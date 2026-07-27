---
name: deploy
description: Release and deploy Sunrei to the k3s cluster. Use when the user asks to deploy, cut a release, or ship a new version.
---

# Deploy Sunrei

Deployment is tag-driven. Pushing a version tag builds the images, updates the
Helm chart, and lets ArgoCD roll it out — there is no manual image push or chart
edit.

## Release

Run the release script from a clean working tree on `main`:

```bash
./scripts/release.sh
```

It reads the latest `vX.Y.Z` tag, increments the patch version, then creates and
pushes the new tag. It takes no version argument.

Pushing that tag triggers `.github/workflows/docker-publish.yml`, which:

1. Builds four `linux/arm64` images (admin, app, server, migration) and pushes
   them to GHCR at `ghcr.io/yongseongkim/sunrei/<name>` — public, no auth.
2. Runs the `update-chart` job, which bumps `deploy/helm/Chart.yaml` and
   `deploy/helm/values.yaml` to the new version and commits to `main` with
   `[skip ci]`. Images are built before the chart is bumped, so ArgoCD never
   sees a tag that isn't in the registry.

ArgoCD watches `deploy/helm/` on `main` and auto-syncs. The `sunrei-migration`
Job runs as a PreSync hook (`flyway migrate`) before the new pods start.

## Verify

```bash
kubectl get app sunrei -n argocd
kubectl get pods -n sunrei -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].image}{"\n"}{end}'
```

Confirm the app is `Synced`/`Healthy` and the pods run the expected image tag.

## Version convention

Git tags carry a `v` prefix (`v0.12.0`). Image tags and the chart `version`
strip it (`0.12.0`); the chart `appVersion` keeps it (`v0.12.0`). A prefix
mismatch is the usual cause of `ImagePullBackOff` — check it first when pods
fail to pull.

## Notes

- The GitHub Actions runner needs no cluster access; ArgoCD pulls from `main`.
- To watch a release: `gh run watch <id> --repo yongseongkim/sunrei`, then the
  chart-bump commit appears on `main` and ArgoCD syncs within a minute or two.
