# 프로젝트 개요

Sunrei는 영화, 드라마, 소설, 애니메이션 등의 촬영지나 배경이 된 장소를 찾아가는 '성지순례' 여행을 위한 지도 기반 웹 애플리케이션.
지도에서 작품별 장소들을 탐색할 수 있으며 클릭 시 상세정보를 얻을 수 있다.

## 기술 스택

Backend (Ktor + Exposed + PostgreSQL), Frontend (Next.js + TypeScript + Google Maps)

# 도메인 용어

성지순례는 영화, 드라마, 소설, 애니메이션 등의 촬영지나 배경이 된 장소를 찾아가는 여행을 말한다.

#### Sunrei

- 성지순례에서 파생된 용어
- 특정 콘텐츠(영화/드라마/소설/애니메이션)와 관련된 장소들의 집합체
- 하나의 작품에 대응하는 최상위 개념

#### SunreiSpot

- Sunrei에 속한 개별 장소
- 작품 내 특정 장면이나 에피소드와 연결된 실제 장소
- 예: "7화에서 주인공이 울면서 식사한 식당"
- 하나 이상의 Place와 연결됨 (many-to-many)

#### Place

- SunreiSpot의 실제 위치 정보
- 여러 SunreiSpot에서 공유 가능 (예: 도쿄역이 여러 작품에 등장)

#### Image

- 여러 해상도를 대응하기 위해 widh, height 정보도 같이 이용한다.

# YouTube → Sunrei Skills

YouTube 영상에서 장소를 추출하여 Sunrei를 생성하는 CLI 기반 워크플로우. 5개의 스킬로 구성되어 있으며 각 단계마다 사용자 확인을 거침.

## 스킬 목록

| 스킬 | 설명 |
|------|------|
| `/youtube-fetch-info [url]` | YouTube 영상/플레이리스트 메타데이터 조회 |
| `/youtube-extract-transcript` | 자막 추출 및 정리 (youtube-transcript-api, whisper 폴백) |
| `/youtube-extract-locations` | 영상 컨셉 기반 장소 추출 + Google Maps 지오코딩 |
| `/youtube-create-sunrei` | 추출된 데이터로 서버 API를 통해 Sunrei 생성 |
| `/youtube-to-sunrei [url]` | 위 4개 스킬을 순서대로 실행하는 전체 워크플로우 |

## 데이터 흐름

```
YouTube URL → video_info.json → transcripts.json → locations.json → POST /admin/sunreis
```

중간 데이터는 `.claude/workspace/youtube/{ID}/`에 저장되어 스킬 간 공유됨.

## API 키 요구사항

`sunrei-worker/.env`에서 로드:
- `youtube_api_key` — YouTube Data API v3
- `google_maps_api_key` — Google Maps Places API

## 서버 의존성

`/youtube-create-sunrei`는 sunrei-server가 실행 중이어야 하며 관리자 JWT 토큰이 필요함.
