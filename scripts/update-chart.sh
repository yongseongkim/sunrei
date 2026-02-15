#!/bin/bash

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================
# Oracle Cloud Container Registry Configuration
# ============================================
OCI_REGION="yny"  # Chuncheon region
OCI_TENANCY_NAMESPACE="axrudau2tcfl"
OCI_REGISTRY="${OCI_REGION}.ocir.io/${OCI_TENANCY_NAMESPACE}/sunrei"

# Parse arguments
IMAGE_TAG=""
SKIP_VERIFY=false
AUTO_YES=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-verify)
            SKIP_VERIFY=true
            shift
            ;;
        --yes|-y)
            AUTO_YES=true
            shift
            ;;
        -h|--help)
            # Will be handled later
            shift
            ;;
        *)
            if [ -z "$IMAGE_TAG" ]; then
                IMAGE_TAG=$1
            fi
            shift
            ;;
    esac
done

# Image names
IMAGES=("sunrei-admin" "sunrei-app" "sunrei-server")

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check if image exists in registry
check_image_exists() {
    local image_name=$1
    local remote_image="$OCI_REGISTRY/$image_name:$IMAGE_TAG"

    log_info "Checking if $image_name:$IMAGE_TAG exists in registry..."

    # Try to inspect the image manifest
    if docker manifest inspect "$remote_image" &> /dev/null; then
        log_info "✓ $image_name:$IMAGE_TAG exists"
        return 0
    else
        log_error "✗ $image_name:$IMAGE_TAG not found"
        return 1
    fi
}

# Update Helm Chart.yaml version
update_helm_chart_version() {
    local version=$1
    # Remove 'v' prefix for chart version
    local chart_version=${version#v}

    log_step "Updating Helm Chart.yaml version to $chart_version..."

    # Update Chart.yaml version and appVersion
    sed -i.bak "s/^version: .*/version: $chart_version/" deploy/helm/Chart.yaml
    sed -i.bak "s/^appVersion: .*/appVersion: \"$version\"/" deploy/helm/Chart.yaml
    rm deploy/helm/Chart.yaml.bak

    log_info "Chart.yaml updated"
}

# Update Helm values.yaml image tags
update_helm_values() {
    local version=$1
    local image_tag=${version#v}  # strip 'v' prefix: v0.12.0 -> 0.12.0

    log_step "Updating Helm values.yaml image tags to $image_tag..."

    # Update all image tags in values.yaml
    # Match from 'images:' section to next non-indented line, update all '    tag:' lines
    sed -i.bak '/^images:/,/^[^ ]/{/^    tag: /s/tag: .*/tag: '"$image_tag"'/;}' deploy/helm/values.yaml
    rm deploy/helm/values.yaml.bak

    log_info "values.yaml updated"
}

# Show help
show_help() {
    cat << EOF
Usage: $0 <version> [OPTIONS]

Update Helm chart to use existing Docker images from OCI registry

This script will:
  1. Verify all images exist in OCI Container Registry (unless --skip-verify)
  2. Update Helm Chart.yaml version
  3. Update values.yaml image tags

Arguments:
  version             Version tag of existing Docker images (e.g., v1.2.3)

Options:
  --skip-verify       Skip image existence verification
  --yes, -y           Skip confirmation prompt
  -h, --help          Show this help message

Prerequisites:
  - Docker installed and logged in to OCI registry (for verification)
  - Images must already exist in registry

Configuration:
  Registry: $OCI_REGISTRY
  Images: ${IMAGES[@]}

Examples:
  # Update chart to use existing v1.2.3 images (with verification)
  $0 v1.2.3

  # Update chart without verification (faster, used by release.sh)
  $0 v1.2.3 --skip-verify --yes

Workflow:
  1. Build and push images: ./scripts/push-images.sh v1.2.3
  2. Update chart: ./scripts/update-chart.sh v1.2.3
  3. Commit and push:
     git add deploy/helm/
     git commit -m 'chore: bump version to v1.2.3'
     git tag v1.2.3
     git push origin main --tags

EOF
}

# Main execution
main() {
    # Validate version parameter
    if [ -z "$IMAGE_TAG" ]; then
        log_error "Version is required as first argument"
        show_help
        exit 1
    fi

    log_info "=========================================="
    log_info "  Helm Chart Update Script"
    log_info "=========================================="
    log_info "Registry: $OCI_REGISTRY"
    log_info "Target Version: $IMAGE_TAG"
    echo ""

    # Check if all images exist in registry (unless skipped)
    if [ "$SKIP_VERIFY" = false ]; then
        log_step "Verifying images exist in registry..."
        local all_exist=true

        for image in "${IMAGES[@]}"; do
            if ! check_image_exists "$image"; then
                all_exist=false
            fi
        done
        echo ""

        if [ "$all_exist" = false ]; then
            log_error "Some images are missing in the registry"
            log_info ""
            log_info "Please build and push images first:"
            log_info "  ./scripts/push-images.sh $IMAGE_TAG"
            exit 1
        fi

        log_info "All images verified successfully!"
        echo ""
    else
        log_info "Skipping image verification (--skip-verify)"
        echo ""
    fi

    # Confirm with user (unless auto-yes)
    if [ "$AUTO_YES" = false ]; then
        log_warn "This will update Helm chart to version $IMAGE_TAG"
        read -p "Continue? (y/N): " -n 1 -r
        echo ""

        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_warn "Update cancelled"
            exit 0
        fi
        echo ""
    fi

    # Update Helm chart
    update_helm_chart_version "$IMAGE_TAG"
    update_helm_values "$IMAGE_TAG"
    echo ""

    log_info "=========================================="
    log_info "  Chart update completed successfully!"
    log_info "=========================================="
    log_info "Version: $IMAGE_TAG"
    log_info "Chart Version: ${IMAGE_TAG#v}"
    log_info ""
    log_info "Next steps:"
    log_info "  1. Review changes:"
    log_info "     git diff deploy/helm/"
    log_info "  2. Commit and push:"
    log_info "     git add deploy/helm/"
    log_info "     git commit -m 'chore: bump version to $IMAGE_TAG'"
    log_info "     git tag $IMAGE_TAG"
    log_info "     git push origin main --tags"
    log_info "  3. ArgoCD will detect changes and deploy"
    echo ""
}

# Parse arguments - check for help
for arg in "$@"; do
    if [ "$arg" = "-h" ] || [ "$arg" = "--help" ]; then
        show_help
        exit 0
    fi
done

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Change to project root
cd "$PROJECT_ROOT"

# Run main
main
