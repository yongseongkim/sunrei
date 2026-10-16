# Sunrei

Sunrei는 영화, 드라마, 애니메이션, YouTube 영상, Instagram 게시물에 나온 장소를 지도에서 찾아보는 '성지순례' 여행 서비스다.
여행자는 지도를 움직이며 주변 장소를 둘러보거나, 좋아하는 채널과 작품을 골라 거기에 나온 장소를 모아 본다.
운영자는 어드민에서 작품과 장소를 등록해 공개하고, YouTube 영상과 Instagram 게시물에서 자동으로 뽑은 장소 후보를 검토한다.

도메인 용어와 작업 규칙은 `AGENTS.md`에 있다.

## 주요 기능

공개 앱은 다음 기능을 제공한다.

- 지도 탐색: 지금 보이는 지도 영역의 장소를 지도 중심에서 가까운 순으로 보여 준다.
- 작품별 보기: 채널이나 작품을 고르면 지역과 관계없이 거기에 나온 장소를 모두 보여 준다.
- 영상 미리보기: 장소 카드에서 영상을 고르면 그 영상에 나온 장소만 지도에 보여 준다.
- 통합 검색: 장소, 채널과 작품, 영상을 한 번에 찾고, Sunrei에 없는 지역은 Google Places 결과로 이동한다.
- 태그 필터: 한국어와 영어로 된 태그로 장소를 거른다.
- 작품 정보: YouTube 채널과 Instagram 계정은 각 서비스로 이동하고, 애니메이션과 TV 작품은 Sunrei가 만든 소개 페이지를 보여 준다.
- 장소 상세의 언급마다 그 장소가 나온 YouTube 장면이나 Instagram 게시물의 이미지와 링크가 있다.
- 화면은 브라우저 언어에 따라 한국어나 영어로 보이며, 기본은 한국어다.

어드민은 Google 로그인 후 admin 권한이 있는 사용자만 쓸 수 있고, 데스크톱 화면만 지원한다.

- Source, Sunrei, Place, Tag를 관리하고 Sunrei를 공개하거나 다시 draft로 돌린다.
- YouTube와 Instagram 수집이 뽑은 장소 후보는 어드민 화면이 아니라 admin API로 승인하거나 반려한다.

## 시스템 구성

```
Browser ---- page ----> sunrei-app, sunrei-admin  (Next.js)
Browser ---- API -----> sunrei-server  (Ktor) ---> PostgreSQL + PostGIS
                                              \--> AWS S3  (images)
YouTube collector ---- admin API --> sunrei-server
Instagram collector -- admin API --> sunrei-server
```

- 브라우저는 Next.js 앱에서 화면을 받고, API는 sunrei-server를 직접 호출한다.
  두 Next.js 앱은 코드를 공유하지 않는 별개의 앱이다.
- sunrei-server는 장소 좌표를 PostGIS로 검색하고, 어드민이 올린 이미지는 여러 크기로 줄여 AWS S3에 저장한다.
- YouTube와 Instagram 수집기는 개인 머신에서 도는 스크립트로, admin API를 통해 수집 상태와 장소 후보를 DB에 기록한다.
  서버는 YouTube와 Instagram을 직접 호출하지 않는다.
- 외부 서비스로 Google Maps JavaScript/Places/Geocoding API, Google OAuth, YouTube Data API, Instagram Graph API(Business Discovery)를 쓴다.

| 디렉터리 | 역할 |
|----------|------|
| `sunrei-server/` | 공개 API, 어드민 API, 로그인 API를 제공하는 Kotlin 서버 |
| `sunrei-frontend/packages/sunrei-app/` | 여행자가 쓰는 공개 지도 앱 |
| `sunrei-frontend/packages/sunrei-admin/` | 운영자가 쓰는 콘텐츠 관리 앱 |
| `sunrei-api/` | 공개 API와 어드민 API의 OpenAPI 명세 |
| `deploy/` | Dockerfile, Helm chart, 암호화한 Secret |
| `.claude/scripts/youtube/` | YouTube 수집 스크립트 |
| `.claude/scripts/instagram/` | Instagram 수집 스크립트 |

## API 명세와 코드 생성

API 계약은 `sunrei-api/`의 OpenAPI 명세 두 개가 기준이다.
서버는 Gradle 빌드 때 명세에서 Kotlin DTO를 생성하고, 두 프론트엔드 앱은 `pnpm codegen`으로 TypeScript client를 생성한다.
그래서 API를 바꿀 때는 명세를 먼저 고친 뒤 양쪽 코드를 다시 생성한다.

## 콘텐츠 수집

영상 하나를 직접 처리할 때는 Claude Code에서 `/youtube-to-sunrei <URL>` 스킬로 단계마다 확인하며 Sunrei를 만든다.
등록한 플레이리스트에 새 영상이 올라오면 수집 스크립트가 장소 후보를 뽑아 DB에 쌓고, 운영자가 승인한 후보만 지도에 나온다.
실행 방법은 `.claude/scripts/youtube/AUTOMATION.md`에 있다.

Instagram은 계정 하나를 Sunrei 하나로 모은다.
`/instagram-to-sunrei` 스킬로 계정을 등록하고 게시물을 수집하면, 캡션과 릴스의 음성·화면 텍스트에서 장소 후보를 뽑아 DB에 쌓는다.
운영자가 승인한 후보만 그 게시물로 가는 링크와 함께 지도에 나온다.
실행 방법은 `.agents/skills/instagram-to-sunrei/SKILL.md`에, 설계는 `SPEC-instagram.md`에 있다.

## 로컬 개발

- 서버: `sunrei-server/README.md`
- 프론트엔드: `sunrei-frontend/README.md`

## 배포

`scripts/release.sh`로 버전 태그를 push하면 GitHub Actions가 이미지를 빌드하고 Helm chart 버전을 올리며, homelab k3s의 ArgoCD가 새 버전을 배포한다.
Secret은 SOPS로 암호화한 파일을 수동으로 적용한다.
절차와 문제 해결은 `deploy/README.md`에 있고, 클러스터 쪽 설정은 homelab-infra 저장소에 있다.
