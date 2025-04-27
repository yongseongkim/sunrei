# 프로젝트 개요

Sunrei는 영화, 드라마, 소설, 애니메이션 등의 촬영지나 배경이 된 장소를 찾아가는 '성지순례' 여행을 위한 지도 기반 웹 애플리케이션입니다.

## 주요 기능

- 지도에서 작품별 성지순례 장소를 탐색
- 지도 이동 시 해당 영역의 Sunrei만 표시 (실시간 필터링)
- 작품 선택 시 관련 장소들이 지도에 하이라이트
- 장소 클릭 시 상세 정보 확인

**기술 스택**: Backend (NestJS + TypeORM + PostgreSQL), Frontend (Next.js + TypeScript + Google Maps)

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

#### Tag

- Sunrei를 분류하는 태그 (예: "애니메이션", "영화", "드라마")

#### Image

- Sunrei와 SunreiSpot의 이미지

## TypeORM 관계

- Sunrei ↔ SunreiSpot: 1:N
- SunreiSpot ↔ Place: N:M (중간 테이블: sunrei_spot_place)
- Sunrei ↔ Tag: N:M
- Sunrei/SunreiSpot ↔ Image: 1:N
- 모든 엔티티는 @BeforeInsert로 자동 ID 생성 (`{entity}_{randomHex}`)

# API 프로토콜 가이드

## 네이밍 컨벤션

- **요청**: `{HttpMethod}{Name}Params` (예: `GetUserParams`, `ListUsersParams`)
- **응답**: `{HttpMethod}{Name}Result` (예: `GetUserResult`, `ListUsersResult`)
- RESTful API + OpenAPI 3.0 스펙

## 구현된 API 엔드포인트

### Sunrei API

#### GET /sunreis

- 모든 Sunrei 목록 조회 또는 polygon 영역 내 Sunrei 검색
- Query Parameters:
  - `polygon` (optional): WKT 형식의 polygon 문자열
  - 예: `POLYGON((139.5 35.5, 139.8 35.5, 139.8 35.8, 139.5 35.8, 139.5 35.5))`
  - 지도 viewport 변경 시 자동으로 bounds를 polygon으로 변환하여 API 호출 (500ms debounce)
  - Point-in-polygon 알고리즘으로 영역 내 Place 필터링
- Response: `ListSunreiResult`
  - sunreis: SunreiDTO[] (spots와 places가 중첩된 구조)

#### GET /sunreis/{id}

- 특정 Sunrei 상세 정보 조회
- Path Parameters:
  - `id`: Sunrei ID
- Response: `GetSunreiResult`
