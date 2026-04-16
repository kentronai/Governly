#!/bin/bash
# Quick rebuild and deploy single service
# Much faster than full deployment pipeline
#
# Usage:
#   ./infra/scripts/quick-deploy-service.sh --service web --project kn-dev-01

set -euo pipefail

SERVICE=""
PROJECT_ID=""
REGION="us-central1"
IMAGE_TAG="latest"

usage() {
  cat <<'EOF'
Quick Service Deploy - Build & Deploy Single Service

Usage:
  ./infra/scripts/quick-deploy-service.sh --service <name> --project <id>

Options:
  --service <name>   Service to deploy: web, controlnet, model-guard, onnx
  --project <id>     GCP Project ID
  --region <region>  Region (default: us-central1)
  --tag <tag>        Image tag (default: latest)

Examples:
  # Quick rebuild and deploy web app
  ./infra/scripts/quick-deploy-service.sh --service web --project kn-dev-01

  # Deploy controlnet with specific tag
  ./infra/scripts/quick-deploy-service.sh --service controlnet --project kn-dev-01 --tag v1.2.3

Time savings:
  - Full deployment: ~15 minutes (builds all 4 services)
  - This script: ~3-5 minutes (builds only 1 service)
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case $1 in
      --service)
        SERVICE="$2"
        shift 2
        ;;
      --project)
        PROJECT_ID="$2"
        shift 2
        ;;
      --region)
        REGION="$2"
        shift 2
        ;;
      --tag)
        IMAGE_TAG="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "Unknown option: $1"
        usage
        exit 1
        ;;
    esac
  done
}

validate_args() {
  if [[ -z "$SERVICE" ]]; then
    echo "❌ Service required (--service)"
    exit 1
  fi
  
  if [[ -z "$PROJECT_ID" ]]; then
    echo "❌ Project ID required (--project)"
    exit 1
  fi
  
  if [[ ! "$SERVICE" =~ ^(web|controlnet|model-guard|onnx)$ ]]; then
    echo "❌ Service must be: web, controlnet, model-guard, or onnx"
    exit 1
  fi
}

map_service_names() {
  case "$SERVICE" in
    web)
      SERVICE_DIR="apps/web"
      IMAGE_NAME="web"
      CLOUD_RUN_SERVICE="web-app-dev"
      DOCKERFILE="Dockerfile"
      ;;
    controlnet)
      SERVICE_DIR="apps/controlnet"
      IMAGE_NAME="controlnet"
      CLOUD_RUN_SERVICE="controlnet-gateway-dev"
      DOCKERFILE="Dockerfile"
      ;;
    model-guard)
      SERVICE_DIR="apps/model-guard"
      IMAGE_NAME="model-guard"
      CLOUD_RUN_SERVICE="model-guard-dev"
      DOCKERFILE="Dockerfile"
      ;;
    onnx)
      SERVICE_DIR="apps/onnx-service"
      IMAGE_NAME="onnx-inference-service-dev"
      CLOUD_RUN_SERVICE="onnx-inference-service-dev"
      DOCKERFILE="Dockerfile"
      ;;
  esac
}

build_and_push() {
  local image="${REGION}-docker.pkg.dev/${PROJECT_ID}/ai-governance/${IMAGE_NAME}:${IMAGE_TAG}"
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔨 Building $SERVICE"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "Service:    $SERVICE"
  echo "Directory:  $SERVICE_DIR"
  echo "Image:      $image"
  echo ""
  
  # Get secrets for build args (if needed)
  local secrets=""
  if command -v gcloud >/dev/null 2>&1; then
    CLERK_PUB=$(gcloud secrets versions access latest --secret=clerk-publishable-key --project="$PROJECT_ID" 2>/dev/null || echo "")
    CLERK_SECRET=$(gcloud secrets versions access latest --secret=clerk-secret-key --project="$PROJECT_ID" 2>/dev/null || echo "")
    DATABASE_URL=$(gcloud secrets versions access latest --secret=database-url --project="$PROJECT_ID" 2>/dev/null || echo "")
    
    if [[ -n "$CLERK_PUB" ]]; then
      secrets="--build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$CLERK_PUB"
    fi
    if [[ -n "$CLERK_SECRET" ]]; then
      secrets="$secrets --build-arg CLERK_SECRET_KEY=$CLERK_SECRET"
    fi
    if [[ -n "$DATABASE_URL" ]]; then
      secrets="$secrets --build-arg DATABASE_URL=$DATABASE_URL"
    fi
  fi
  
  # Build image
  echo "📦 Building Docker image..."
  docker build \
    -t "$image" \
    -f "${SERVICE_DIR}/${DOCKERFILE}" \
    $secrets \
    "$SERVICE_DIR"
  
  # Push image
  echo ""
  echo "📤 Pushing to Artifact Registry..."
  docker push "$image"
  
  echo ""
  echo "✅ Image built and pushed successfully"
}

deploy_service() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🚀 Deploying to Cloud Run"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  
  local image="${REGION}-docker.pkg.dev/${PROJECT_ID}/ai-governance/${IMAGE_NAME}:${IMAGE_TAG}"
  
  gcloud run deploy "$CLOUD_RUN_SERVICE" \
    --image="$image" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --quiet
  
  echo ""
  echo "✅ Deployment complete!"
  echo ""
  echo "Service URL:"
  gcloud run services describe "$CLOUD_RUN_SERVICE" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --format="value(status.url)"
}

main() {
  parse_args "$@"
  validate_args
  map_service_names
  
  echo ""
  echo "╔════════════════════════════════════════════════════════╗"
  echo "║         Quick Service Deploy - Single Service         ║"
  echo "╚════════════════════════════════════════════════════════╝"
  echo ""
  
  build_and_push
  deploy_service
  
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ Done! Much faster than full deployment pipeline 🚀"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

main "$@"

