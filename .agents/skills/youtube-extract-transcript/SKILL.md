---
name: youtube-extract-transcript
description: Collect, align, and review YouTube captions, Whisper audio transcripts, and OCR text from video frames. Use when the user asks for a transcript, subtitles, on-screen text, multimodal transcript review, or the evidence stage of the YouTube-to-Sunrei workflow.
---

# Extract and Review YouTube Text

Collect captions, audio transcription, and on-screen text as independent evidence.
Use Codex to compare aligned time ranges without changing the raw sources.

## Prerequisites

- Load the video metadata created by `youtube-fetch-info`.
- Include the video ID, URL, channel, title, and description in `metadata.json`.
- Process playlist videos independently so every run has one video's metadata and
  evidence files.

## 1. Collect Every Source

Attempt all three sources for each video. Do not treat Whisper and OCR only as
fallbacks for missing captions.

### YouTube captions

```bash
uv run --with youtube-transcript-api --with python-dotenv \
  python .claude/scripts/youtube/extract_transcript.py "{VIDEO_ID}"
```

Save the unmodified result as `captions.json`.

### Whisper audio transcription

```bash
uv run --python 3.11 --with yt-dlp --with openai-whisper \
  python .claude/scripts/youtube/whisper_transcribe.py \
  "https://www.youtube.com/watch?v={VIDEO_ID}" base
```

Save the unmodified result as `audio_transcript.json`. Whisper runs locally;
the script downloads temporary audio and deletes it after transcription.

### Video OCR

```bash
uv run --python 3.11 --with easyocr --with opencv-python-headless --with yt-dlp \
  python .claude/scripts/youtube/extract_onscreen_text.py \
  "https://www.youtube.com/watch?v={VIDEO_ID}" --lang ko,en --interval 1.0
```

Save the unmodified result as `onscreen_text.json`. Use `--lang ja,en` for
Japanese videos. EasyOCR cannot load Korean and Japanese together. Use
`--interval 0.5` for rapidly changing text.

Preserve a source's structured error in its file and continue collecting the
other sources. Stop only when every source is empty or unavailable.

## 2. Create the Base Transcript

Create `transcripts.json` for compatibility with the review workflow. Select the
first usable source in this order:

1. YouTube captions
2. Whisper
3. OCR

This selection defines the editable transcript track; it does not make the
selected source authoritative. Keep the other tracks separate so spoken text is
not merged with labels, captions, signs, or decorative text shown on screen.

Set `approved` to `false` and preserve every segment boundary and timestamp.

## 3. Review with Codex

Run the isolated headless reviewer:

```bash
uv run python .claude/scripts/youtube/review_transcripts.py "{RUN_DIR}" --all
```

The reviewer receives the video title and description, the target transcript
segments, and Whisper and OCR events from the same time range. Apply these
rules:

- Use agreement between sources to correct clear recognition errors.
- Give exact text in a title, description, or on-screen label more weight for
  person, place, restaurant, dish, and brand names.
- Treat OCR as a separate visual annotation. Do not insert `WOW`, prices, signs,
  or labels into spoken dialogue unless the evidence shows they were spoken.
- Do not resolve conflicts from plausibility alone. Flag the time range when
  sources disagree or the intended wording remains uncertain.
- Preserve meaning, segment boundaries, and timestamps.

The reviewer must not modify `captions.json`, `audio_transcript.json`,
`onscreen_text.json`, or `transcripts.json`. It writes:

- `transcript_review.json`: corrections and unresolved passages, initially
  `pending`
- `transcripts.reviewed.json`: the base transcript with accepted corrections
  only

Do not bulk-accept medium- or low-confidence proposals. After explicit review,
set each proposal to `accept` or `reject` and rebuild without another model call:

```bash
uv run python .claude/scripts/youtube/review_transcripts.py "{RUN_DIR}" \
  --all --max-new-chunks 0
```

Use `transcript_review_hints.json` for verified spellings that recur in a video.
Scope hints narrowly so a person or brand name does not cause unrelated global
replacements.

## 4. Build the Evidence Timeline

Normalize all available tracks after review:

```bash
uv run python .claude/scripts/youtube/evidence_timeline.py "{RUN_DIR}" --force
```

`evidence_timeline.json` contains timestamp-ordered events labeled
`transcript`, `whisper`, or `ocr`, plus each source's status and input hash.
Duplicate tracks are marked and must not count as independent confirmation.

Use this file, together with `metadata.json`, as the LLM input for location and
context extraction:

```bash
uv run python .claude/scripts/youtube/extract_locations_headless.py \
  "{RUN_DIR}" --restart
```

The location result remains `review_pending`. Every candidate must cite a
verbatim source event and timestamp. Preserve source conflicts and uncertain
names instead of inventing a correction or venue.

## 5. Handle Caption Blocking

For playlists, wait a random 60-90 seconds between caption requests. After
repeated `RequestBlocked` or `IpBlocked` errors, stop caption requests for that
run instead of repeatedly retrying the same IP. Continue with Whisper and OCR.

An yt-dlp login challenge is separate from caption IP blocking. If audio or
video download requires authentication, provide a protected Netscape cookie
file through `SUNREI_YT_COOKIES`. Do not pass cookie contents or credentials to
Codex.

## 6. Preserve Artifacts

Keep these files for review and debugging:

```text
metadata.json
captions.json
audio_transcript.json
onscreen_text.json
transcripts.json
transcript_review.json
transcripts.reviewed.json
evidence_timeline.json
location_candidates.json
```

Upload JSON artifacts only after local validation. Do not store downloaded
audio or video. S3 upload preserves pending decisions and never constitutes
approval.

Present source availability, segment counts, conflicts, proposed corrections,
and location-related passages to the user. Continue to publication only after
the required transcript and location decisions are explicit.
