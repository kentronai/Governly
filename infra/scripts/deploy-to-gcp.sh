#!/bin/bash
# One-click deployment pipeline for the AI Governance platform on GCP
#
# PRIMARY ENTRY POINT: Use ./infra/scripts/deploy.sh instead (shorter name)
# This script handles the full deployment pipeline:
#   - Infrastructure provisioning (Terraform)
#   - Docker image builds (Cloud Build)
#   - Service deployment (Cloud Run)
#
# Quick start:
#   ./infra/scripts/deploy.sh --project <project-id> --env dev

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TERRAFORM_DIR="${ROOT_DIR}/infra/terraform"
CLOUDBUILD_CONFIG="${ROOT_DIR}/infra/cloudbuild.yaml"
DEFAULT_REGION="us-central1"

usage() {
  cat <<'EOF'
AI Governance Platform - One-Click GCP Deployment

Usage:
  ./infra/scripts/deploy.sh [--project <id>] [--env dev|staging|prod] [--image-tag <tag>]
  ./infra/scripts/deploy-to-gcp.sh [--project <id>] [--env dev|staging|prod] [--image-tag <tag>]

Options:
  --project <id>    GCP Project ID (required if not set in gcloud config)
  --env <env>       Environment: dev, staging, or prod (default: dev)
  --image-tag <tag> Docker image tag (default: latest)
  --skip-branch-check  Skip branch validation (not recommended for production)
  -h, --help        Show this help message

Examples:
  # Deploy to dev (uses gcloud config project)
  ./infra/scripts/deploy.sh --env dev

  # Deploy to specific project
  ./infra/scripts/deploy.sh --project kn-dev-01 --env dev

  # Deploy with custom image tag
  ./infra/scripts/deploy.sh --project my-project --env staging --image-tag v1.2.3

What it does:
  1. Creates/verifies Terraform state bucket
  2. Applies all infrastructure (DB, Redis, VPC, Load Balancer, Cloud Run)
  3. Builds and deploys Docker images via Cloud Build
  4. Prints deployment outputs (URLs, IPs)

See infra/scripts/README.md for more details.
EOF
}

PROJECT_ID=""
ENVIRONMENT="dev"
IMAGE_TAG="latest"
SKIP_BRANCH_CHECK=false

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --project)
        PROJECT_ID="${2:-}"
        shift 2
        ;;
      --env)
        ENVIRONMENT="${2:-}"
        shift 2
        ;;
      --image-tag)
        IMAGE_TAG="${2:-}"
        shift 2
        ;;
      --skip-branch-check)
        SKIP_BRANCH_CHECK=true
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "Unknown argument: $1"
        usage
        exit 1
        ;;
    esac
  done
}

require_cli() {
  for tool in gcloud gsutil terraform; do
    if ! command -v "${tool}" >/dev/null 2>&1; then
      echo "❌ ${tool} CLI is required."
      exit 1
    fi
  done
}

get_current_branch() {
  git rev-parse --abbrev-ref HEAD 2>/dev/null || echo ""
}

has_uncommitted_changes() {
  ! git diff-index --quiet HEAD -- 2>/dev/null
}

validate_production_deployment() {
  if [[ "${ENVIRONMENT}" != "prod" && "${ENVIRONMENT}" != "production" ]]; then
    return 0
  fi

  if [[ "${SKIP_BRANCH_CHECK}" == "true" ]]; then
    echo "⚠️  WARNING: Branch check skipped for production deployment"
    return 0
  fi

  local current_branch
  current_branch="$(get_current_branch)"

  if [[ -z "${current_branch}" ]]; then
    echo "❌ Not in a git repository. Production deployments must be from a git branch."
    exit 1
  fi

  if [[ "${current_branch}" != "main" && "${current_branch}" != "master" ]]; then
    echo "❌ Production deployments must be from 'main' or 'master' branch."
    echo "   Current branch: ${current_branch}"
    echo "   Use --skip-branch-check to override (not recommended)"
    exit 1
  fi

  if has_uncommitted_changes; then
    echo "❌ Uncommitted changes detected. Production deployments must be from committed code."
    echo "   Commit or stash your changes before deploying to production."
    exit 1
  fi

  if [[ "${IMAGE_TAG}" == "latest" ]]; then
    echo "❌ Production deployments must use a versioned image tag, not 'latest'."
    echo "   Use --image-tag v1.2.3 (or similar versioned tag)"
    exit 1
  fi

  echo "✅ Production deployment checks passed"
  echo "   Branch: ${current_branch}"
  echo "   Image tag: ${IMAGE_TAG}"
}

