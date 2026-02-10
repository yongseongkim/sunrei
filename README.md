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

## Claude Code Skills (YouTube → Sunrei)

관리자 페이지의 서버→RabbitMQ→워커 파이프라인 대신, Claude Code CLI에서 직접 YouTube 영상을 처리하여 Sunrei를 생성하는 대안적 워크플로우.

```
/youtube-to-sunrei https://www.youtube.com/watch?v=VIDEO_ID
```

5개의 개별 스킬로 구성되며, 각 단계에서 사용자 확인 후 진행:

1. `/youtube-fetch-info` — 영상 메타데이터 조회 (YouTube Data API v3)
2. `/youtube-extract-transcript` — 자막 추출 및 한국어 정리
3. `/youtube-extract-locations` — 영상 컨셉 기반 장소 추출 + 지오코딩
4. `/youtube-create-sunrei` — 서버 API로 Sunrei 생성
5. `/youtube-to-sunrei` — 위 4단계를 자동으로 연결

필수 설정: `sunrei-worker/.env`에 `youtube_api_key`, `google_maps_api_key` 설정 필요
