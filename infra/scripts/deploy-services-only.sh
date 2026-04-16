#!/bin/bash
# Deploy services only (no infrastructure changes)
# Use this for code changes when infrastructure hasn't changed
#
# Usage:
#   ./infra/scripts/deploy-services-only.sh --project <project-id> --env <env>

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLOUDBUILD_CONFIG="${ROOT_DIR}/infra/cloudbuild-services-only.yaml"
TERRAFORM_DIR="${ROOT_DIR}/infra/terraform"
DEFAULT_REGION="us-central1"

usage() {
  cat <<'EOF'
Deploy Services Only - Skip Infrastructure Changes

Usage:
  ./infra/scripts/deploy-services-only.sh --project <id> --env <env> [--image-tag <tag>]

Options:
  --project <id>    GCP Project ID
  --env <env>       Environment: dev, staging, or prod
  --image-tag <tag> Docker image tag (default: latest)

Examples:
  # Deploy code changes only (skip infrastructure)
  ./infra/scripts/deploy-services-only.sh --project kn-dev-01 --env dev

  # Deploy with specific tag
  ./infra/scripts/deploy-services-only.sh --project kn-dev-01 --env dev --image-tag v1.2.3

What it does:
  1. ✅ Builds all Docker images
  2. ✅ Pushes to Artifact Registry
  3. ✅ Deploys services to Cloud Run
  4. ⏭️  SKIPS Terraform (no infrastructure changes)

Time savings:
  - Full deployment: ~15-20 minutes (includes Terraform)
  - This script: ~8-10 minutes (skips Terraform)

When to use:
  ✅ Code changes only
  ✅ Application updates
  ✅ Bug fixes
  ✅ Feature deployments

When NOT to use:
  ❌ First deployment (infrastructure doesn't exist)
  ❌ Scaling changes (min/max instances)
  ❌ Database size changes
  ❌ Redis configuration changes
  ❌ VPC or networking changes

For infrastructure changes, use:
  ./infra/scripts/deploy.sh --project <id> --env <env>
EOF
}

PROJECT_ID=""
ENVIRONMENT="dev"
IMAGE_TAG="latest"

parse_args() {
  while [[ $# -gt 0 ]]; do
    case $1 in
      --project)
        PROJECT_ID="$2"
        shift 2
        ;;
      --env)
        ENVIRONMENT="$2"
        shift 2
        ;;
      --image-tag)
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
  if [[ -z "$PROJECT_ID" ]]; then
    echo "❌ Project ID required (--project)"
    exit 1
  fi
  
  if [[ -z "$ENVIRONMENT" ]]; then
    echo "❌ Environment required (--env)"
    exit 1
  fi
}

resolve_platform_domain() {
  local tfvars=""
  case "$ENVIRONMENT" in
    dev)
      tfvars="${TERRAFORM_DIR}/terraform.tfvars"
      ;;
    staging)
      tfvars="${TERRAFORM_DIR}/terraform.tfvars.staging"
      ;;
    prod|production)
      tfvars="${TERRAFORM_DIR}/terraform.tfvars.production"
      ;;
    *)
      echo "❌ Invalid environment: $ENVIRONMENT"
      exit 1
      ;;
  esac
  
  if [[ ! -f "$tfvars" ]]; then
    echo "❌ tfvars file not found: $tfvars"
    exit 1
  fi
  
  # Extract platform_domain from tfvars
  local domain=$(awk -F'=' '/^[[:space:]]*platform_domain[[:space:]]*=/ {gsub(/[" \t]/, "", $2); print $2}' "$tfvars")
  
  if [[ -z "$domain" ]]; then
    echo "❌ platform_domain not found in $tfvars"
    exit 1
  fi
  
  echo "$domain"
}

main() {
  parse_args "$@"
  validate_args
  
  local platform_domain
  platform_domain=$(resolve_platform_domain)
  
  local region
  region=$(awk -F'=' '/^[[:space:]]*region[[:space:]]*=/ {gsub(/[" \t]/, "", $2); print $2}' "${TERRAFORM_DIR}/terraform.tfvars" || echo "$DEFAULT_REGION")
  
  echo ""
  echo "╔════════════════════════════════════════════════════════╗"
  echo "║        Deploy Services Only (Skip Infrastructure)     ║"
  echo "╚════════════════════════════════════════════════════════╝"
  echo ""
  echo "Project:      $PROJECT_ID"
  echo "Environment:  $ENVIRONMENT"
  echo "Region:       $region"
  echo "Domain:       $platform_domain"
  echo "Image tag:    $IMAGE_TAG"
  echo ""
  echo "⚠️  This will NOT apply Terraform changes"
  echo "    Use ./infra/scripts/deploy.sh for infrastructure changes"
  echo ""
  
  read -p "Continue? (Y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Nn]$ ]]; then
    echo "Cancelled"
    exit 0
  fi
  
  echo ""
  echo "🚀 Starting deployment..."
  echo ""
  echo "Steps:"
  echo "  1. Build all Docker images"
  echo "  2. Push to Artifact Registry"
  echo "  3. Deploy to Cloud Run"
  echo ""
  
  gcloud builds submit \
    --config="$CLOUDBUILD_CONFIG" \
    --project="$PROJECT_ID" \
    --substitutions=_REGION="$region",_ENVIRONMENT="$ENVIRONMENT",_PLATFORM_DOMAIN="$platform_domain",_IMAGE_TAG="$IMAGE_TAG"
  
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ Services deployed successfully!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "Deployed services:"
  echo "  - controlnet-gateway-$ENVIRONMENT"
  echo "  - web-app-$ENVIRONMENT"
  echo "  - model-guard-$ENVIRONMENT"
  echo "  - onnx-inference-service-$ENVIRONMENT"
  echo ""
}

main "$@"