resolve_project() {
  if [[ -z "${PROJECT_ID}" ]]; then
    PROJECT_ID="$(gcloud config get-value project 2>/dev/null || true)"
  fi
  if [[ -z "${PROJECT_ID}" ]]; then
    echo "❌ Provide a project id via --project or gcloud config set project."
    exit 1
  fi
}

tfvars_path() {
  case "${ENVIRONMENT}" in
    dev) echo "${TERRAFORM_DIR}/terraform.tfvars" ;;
    staging) echo "${TERRAFORM_DIR}/terraform.tfvars.staging" ;;
    prod|production) echo "${TERRAFORM_DIR}/terraform.tfvars.production" ;;
    *)
      echo "❌ Unsupported environment: ${ENVIRONMENT}"
      exit 1
      ;;
  esac
}

read_tfvar() {
  local file="$1"
  local key="$2"
  awk -F'=' -v key="${key}" '
    $0 ~ "^[[:space:]]*"key"[[:space:]]*=" {
      gsub(/#.*/,"",$2)
      gsub(/"/,"",$2)
      gsub(/[[:space:]]/,"",$2)
      print $2
      exit
    }
  ' "${file}"
}

ensure_state_bucket() {
  local bucket="${PROJECT_ID}-terraform-state"
  if ! gsutil ls -b "gs://${bucket}" >/dev/null 2>&1; then
    echo "🪣 Creating Terraform state bucket gs://${bucket}"
    gsutil mb -p "${PROJECT_ID}" -l "${DEFAULT_REGION}" "gs://${bucket}"
    gsutil versioning set on "gs://${bucket}" >/dev/null
  fi
}

init_backend() {
  echo "🔧 Initializing Terraform backend"
  (cd "${TERRAFORM_DIR}" && terraform init -reconfigure \
    -backend-config="bucket=${PROJECT_ID}-terraform-state" \
    -backend-config="prefix=terraform/state")
}

apply_infra() {
  local tfvars="$1"
  local domain="$2"
  echo "🚀 Applying Terraform configuration (${ENVIRONMENT})"
  (cd "${TERRAFORM_DIR}" && terraform apply -auto-approve \
    -var-file="${tfvars}" \
    -var="project_id=${PROJECT_ID}" \
    -var="environment=${ENVIRONMENT}" \
    -var="platform_domain=${domain}")
}

run_cloud_build() {
  local region="$1"
  local domain="$2"
  echo "📦 Building & deploying containers via Cloud Build"
  gcloud builds submit \
    --config="${CLOUDBUILD_CONFIG}" \
    --project="${PROJECT_ID}" \
    --substitutions=_REGION="${region}",_ENVIRONMENT="${ENVIRONMENT}",_PLATFORM_DOMAIN="${domain}",_IMAGE_TAG="${IMAGE_TAG}"
}

print_outputs() {
  echo "📡 Deployment outputs:"
  (cd "${TERRAFORM_DIR}" && terraform output || true)
}

main() {
  parse_args "$@"
  require_cli
  resolve_project
  validate_production_deployment

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

  ensure_state_bucket
  init_backend
  
  # Build images first, then apply infrastructure
  # Cloud Build handles: image builds → Terraform apply (which deploys services)
  echo ""
  echo "📋 Deployment flow:"
  echo "   1. Build Docker images (Cloud Build)"
  echo "   2. Apply infrastructure & deploy services (Terraform via Cloud Build)"
  echo ""
  
  run_cloud_build "${region}" "${platform_domain}"
  print_outputs
}

main "$@"
