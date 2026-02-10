# Project Sunrei

Sunrei는 영화, 드라마, 소설, 애니메이션 등의 촬영지나 배경이 된 장소를 찾아가는 '성지순례' 여행을 위한 지도 기반 웹 애플리케이션.
지도에서 작품별 장소들을 탐색할 수 있으며 클릭 시 상세정보를 얻을 수 있다.

## Architecture

Backend (Ktor + Exposed + PostgreSQL), Frontend (Next.js + TypeScript + Google Maps)

## Core Domain

### Sunrei

성지순례에서 파생된 용어로, 특정 콘텐츠(영화/드라마/소설/애니메이션)와 관련된 장소들의 집합체

### SunreiSpot

Sunrei에 속한 개별 장소로, 작품 내 특정 장면이나 에피소드와 연결된 실제 장소
예를 들어, "7화에서 주인공이 울면서 식사한 식당" 같이 하나의 Place 와 연결된다.

### Place

실제 위치 정보로 현재는 GoogleMaps 정보를 이용한다.
여러 작품에 "도쿄역" 이 등장하듯이, 여러 SunreiSpot 이 한 Place 를 가리킬 수 있다.

## Contents Creating

### Claude Code Skills (YouTube → Sunrei)

Claude Code CLI에서 직접 YouTube 영상을 처리하여 Sunrei를 생성하는 워크플로우

```
/youtube-to-sunrei https://www.youtube.com/watch?v=VIDEO_ID
```

5개의 개별 스킬로 구성되며, 각 단계에서 사용자 확인 후 진행한다.

1. `/youtube-fetch-info` — 영상 메타데이터 조회 (YouTube Data API v3)
2. `/youtube-extract-transcript` — 자막 추출 및 한국어 정리
3. `/youtube-extract-locations` — 영상 컨셉 기반 장소 추출 + 지오코딩
4. `/youtube-create-sunrei` — 서버 API로 Sunrei 생성
5. `/youtube-to-sunrei` — 위 4단계를 자동으로 연결

#### Requirements
- env
    - `sunrei-worker/.env`에 `youtube_api_key`, `google_maps_api_key` 설정 필요
- Admin Server Access
    - 로컬 서버 실행: `cd sunrei-server && ./gradlew run --args="-config=application-local.conf"` (Docker로 PostgreSQL 필요)
    - 운영 서버 포트포워딩: `kubectl port-forward svc/sunrei-server 3030:3100`

