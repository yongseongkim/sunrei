# YouTube Video Extractor

YouTube 영상에서 장소 정보를 AI(Claude/Gemini)로 추출하는 도구입니다.

## 요구사항

- Python 3.11+
- API Keys (`.env` 파일에 설정)
  - `YOUTUBE_API_KEY` - YouTube Data API (필수)
  - `ANTHROPIC_API_KEY` - Claude 사용 시
  - `GEMINI_API_KEY` - Gemini 사용 시
  - `GOOGLE_MAPS_API_KEY` - 지오코딩용 (선택)

## 설치

```bash
uv sync
```

## 사용법

```bash
# 단일 영상
uv run python main.py "https://youtube.com/watch?v=VIDEO_ID"

# 플레이리스트
uv run python main.py "https://www.youtube.com/playlist?list=PLxxxxxx"

# 특정 단계만 실행
uv run python main.py URL --only transcript   # 자막만 추출 (Whisper STT)
uv run python main.py URL --only locations    # 장소만 추출 (자막 캐시 필요)
uv run python main.py URL --only geocode      # 지오코딩만 (장소 캐시 필요)

# Gemini STT 사용 (기본은 Whisper)
uv run python main.py URL --only transcript --use-gemini-stt

# Gemini로 장소 추출
uv run python main.py URL --provider gemini

# STT/지오코딩 스킵
uv run python main.py URL --skip-stt-fallback --skip-geocoding
```

### 주요 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--only` | 특정 단계만 실행 (transcript/locations/geocode) | - |
| `--provider` | AI 제공자 (claude/gemini) | claude |
| `--transcript-delay` | API 요청 간격 (초) | 60 |
| `--whisper-model` | Whisper 모델 (tiny/base/small/medium/large) | medium |
| `--use-gemini-stt` | Gemini STT 사용 (기본은 Whisper) | - |
| `--skip-stt-fallback` | 자막 없을 때 STT 스킵 | - |
| `--skip-geocoding` | 지오코딩 스킵 | - |
