# Project Sunrei

Sunrei는 영화, 드라마, 애니메이션, YouTube 영상, Instagram 게시물 등의 촬영지나 배경이 된 장소를 찾아가는 '성지순례' 여행을 위한 지도 기반 웹 애플리케이션이다.
제품과 시스템 구성의 설명은 `README.md`에 있고, 이 문서는 작업할 때 지켜야 할 규칙과 위치를 적는다.

도메인 관련 코드를 변경할 때, 해당 내용을 설명하는 AGENTS.md가 있다면 함께 업데이트한다.

## 구성

- `sunrei-server/`: Ktor, Exposed, PostgreSQL + PostGIS로 만든 API 서버다.
  공개 API `/api/*`, 어드민 API `/admin/*`, 로그인 API `/api/auth/*`를 제공한다.
  실행 방법과 서버 규칙은 `sunrei-server/README.md`에 있다.
- `sunrei-frontend/`: Next.js pnpm workspace다.
  `packages/sunrei-app`은 공개 지도 앱이고, `packages/sunrei-admin`은 콘텐츠를 관리하는 어드민이다.
  두 앱은 코드를 공유하지 않으며, 상세 규칙은 `sunrei-frontend/AGENTS.md`에 있다.
- `sunrei-api/`: OpenAPI 3.0 명세다.
  `app-api-spec.yaml`은 공개 API, `admin-api-spec.yaml`은 어드민 API이며, 서버와 프론트엔드 DTO는 모두 이 명세에서 생성한다.
- `deploy/`: Dockerfile, Helm chart, SOPS로 암호화한 Secret이 있다.
  배포 절차는 `deploy/README.md`에 있다.
- `scripts/release.sh`: 릴리스 태그를 만들어 배포를 시작한다.
- `.claude/scripts/youtube/`, `.claude/scripts/instagram/`, `.agents/skills/`: YouTube 영상과 Instagram 게시물에서 장소를 수집하는 스크립트와 Claude Code 스킬이다.

## API 명세와 코드 생성

API를 바꿀 때는 `sunrei-api/`의 명세를 먼저 고치고 DTO를 다시 생성한다.

- 서버: `cd sunrei-server && ./gradlew generateProtocols`가 `build/generated-app`, `build/generated-admin`에 Kotlin DTO를 만든다.
  `compileKotlin` 전에 자동으로 실행되며, 생성 코드는 커밋하지 않는다.
- 프론트엔드: `pnpm codegen`이 typescript-axios client를 sunrei-app은 `src/dto`, sunrei-admin은 `src/api/admin`에 만든다.
  생성 코드는 커밋하고 손으로 고치지 않으며, openapi-generator-cli를 쓰므로 Java가 필요하다.

## Core Domain

`Source -> Sunrei -> SunreiSpot -> Place` 순서로 묶인다.

### Source

콘텐츠의 출처 또는 작품 단위다.
YouTube/Instagram/TV/Anime/Other 타입을 가지며, 타입에 따라 public 앱 동작이 달라진다.
YouTube와 Instagram Source는 외부 링크로 이동하고, Anime/TV/Other Source는 Sunrei가 관리하는 정보 페이지로 표시한다.
`external_url`은 YouTube와 Instagram Source에서는 이동할 채널이나 프로필 주소이고, 나머지 Source에서는 작품을 볼 수 있는 곳의 주소다.

### Sunrei

성지순례에서 파생된 용어로, 하나의 Source에 속한 개별 영상/에피소드/작품 항목.
요약(summary)과 여러 SunreiSpot을 가지며, `link`는 그 영상이나 작품 항목의 주소다.
공개 상태는 `published_at`으로 관리한다.
`NULL`이면 draft이고, 값이 있으면 published다.
Public 엔드포인트는 `published_at IS NOT NULL`인 Sunrei와 그 spot만 노출하며, Admin은 모두 본다.

### SunreiSpot

