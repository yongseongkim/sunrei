# Project Sunrei

Sunrei는 영화, 드라마, 소설, 애니메이션 등의 촬영지나 배경이 된 장소를 찾아가는 '성지순례' 여행을 위한 지도 기반 웹 애플리케이션.
지도에서 작품별 장소들을 탐색할 수 있으며 클릭 시 상세정보를 얻을 수 있다.

도메인 관련 코드를 변경할 때, 해당 내용을 설명하는 AGENTS.md가 있다면 함께 업데이트한다.

## Architecture

Backend (Ktor + Exposed + PostgreSQL), Frontend (Next.js + TypeScript + Google Maps)

## Core Domain

### Source

콘텐츠의 출처 또는 작품 단위. YouTube/TV/Anime/Other 타입을 가지며, 타입에 따라 public 앱 동작이 달라진다.
YouTube Source는 외부 링크로 이동하고, Anime/TV/Other Source는 Sunrei가 관리하는 정보 페이지로 표시한다.

### Sunrei

성지순례에서 파생된 용어로, 하나의 Source에 속한 개별 영상/에피소드/작품 항목.
요약(summary)과 여러 SunreiSpot을 가진다.
공개 상태는 `published_at`으로 관리한다. `NULL` = draft, 값이 있으면 published.
Public 엔드포인트는 `published_at IS NOT NULL`인 Sunrei만 노출하며, Admin은 모두 본다.

### SunreiSpot

Sunrei에 속한 개별 장소로, 작품 내 특정 장면이나 에피소드와 연결된 실제 장소
예를 들어, "7화에서 주인공이 울면서 식사한 식당" 같이 하나의 Place 와 연결된다.
Source가 해당 장소를 언급한 맥락(context)과 spot 단위 태그를 가진다.

### Place

실제 위치 정보로 현재는 GoogleMaps 정보를 이용한다.
여러 작품에 "도쿄역" 이 등장하듯이, 여러 SunreiSpot 이 한 Place 를 가리킬 수 있다.
Public 지도에서는 Place 하나가 마커 하나와 카드 하나로 표시되며, 같은 Place의 여러 Source/SunreiSpot 언급은 카드 안에 집계된다.

### Tag

SunreiSpot에 연결되는 bilingual 태그. `label_en`, `label_ko`를 가지며 public 필터링은 spot 태그 기준으로 동작한다.

### YouTube 수집

등록한 플레이리스트의 새 영상에서 장소 후보를 추출하고, 어드민 검토를 거쳐 SunreiSpot으로 만든다.
수집 job과 스킬은 `/admin/youtube/*` admin API로 같은 DB 상태를 읽고 쓴다.

- `youtube_playlist`: 등록한 플레이리스트로, `sync_enabled`가 주기 수집 대상을 정하고 `sunrei_id`가 승인된 장소가 들어갈 Sunrei다.
- `youtube_video`, `youtube_playlist_video`: 영상과 플레이리스트 소속이다. 동기화 때 목록에서 빠진 영상은 `removed_at`만 기록하고 데이터와 spot은 지우지 않는다.
- `youtube_video.status`: `PENDING`과 `FAILED`가 처리 대상이고, 추출이 끝나면 `REVIEW_PENDING`, 후보 검토가 모두 끝나면 `COMPLETED`가 된다. 기준선으로 등록한 기존 영상은 `SKIPPED`다.
- `youtube_video_text`: 자막, Whisper, OCR, 검토된 transcript, timeline을 종류별로 쌓아 두어 디버깅과 재추출에 쓴다.
- `youtube_extraction_run`, `youtube_extracted_place`: agent 실행 기록(원본 출력, prompt 해시)과 장소 후보다. 후보는 승인될 때만 SunreiSpot이 되며, 반려한 후보도 남겨 둔다.
- `youtube_video_attempt`: 자막 차단, rate limit 같은 외부 호출 실패 기록이다.

## Deployment

- Infrastructure: k3s on Oracle Cloud ARM (Chuncheon), ArgoCD (GitOps), Cloudflare Tunnel
- Registry: GHCR (`ghcr.io/yongseongkim/sunrei`) — public, no auth needed
- Services: admin(:3102), app(:3101), server(:3100) — all linux/arm64
- Domains: sunrei.com, admin.sunrei.com, api.sunrei.com
- Release flow: `scripts/release.sh` → auto-increment version → create and push tag → GitHub Actions builds images → GitHub Actions updates Helm chart → ArgoCD auto-syncs
- Version convention: git tags use `v` prefix (`v0.12.0`), image tags and chart `version` strip it (`0.12.0`), chart `appVersion` keeps it (`v0.12.0`)
- Verify deployment: `kubectl get pods -n sunrei`, `argocd app get sunrei`
- Secrets: 앱 소유 키는 `deploy/secrets/secrets.enc.yaml` (SOPS + GCP KMS, rules in `.sops.yaml`), 인프라 종속 키(`database-host/password`)는 homelab-infra의 `sunrei-infra-secrets` — 수동 적용: `sops -d ... | kubectl create/replace -f -` (`kubectl apply` 금지)
- Common issue: `ImagePullBackOff` — check for `v` prefix mismatch between chart values and actual image tags

자세한 내용은 `deploy/README.md` 참고.
