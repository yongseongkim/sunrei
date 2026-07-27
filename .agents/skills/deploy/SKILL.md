---
name: deploy
description: Release and deploy Sunrei to the k3s cluster. Use when the user asks to deploy, cut a release, or ship a new version.
---

# Deploy Sunrei

Sunrei uses tag-driven releases. Pushing a version tag builds the images, updates
the Helm chart, and triggers an ArgoCD rollout. Do not push images or edit the
chart manually.

## Release

Run the release script from a clean working tree on `main`:

```bash
./scripts/release.sh
```

The script finds the latest `vX.Y.Z` tag, increments the patch version, and
creates and pushes the next tag. It does not accept a version argument.

Pushing the tag triggers `.github/workflows/docker-publish.yml`. The workflow
builds four `linux/arm64` images (admin, app, server, and migration) and publishes
them at `ghcr.io/yongseongkim/sunrei/<name>`. After every image is available, it
updates `deploy/helm/Chart.yaml` and `deploy/helm/values.yaml` and commits the
change to `main` with `[skip ci]`. This ordering prevents ArgoCD from deploying
a tag that is missing from the registry.

ArgoCD watches `deploy/helm/` on `main` and auto-syncs. The `sunrei-migration`
job runs `flyway migrate` as a PreSync hook before the new pods start.

## Verify

```bash
kubectl get app sunrei -n argocd
kubectl get pods -n sunrei -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].image}{"\n"}{end}'
```

Confirm that the app is `Synced` and `Healthy`, and that every pod uses the
expected image tag.

To follow the GitHub Actions run, use:

```bash
gh run watch <id> --repo yongseongkim/sunrei
```

## Version Convention

Git tags carry a `v` prefix (`v0.12.0`). Image tags and the chart `version`
omit it (`0.12.0`), while `appVersion` keeps it (`v0.12.0`). If a pod enters
`ImagePullBackOff`, check for a prefix mismatch first.
