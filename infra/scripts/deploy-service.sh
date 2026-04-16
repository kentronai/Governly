#!/bin/bash
# Deploy a single service (for production or any environment)
# This is a cleaner interface for deploying individual services
#
# Usage:
#   ./infra/scripts/deploy-service.sh web prod
#   ./infra/scripts/deploy-service.sh controlnet dev

set -euo pipefail

SERVICE="${1:-}"
ENVIRONMENT="${2:-prod}"
PROJECT_ID=""
IMAGE_TAG="latest"

usage() {
  cat <<'EOF'
Deploy Single Service - Fast deployments for individual services

Usage:
  ./infra/scripts/deploy-service.sh <service> [environment] [options]

Arguments:
  service       Service name: web, controlnet, model-guard, onnx
  environment   Environment: dev, staging, prod (default: prod)

Options:
  --project <id>    GCP Project ID (auto-detected if not specified)
  --tag <tag>       Image tag (default: latest)
  -h, --help        Show this help

Examples:
  # Deploy web to production
  ./infra/scripts/deploy-service.sh web prod

  # Deploy controlnet to dev
  ./infra/scripts/deploy-service.sh controlnet dev

  # Deploy with specific tag
  ./infra/scripts/deploy-service.sh web prod --tag v1.2.3

  # Deploy to specific project
  ./infra/scripts/deploy-service.sh web prod --project kentron-production

Available Services:
  web          - Web application (Next.js)
  controlnet   - ControlNet Gateway (FastAPI)
  model-guard  - Model Guard service
  onnx         - ONNX Inference Service

What this does:
  1. Builds single Docker image
  2. Pushes to Artifact Registry
  3. Deploys to Cloud Run
  4. NO infrastructure changes (Terraform not touched)

Time: ~3-5 minutes (vs ~15 minutes for full deployment)
EOF
}

if [[ "${SERVICE}" == "-h" || "${SERVICE}" == "--help" ]]; then
  usage
  exit 0
fi

# Parse remaining args
shift 2 2>/dev/null || true
while [[ $# -gt 0 ]]; do
  case $1 in
    --project)
      PROJECT_ID="$2"
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

# Validate service
if [[ -z "${SERVICE}" ]]; then
  echo "❌ Service required"
  usage
  exit 1
fi

if [[ ! "${SERVICE}" =~ ^(web|controlnet|model-guard|onnx)$ ]]; then
  echo "❌ Invalid service: ${SERVICE}"
  echo "   Must be: web, controlnet, model-guard, or onnx"
  exit 1
fi

# Validate environment
if [[ ! "${ENVIRONMENT}" =~ ^(dev|staging|prod|production)$ ]]; then
  echo "❌ Invalid environment: ${ENVIRONMENT}"
  echo "   Must be: dev, staging, or prod"
  exit 1
fi

# Auto-detect project based on environment
if [[ -z "${PROJECT_ID}" ]]; then
  case "${ENVIRONMENT}" in
    prod|production)
      PROJECT_ID="kentron-production"
      ;;
    staging)
      PROJECT_ID="kentron-staging"
      ;;
    dev)
      PROJECT_ID="kn-dev-01"
      ;;
  esac
fi

# Normalize environment name
if [[ "${ENVIRONMENT}" == "production" ]]; then
  ENVIRONMENT="prod"
fi

# Determine service names based on environment
if [[ "${ENVIRONMENT}" == "prod" ]]; then
  ENV_SUFFIX=""
else
  ENV_SUFFIX="-${ENVIRONMENT}"
fi

# Map service to image and Cloud Run service names
case "${SERVICE}" in
  web)
    IMAGE_NAME="web"
    SERVICE_DIR="apps/web"
    CLOUD_RUN_SERVICE="web-app${ENV_SUFFIX}"
    ;;
  controlnet)
    IMAGE_NAME="controlnet"
    SERVICE_DIR="apps/controlnet"
    CLOUD_RUN_SERVICE="controlnet-gateway${ENV_SUFFIX}"
    ;;
  model-guard)
    IMAGE_NAME="model-guard"
    SERVICE_DIR="apps/model-guard"
    CLOUD_RUN_SERVICE="model-guard${ENV_SUFFIX}"
    ;;
  onnx)
    IMAGE_NAME="onnx-inference-service-${ENVIRONMENT}"
    SERVICE_DIR="apps/onnx-service"
    CLOUD_RUN_SERVICE="onnx-inference-service${ENV_SUFFIX}"
    ;;
