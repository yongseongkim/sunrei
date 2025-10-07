# YouTube Transcript to Sunrei Data Extractor

YouTube 플레이리스트에서 비디오 정보와 자막을 추출하고 AI로 장소 정보를 분석하여 Sunrei 어드민 폼에 사용할 데이터를 생성하는 도구.

**추출 정보**: 제목, 설명, 채널, 게시일, 썸네일, 태그, 조회수, 좋아요 수, 댓글 수, 자막 등

## 사용법

```bash
# 1. 환경 변수 설정
# .env 파일에 API 키 입력 (YOUTUBE_API_KEY, OPENAI_API_KEY 등)
cp .env.example .env

# 2. 실행
uv run main.py <PLAYLIST_ID>

# 3. 결과 확인
# - transcripts/<PLAYLIST_ID>/ : 추출된 자막 (플레이리스트별 폴더)
#   - VIDEO_ID.json : 각 비디오의 자막 데이터
#   - playlist_summary.json : 플레이리스트 요약
# - output/<PLAYLIST_ID>/ : AI가 분석한 장소 데이터 (플레이리스트별 폴더)
#   - VIDEO_ID.json : 각 비디오의 장소 데이터
```

## 옵션

```bash
# AI 제공자 선택 (기본값: openai)
uv run main.py <PLAYLIST_ID> --provider gemini

# 특정 모델 지정
uv run main.py <PLAYLIST_ID> --provider openai --model gpt-4o-mini

# 자막만 추출 (AI 분석 스킵)
uv run main.py <PLAYLIST_ID> --skip-extraction

# 좌표 추가 (Google Geocoding API 사용)
uv run geocode_locations.py output/
```

## 동작 방식

1. **Playlist 비디오 추출**
   - YouTube Data API로 비디오 목록 및 메타데이터 수집
   - Rate limiting 방지를 위해 각 비디오 추출 후 1-10초 랜덤 대기
   - 캐시된 transcript는 딜레이 없이 즉시 사용

2. **자막을 30초 단위로 분할**하여 AI에게 전달
   ```
   [0:00-0:30] 안녕하세요, 오늘은 도쿄 여행을...
   [0:30-1:00] 첫 번째로 방문한 곳은 시부야입니다...
   ```

3. **Description 정리** (LLM 사용)
   - 음악 크레딧, 링크 등 불필요한 정보 제거
   - 장소 관련 정보만 유지

4. AI가 각 **시간 구간에서 장소 정보 추출**
   - 30초 단위로 충분한 맥락 제공
   - 정확한 timestamp 파악 가능
   - 영상에서 언급된 그대로의 정보만 사용
   - 중복 장소 자동 제거 (첫 번째 언급 시점 사용)

5. **Google Maps API로 좌표 변환** (선택적)

## 출력 형식

AI가 추출한 장소 데이터 (`output/PLAYLIST_ID/VIDEO_ID.json`):

```json
{
  "extracted_data": {
    "video_summary": "도쿄의 유명 관광지를 소개하는 영상",
    "locations": [
      {
        "location_name": "Shibuya Scramble Crossing",
        "location_query": "Shibuya Scramble Crossing, Shibuya, Tokyo, Japan",
        "description": "세계에서 가장 붐비는 교차로로 유명하며...",
        "timestamp": 10,
        "video_url_with_timestamp": "https://youtube.com/watch?v=VIDEO_ID&t=10s"
      }
    ]
  }
}
```

> - Transcript는 30초 단위로 분할되어 AI에게 전달됩니다
> - `timestamp`는 해당 장소가 처음 언급된 시간(초)입니다
> - `video_url_with_timestamp`는 자동 생성됩니다
> - 중복된 장소는 자동으로 제거되며, timestamp 순서로 정렬됩니다

## Geocoding (좌표 추가)

AI가 추출한 `location_query`를 Google Maps API로 위도/경도 변환:

```bash
# 단일 파일
uv run geocode_locations.py output/PLAYLIST_ID/VIDEO_ID.json

# 디렉토리 전체 (모든 플레이리스트)
uv run geocode_locations.py output/
```

실행 후 각 location에 `latitude`, `longitude` 필드가 추가됩니다.

## S3 Upload (백업)

추출한 transcript 및 output 데이터를 S3에 백업:

```bash
# aws-vault 사용 (권장)
aws-vault exec xxx -- uv run upload_to_s3.py --all             # 실제 업로드
# 특정 디렉토리만 업로드
uv run upload_to_s3.py --transcripts transcripts/ --bucket my-bucket
uv run upload_to_s3.py --outputs output/ --bucket my-bucket
```

## 데이터베이스에 Import

추출한 장소 데이터를 Sunrei 데이터베이스에 저장합니다.

### 1. 개별 영상을 각각 Sunrei로 Import (기존 방식)

```bash
# 단일 파일
uv run import_to_database.py output/PLAYLIST_ID/VIDEO_ID.json

# 디렉토리 전체 (각 영상이 별도 Sunrei로 생성됨)
uv run import_to_database.py output/
```

### 2. Playlist 전체를 하나의 Sunrei로 Import (권장)

Playlist의 모든 영상을 하나의 Sunrei로 묶어서 생성합니다. 각 영상의 장소들이 SunreiSpot으로 추가됩니다.

```bash
# 특정 플레이리스트 import
uv run import_playlist_to_database.py output/PLAYLIST_ID

# 모든 플레이리스트 일괄 import
uv run import_playlist_to_database.py output/

# Dry run으로 미리보기
uv run import_playlist_to_database.py output/PLAYLIST_ID --dry-run
```

**Environment variables** (`.env`):
- `SUNREI_API_URL`: Sunrei Admin API URL (기본값: `http://localhost:8080`)
- `SUNREI_API_TOKEN`: JWT 인증 토큰 (선택사항)

## API 키

`.env` 파일에 다음 키를 설정:

- `YOUTUBE_API_KEY` (필수)
- `GOOGLE_MAPS_API_KEY` (좌표 변환 시 필요)
- `OPENAI_API_KEY` / `GEMINI_API_KEY` (하나 이상)
