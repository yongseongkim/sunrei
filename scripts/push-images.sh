#!/bin/bash

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================
# Oracle Cloud Container Registry Configuration
# ============================================
OCI_REGION="yny"  # Chuncheon region
OCI_TENANCY_NAMESPACE="axrudau2tcfl"
OCI_USERNAME="${OCI_TENANCY_NAMESPACE}/yongseongkimm@gmail.com"
OCI_REGISTRY="${OCI_REGION}.ocir.io/${OCI_TENANCY_NAMESPACE}/sunrei"

# Version must be provided as first argument
IMAGE_TAG=$1

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
# Authenticate to Oracle Cloud Container Registry
authenticate() {
    log_info "Authenticating to Oracle Cloud Container Registry..."

    # Check if already logged in to docker registry
    if docker-credential-osxkeychain list 2>/dev/null | grep -q "${OCI_REGION}.ocir.io" || \
       grep -q "${OCI_REGION}.ocir.io" ~/.docker/config.json 2>/dev/null; then
        log_info "Already authenticated to ${OCI_REGION}.ocir.io"
        return 0
    fi

    # Not logged in - check if we have auth token in .env.registry
    if [ -f ".env.registry" ]; then
        source .env.registry
        if [ -n "$OCI_USERNAME" ] && [ -n "$OCI_AUTH_TOKEN" ]; then
            log_info "Using credentials from .env.registry..."
            echo "$OCI_AUTH_TOKEN" | docker login "${OCI_REGION}.ocir.io" -u "$OCI_USERNAME" --password-stdin
            if [ $? -eq 0 ]; then
                log_info "Authentication successful"
                return 0
            fi
            log_warn "Failed to login with .env.registry credentials"
        fi
    fi

    # No valid authentication found
    log_error "Not authenticated to OCI Container Registry"
    log_info ""
    log_info "Please run: docker login ${OCI_REGION}.ocir.io"
    log_info "  Username: ${OCI_USERNAME}"
    log_info "  Password: Your OCI Auth Token"
    log_info ""
    log_info "Or create .env.registry file with:"
    log_info "  OCI_USERNAME='${OCI_USERNAME}'"
    log_info "  OCI_AUTH_TOKEN='your-auth-token'"
    exit 1
}

# Build Docker image
build_image() {
    local image_name=$1
    local dockerfile="deploy/dockerfiles/${image_name#sunrei-}.Dockerfile"

    log_info "Building $image_name..."

    if [ ! -f "$dockerfile" ]; then
        log_error "Dockerfile not found: $dockerfile"
        exit 1
    fi

    # Load .env file for the specific app (for Next.js apps only)
    local env_file="${image_name}/.env"
    local build_args=""

    if [ -f "$env_file" ]; then
        log_info "Loading environment from $env_file"

        # Read environment variables from .env file
        set -a
        source "$env_file"
        set +a

        # Prepare build args for Next.js public environment variables
        if [ -n "$NEXT_PUBLIC_API_URL" ]; then
            build_args="$build_args --build-arg NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}"
        fi
        if [ -n "$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY" ]; then
            build_args="$build_args --build-arg NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=${NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}"
        fi
        if [ -n "$NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID" ]; then
            build_args="$build_args --build-arg NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=${NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID}"
        fi
    fi

    # Build with environment variables
    docker build -f "$dockerfile" $build_args -t "$image_name:$IMAGE_TAG" .

    log_info "Built $image_name:$IMAGE_TAG"
}

# Tag and push image
push_image() {
    local image_name=$1
    local remote_image="$OCI_REGISTRY/$image_name:$IMAGE_TAG"

    log_info "Tagging $image_name:$IMAGE_TAG as $remote_image..."
    docker tag "$image_name:$IMAGE_TAG" "$remote_image"

    log_info "Pushing $remote_image..."
    docker push "$remote_image"

    log_info "Successfully pushed $remote_image"
}

# Main execution
main() {
    # Validate version parameter
    if [ -z "$IMAGE_TAG" ]; then
        log_error "Version is required as first argument"
        show_help
        exit 1
    fi

    log_info "Starting image build and push process..."
    log_info "Registry: $OCI_REGISTRY"
    log_info "Image Tag: $IMAGE_TAG"
    echo ""

    # Authenticate
    authenticate
    echo ""

    # Build and push each image
    for image in "${IMAGES[@]}"; do
        build_image "$image"
        push_image "$image"
        echo ""
    done

    log_info "All images built and pushed successfully!"
    log_info ""
    log_info "Images:"
    for image in "${IMAGES[@]}"; do
        echo "  - $OCI_REGISTRY/$image:$IMAGE_TAG"
    done
    echo ""
}

# Show help
show_help() {
    cat << EOF
Usage: $0 <version>

Build and push Docker images to Oracle Cloud Container Registry

Arguments:
  version             Version tag for Docker images (e.g., v1.2.3)

Prerequisites:
  1. Docker installed and running
  2. Authenticated to OCI Container Registry

Configuration:
  Registry settings are configured in the script:
  - OCI_REGION: $OCI_REGION
  - OCI_TENANCY_NAMESPACE: $OCI_TENANCY_NAMESPACE
  - OCI_USERNAME: $OCI_USERNAME
  - OCI_REGISTRY: $OCI_REGISTRY

Options:
  -h, --help          Show this help message

Examples:
  # Basic usage (if already logged in)
  $0 v1.0.0

Setup Instructions (one-time):

  1. Create OCI Auth Token:
     - Go to OCI Console > User Settings > Auth Tokens
     - Click "Generate Token"
     - Copy the generated token

  2. Docker login:
     docker login ${OCI_REGION}.ocir.io
     Username: ${OCI_USERNAME}
     Password: [paste the auth token]

  3. Run this script:
     $0 v1.0.0

The script will detect your existing docker credentials automatically.

EOF
}

# Parse arguments
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_help
    exit 0
fi

# Run main
main
