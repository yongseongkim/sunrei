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

#### Handling repeated OCR text

The script has several built-in stages that strip noise outside the caption area:

1. Caption-area crop — scans only the bottom 30% of each frame. Most captions sit near the bottom, so titles, logos, and other UI at the top are ignored.
2. Static-text filter — text that appears identically in 80%+ of sampled frames is treated as a watermark, channel logo, or fixed overlay and removed.
3. Deduplication — text with 80%+ similarity across consecutive frames is merged into one segment; segments shorter than 0.5s are treated as noise and dropped.
4. Practical tips
   - In videos where captions sit in the center or top, OCR may miss them (only the bottom 30% is scanned).
   - For videos with fast caption changes, lower the sampling interval with `--interval 0.5` (default: 1.0s) to avoid drops.
   - If a channel logo overlaps the caption area, the filter may strip the caption along with it. When OCR output looks abnormally sparse, check the original frames.

### Rate Limiting

youtube-transcript-api trips YouTube's bot blocking (IP block) when automated requests go out too fast. A failure looks like this:

```
"Could not retrieve a transcript for the video ... This is most likely caused by:
- YouTube is blocking requests from your IP ...
- You have done too many requests and your IP has been blocked by YouTube"
```

This error has two causes that the message alone can't distinguish:
(a) the video genuinely has no transcript, or (b) the IP is blocked. Treat repeated failures as (b), and a single failure amid otherwise-successful fetches as (a).

#### Measured results (2026-07, on a 82-video 육식맨 playlist)

The block is triggered by request rate, not by a pre-flagged IP. A fresh IP was blocked the same way after 15–20 requests. Because the threshold is request count over a time window, keeping the interval under ~30s doesn't help:

| Interval | Result |
|------|------|
| 14s | blocked after ~17 requests |
| 20s | blocked after ~10–20 requests |
| 60–90s | 25 requests, no block |

Don't try to dodge it by changing IP — slow down. Spacing videos 60–90s apart keeps you under the threshold and fetches the whole playlist without a block.

One more finding: yt-dlp doesn't get around it either. `yt-dlp --write-auto-subs` gets a 429 from the same caption-download endpoint, and `--impersonate` or `--js-runtimes deno` don't help (the limit is on the download endpoint, not bot detection). The YouTube Data API's `captions.download` can't fetch captions for channels you don't own.

#### What to do

- Single video: just request it.
- Playlist: put a random 60–90s gap between videos (e.g. `random.uniform(60, 90)`). Don't use 14–20s intervals — they hit the wall around request 15–20 every time.
- On an IP-block error: don't skip to the next video and don't retry immediately. Wait a long time (e.g. 600s), then retry the same video — that gives the request count room to reset.
- Cap the number of consecutive waits (e.g. stop after 4), so a run that keeps getting blocked halts instead of looping forever.

#### Batch processing

For playlists with many videos (>10), don't run commands one at a time or write a new script per workspace — use the shared batch script:

```bash
uv run --with youtube-transcript-api --with python-dotenv \
  python .claude/scripts/youtube/fetch_playlist_transcripts.py "{ID}"
```

`{ID}` is the workspace folder name under `.claude/workspace/youtube/`. The script reads `selectedVideos` from `video_info.json`, writes `transcripts_raw.json` into the workspace folder, and implements everything above:

- Random 60–90s wait between videos.
- On an IP-block error: pause ~600s, retry the same video, stop after 4 consecutive blocks.
- Resume: skips already-fetched videos and re-fetches only failed ones, saving results per video — if interrupted, rerunning the same command continues where it left off.
- Prints a summary at the end (N succeeded, N no-transcript).

### 3. Audit and Clean Transcript

For each transcript, analyze and clean the text:

1. Fix Korean auto-generated errors: Common YouTube auto-caption mistakes in Korean (e.g., misheard words, wrong particles)
2. Remove noise: "[음악]", "[박수]", "[웃음]" markers, repeated filler words
3. Fix formatting: Merge broken sentences, fix punctuation
4. Preserve timestamps: Keep segment timing information intact
5. Identify key sections: Note sections that mention places, restaurants, attractions — especially the food/menu commentary (dish names, how it's cooked and served, taste, and the creator's reaction) with their timestamps. This narration is the primary source for the per-place descriptions in `youtube-extract-locations`, so carry it forward instead of trimming it as filler.

#### Context-aware correction

OCR output has many per-segment misreads. Always read the neighboring segments and grasp the context before correcting.

Procedure:

1. Grasp the overall flow — first read the whole `fullText` to understand the video's topic, speaker, and tone. This anchors every per-segment correction.
2. Sliding-window correction — when correcting a segment, read the 2 preceding and 2 following segments together. For example:
   - `"그렇다 사실 여기논 안도 다다오가 아"` → reading the next segment `"카타야마 마사미치라는 인테리어 디자이너가 맡은 긋이다"` shows that "아" is a cut-off "아니고", and "긋" should be "곳".
   - `"싶었으나;"` → the preceding `"저 건물들에서 내려다보이는 거 아난가 ?"` and following `"당연하게도 안쪽은 지붕으로 덮어있다"` show the sentence continues across segments.
3. Unify recurring proper nouns — when the same proper noun is recognized differently across segments, normalize to the most accurate form:
   - `"도교 토일핏 프로적트"` / `"도교 화장실 프로적트"` → `"도쿄 토일렛 프로젝트"`
   - `"히라아마"` → `"히라야마"` (protagonist of the film Perfect Days)
   - `"빚 벤터스"` / `"팀 벤터스"` → `"빔 벤더스"` (director Wim Wenders)
4. OCR-specific misread patterns — suspect these first:
   - Final-consonant (받침) errors: `긋`→`곳`, `잇`→`있`, `앉`→`않`, `햇`→`했`
   - Jamo confusion: `논`→`는`, `안분`→`않은`, `적논지`→`졌는지`
   - Cut-off sentences: when a segment ends missing a particle or verb ending, restore it by joining with the start of the next segment.
   - Special-character noise: remove stray `_`, `;`, `:` tacked onto the end of a sentence.
5. Knowledge-based correction — when OCR is plausible character-by-character but wrong in meaning, correct it using general knowledge:
   - Well-known proper nouns: `"고로나"` → `"코로나"`; `"2020년"` in an `"올림픽"` context, etc.
   - Channel name / greeting: fix the intro greeting using the channel name and title from video_info.json (e.g. `"비밀이 합니다"` → `"비밀이야 입니다"`).
   - Place / architect names: verify real people and places mentioned in context (e.g. `"쿠마 렌고"` → `"쿠마 켄고"`, `"프리초거상"` → `"프리츠커상"`).

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
