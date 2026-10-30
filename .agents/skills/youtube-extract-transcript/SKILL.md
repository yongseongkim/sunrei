---
name: youtube-extract-transcript
description: Collect, align, and review YouTube captions, Whisper audio transcripts, and OCR text from video frames. Use when the user asks for a transcript, subtitles, on-screen text, multimodal transcript review, or the evidence stage of the YouTube-to-Sunrei workflow.
---

# Extract and Review YouTube Text

Collect captions, audio transcription, and on-screen text as three separate
evidence tracks, review the primary transcript with an isolated agent, and
align everything on one timeline. Raw source files are never modified.

## Prerequisites

- `youtube-fetch-info` writes `video_info.json`. For a single-video run, copy
  that video's file to `{RUN_DIR}/metadata.json`; its `id` is accepted by the
  timeline builder. Collector runs already supply `metadata.json` with
  `videoId`. Keep the original fetch output unchanged.
- One run directory per video, so each run holds one video's metadata and
  evidence files. A playlist's `selectedVideos` entries lack full video
  descriptions: fetch each selected video's metadata before preparing its run,
  rather than using the playlist description as the video's evidence.

## 1. Collect Every Source

Attempt all three sources for every video. Whisper and OCR are not fallbacks
for missing captions: each source catches what the others miss, and the
extractor later weighs them against each other.

Captions:

```bash
uv run --with youtube-transcript-api python .claude/scripts/youtube/extract_transcript.py "{VIDEO_ID}"
```

Save the unmodified result as `captions.json`. Check that the track belongs to
this video: an uploaded track can be another video's subtitles. When the
captions contradict the title, description, and on-screen text, mark them
unusable and rely on Whisper and OCR.

Whisper:

```bash
uv run --python 3.11 --with yt-dlp --with openai-whisper \
  python .claude/scripts/youtube/whisper_transcribe.py \
  "https://www.youtube.com/watch?v={VIDEO_ID}" base
```

Save the unmodified result as `audio_transcript.json`. Whisper runs locally,
and the script deletes the downloaded audio afterwards. The script prints
yt-dlp progress before its JSON, so a caller parses the trailing JSON object,
not the whole output.

OCR:

```bash
uv run --python 3.11 --with easyocr --with opencv-python-headless --with yt-dlp \
  python .claude/scripts/youtube/extract_onscreen_text.py \
  "https://www.youtube.com/watch?v={VIDEO_ID}" --lang ko,en --interval 1.0
```

Save the unmodified result as `onscreen_text.json`. Always run OCR, even when
captions and Whisper look complete: creators often name the place only in
burned-in subtitles, and scenes with music instead of speech carry names,
addresses, and prices on screen only. Choose `--lang` by the language of the
burned-in subtitles, not the country in the video. EasyOCR cannot load Korean
and Japanese together, so run a second pass with `ja,en` when a sign or menu
matters. Use `--interval 0.5` for rapidly changing text.

This helper crops the bottom 30% of each frame. Signs elsewhere need a
targeted full-frame inspection or separate OCR pass; changing `--lang` alone
does not read the omitted area.

For unresolved visual clues or a mismatch with today's premises, read
[visual and historical review](../youtube-extract-locations/references/visual-and-historical-review.md).
It covers representative frames, optional detection, and dated web evidence.

Preserve a source's structured error in its file and continue with the other
sources. Stop only when every source is empty or unavailable.

## 2. Create the Base Transcript

Write `transcripts.json` from the first usable source in this order: captions,
Whisper, OCR. This chooses the track the reviewer edits; it does not make that
source authoritative. Keep the other tracks separate so spoken text is never
merged with labels, signs, or decorative text from the screen.

```json
{
  "videos": [
    {
      "videoId": "VIDEO_ID",
      "title": "...",
      "language": "ko",
      "source": "youtube_captions",
      "segments": [{ "text": "...", "start": 1.5, "duration": 2.0 }],
      "fullText": "...",
      "cleanedText": "...",
      "approved": false
    }
  ]
}
```

