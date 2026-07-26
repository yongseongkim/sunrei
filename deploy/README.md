# Deployment Guide

## Overview

```
Code → GitHub Actions → GHCR → ArgoCD → k3s (Oracle ARM)
```

| Component | Port | Replicas | Domain |
|-----------|------|----------|--------|
| admin     | 3102 | 1        | admin.sunrei.com |
| app       | 3101 | 2        | sunrei.com |
| server    | 3100 | 2        | api.sunrei.com |

All images are built for linux/arm64. External traffic is routed through Cloudflare Tunnel (no Ingress resource needed).

## Release Process

### 1. Run the release script

```bash
./scripts/release.sh
```

The script:
1. Checks the working directory is clean (excluding `.env` files)
2. Reads the latest git tag and auto-increments the patch version (e.g. `v0.12.0` → `v0.12.1`)
3. Creates and pushes the new git tag

### 2. GitHub Actions

Pushing a tag matching `v*.*.*` triggers the Docker Publish to GHCR workflow (`.github/workflows/docker-publish.yml`):

1. **build** (matrix): Builds and pushes four images in parallel:

| Image | Dockerfile |
|-------|-----------|
| sunrei-admin | `deploy/dockerfiles/admin.Dockerfile` |
| sunrei-app | `deploy/dockerfiles/app.Dockerfile` |
| sunrei-server | `deploy/dockerfiles/server.Dockerfile` |
| sunrei-migration | `deploy/dockerfiles/migration.Dockerfile` |

Each image is pushed to `ghcr.io/yongseongkim/sunrei/<name>` with semantic version tags (e.g. `0.12.1`, `0.12`, `0`, `latest`).

2. **update-chart** (runs after build): Updates `deploy/helm/Chart.yaml` and `deploy/helm/values.yaml` with the new version, then commits and pushes to `main`. This ensures images are available in GHCR before ArgoCD sees the chart change.

### 3. ArgoCD auto-sync

ArgoCD watches `deploy/helm/` on the `main` branch. Once the chart commit from GitHub Actions appears, ArgoCD detects the diff and auto-syncs the new deployment to the k3s cluster. Since images were built before the chart update, pods will not hit `ImagePullBackOff`.

## Version Convention

| Location | Format | Example |
|----------|--------|---------|
| Git tag | `v` prefix | `v0.12.0` |
| Chart.yaml `version` | No prefix | `0.12.0` |
| Chart.yaml `appVersion` | `v` prefix | `v0.12.0` |
| values.yaml image tags | No prefix | `0.12.0` |
| GHCR image tags | No prefix | `0.12.0` |

The `v` prefix is stripped by `docker/metadata-action` in the GitHub Actions workflow and by `scripts/update-chart.sh` when updating values.yaml. Mismatching the prefix (e.g. using `v0.12.0` as an image tag) causes `ImagePullBackOff`.

## Helm Chart

```
deploy/helm/
├── Chart.yaml          # name, version, appVersion
├── values.yaml         # image registry/tags, replicas, ports, env, resources
└── templates/
    ├── _helpers.tpl     # label and naming helpers
    ├── deployment.yaml  # Deployments for admin, app, server
    └── service.yaml     # ClusterIP Services for admin, app, server
```

- Registry: `ghcr.io/yongseongkim/sunrei` (public — no `imagePullSecrets` needed)
- Pull policy: `IfNotPresent`
- Image tags in `values.yaml` are updated by `scripts/update-chart.sh`

## Infrastructure

- Cluster: k3s on Oracle Cloud Free Tier ARM instance (Chuncheon region)
- GitOps: ArgoCD watches `deploy/helm/` on `main`, auto-syncs on change
- External access: Cloudflare Tunnel (`cloudflared` runs on the master node) routes traffic from Cloudflare CDN through an encrypted tunnel directly to k3s ClusterIP services
- Domains: `sunrei.com`, `admin.sunrei.com`, `api.sunrei.com`

## Secrets

Secrets are split into two Kubernetes Secrets by ownership:

- **`sunrei-secrets`** (app-owned) — managed in this repo at
  `deploy/secrets/secrets.enc.yaml`, a Secret manifest encrypted with
  [SOPS](https://github.com/getsops/sops) + Google Cloud KMS (rules in
  `.sops.yaml` at the repo root). Values are encrypted; key names stay
  readable, so the file itself documents which keys the project uses.
- **`sunrei-infra-secrets`** (infrastructure-dependent: `database-host`,
  `database-password`) — managed in the homelab-infra repo
  (`k8s/sunrei/infra-secrets.enc.yaml`). These change when the app moves to a
  different cluster/DB, so they live with the infrastructure.

Editing and applying (requires GCP credentials with decrypt permission on the
KMS key):

```bash
sops deploy/secrets/secrets.enc.yaml                         # edit in place
sops -d deploy/secrets/secrets.enc.yaml | kubectl create -f -  # first apply
sops -d deploy/secrets/secrets.enc.yaml | kubectl replace -f - # re-apply
```

Never client-side `kubectl apply` a decrypted Secret — it leaks the plaintext
into the `last-applied-configuration` annotation. ArgoCD does not manage these
files; applying them is a manual step.

Required keys:

| Key | Secret | Used by |
|-----|--------|---------|
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

If a key is missing, the pod will fail to start with `CreateContainerConfigError`.

## Troubleshooting

### ImagePullBackOff

The most common cause is a version prefix mismatch. Image tags in GHCR do not have the `v` prefix, but git tags and `appVersion` do.

```bash
# Check what tag the deployment expects
kubectl -n sunrei get deployment sunrei-app -o jsonpath='{.spec.template.spec.containers[0].image}'

# Verify the image exists in GHCR
docker manifest inspect ghcr.io/yongseongkim/sunrei/sunrei-app:0.12.0
```

Also check that image visibility is set to public in GitHub package settings.

### ArgoCD not syncing

Force a hard refresh:

```bash
argocd app get sunrei --hard-refresh
```

Or patch the refresh annotation:

```bash
kubectl -n argocd patch app sunrei --type merge -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"hard"}}}'
```

### General verification

```bash
# Pod status
kubectl get pods -n sunrei

# Deployment details (image, events)
kubectl -n sunrei describe deployment sunrei-server

# Pod logs
kubectl -n sunrei logs -l app=sunrei-server --tail=100

# ArgoCD app status
argocd app get sunrei
```
