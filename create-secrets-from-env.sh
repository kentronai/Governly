#!/bin/bash
set -e

# Create GCP Secrets from .env file
# This reads values from .env and creates them in Secret Manager

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Creating GCP Secrets from .env file${NC}"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
  echo -e "${RED}❌ .env file not found${NC}"
  exit 1
fi

# Load .env
set -a
source .env
set +a

# Get project
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
  echo -e "${RED}❌ No GCP project set${NC}"
  exit 1
fi

echo "Project: $PROJECT_ID"
echo ""

# Function to create or update secret
create_or_update_secret() {
  local secret_name=$1
  local secret_value=$2
  
  if [ -z "$secret_value" ]; then
    echo -e "${YELLOW}⚠️  Skipping $secret_name (empty value)${NC}"
    return
  fi
  
  # Check if secret exists
  if gcloud secrets describe "$secret_name" --project="$PROJECT_ID" &>/dev/null; then
    echo -e "${YELLOW}Updating existing secret:${NC} $secret_name"
    echo "$secret_value" | gcloud secrets versions add "$secret_name" --data-file=- --project="$PROJECT_ID"
  else
    echo -e "${GREEN}Creating new secret:${NC} $secret_name"
    echo "$secret_value" | gcloud secrets create "$secret_name" --data-file=- --project="$PROJECT_ID"
  fi
}

# Create secrets from .env values
echo "Creating/Updating secrets..."
echo ""

create_or_update_secret "database-url" "$DATABASE_URL"
create_or_update_secret "openai-api-key" "$OPENAI_API_KEY"
create_or_update_secret "clerk-publishable-key" "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
create_or_update_secret "clerk-secret-key" "$CLERK_SECRET_KEY"
create_or_update_secret "clerk-webhook-secret" "$CLERK_WEBHOOK_SECRET"

echo ""
echo -e "${GREEN}✅ All secrets created/updated!${NC}"
echo ""
echo "Verify with:"
echo "  gcloud secrets list --project=$PROJECT_ID"
echo ""