Sunrei에 속한 개별 장소로, 작품 내 특정 장면이나 에피소드와 연결된 실제 장소다.
예를 들어, "7화에서 주인공이 울면서 식사한 식당" 같이 하나의 Place 와 연결된다.
Source가 해당 장소를 언급한 맥락(context)과 spot 단위 태그를 가진다.
`source_link`는 그 장소를 언급한 콘텐츠로 바로 가는 링크이며 없어도 된다.
YouTube 영상의 그 장면 시각이나 Instagram 게시물 주소다.
V3에서 `youtube_link`를 대신했고, V4에서 `youtube_link`를 지웠다.
spot 이미지가 있으면 공개 지도의 언급에 그 이미지를 보여 주고, 없으면 Sunrei 이미지를 보여 준다.

### Place

실제 위치 정보로 현재는 GoogleMaps 정보를 이용한다.
여러 작품에 "도쿄역" 이 등장하듯이, 여러 SunreiSpot 이 한 Place 를 가리킬 수 있다.
같은 장소인지는 Google place ID인 `google_maps_id`로 판정한다.
Public 지도에서는 Place 하나가 마커 하나와 카드 하나로 표시되며, 같은 Place의 여러 Source/SunreiSpot 언급은 카드 안에 집계된다.
카드에는 Sunrei마다 한 줄씩 보이므로, 같은 채널이라도 영상이 다르면 따로 보인다.

### Tag

SunreiSpot에 연결되는 bilingual 태그다.
`label_en`, `label_ko`를 가지며 public 필터링은 spot 태그 기준으로 동작한다.
어드민에서 없는 이름을 입력하면 두 label을 모두 그 이름으로 만들고, 영어 label은 나중에 고친다.
Place의 태그는 그 Place에 있는 공개 spot의 태그를 모두 합친 것이다.

## 공개 지도 규칙

- 거리는 사용자 위치가 아니라 항상 지도 중심에서 잰다.
  위치 권한은 처음 지도 중심을 정할 때만 쓰고, 거부하면 서울에서 시작한다.
- nearby 모드는 지금 보이는 지도 영역(bounds) 안의 Place를 찾는다.
- source 모드는 Source를 하나 이상 고르면 시작하며, 지도 영역과 관계없이 고른 Source의 Place를 모두 보여 준다.
- 영상 미리보기는 nearby나 source 모드 위에 잠시 겹치는 상태로, 한 Sunrei의 spot만 보여 준다.
- 태그 필터는 클라이언트에서 처리한다.
  서버는 태그가 맞지 않는 Place도 돌려주고, 앱은 그 Place를 목록에서 빼고 지도 핀은 흐리게 표시한다.
- 요청 파라미터는 `sunrei-api/app-api-spec.yaml`의 `/api/map` 설명에 있다.

## YouTube 수집

등록한 플레이리스트의 새 영상에서 장소 후보를 추출하고, 어드민 검토를 거쳐 SunreiSpot으로 만든다.
수집 스크립트와 스킬은 `/admin/youtube/*` admin API로 같은 DB 상태를 읽고 쓴다.
YouTube가 데이터센터 IP에서 오는 자막과 영상 다운로드를 막으므로, 수집은 클러스터가 아닌 개인 머신에서 실행한다.
실행 방법은 `.claude/scripts/youtube/AUTOMATION.md`에, 테이블별 설명은 `sunrei-server/src/main/resources/db/migration/V2__youtube_collection.sql` 주석에 있다.

- `youtube_video.status`: `PENDING`과 `FAILED`가 처리 대상이고, 추출이 끝나면 `REVIEW_PENDING`, 후보 검토가 모두 끝나면 `COMPLETED`가 된다.
  기준선으로 등록한 기존 영상과, 음성·영상 다운로드가 멤버십 전용으로 거부된 영상은 `SKIPPED`이며 다시 처리하지 않는다.
