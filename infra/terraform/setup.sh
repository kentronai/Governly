#!/bin/bash

# AI Governance Platform - Terraform Setup Script
# Dynamically configures backend + tfvars for the requested project/environment

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

usage() {
  cat <<'EOF'
Usage: ./setup.sh <project-id> [environment]

Environment values:
  dev      -> terraform.tfvars
  staging  -> terraform.tfvars.staging
  prod     -> terraform.tfvars.production
EOF
}

PROJECT_ID="${1:-}"
ENVIRONMENT="${2:-dev}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "❌ Project ID is required."
  usage
  exit 1
fi

case "${ENVIRONMENT}" in
  dev) TFVARS_FILE="terraform.tfvars" ;;
  staging) TFVARS_FILE="terraform.tfvars.staging" ;;
  prod|production) TFVARS_FILE="terraform.tfvars.production" ;;
  *)
    echo "❌ Unknown environment: ${ENVIRONMENT}"
    usage
    exit 1
    ;;
esac

if [[ ! -f "${TFVARS_FILE}" ]]; then
  echo "❌ ${TFVARS_FILE} not found. Please create it first."
  exit 1
fi

STATE_BUCKET="${PROJECT_ID}-terraform-state"

echo "🚀 AI Governance Terraform Setup"
echo "============================================="
echo "Project:      ${PROJECT_ID}"
echo "Environment:  ${ENVIRONMENT}"
echo "TFVARS file:  ${TFVARS_FILE}"
echo "State bucket: ${STATE_BUCKET}"
echo ""

if ! command -v gsutil >/dev/null 2>&1; then
  echo "❌ gsutil CLI is required to manage the remote state bucket."
  exit 1
fi

if ! gsutil ls -b "gs://${STATE_BUCKET}" >/dev/null 2>&1; then
  echo "🪣 Creating state bucket gs://${STATE_BUCKET}..."
  gsutil mb -p "${PROJECT_ID}" -l us-central1 "gs://${STATE_BUCKET}"
  gsutil versioning set on "gs://${STATE_BUCKET}" >/dev/null
else
  echo "✅ State bucket already exists."
fi

echo "🔧 Initializing Terraform backend..."
terraform init -reconfigure \
  -backend-config="bucket=${STATE_BUCKET}" \
  -backend-config="prefix=terraform/state"

echo ""
echo "✅ Terraform initialized successfully!"
echo ""
echo "Next steps:"
echo "  terraform plan  -var-file=${TFVARS_FILE}"
echo "  terraform apply -var-file=${TFVARS_FILE}"