`source` is `youtube_captions`, `whisper`, or `ocr_frames`. Preserve every
segment boundary and timestamp.

## 3. Review with Codex

Write `{RUN_DIR}/descriptions.json` with the video's description, for example
`{"VIDEO_ID": {"description": "the video's full description"}}`. The reviewer
reads this file, not `metadata.json`; the automated collector prepares it.

```bash
uv run --with openai-codex==0.160.0 python .claude/scripts/youtube/review_transcripts.py "{RUN_DIR}" --all
```

The reviewer receives the title and description, the target segments, and the
Whisper and OCR events from the same time range. It corrects clear recognition
errors where sources agree, gives exact text from the title, description, or
screen more weight for person, place, restaurant, dish, and brand names, and
flags passages where sources disagree instead of choosing by plausibility. OCR
stays a separate visual annotation: prices, signs, and labels do not enter the
spoken dialogue unless the evidence shows they were spoken. A garbled foreign
proper noun is read in the language of the video's region and left flagged
when no source confirms a spelling.

The reviewer writes `transcript_review.json` with every proposal `pending` and
`transcripts.reviewed.json` with accepted corrections only. It never modifies
`captions.json`, `audio_transcript.json`, `onscreen_text.json`, or
`transcripts.json`.

Keep proposals pending until the user decides them, carrying forward explicit
decisions already given. Do not infer approval from confidence alone. Set
decided proposals to `accept` or `reject` and rebuild without
another model call:

```bash
uv run --with openai-codex==0.160.0 python .claude/scripts/youtube/review_transcripts.py "{RUN_DIR}" \
  --all --max-new-chunks 0
```

Put verified spellings that recur in a video into
`transcript_review_hints.json`, scoped to that video so a person or brand name
does not cause unrelated replacements elsewhere.

## 4. Build the Evidence Timeline

```bash
uv run python .claude/scripts/youtube/evidence_timeline.py "{RUN_DIR}" --force
```

`evidence_timeline.json` holds timestamp-ordered events labeled `transcript`,
`whisper`, or `ocr`, plus each source's status and input hash. A track that
duplicates another is marked `duplicate` and does not count as independent
confirmation. This file and `metadata.json` are the input to
`youtube-extract-locations`. The CLI reads the video ID from `metadata.json`;
when using a run without that file, supply `--video-id VIDEO_ID`.

## 5. Blocking and Unavailable Videos

Caption blocking: for playlists, wait a random 60-90 seconds between caption
requests. After repeated `RequestBlocked` or `IpBlocked` errors, stop caption
requests for the run instead of retrying from the same IP, and continue with
Whisper and OCR.

Members-only videos: captions, audio, and video download all fail with "Join
this channel to get access to members-only content". Stop there. Do not
retry, do not look for the places another way, and report the video as
members-only. Playlist renewal stores such videos as `SKIPPED`.

Login challenges: a yt-dlp authentication prompt is separate from caption IP
blocking. Provide a protected Netscape cookie file through `SUNREI_YT_COOKIES`
for audio and video download. Never pass cookie contents or credentials to
Codex.

## 6. Preserve Artifacts

Keep these files in the run directory for review and debugging:

```text
metadata.json
descriptions.json
captions.json
audio_transcript.json
onscreen_text.json
transcripts.json
transcript_review.json
transcripts.reviewed.json
evidence_timeline.json
```

Never store downloaded audio or video. Uploading the JSON artifacts preserves
pending decisions and is not approval.

## Finish

Report which sources succeeded or failed and why, the segment counts, the
number of pending review proposals and flagged conflicts, and the path of
`evidence_timeline.json`. Do not start location extraction;
`youtube-to-sunrei` decides the next step.

## References

- `references/evidence-quality.md`: symptoms that mean a source is wrong or
  is missing something, and what to do in each case.