- 동기화 때 플레이리스트에서 빠진 영상은 `removed_at`만 기록하고 데이터와 spot은 지우지 않는다.
- 장소 후보는 `PATCH /admin/youtube/extracted-places/{id}`로 승인될 때만 SunreiSpot이 되며, 반려한 후보도 남겨 둔다.

## Instagram 수집

등록한 Instagram 계정의 게시물에서 장소 후보를 추출하고, 어드민 검토를 거쳐 SunreiSpot으로 만든다.
YouTube 수집과 같은 구조이며, 수집 스크립트와 스킬은 `/admin/instagram/*` admin API로 같은 DB 상태를 읽고 쓴다.
게시물 수집, 릴스 전사, 장소 추출은 모두 개인 머신의 스킬(`instagram-to-sunrei`)이 하고, 서버는 Instagram을 호출하지 않는다.
설계와 결정 사항은 `SPEC-instagram.md`에, 테이블별 설명은 `sunrei-server/src/main/resources/db/migration/V3__instagram_collection.sql` 주석에 있다.

- 계정 하나에 Sunrei 하나이며, 승인한 후보는 게시물 링크를 `source_link`로 하는 SunreiSpot이 된다.
- 게시물 상태값은 YouTube 영상과 같다.
  캡션은 게시물에 저장하고, Instagram에서 지운 게시물은 감지하지 않는다.
- 같은 게시물을 다시 추출하면 이전 실행의 대기 후보는 `SUPERSEDED`가 된다.
- 광고 표시 글과 작성자 본인의 상품·행사를 알리는 글은 후보를 만들지 않고 실행 기록에만 남기며, 서버가 이 규칙을 지킨다.
- 상호를 찾지 못한 후보는 지도 검색을 하지 않으므로, 승인하려면 장소를 직접 지정해야 한다.
- 후보가 있는 게시물은 이미지(릴스 커버, 사진, 캐러셀 최대 5장)를 이미지 저장소에 복사해 `instagram_post.images`에 두고, 승인한 spot의 이미지로 쓴다.
  Instagram 이미지 주소는 서명이 만료되므로 원래 주소는 저장하지 않는다.

## Deployment

- 릴리스: `./scripts/release.sh`가 다음 patch 버전 태그를 push하면, GitHub Actions가 admin, app, server, migration 이미지를 linux/arm64로 빌드해 GHCR `ghcr.io/yongseongkim/sunrei/<name>`에 올리고 `deploy/helm`의 버전을 `main`에 커밋한다.
- 배포: homelab k3s의 ArgoCD가 `main`의 `deploy/helm`을 자동 동기화하고, 새 Pod보다 먼저 migration Job이 Flyway migrate를 실행한다.
- 버전 표기: git 태그와 chart `appVersion`은 `v0.12.0`처럼 `v`를 붙이고, 이미지 태그와 chart `version`은 `0.12.0`처럼 붙이지 않는다.
  둘이 어긋나면 `ImagePullBackOff`가 난다.
- 서비스: namespace `sunrei`에서 server는 3100, app은 3101, admin은 3102 포트로 돈다.
- 공개 주소: app은 `sunrei.yongseongkimm.com`, admin은 `sunrei-admin.yongseongkimm.com`, server는 `sunrei-api.yongseongkimm.com`이다.
  Cloudflare Tunnel 연결은 homelab-infra가 관리한다.
- Secrets: 앱 소유 키는 SOPS와 GCP KMS로 암호화한 `deploy/secrets/secrets.enc.yaml`에 있고, 암호화 규칙은 `.sops.yaml`에 있다.
  `database-host`, `database-password`처럼 인프라에 묶인 키는 homelab-infra가 관리하는 `sunrei-infra-secrets`에 있다.
  ArgoCD는 Secret을 적용하지 않으므로 `sops -d ... | kubectl create/replace -f -`로 수동 적용하고, `kubectl apply`는 쓰지 않는다.

자세한 내용은 `deploy/README.md` 참고.
