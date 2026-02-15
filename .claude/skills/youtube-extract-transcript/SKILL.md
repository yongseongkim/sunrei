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

If Whisper also fails, returns empty, returns no useful text (e.g., only noise markers, gibberish, repetitive filler), or returns too little text relative to the video duration, fall back to video OCR:

```bash
uv run --with easyocr --with opencv-python-headless --with yt-dlp \
  python .claude/scripts/youtube/extract_onscreen_text.py "https://www.youtube.com/watch?v={VIDEO_ID}"
```

This extracts burned-in subtitles and on-screen text from video frames using OCR.

OCR language flag: Use `--lang ja,en` for Japanese content. Do NOT use `ko,ja,en` — easyocr throws `"Japanese is only compatible with English"`.

OCR output: yt-dlp download progress logs can mix with JSON stdout. When parsing OCR results, extract the JSON block from potentially mixed output using regex.

#### OCR 반복 텍스트 처리

스크립트는 자막 영역 외의 노이즈를 자동으로 제거하는 여러 단계를 내장하고 있다:

1. **자막 영역 크롭** — 각 프레임의 하단 30%만 스캔한다. 대부분의 자막이 화면 아래에 위치하므로, 상단의 제목·로고·기타 UI 요소를 무시할 수 있다.
2. **고정 텍스트 필터** — 샘플링된 프레임의 80% 이상에서 동일하게 나타나는 텍스트는 워터마크·채널 로고·고정 오버레이로 간주하여 제거한다.
3. **중복 제거** — 연속된 프레임에서 유사도 80% 이상인 텍스트는 하나의 세그먼트로 병합한다. 0.5초 미만의 짧은 세그먼트는 노이즈로 판단하여 버린다.
4. **실전 팁**
   - 자막이 화면 중앙이나 상단에 위치하는 영상에서는 OCR이 자막을 놓칠 수 있다 (하단 30%만 스캔하므로).
   - 자막 전환이 빠른 영상에서는 `--interval 0.5` 등으로 샘플링 간격을 줄여 누락을 방지한다 (기본값: 1.0초).
   - 채널 로고가 자막 영역에 겹치면 필터링에 의해 자막까지 함께 제거될 수 있다. 이 경우 OCR 결과가 비정상적으로 적다면 원본 프레임을 확인해볼 것.

### Rate Limiting

youtube-transcript-api commonly hits rate limits (HTTP 429) with rapid automated requests, resulting in temporary blocks.

Known limits:

- ~5 requests per 10 seconds
- Free third-party providers: ~1000 requests per hour
- High-volume automated scraping triggers YouTube's anti-bot policies

Mitigation:

- Single videos: Add 10-22 second delay between requests
- Playlists: Wait ~60 seconds between videos. Inform the user of progress
- yt-dlp: Use `--sleep-interval 15` or `--min-sleep-interval 6 --max-sleep-interval 12`
- On 429 errors: Use exponential backoff (wait longer after each retry), do NOT immediately retry

Batch processing: For playlists with many videos (>10), create a batch Python script rather than running individual commands. The script should:

- Handle rate limiting internally (see Rate Limiting section above)
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
