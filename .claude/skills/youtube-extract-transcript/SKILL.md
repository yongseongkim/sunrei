---
name: youtube-extract-transcript
description: This skill should be used when the user asks to "extract transcript", "get subtitles", "get captions" from a YouTube video, or wants to continue the YouTube-to-Sunrei workflow after fetching video info.
---

# Extract and Clean YouTube Video Transcript

Extract transcript from YouTube video(s) using Python scripts, then clean/audit the transcript.

## Prerequisites

- `.claude/workspace/youtube/{ID}/video_info.json` must exist (created by `/youtube-fetch-info`)
- If it doesn't exist, ask the user to run `/youtube-fetch-info` first or provide a video ID

## Steps

### 1. Load Video Info

Read `.claude/workspace/youtube/{ID}/video_info.json` to get video ID(s).

If the user provides an ID directly, use that instead.

### 2. Extract Transcript for Each Video

For each video, run the transcript extraction script:

```bash
uv run --with youtube-transcript-api --with python-dotenv python .claude/scripts/youtube/extract_transcript.py "{VIDEO_ID}"
```

If the result contains `"error": "no_transcript_available"`, fall back to whisper:

```bash
uv run --with yt-dlp --with openai-whisper python .claude/scripts/youtube/whisper_transcribe.py "https://www.youtube.com/watch?v={VIDEO_ID}"
```

If Whisper also fails or returns empty, fall back to video OCR:

```bash
uv run --with easyocr --with opencv-python-headless --with yt-dlp \
  python .claude/scripts/youtube/extract_onscreen_text.py "https://www.youtube.com/watch?v={VIDEO_ID}"
```

This extracts burned-in subtitles and on-screen text from video frames using OCR.

OCR language flag: Use `--lang ja,en` for Japanese content. Do NOT use `ko,ja,en` — easyocr throws `"Japanese is only compatible with English"`.

OCR output: yt-dlp download progress logs can mix with JSON stdout. When parsing OCR results, extract the JSON block from potentially mixed output using regex.

Rate limiting for playlists: Wait ~60 seconds between videos to avoid YouTube rate limiting. Inform the user of progress.

Batch processing: For playlists with many videos (>10), create a batch Python script rather than running individual commands. The script should:
  - Handle rate limiting internally (60s between videos)
  - Track success/failure per video
  - Save raw results to `transcripts_raw.json`
  - Report summary at the end (N success, N failed, N OCR fallback needed)

### 3. Audit and Clean Transcript

For each transcript, analyze and clean the text:

1. Fix Korean auto-generated errors: Common YouTube auto-caption mistakes in Korean (e.g., misheard words, wrong particles)
2. Remove noise: "[음악]", "[박수]", "[웃음]" markers, repeated filler words
3. Fix formatting: Merge broken sentences, fix punctuation
4. Preserve timestamps: Keep segment timing information intact
5. Identify key sections: Note sections that mention places, restaurants, attractions

### 4. Present for User Approval

Show the cleaned transcript to the user with:

- Original language detected
- Transcript source (YouTube captions vs Whisper)
- Total segment count and duration
- The cleaned full text (or a summary if very long)
- Key sections highlighted that seem to mention locations

Use AskUserQuestion:

- "Approve this transcript"
- "Request re-edit" (user provides feedback)
- "Skip this video" (for playlists)

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

### 6. Confirm

Tell the user transcripts have been saved and ask if they want to proceed to location extraction.
