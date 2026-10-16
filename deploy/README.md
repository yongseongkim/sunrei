# 배포

Sunrei는 버전 태그를 기준으로 배포한다.
태그를 push하면 GitHub Actions가 이미지를 GHCR에 올리고 Helm chart 버전을 바꾸며, homelab k3s의 ArgoCD가 `main`의 `deploy/helm`을 자동으로 동기화한다.
클러스터, ArgoCD Application, Cloudflare Tunnel, 공유 PostgreSQL 설정은 homelab-infra 저장소가 관리한다.

```
release.sh -> tag vX.Y.Z -> GitHub Actions -> GHCR -> chart commit on main -> ArgoCD -> k3s
```

| Component | Port | Replicas | 공개 주소 |
|-----------|------|----------|-----------|
| admin     | 3102 | 1        | `sunrei-admin.yongseongkimm.com` |
| app       | 3101 | 2        | `sunrei.yongseongkimm.com` |
| server    | 3100 | 2        | `sunrei-api.yongseongkimm.com` |

모든 이미지는 linux/arm64로 빌드한다.
migration 이미지는 ArgoCD PreSync hook Job으로 실행되어, 새 Pod가 뜨기 전에 Flyway migrate를 마친다.

## 릴리스

```bash
./scripts/release.sh
```

스크립트는 `.env`와 `application-prod.conf` 외에 커밋하지 않은 변경이 없는지 확인한다.
그다음 가장 최근 `vX.Y.Z` 태그의 patch 버전을 하나 올린 태그를 만들어 push하며, 버전 인자는 받지 않는다.

태그 push가 `.github/workflows/docker-publish.yml`을 실행한다.

1. build: admin, app, server, migration 이미지를 `deploy/dockerfiles/*.Dockerfile`로 빌드해 `ghcr.io/yongseongkim/sunrei/<name>`에 `X.Y.Z`와 `latest` 태그로 올린다.
2. update-chart: 모든 이미지가 올라간 뒤 `deploy/helm/Chart.yaml`과 `values.yaml`의 버전을 바꿔 `main`에 커밋한다.
   chart가 이미지보다 먼저 바뀌지 않으므로 ArgoCD가 아직 없는 이미지 태그를 배포하는 일이 없다.

GitHub Actions 화면에서 workflow를 직접 실행할 수도 있으며, 이때는 이미지와 chart를 갱신한 뒤 마지막에 태그를 만든다.

`NEXT_PUBLIC_*` 값은 이미지를 빌드할 때 Next.js 번들에 들어가므로, 바꾸려면 GitHub repository variables를 고치고 다시 릴리스한다.

## 버전 표기

| 위치 | 형식 | 예 |
|------|------|----|
| git 태그 | `v`를 붙인다 | `v0.12.0` |
| `Chart.yaml` `version` | `v`를 붙이지 않는다 | `0.12.0` |
| `Chart.yaml` `appVersion` | `v`를 붙인다 | `v0.12.0` |
| `values.yaml` 이미지 태그 | `v`를 붙이지 않는다 | `0.12.0` |
| GHCR 이미지 태그 | `v`를 붙이지 않는다 | `0.12.0` |

workflow가 git 태그에서 `v`를 떼어 이미지 태그와 chart 버전을 만든다.
이미지 태그에 `v`를 붙이면 `ImagePullBackOff`가 난다.

## Helm chart

- `values.yaml`: 이미지 태그, replica, port, 환경 변수, resource를 정한다.
- `templates/deployment.yaml`, `templates/service.yaml`: admin, app, server의 Deployment와 ClusterIP Service다.
- `templates/migration-job.yaml`: Flyway migration Job이다.

GHCR 이미지는 public이라 `imagePullSecrets`가 필요 없다.
Ingress는 두지 않으며, homelab-infra의 Cloudflare Tunnel이 외부 트래픽을 ClusterIP Service로 보낸다.

## Secrets

Secret은 소유자에 따라 둘로 나뉜다.

- `sunrei-secrets`: 앱이 소유하는 키로, 이 저장소의 `deploy/secrets/secrets.enc.yaml`에 있다.
  SOPS와 Google Cloud KMS로 값만 암호화하고 키 이름은 그대로 두므로, 파일만 봐도 프로젝트가 어떤 키를 쓰는지 알 수 있다.
  암호화 규칙은 루트의 `.sops.yaml`에 있다.
- `sunrei-infra-secrets`: `database-host`, `database-password`처럼 앱이 다른 클러스터나 DB로 옮겨 가면 바뀌는 키로, homelab-infra가 관리한다.