esac

REGION="us-central1"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/ai-governance/${IMAGE_NAME}:${IMAGE_TAG}"

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║          Deploy Single Service - Fast Mode            ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "Service:         ${SERVICE}"
echo "Environment:     ${ENVIRONMENT}"
echo "Project:         ${PROJECT_ID}"
echo "Region:          ${REGION}"
echo "Image:           ${IMAGE_URI}"
echo "Cloud Run:       ${CLOUD_RUN_SERVICE}"
echo "Tag:             ${IMAGE_TAG}"
echo ""

# Get platform domain from tfvars
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TERRAFORM_DIR="${ROOT_DIR}/infra/terraform"
case "${ENVIRONMENT}" in
  dev)
    TFVARS="${TERRAFORM_DIR}/terraform.tfvars"
    ;;
  staging)
    TFVARS="${TERRAFORM_DIR}/terraform.tfvars.staging"
    ;;
  prod)
    TFVARS="${TERRAFORM_DIR}/terraform.tfvars.production"
    ;;
esac

PLATFORM_DOMAIN=$(awk -F'=' '/^[[:space:]]*platform_domain[[:space:]]*=/ {gsub(/[" \t]/, "", $2); print $2}' "${TFVARS}")

echo "Platform Domain: ${PLATFORM_DOMAIN}"
echo ""
echo "⏱️  This will take ~3-5 minutes"
echo ""

# Build image using Cloud Build (faster than local Docker)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Building image via Cloud Build..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Create temporary cloudbuild config for single service
TEMP_BUILD_CONFIG=$(mktemp)
trap "rm -f ${TEMP_BUILD_CONFIG}" EXIT

cat > "${TEMP_BUILD_CONFIG}" <<EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    id: 'build-${SERVICE}'
    secretEnv:
      - 'CLERK_PUBLISHABLE_KEY'
      - 'CLERK_SECRET_KEY'
      - 'DATABASE_URL'
    entrypoint: 'bash'
    args:
      - '-c'
      - |
        docker build \\
          --build-arg NEXT_PUBLIC_BACKEND_URL=https://${PLATFORM_DOMAIN} \\
          --build-arg NEXT_PUBLIC_PLAYGROUND_REQUEST_URL=https://${PLATFORM_DOMAIN} \\
          --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=\$\$CLERK_PUBLISHABLE_KEY \\
          --build-arg CLERK_SECRET_KEY=\$\$CLERK_SECRET_KEY \\
          --build-arg DATABASE_URL=\$\$DATABASE_URL \\
          -t ${IMAGE_URI} \\
          -f ${SERVICE_DIR}/Dockerfile \\
          ${SERVICE_DIR}

  - name: 'gcr.io/cloud-builders/docker'
    id: 'push-${SERVICE}'
    entrypoint: 'bash'
    args:
      - '-c'
      - |
        docker push ${IMAGE_URI}
    waitFor: ['build-${SERVICE}']

options:
  machineType: 'E2_HIGHCPU_8'
  logging: CLOUD_LOGGING_ONLY

timeout: '900s'

availableSecrets:
  secretManager:
    - versionName: projects/${PROJECT_ID}/secrets/clerk-publishable-key/versions/latest
      env: 'CLERK_PUBLISHABLE_KEY'
    - versionName: projects/${PROJECT_ID}/secrets/clerk-secret-key/versions/latest
      env: 'CLERK_SECRET_KEY'
    - versionName: projects/${PROJECT_ID}/secrets/database-url/versions/latest
      env: 'DATABASE_URL'
EOF

gcloud builds submit \
  --config="${TEMP_BUILD_CONFIG}" \
  --project="${PROJECT_ID}" \
  "${ROOT_DIR}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Deploying to Cloud Run..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

gcloud run deploy "${CLOUD_RUN_SERVICE}" \
  --image="${IMAGE_URI}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --quiet

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ ${SERVICE} deployed successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Get service URL
SERVICE_URL=$(gcloud run services describe "${CLOUD_RUN_SERVICE}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format="value(status.url)")

echo "Service URL: ${SERVICE_URL}"
echo ""
echo "Check logs:"
echo "  gcloud logging read \"resource.type=cloud_run_revision AND resource.labels.service_name=${CLOUD_RUN_SERVICE}\" \\"
echo "    --project=${PROJECT_ID} --limit=20"
echo ""

