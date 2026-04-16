#!/bin/bash
# Image Promotion Script
# Promotes (retags) existing images from one environment to another
# without rebuilding - ensures identical code runs in all environments
#
# Usage:
#   ./infra/scripts/promote-images.sh --from-project kn-dev-01 --to-project kn-prod-01 --tag v1.2.3

set -euo pipefail

DEFAULT_REGION="us-central1"
SOURCE_PROJECT=""
TARGET_PROJECT=""
IMAGE_TAG=""
DRY_RUN=false

usage() {
  cat <<'EOF'
Image Promotion Script - Promote Images Between Environments

Usage:
  ./infra/scripts/promote-images.sh --from-project <src> --to-project <dst> --tag <version>

Options:
  --from-project <id>   Source GCP project (e.g., dev/staging)
  --to-project <id>     Target GCP project (e.g., staging/production)
  --tag <version>       Image tag to promote (e.g., v1.2.3)
  --dry-run             Show what would be done without executing
  -h, --help            Show this help message

Examples:
  # Promote staging images to production
  ./infra/scripts/promote-images.sh \
    --from-project kn-staging-01 \
    --to-project kn-prod-01 \
    --tag v1.2.3

  # Preview what would be promoted (dry run)
  ./infra/scripts/promote-images.sh \
    --from-project kn-dev-01 \
    --to-project kn-staging-01 \
    --tag v1.2.3 \
    --dry-run

What it does:
  1. Pulls images from source project's Artifact Registry
  2. Retags them for target project
  3. Pushes to target project's Artifact Registry
  4. Ensures IDENTICAL images run in both environments

Why promote instead of rebuild:
  ✅ Guarantees same code/dependencies in all environments
  ✅ Much faster (no rebuild time)
  ✅ Reduces CI/CD costs
  ✅ Enables true "test in staging, promote to prod" workflow

After promotion, deploy with:
  ./infra/scripts/deploy.sh --project <target-project> --env prod --image-tag <version>
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case $1 in
      --from-project)
        SOURCE_PROJECT="$2"
        shift 2
        ;;
      --to-project)
        TARGET_PROJECT="$2"
        shift 2
        ;;
      --tag)
        IMAGE_TAG="$2"
        shift 2
        ;;
      --dry-run)
        DRY_RUN=true
        shift
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
  if [[ -z "$SOURCE_PROJECT" ]]; then
    echo "❌ Source project required (--from-project)"
    exit 1
  fi
  
  if [[ -z "$TARGET_PROJECT" ]]; then
    echo "❌ Target project required (--to-project)"
    exit 1
  fi
  
  if [[ -z "$IMAGE_TAG" ]]; then
    echo "❌ Image tag required (--tag)"
    exit 1
  fi
  
  if [[ "$IMAGE_TAG" == "latest" ]]; then
    echo "❌ Cannot promote 'latest' tag. Use versioned tags (e.g., v1.2.3)"
    exit 1
  fi
  
  if [[ "$SOURCE_PROJECT" == "$TARGET_PROJECT" ]]; then
    echo "❌ Source and target projects must be different"
    exit 1
  fi
}

check_source_images() {
  echo "🔍 Checking source images in $SOURCE_PROJECT..."
  
  local missing=0
  for service in controlnet model-guard web onnx-inference-service-dev; do
    local image="${DEFAULT_REGION}-docker.pkg.dev/${SOURCE_PROJECT}/ai-governance/${service}:${IMAGE_TAG}"
    
    if gcloud container images describe "$image" --project="$SOURCE_PROJECT" >/dev/null 2>&1; then
      echo "  ✅ $service:${IMAGE_TAG}"
    else
      echo "  ❌ $service:${IMAGE_TAG} NOT FOUND"
      missing=$((missing + 1))
    fi
  done
  
  if [[ $missing -gt 0 ]]; then
    echo ""
    echo "❌ $missing image(s) not found in source project"
    echo "   Build images first with:"
    echo "   ./infra/scripts/deploy.sh --project $SOURCE_PROJECT --env dev --image-tag $IMAGE_TAG"
    exit 1
  fi
  
  echo "✅ All source images found"
}

