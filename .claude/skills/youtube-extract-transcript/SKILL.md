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

### 요청 제한 (Rate Limiting)

youtube-transcript-api는 자동화된 요청을 빠르게 보내면 YouTube의 봇 차단(IP 차단)에 걸린다. 실패는 이런 모습이다:

```
"Could not retrieve a transcript for the video ... This is most likely caused by:
- YouTube is blocking requests from your IP ...
- You have done too many requests and your IP has been blocked by YouTube"
```

이 오류는 원인이 두 가지인데 메시지만으로는 구분되지 않는다:
(a) 영상에 자막이 정말 없거나, (b) IP가 차단된 경우다. 연달아 나오면 (b)로, 잘 받다가 한 번만 튀면 (a)로 본다.

#### 실측 결과 (2026-07, 육식맨 82편 재생목록에서 확인)

차단은 미리 걸려 있던 IP 표시가 아니라 요청 속도로 발동한다. 새 IP도 요청 15~20번 만에 똑같이
차단됐다. 기준이 일정 시간 동안의 요청 수라서, 요청 간격을 ~30초 아래로 둬도 소용없다:

| 간격 | 결과 |
|------|------|
| 14초 | 약 17번 만에 차단 |
| 20초 | 약 10~20번 만에 차단 |
| 60~90초 | 25번, 차단 없음 |

IP를 바꿔 우회하려 하지 말고 속도를 늦춘다. 영상마다 60~90초씩 천천히 흘려보내면 기준 아래로
유지되어 차단 없이 재생목록을 끝까지 받는다.

한 가지 더 확인된 점: yt-dlp로도 못 피한다. `yt-dlp --write-auto-subs`는 같은 자막 다운로드
엔드포인트에서 429가 나고, `--impersonate`나 `--js-runtimes deno`도 소용없다(요청 제한이 봇
탐지가 아니라 다운로드 엔드포인트에 걸려 있다). YouTube Data API의 `captions.download`는 본인
소유가 아닌 채널의 자막은 받을 수 없다.

#### 대응 방법

- 단일 영상: 그냥 요청해도 된다.
- 재생목록: 영상 사이에 60~90초를 무작위로 둔다(예: `random.uniform(60, 90)`). 14~20초 간격은
  쓰지 않는다 — 매번 15~20번쯤에서 벽에 부딪힌다.
- IP 차단 오류가 나면: 다음 영상으로 넘기지도, 곧바로 재시도하지도 않는다. 길게(예: 600초)
  기다린 뒤 같은 영상을 다시 시도한다. 그 사이 요청 카운트가 초기화될 여지가 생긴다.
- 연속으로 기다리는 횟수에 상한을 둔다(예: 4번이면 중단). 계속 차단당하는 실행이 무한히 도는 대신 멈추도록.

#### 일괄 처리

영상이 많은 재생목록(>10)은 명령을 하나씩 돌리거나 작업 폴더마다 새 스크립트를 쓰지 말고,
공용 일괄 스크립트를 쓴다:

```bash
uv run --with youtube-transcript-api --with python-dotenv \
  python .claude/scripts/youtube/fetch_playlist_transcripts.py "{ID}"
```

`{ID}`는 `.claude/workspace/youtube/` 아래 작업 폴더의 이름이다. 이 스크립트는 `video_info.json`의
`selectedVideos`를 읽어 작업 폴더에 `transcripts_raw.json`을 쓰며, 위 내용을 전부 구현한다:

- 영상 사이 60~90초 무작위 대기.
- IP 차단 오류 시: 약 600초 멈췄다가 같은 영상 재시도, 연속 4번이면 중단.
- 이어받기: 이미 받은 영상은 건너뛰고 오류 난 것만 다시 받으며, 영상마다 결과를 저장한다 —
  중간에 끊겨도 같은 명령을 다시 돌리면 이어진다.
