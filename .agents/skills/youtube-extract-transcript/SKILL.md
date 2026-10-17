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

Always run OCR, even when captions and Whisper look complete. Creators often
say where they are only in burned-in subtitles: the shop name, address, or
neighborhood appears on screen while the speech says nothing about it. Skipping
OCR is how a context refill once missed 거대돼지국밥, 강풍해장국, 산지해장국, and
동화반점, and how a ramen shop stayed pinned to the wrong place.

### YouTube captions

```bash
uv run --with youtube-transcript-api --with python-dotenv \
  python .claude/scripts/youtube/extract_transcript.py "{VIDEO_ID}"
```

Save the unmodified result as `captions.json`.

Check that the captions belong to this video. A manually uploaded track can be
another video's subtitles: one 비밀이야 video about a Busan restaurant carried
Korean and English captions for a Beijing dinner. When the captions contradict
the title, description, and on-screen text, treat them as unusable and rely on
Whisper and OCR.

### Whisper audio transcription

```bash
uv run --python 3.11 --with yt-dlp --with openai-whisper \
  python .claude/scripts/youtube/whisper_transcribe.py \
  "https://www.youtube.com/watch?v={VIDEO_ID}" base
```

Save the unmodified result as `audio_transcript.json`. Whisper runs locally;
the script downloads temporary audio and deletes it after transcription.

The script prints yt-dlp download progress to stdout before its JSON result.
When calling it from another script, parse the trailing JSON object, as
`parse_json_output` in `renew_playlists.py` does, instead of `json.loads` on
the whole output.

### Video OCR

```bash
uv run --python 3.11 --with easyocr --with opencv-python-headless --with yt-dlp \
  python .claude/scripts/youtube/extract_onscreen_text.py \
  "https://www.youtube.com/watch?v={VIDEO_ID}" --lang ko,en --interval 1.0
```

Save the unmodified result as `onscreen_text.json`. Choose `--lang` by the
language of the burned-in subtitles, not the country in the video: a Korean
channel's Tokyo or Osaka video needs `ko,en`, and `ja,en` reads only Japanese
signs. EasyOCR cannot load Korean and Japanese together, so run a second pass
with `ja,en` when a sign or menu matters. In one Osaka video the speech track
garbled a ramen shop's name, and only the Korean subtitle `우골왕` led to
人情麺家 牛骨王. Use `--interval 0.5` for rapidly changing text.

Vlogs often show a place with music and burned-in subtitles only, so OCR can be
the only source that names the place, the dishes, and the prices. A 30-minute
video takes about seven minutes on an Apple Silicon Mac.

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
uv run --with openai-codex==0.160.0 python .claude/scripts/youtube/review_transcripts.py "{RUN_DIR}" --all
```

The reviewer receives the video title and description, the target transcript
segments, and Whisper and OCR events from the same time range. Apply these
rules:

- Use agreement between sources to correct clear recognition errors.
- Read garbled proper nouns in the language of the video's region. A Korean
  caption like `닌냐 꼬치우` in an Osaka video is a Japanese shop name heard as
  Korean; the on-screen text gave `닌조멘 규코츠오` (人情麺家 牛骨王).
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
uv run --with openai-codex==0.160.0 python .claude/scripts/youtube/review_transcripts.py "{RUN_DIR}" \
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
uv run --with openai-codex==0.160.0 python .claude/scripts/youtube/extract_locations_headless.py \
  "{RUN_DIR}" --restart
```

The location result remains `review_pending`. Every candidate must cite a
verbatim source event and timestamp. Preserve source conflicts and uncertain
names instead of inventing a correction or venue.

## 5. Handle Caption Blocking

For playlists, wait a random 60-90 seconds between caption requests. After
repeated `RequestBlocked` or `IpBlocked` errors, stop caption requests for that
run instead of repeatedly retrying the same IP. Continue with Whisper and OCR.
The 60-90 second pace fetched 269 videos in a row without a block.

Members-only videos fail captions, audio, and video download with "Join this
channel to get access to members-only content". They are out of scope: do not
retry them, do not look for their places another way, and mark them `SKIPPED`
in playlist renewal.

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