promote_image() {
  local service=$1
  local src_image="${DEFAULT_REGION}-docker.pkg.dev/${SOURCE_PROJECT}/ai-governance/${service}:${IMAGE_TAG}"
  local dst_image="${DEFAULT_REGION}-docker.pkg.dev/${TARGET_PROJECT}/ai-governance/${service}:${IMAGE_TAG}"
  
  echo ""
  echo "📦 Promoting: $service"
  echo "   From: $src_image"
  echo "   To:   $dst_image"
  
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "   [DRY RUN] Would execute:"
    echo "     gcloud container images add-tag $src_image $dst_image --quiet"
    return
  fi
  
  # Use gcloud to copy image between projects
  # This is more efficient than pull/tag/push
  if gcloud container images add-tag "$src_image" "$dst_image" --quiet 2>/dev/null; then
    echo "   ✅ Promoted successfully"
  else
    # Fallback: manual pull/tag/push if add-tag doesn't work cross-project
    echo "   ℹ️  Using manual promotion (cross-project)..."
    
    # Authenticate docker with source project
    gcloud auth configure-docker ${DEFAULT_REGION}-docker.pkg.dev --project="$SOURCE_PROJECT" --quiet
    
    # Pull from source
    echo "   📥 Pulling from source..."
    docker pull "$src_image"
    
    # Tag for destination
    docker tag "$src_image" "$dst_image"
    
    # Authenticate docker with target project
    gcloud auth configure-docker ${DEFAULT_REGION}-docker.pkg.dev --project="$TARGET_PROJECT" --quiet
    
    # Push to destination
    echo "   📤 Pushing to target..."
    docker push "$dst_image"
    
    echo "   ✅ Promoted successfully"
  fi
}

log_promotion() {
  local status=$1
  local details=$2
  
  # Log to Cloud Logging for audit trail
  local log_entry=$(cat <<EOF
{
  "severity": "INFO",
  "jsonPayload": {
    "action": "image_promotion",
    "status": "$status",
    "source_project": "$SOURCE_PROJECT",
    "target_project": "$TARGET_PROJECT",
    "image_tag": "$IMAGE_TAG",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "user": "${USER:-unknown}",
    "details": "$details"
  },
  "labels": {
    "component": "deployment",
    "environment": "production"
  }
}
EOF
)
  
  # Write to Cloud Logging
  if command -v gcloud >/dev/null 2>&1 && [[ "$DRY_RUN" != "true" ]]; then
    echo "$log_entry" | gcloud logging write promotion-audit - --severity=INFO --project="$TARGET_PROJECT" 2>/dev/null || true
  fi
  
  # Also write to local audit log file
  local audit_file="/tmp/promotion-audit-$(date +%Y%m).log"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $status: $SOURCE_PROJECT -> $TARGET_PROJECT ($IMAGE_TAG) by ${USER:-unknown}" >> "$audit_file"
}

main() {
  parse_args "$@"
  validate_args
  
  echo "========================================="
  echo "Image Promotion"
  echo "========================================="
  echo "From:     $SOURCE_PROJECT"
  echo "To:       $TARGET_PROJECT"
  echo "Tag:      $IMAGE_TAG"
  echo "Dry Run:  $DRY_RUN"
  echo "User:     ${USER:-unknown}"
  echo "========================================="
  echo ""
  
  log_promotion "STARTED" "Promotion initiated"
  
  check_source_images
  
  echo ""
  echo "🚀 Promoting images..."
  
  # Promote all services
  promote_image "controlnet"
  promote_image "model-guard"
  promote_image "web"
  promote_image "onnx-inference-service-dev"
  
  echo ""
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "✅ Dry run complete - no images were actually promoted"
    log_promotion "DRY_RUN" "Dry run completed successfully"
  else
    echo "✅ All images promoted successfully!"
    log_promotion "SUCCESS" "All 4 services promoted successfully"
  fi
  
  echo ""
  echo "📋 Audit Trail:"
  echo "   - Cloud Logging: Check promotion-audit logs in $TARGET_PROJECT"
  echo "   - Local log: /tmp/promotion-audit-$(date +%Y%m).log"
  echo ""
  echo "Next steps:"
  echo "  1. Deploy to target environment with promoted images:"
  echo "     ./infra/scripts/deploy.sh --project $TARGET_PROJECT --env prod --image-tag $IMAGE_TAG"
  echo ""
  echo "  2. Or use apply-terraform to deploy without rebuilding:"
  echo "     ./infra/scripts/apply-terraform.sh --project $TARGET_PROJECT --env prod --image-tag $IMAGE_TAG"
  echo ""
  echo "  3. View promotion history:"
  echo "     gcloud logging read 'logName=\"projects/$TARGET_PROJECT/logs/promotion-audit\"' --project=$TARGET_PROJECT --limit=10"
}

main "$@"