- 끝에 요약 출력(성공 N개, 자막 없음 N개).

### 3. Audit and Clean Transcript

For each transcript, analyze and clean the text:

1. Fix Korean auto-generated errors: Common YouTube auto-caption mistakes in Korean (e.g., misheard words, wrong particles)
2. Remove noise: "[음악]", "[박수]", "[웃음]" markers, repeated filler words
3. Fix formatting: Merge broken sentences, fix punctuation
4. Preserve timestamps: Keep segment timing information intact
5. Identify key sections: Note sections that mention places, restaurants, attractions — especially the food/menu commentary (dish names, how it's cooked and served, taste, and the creator's reaction) with their timestamps. This narration is the primary source for the per-place descriptions in `youtube-extract-locations`, so carry it forward instead of trimming it as filler.

#### 전후 문맥 참조를 통한 교정

OCR 결과는 개별 세그먼트 단위로 오인식이 많다. **반드시 앞뒤 세그먼트를 함께 읽고 문맥을 파악한 뒤 교정한다.**

교정 절차:

1. **전체 흐름 파악** — 먼저 전체 `fullText`를 통독하여 영상의 주제·화자·톤을 파악한다. 이것이 개별 세그먼트 교정의 기준이 된다.
2. **슬라이딩 윈도우 교정** — 각 세그먼트를 교정할 때 앞 2개·뒤 2개 세그먼트를 함께 읽는다. 예를 들어:
   - `"그렇다 사실 여기논 안도 다다오가 아"` → 다음 세그먼트 `"카타야마 마사미치라는 인테리어 디자이너가 맡은 긋이다"` 를 함께 보면, "아"가 "아니고"의 잘림임을 알 수 있고, "긋"→"곳"으로 교정할 수 있다.
   - `"싶었으나;"` → 앞 세그먼트 `"저 건물들에서 내려다보이는 거 아난가 ?"` 와 뒤 세그먼트 `"당연하게도 안쪽은 지붕으로 덮어있다"` 를 보면 문장이 연결됨을 알 수 있다.
3. **반복 등장 고유명사 통일** — 같은 고유명사가 여러 세그먼트에서 다르게 인식된 경우, 가장 정확한 형태로 통일한다:
   - `"도교 토일핏 프로적트"` / `"도교 화장실 프로적트"` → `"도쿄 토일렛 프로젝트"`
   - `"히라아마"` → `"히라야마"` (영화 Perfect Days 주인공)
   - `"빚 벤터스"` / `"팀 벤터스"` → `"빔 벤더스"` (감독 Wim Wenders)
4. **OCR 특유의 오인식 패턴** — 아래 패턴을 우선적으로 의심한다:
   - 받침 오류: `긋`→`곳`, `잇`→`있`, `앉`→`않`, `햇`→`했`
   - 자모 혼동: `논`→`는`, `안분`→`않은`, `적논지`→`졌는지`
   - 잘린 문장: 세그먼트 끝에 조사·어미가 빠진 경우, 다음 세그먼트 시작과 연결하여 복원
   - 특수문자 노이즈: `_`, `;`, `:` 등이 문장 끝에 불필요하게 붙은 경우 제거
5. **일반 지식 기반 교정** — OCR이 글자 단위로는 그럴듯하지만 의미적으로 틀린 경우, AI의 일반 지식을 활용하여 교정한다:
   - 널리 알려진 고유명사: `"고로나"` → `"코로나"`, `"올림픽"` 문맥에서 `"2020년"` 등
   - 채널명·인사말: video_info.json의 채널명·제목을 참고하여 인트로 인사 교정 (예: `"비밀이 합니다"` → `"비밀이야 입니다"`)
   - 지명·건축가명 등: 문맥상 언급되는 실존 인물·장소를 AI 지식으로 검증 (예: `"쿠마 렌고"` → `"쿠마 켄고"`, `"프리초거상"` → `"프리츠커상"`)

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