편집하고 적용하려면 KMS 키를 복호화할 수 있는 GCP 인증이 필요하다.

```bash
sops deploy/secrets/secrets.enc.yaml                            # 편집
sops -d deploy/secrets/secrets.enc.yaml | kubectl create -f -   # 처음 적용
sops -d deploy/secrets/secrets.enc.yaml | kubectl replace -f -  # 다시 적용
```

client-side `kubectl apply`는 복호화한 값을 `last-applied-configuration` annotation에 평문으로 남기므로 Secret에는 쓰지 않는다.

| 키 | Secret | 쓰는 곳 |
|----|--------|---------|
| `google-maps-api-key` | sunrei-secrets | admin, app |
| `google-maps-map-id` | sunrei-secrets | admin |
| `google-oauth-client-id` | sunrei-secrets | admin, app, server |
| `google-oauth-client-secret` | sunrei-secrets | server |
| `jwt-page-token-secret` | sunrei-secrets | server |
| `aws-access-key-id` | sunrei-secrets | server |
| `aws-secret-access-key` | sunrei-secrets | server |
| `auth-jwt-secret` | sunrei-secrets | server |
| `database-host` | sunrei-infra-secrets | server, migration |
| `database-password` | sunrei-infra-secrets | server, migration |

키가 없으면 Pod가 `CreateContainerConfigError`로 시작하지 못한다.

`.claude/scripts`의 로컬 스크립트도 `sops -d --extract`로 이 파일의 키를 읽는다.
아래 키는 Pod가 쓰지 않으므로 바꿔도 Secret을 다시 적용할 필요가 없다.

| 키 | 쓰는 곳 |
|----|---------|
| `instagram-access-token` | Instagram 스크립트. Facebook 사용자 토큰이며 `instagram/refresh_token.py`로 약 60일마다 갱신한다 |
| `instagram-user-id` | Instagram 스크립트. Business Discovery를 호출하는 IG 계정이다 |
| `instagram-app-id` | `instagram/refresh_token.py` |
| `instagram-app-secret` | `instagram/refresh_token.py` |

### Secret 변경

ArgoCD는 chart만 배포하고 Secret은 적용하지 않으며, Pod는 시작할 때만 Secret을 환경 변수로 읽는다.
그래서 바뀐 Secret은 그 값이 필요한 릴리스보다 먼저 적용한다.

1. 암호화된 파일을 `sops deploy/secrets/secrets.enc.yaml`로 고쳐 커밋하며, 인프라 키는 homelab-infra에서 고친다.
2. `sops -d ... | kubectl replace -f -`로 클러스터에 적용한다.
3. 그 Secret을 쓰는 Pod를 다시 시작한다.
   - 새 코드가 읽는 새 키라면 `./scripts/release.sh`로 릴리스하며, rollout이 적용된 Secret으로 Pod를 띄운다.
   - 코드 변경 없이 값만 바꿨다면 `kubectl -n sunrei rollout restart deployment/<name>`을 실행한다.
     ArgoCD는 Secret만 바뀐 것으로는 Pod를 다시 띄우지 않는다.

2단계보다 먼저 릴리스하면 새 Pod가 없는 키를 참조해 `CreateContainerConfigError`로 실패한다.

키를 지울 때는 순서를 거꾸로 한다.
그 키를 읽지 않는 코드를 릴리스하고, 모든 Pod가 새 버전으로 바뀐 뒤에 키를 지우고 Secret을 적용한다.
키를 먼저 지우면 다시 시작한 이전 버전 Pod가 실패하므로, Secret에는 돌고 있는 모든 버전이 읽는 키를 남겨 둔다.

## 문제 해결

### ImagePullBackOff

가장 흔한 원인은 `v` 접두사 불일치다.
GHCR 이미지 태그에는 `v`가 없고, git 태그와 `appVersion`에는 있다.

```bash
# Deployment가 기대하는 이미지
kubectl -n sunrei get deployment sunrei-app -o jsonpath='{.spec.template.spec.containers[0].image}'

# GHCR에 그 이미지가 있는지 확인
docker manifest inspect ghcr.io/yongseongkim/sunrei/app:0.12.0
```

GitHub package 설정에서 이미지가 public인지도 확인한다.

### 배포 확인

```bash
kubectl -n sunrei get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].image}{"\n"}{end}'
kubectl -n sunrei logs -l app.kubernetes.io/component=server --tail=100
```

ArgoCD 동기화처럼 클러스터 쪽 점검 방법은 homelab-infra 문서를 본다.
