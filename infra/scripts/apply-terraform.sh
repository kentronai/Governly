#!/bin/bash
# Quick Terraform apply - skips Docker image builds
# Use this to retry failed Terraform steps without rebuilding images
#
# Usage:
#   ./infra/scripts/apply-terraform.sh --project kn-dev-01 --env dev

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TERRAFORM_DIR="${ROOT_DIR}/infra/terraform"
DEFAULT_REGION="us-central1"

usage() {
  cat <<'EOF'
Quick Terraform Apply - Skip Image Builds

Usage:
  ./infra/scripts/apply-terraform.sh [--project <id>] [--env dev|staging|prod] [--image-tag <tag>]

Options:
  --project <id>    GCP Project ID (required if not set in gcloud config)
  --env <env>       Environment: dev, staging, or prod (default: dev)
  --image-tag <tag> Docker image tag to use (default: latest)
  -h, --help        Show this help message

Examples:
  # Apply Terraform for dev (uses existing images)
  ./infra/scripts/apply-terraform.sh --project kn-dev-01 --env dev

  # Apply with specific image tag
  ./infra/scripts/apply-terraform.sh --project kn-dev-01 --env dev --image-tag v1.2.3

What it does:
  1. Initializes Terraform backend
  2. Imports existing resources if needed
  3. Applies Terraform configuration (uses existing Docker images)
  4. Prints outputs

Note: This does NOT rebuild Docker images. Use deploy.sh for full deployment.
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

require_cli() {
  if ! command -v terraform &> /dev/null; then
    echo "❌ terraform CLI not found. Install: https://www.terraform.io/downloads"
    exit 1
  fi
  if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found. Install: https://cloud.google.com/sdk/docs/install"
    exit 1
  fi
}

resolve_project() {
  if [[ -z "${PROJECT_ID}" ]]; then
    PROJECT_ID="$(gcloud config get-value project 2>/dev/null || echo '')"
    if [[ -z "${PROJECT_ID}" ]]; then
      echo "❌ Project ID required. Set via --project or 'gcloud config set project <id>'"
      exit 1
    fi
  fi
}

tfvars_path() {
  case "${ENVIRONMENT}" in
    staging)
      echo "${TERRAFORM_DIR}/terraform.tfvars.staging"
      ;;
    prod|production)
      echo "${TERRAFORM_DIR}/terraform.tfvars.production"
      ;;
    *)
      echo "${TERRAFORM_DIR}/terraform.tfvars"
      ;;
  esac
}

read_tfvar() {
  local file="$1"
  local var="$2"
  grep "^${var}" "${file}" | cut -d'=' -f2 | tr -d ' "'
}

init_backend() {
  echo "🔧 Initializing Terraform backend"
  (cd "${TERRAFORM_DIR}" && terraform init -reconfigure \
    -backend-config="bucket=${PROJECT_ID}-terraform-state" \
    -backend-config="prefix=terraform/state")
}

apply_terraform() {
  local tfvars="$1"
  local domain="$2"
  
  echo "🚀 Applying Terraform configuration (${ENVIRONMENT})"
  echo "   Using image tag: ${IMAGE_TAG}"
  echo ""
  
  cd "${TERRAFORM_DIR}"
  
  # Import existing resources if needed (idempotent)
  echo "📥 Checking for existing resources to import..."
  
  # Import GlobalAddress if it exists and not already in state
  terraform state list | grep -q "google_compute_global_address.private_ip_address" || \
  terraform import \
    -var-file="${tfvars}" \
    -var="project_id=${PROJECT_ID}" \
    -var="environment=${ENVIRONMENT}" \
    google_compute_global_address.private_ip_address \
    projects/${PROJECT_ID}/global/addresses/ai-governance-db-private-ip-${ENVIRONMENT} 2>/dev/null || true
  
  # Note: VPC peering connection is commented out in Terraform since it already exists
  # and cannot be imported. It's managed outside of Terraform.
  
  # Apply Terraform
  terraform apply \
    -var-file="${tfvars}" \
    -var="project_id=${PROJECT_ID}" \
    -var="environment=${ENVIRONMENT}" \
    -var="platform_domain=${domain}" \
    -var="image_tag=${IMAGE_TAG}"
}

print_outputs() {
  echo ""
  echo "📡 Deployment outputs:"
  (cd "${TERRAFORM_DIR}" && terraform output || true)
}

main() {
  parse_args "$@"
  require_cli
  resolve_project

  local tfvars
  tfvars="$(tfvars_path)"
  if [[ ! -f "${tfvars}" ]]; then
    echo "❌ tfvars file not found: ${tfvars}"
    exit 1
  fi

  local platform_domain
  platform_domain="$(read_tfvar "${tfvars}" "platform_domain")"
  if [[ -z "${platform_domain}" ]]; then
    echo "❌ platform_domain missing in ${tfvars}"
    exit 1
  fi

  local region
  region="$(read_tfvar "${tfvars}" "region")"
  if [[ -z "${region}" ]]; then
    region="${DEFAULT_REGION}"
  fi

  echo "========================================="
  echo "Project:      ${PROJECT_ID}"
  echo "Environment:  ${ENVIRONMENT}"
  echo "Region:       ${region}"
  echo "Domain:       ${platform_domain}"
  echo "Image tag:    ${IMAGE_TAG}"
  echo "========================================="
  echo ""
  echo "⚠️  Note: This will use EXISTING Docker images."
  echo "   To rebuild images, use: ./infra/scripts/deploy.sh"
  echo ""

  init_backend
  apply_terraform "${tfvars}" "${platform_domain}"
  print_outputs
}

main "$@"

