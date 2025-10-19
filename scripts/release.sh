#!/bin/bash

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Check if git working directory is clean (excluding environment config files)
check_git_status() {
    log_step "Checking git status..."

    # Get list of modified files, excluding environment configuration files
    local modified_files=$(git diff --name-only HEAD 2>/dev/null || echo "")
    local staged_files=$(git diff --cached --name-only 2>/dev/null || echo "")

    # Filter out environment files
    local filtered_modified=$(echo "$modified_files" | grep -v -E '(\.env$|\.env\.|application-prod\.conf$)' || true)
    local filtered_staged=$(echo "$staged_files" | grep -v -E '(\.env$|\.env\.|application-prod\.conf$)' || true)

    if [ -n "$filtered_modified" ] || [ -n "$filtered_staged" ]; then
        log_error "You have uncommitted changes. Please commit or stash them first."
        git status --short | grep -v -E '(\.env|application-prod\.conf)'
        exit 1
    fi

    log_info "Working directory is clean (excluding environment files)"
}

# Check required environment configuration files
check_environment_files() {
    log_step "Checking required environment files..."

    local has_error=false

    # Check admin .env file
    if [ ! -f "sunrei-admin/.env" ]; then
        log_error "sunrei-admin/.env file not found"
        log_info "This file is required for admin application environment variables"
        has_error=true
    else
        log_info "✓ sunrei-admin/.env exists"
    fi

    # Check app .env file
    if [ ! -f "sunrei-app/.env" ]; then
        log_error "sunrei-app/.env file not found"
        log_info "This file is required for app application environment variables"
        has_error=true
    else
        log_info "✓ sunrei-app/.env exists"
    fi

    # Check server application-prod.conf file
    if [ ! -f "sunrei-server/src/main/resources/application-prod.conf" ]; then
        log_error "sunrei-server/src/main/resources/application-prod.conf file not found"
        log_info "This file is required for production server configuration"
        has_error=true
    else
        log_info "✓ sunrei-server/src/main/resources/application-prod.conf exists"
    fi

    if [ "$has_error" = true ]; then
        echo ""
        log_error "Required environment files are missing. Please create them before release."
        exit 1
    fi

    log_info "All required environment files exist"
}

# Get the latest semantic version tag
get_latest_version() {
    # Get all tags that match semantic version pattern (v1.2.3 or 1.2.3)
    local latest_tag=$(git tag -l | grep -E '^v?[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1)

    # Return only the tag, no logging (logging pollutes the return value)
    echo "$latest_tag"
}

# Increment patch version
increment_version() {
    local version=$1

    # Remove 'v' prefix if present
    version=${version#v}

    # If no version provided, start with 0.0.0
    if [ -z "$version" ]; then
        echo "v0.0.1"
        return
    fi

    # Split version into major.minor.patch
    IFS='.' read -r major minor patch <<< "$version"

    # Increment patch
    patch=$((patch + 1))

    # Return new version with 'v' prefix
    echo "v${major}.${minor}.${patch}"
}

# Check if tag already exists
check_tag_exists() {
    local tag=$1

    if git rev-parse "$tag" >/dev/null 2>&1; then
        log_error "Tag $tag already exists"
        exit 1
    fi
}


# Show help
show_help() {
    cat << EOF
Usage: $0

Automated release script for Sunrei project

This script performs the following steps:
  1. Check for uncommitted changes (excluding .env files)
  2. Check required environment files exist
  3. Get latest semantic version from git tags
  4. Increment patch version (v1.2.3 -> v1.2.4)
  5. Build and push Docker images to OCI registry
  6. Update Helm chart version and values.yaml

After running this script, you need to manually:
  - Review changes in deploy/helm/
  - Commit and push changes with git tag
  - ArgoCD will detect and deploy automatically

Prerequisites:
  - Docker installed and logged in to OCI registry
  - Git configured
  - Environment files (.env, application-prod.conf)

Options:
  -h, --help        Show this help message

Examples:
  # Basic usage
  $0

Setup (one-time):
  1. Docker login: docker login yny.ocir.io
  2. Create environment files (see check_environment_files in script)

Version Increment Logic:
  No tags       -> v0.0.1
  v1.2.3        -> v1.2.4
  v1.2.9        -> v1.2.10
  v2.0.99       -> v2.0.100

EOF
}

# Main execution
main() {
    log_info "=========================================="
    log_info "  Sunrei Release Automation Script"
    log_info "=========================================="
    echo ""

    # Check git status
    check_git_status
    echo ""

    # Check required environment files
    check_environment_files
    echo ""

    # Get latest version
    log_step "Getting latest version from git tags..."
    local current_version=$(get_latest_version)

    if [ -z "$current_version" ]; then
        log_warn "No semantic version tags found"
    else
        log_info "Latest version: $current_version"
    fi

    # Calculate next version
    local next_version=$(increment_version "$current_version")

    if [ -z "$current_version" ]; then
        log_info "Starting from initial version: $next_version"
    else
        log_info "Version increment: $current_version -> $next_version"
    fi
    echo ""

    # Check if tag already exists
    check_tag_exists "$next_version"

    # Confirm with user
    log_warn "This will:"
    echo "  1. Build Docker images with tag: $next_version"
    echo "  2. Push images to OCI registry"
    echo "  3. Update Helm chart version to ${next_version#v}"
    echo "  4. Update values.yaml image tags to $next_version"
    echo ""
    read -p "Continue? (y/N): " -n 1 -r
    echo ""

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_warn "Release cancelled"
        exit 0
    fi
    echo ""

    # Build and push Docker images
    log_step "Building and pushing Docker images..."
    ./scripts/push-images.sh "$next_version"
    echo ""

    # Update Helm chart using update-chart.sh
    log_step "Updating Helm chart..."
    ./scripts/update-chart.sh "$next_version" --skip-verify --yes
    echo ""

    log_info "=========================================="
    log_info "  Release completed successfully!"
    log_info "=========================================="
    log_info "Version: $next_version"
    log_info "Chart Version: ${next_version#v}"
    log_info ""
    log_info "Next steps:"
    log_info "  1. Review changes in deploy/helm/"
    log_info "  2. Commit and push:"
    log_info "     git add deploy/helm/"
    log_info "     git commit -m 'chore: bump version to $next_version'"
    log_info "     git tag $next_version"
    log_info "     git push origin main --tags"
    log_info "  3. ArgoCD will detect changes and deploy"
    echo ""
}

# Parse arguments
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_help
    exit 0
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Change to project root
cd "$PROJECT_ROOT"

# Run main
main
