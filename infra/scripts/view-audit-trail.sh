#!/bin/bash
# View deployment and promotion audit trail
# Shows history of what was promoted/deployed, when, and by whom

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-}"
LIMIT=20
FORMAT="table"

usage() {
  cat <<'EOF'
Deployment Audit Trail Viewer

Usage:
  ./infra/scripts/view-audit-trail.sh [--project <id>] [--limit <n>] [--format table|json]

Options:
  --project <id>   GCP Project ID (default: current gcloud project)
  --limit <n>      Number of entries to show (default: 20)
  --format <fmt>   Output format: table, json, or detailed (default: table)
  -h, --help       Show this help message

Examples:
  # View recent promotions
  ./infra/scripts/view-audit-trail.sh --project kn-prod-01

  # View last 50 promotions in JSON
  ./infra/scripts/view-audit-trail.sh --project kn-prod-01 --limit 50 --format json

  # View detailed history
  ./infra/scripts/view-audit-trail.sh --project kn-prod-01 --format detailed

What it shows:
  - Image promotions (which version, from where, by whom)
  - Deployment events (when services were updated)
  - Rollbacks (if any)
  - Approval history (for production deployments)
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case $1 in
      --project)
        PROJECT_ID="$2"
        shift 2
        ;;
      --limit)
        LIMIT="$2"
        shift 2
        ;;
      --format)
        FORMAT="$2"
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

resolve_project() {
  if [[ -z "$PROJECT_ID" ]]; then
    PROJECT_ID="$(gcloud config get-value project 2>/dev/null || echo '')"
    if [[ -z "$PROJECT_ID" ]]; then
      echo "❌ Project ID required. Set via --project or 'gcloud config set project <id>'"
      exit 1
    fi
  fi
}

view_promotion_history() {
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📋 Image Promotion History"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  
  local filter='logName="projects/'$PROJECT_ID'/logs/promotion-audit"'
  
  case "$FORMAT" in
    table)
      gcloud logging read "$filter" \
        --project="$PROJECT_ID" \
        --limit="$LIMIT" \
        --format="table(timestamp.date('%Y-%m-%d %H:%M:%S'):label=TIME,jsonPayload.status:label=STATUS,jsonPayload.image_tag:label=VERSION,jsonPayload.source_project:label=FROM,jsonPayload.user:label=BY)" \
        2>/dev/null || echo "No promotion history found"
      ;;
    json)
      gcloud logging read "$filter" \
        --project="$PROJECT_ID" \
        --limit="$LIMIT" \
        --format=json \
        2>/dev/null || echo "[]"
      ;;
    detailed)
      gcloud logging read "$filter" \
        --project="$PROJECT_ID" \
        --limit="$LIMIT" \
        --format="value(timestamp,jsonPayload.status,jsonPayload.image_tag,jsonPayload.source_project,jsonPayload.target_project,jsonPayload.user,jsonPayload.details)" \
        2>/dev/null | while read -r line; do
          echo "────────────────────────────────────────────"
          echo "$line" | awk '{print "Time:    " $1 " " $2}'
          echo "$line" | awk '{print "Status:  " $3}'
          echo "$line" | awk '{print "Version: " $4}'
          echo "$line" | awk '{print "From:    " $5}'
          echo "$line" | awk '{print "To:      " $6}'
          echo "$line" | awk '{print "By:      " $7}'
          echo "$line" | awk '{print "Details: " $8}'
          echo ""
        done
      ;;
  esac
}

view_deployment_history() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🚀 Cloud Run Deployment History (Last $LIMIT)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  
  local filter='resource.type="cloud_run_revision" AND (protoPayload.methodName="google.cloud.run.v1.Revisions.CreateRevision" OR protoPayload.methodName="google.cloud.run.v2.Revisions.CreateRevision")'
  
  case "$FORMAT" in
    table)
      gcloud logging read "$filter" \
        --project="$PROJECT_ID" \
        --limit="$LIMIT" \
        --format="table(timestamp.date('%Y-%m-%d %H:%M:%S'):label=TIME,resource.labels.service_name:label=SERVICE,protoPayload.authenticationInfo.principalEmail:label=DEPLOYED_BY)" \
        2>/dev/null || echo "No deployment history found"
      ;;
    json)
      gcloud logging read "$filter" \
        --project="$PROJECT_ID" \
        --limit="$LIMIT" \
        --format=json \
        2>/dev/null || echo "[]"
      ;;
    detailed)
      gcloud logging read "$filter" \
        --project="$PROJECT_ID" \
        --limit="$LIMIT" \
        --format="value(timestamp,resource.labels.service_name,resource.labels.revision_name,protoPayload.authenticationInfo.principalEmail)" \
        2>/dev/null | while read -r line; do
          echo "────────────────────────────────────────────"
          echo "$line" | awk '{print "Time:     " $1 " " $2}'
          echo "$line" | awk '{print "Service:  " $3}'
          echo "$line" | awk '{print "Revision: " $4}'
          echo "$line" | awk '{print "By:       " $5}'
          echo ""
        done
      ;;
  esac
}

view_current_versions() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📦 Currently Deployed Versions"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  
  # Detect environment from project ID
  local env="dev"
  if [[ "$PROJECT_ID" == *"prod"* ]]; then
    env="prod"
  elif [[ "$PROJECT_ID" == *"staging"* ]]; then
    env="staging"
  fi
  
  local services=("controlnet-gateway-$env" "web-app-$env" "model-guard-$env" "onnx-inference-service-$env")
  
  for service in "${services[@]}"; do
    local image=$(gcloud run services describe "$service" \
      --region=us-central1 \
      --project="$PROJECT_ID" \
      --format="value(spec.template.spec.containers[0].image)" \
      2>/dev/null || echo "Not deployed")
    
    local tag=$(echo "$image" | grep -oP ':[^:]+$' | tr -d ':' || echo "unknown")
    
    printf "%-35s %s\n" "$service:" "$tag"
  done
}

view_local_audit_log() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📝 Local Audit Log (This Month)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  
  local audit_file="/tmp/promotion-audit-$(date +%Y%m).log"
  if [[ -f "$audit_file" ]]; then
    tail -n "$LIMIT" "$audit_file"
  else
    echo "No local audit log found at $audit_file"
  fi
}

main() {
  parse_args "$@"
  resolve_project
  
  echo ""
  echo "╔════════════════════════════════════════════════════════╗"
  echo "║          Deployment & Promotion Audit Trail           ║"
  echo "╚════════════════════════════════════════════════════════╝"
  echo ""
  echo "Project: $PROJECT_ID"
  echo "Limit:   $LIMIT entries"
  echo ""
  
  view_current_versions
  view_promotion_history
  view_deployment_history
  
  if [[ "$FORMAT" == "detailed" ]]; then
    view_local_audit_log
  fi
  
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "💡 Tips:"
  echo "  - View more entries: --limit 50"
  echo "  - Export to JSON: --format json > audit.json"
  echo "  - View detailed info: --format detailed"
  echo ""
}

main "$@"

