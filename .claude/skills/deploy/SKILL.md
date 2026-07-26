# Deploy Skill

Deploy a version of Sunrei to the k3s cluster.

## Usage
```
/deploy <version>
```
Example: `/deploy v0.12.0`

## Steps

1. **Build & push OCI images (arm64)**
   ```bash
   ./scripts/push-images.sh <version>
   ```
   Builds all images (sunrei-admin, sunrei-app, sunrei-server, sunrei-migration) for linux/arm64 and pushes to Oracle Cloud Container Registry.

2. **Update Helm chart & values**
   ```bash
   ./scripts/update-chart.sh <version> --skip-verify --yes
   ```
   Updates `deploy/helm/Chart.yaml` (version, appVersion) and `deploy/helm/values.yaml` (image tags).

3. **Commit, tag, and push**
   ```bash
   git add deploy/helm/
   git commit -m 'chore: bump version to <version>'
   git tag <version>
   git push origin main --tags
   ```
   This triggers GitHub Actions for GHCR images and ArgoCD auto-sync.

4. **Verify deployment**
   ```bash
   kubectl get app sunrei -n argocd
   kubectl get pods -n sunrei -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].image}{"\n"}{end}'
   ```
   Check ArgoCD sync status and confirm pods are running the expected version.

## Prerequisites
- Docker running and authenticated to OCI registry (`yny.ocir.io`)
- `kubectl` configured with cluster access
- On `main` branch with clean working tree

## Notes
- The `push-images.sh` script reads `.env` files from app directories for Next.js build args
- Image tag format: use `v` prefix (e.g., `v0.12.0`), the chart version strips the prefix
- ArgoCD auto-syncs from `deploy/helm/` on the `main` branch
