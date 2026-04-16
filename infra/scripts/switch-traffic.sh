#!/bin/bash
# Switch traffic to latest revision
# Run this after deployment to activate the new code

set -e

PROJECT_ID=$(gcloud config get-value project)
if [ -z "$PROJECT_ID" ]; then
  echo "❌ GCP project not set. Run: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

REGION=${GCP_REGION:-us-central1}
SERVICE_NAME="controlnet-gateway"

echo "🔄 Switching traffic to latest revision..."
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE_NAME"
echo ""

# Get latest revision
LATEST_REVISION=$(gcloud run revisions list \
  --service=$SERVICE_NAME \
  --region=$REGION \
  --project=$PROJECT_ID \
  --limit=1 \
  --format="value(name)")

echo "Latest revision: $LATEST_REVISION"

# Update service to route 100% traffic to latest
echo ""
echo "Routing 100% traffic to $LATEST_REVISION..."

gcloud run services update-traffic $SERVICE_NAME \
  --region=$REGION \
  --project=$PROJECT_ID \
  --to-revisions=$LATEST_REVISION=100

echo ""
echo "✅ Traffic switched successfully!"
echo ""
echo "Verify:"
echo "  gcloud run revisions list --service=$SERVICE_NAME --region=$REGION --project=$PROJECT_ID --limit=5"

