---
name: youtube-extract-transcript
description: Extract, audit, and clean transcripts or on-screen text from YouTube videos. Use when the user asks for subtitles, captions, or transcripts, or continues the YouTube-to-Sunrei workflow after fetching metadata.
---

# Extract and Clean YouTube Transcripts

Extract text from one or more videos, correct recognition errors, and preserve the
details needed for location extraction.

## Prerequisites

- Use `.claude/workspace/youtube/{ID}/video_info.json`, created by
  `youtube-fetch-info`.
- If the file is missing, ask the user to fetch the metadata or provide a video
  ID directly.

## Steps

### 1. Load Video Info

Read the video IDs from
`.claude/workspace/youtube/{ID}/video_info.json`.

Use a video ID supplied directly by the user instead of the workspace file.

### 2. Extract Transcript for Each Video

Run the caption extractor for each video:

```bash
uv run --with youtube-transcript-api --with python-dotenv python .claude/scripts/youtube/extract_transcript.py "{VIDEO_ID}"
```

If it returns `"error": "no_transcript_available"`, fall back to Whisper:

```bash
uv run --with yt-dlp --with openai-whisper python .claude/scripts/youtube/whisper_transcribe.py "https://www.youtube.com/watch?v={VIDEO_ID}"
```

If Whisper fails or produces too little useful text for the video's duration,
fall back to OCR:

```bash
uv run --with easyocr --with opencv-python-headless --with yt-dlp \
  python .claude/scripts/youtube/extract_onscreen_text.py "https://www.youtube.com/watch?v={VIDEO_ID}"
```

This reads burned-in subtitles and other on-screen text from video frames.

For Japanese content, use `--lang ja,en`. EasyOCR cannot load Japanese and
Korean together, so `--lang ko,ja,en` fails.

The OCR command may mix yt-dlp progress logs with JSON on standard output.
Extract the JSON object before parsing the result.

#### Handle Repeated OCR Text

The script removes common OCR noise in three stages:

1. Scan only the bottom 30% of each frame, where captions usually appear.
2. Remove text that appears unchanged in at least 80% of sampled frames.
3. Merge consecutive segments with at least 80% similarity and discard segments
   shorter than 0.5 seconds.

Adjust the defaults when needed:

- If captions appear in the center or at the top, the default crop may miss them.
- For fast-changing captions, use `--interval 0.5` instead of the one-second
  default.
- If a logo overlaps the caption area, the static-text filter may remove nearby
  captions. Inspect the frames when the output is unusually sparse.

### Rate Limiting

YouTube may block caption requests when `youtube-transcript-api` runs too
quickly. The error usually says that YouTube is blocking the IP or has received
too many requests.

The message does not distinguish an unavailable transcript from a rate limit. A
single failure among successful requests probably means no transcript exists;
repeated failures usually indicate a block.

Use these limits:

- Fetch a single video immediately.
- For a playlist, wait a random 60–90 seconds between videos. Tests in July
  2026 found that 14–20 second intervals triggered a block after roughly 10–20
  requests, while 60–90 second intervals completed later runs of up to 165
  videos without blocks.
- After a block, wait about 10 minutes and retry the same video. Stop after four
  consecutive blocks.

Changing IPs or switching to `yt-dlp --write-auto-subs` does not avoid this
limit. The YouTube Data API also cannot download captions from channels the
authenticated user does not own.

#### Batch processing

For a playlist with more than 10 videos, use the shared batch script:

```bash
uv run --with youtube-transcript-api --with python-dotenv \
  python .claude/scripts/youtube/fetch_playlist_transcripts.py "{ID}"
```

`{ID}` is the folder name under `.claude/workspace/youtube/`. The script reads
`selectedVideos` from `video_info.json`, writes `transcripts_raw.json`, and:

- Waits 60–90 seconds between videos.
- Waits about 10 minutes after a block, retries the same video, and stops after
  four consecutive blocks.
- Saves each result as it completes. Rerunning the command skips successful
  videos and retries failed ones.
- Prints success and no-transcript counts.

#### Re-derive locations after video edits

When a creator re-edits a video, old timestamps can drift and places can be cut.
Re-extract the transcript before reusing an older `locations.json`. Keep
verified geocodes for places that still appear; a place's map pin does not
change when the video is re-cut. Back up the old file first:

```bash
mv .claude/workspace/youtube/{ID}/locations.json \
   .claude/workspace/youtube/{ID}/locations.legacy.json
```

For large playlists, split the matching into subagent batches. Each batch should
match legacy places against the current narration, flag places that were cut,
extract new places, and return a verbatim `quote` from the current transcript
for each retained place. Map those quotes back to fresh timestamps in the
segment list. Then merge the batches, geocode only new places, and run
country-aware cleanup:

```bash
uv run python .claude/scripts/youtube/prep_redrive_batches.py {ID} [batch_size]
uv run python .claude/scripts/youtube/merge_redrive.py {ID}
uv run python .claude/scripts/youtube/cleanup_geocodes.py {ID} japan|france|italy
```

### 3. Audit and Clean Transcript

For each transcript:

1. Correct obvious recognition errors, including misheard Korean words and
   particles.
2. Remove noise markers such as `[음악]`, `[박수]`, and `[웃음]`, along with
   repeated filler.
3. Join broken sentences and repair punctuation without changing the speaker's
   meaning.
4. Preserve every segment's timing.
5. Mark passages about places, restaurants, attractions, and food. Keep dish
   names, preparation and serving details, tasting notes, reactions, and
   timestamps. `youtube-extract-locations` uses this narration to write each
   place description.

For a long transcript, run the headless Codex reviewer in small, resumable
batches:

```bash
uv run python .claude/scripts/youtube/review_transcripts.py "{ID}" \
  --video-id "{VIDEO_ID}"
```

Use `--all` only for an intentional full-workspace backfill. The reviewer:

- Keeps `transcripts.json` unchanged.
- Writes correction proposals and uncertain passages to
  `transcript_review.json`.
- Writes the resulting transcript to `transcripts.reviewed.json`.
- Validates the segment index and original text before accepting a proposal, so
  segment count and timing cannot change.
- Uses aligned segments from `audio_transcript.json` and `onscreen_text.json`
  when those files exist. Conflicts remain flagged instead of being resolved
  from a plausible text-only guess.
- Runs Codex in an empty temporary directory with an ephemeral, read-only
  session. It does not load user MCP configuration or project rules, and AWS,
  SOPS, Google, Admin API, and GitHub credentials are removed from the child
  process environment.

Corrections default to `"decision": "pending"` and are not copied into the
reviewed transcript. Change reviewed proposals to `accept` or `reject`, then
rebuild without starting another Codex call:

```bash
uv run python .claude/scripts/youtube/review_transcripts.py "{ID}" \
  --video-id "{VIDEO_ID}" --max-new-chunks 0
```

Use `transcript_review_hints.json` in the workspace for verified spellings of
people, channels, restaurants, and other recurring entities. Hints are scoped
per video so a name such as `나폴리맛피아` does not cause ordinary uses of
`마피아` or a business such as `와규 마피아` to be rewritten.

Do not accept a plausible reconstruction when the intended wording is
uncertain. Recheck the flagged timestamp against the audio and on-screen text;
leave the item pending when the sources still disagree.

#### Correct OCR in Context

Read the full `fullText` before editing individual segments. For each correction,
inspect the two preceding and two following segments.

- Restore a cut-off word or sentence only when adjacent segments make the
  continuation clear. For example, the segment ending `"안도 다다오가 아"`
  continues as `"아니고"` when the next segment names the actual designer.
- Normalize recurring proper nouns. Examples include
  `"도교 토일핏 프로적트"` to `"도쿄 토일렛 프로젝트"`, `"히라아마"` to
  `"히라야마"`, and `"팀 벤터스"` to `"빔 벤더스"`.
- Check common Korean OCR errors first: `긋` to `곳`, `잇` to `있`, `햇` to
  `했`, `논` to `는`, and similar consonant or jamo confusion.
- Remove stray trailing characters such as `_`, `;`, and `:`.
- Use the channel name and video title in `video_info.json` to correct greetings
  and names. Use established context to correct well-known people and places,
  such as `"쿠마 렌고"` to `"쿠마 켄고"` and `"프리초거상"` to
  `"프리츠커상"`.

### 4. Present for User Approval

Show:

- Detected language
- Source: YouTube captions, Whisper, or OCR
- Segment count and duration
- Cleaned text, or a summary when the transcript is very long
- Passages that mention locations

Ask the user to:

- Approve the transcript
- Request another edit
- Skip the video when processing a playlist

### 5. Save Results

Save to `.claude/workspace/youtube/{ID}/transcripts.json`:

```json
{
  "videos": [
    {
      "videoId": "...",
      "title": "...",
      "language": "ko",
      "source": "youtube_captions | whisper | ocr_frames",
      "segments": [{ "text": "...", "start": 0.0, "duration": 3.5 }],
      "fullText": "...",
      "cleanedText": "...",
      "approved": true
    }
  ]
}
```

After saving the file, report its path and ask whether to continue with location
extraction.
