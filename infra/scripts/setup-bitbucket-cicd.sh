#!/bin/bash
set -e

# Script to setup GCP service account for Bitbucket Pipelines CI/CD
# This creates and configures a service account with necessary permissions

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}🔧 Bitbucket Pipelines CI/CD Setup${NC}"
echo "======================================"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI not found${NC}"
    echo "Install from: https://cloud.google.com/sdk/install"
    exit 1
fi

# Get project ID
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)

if [ -z "$PROJECT_ID" ]; then
    echo -e "${YELLOW}No project configured. Please enter your GCP project ID:${NC}"
    read -p "Project ID: " PROJECT_ID
    gcloud config set project $PROJECT_ID
fi

echo -e "${BLUE}Using GCP Project: ${PROJECT_ID}${NC}"
echo ""

# Confirm
echo -e "${YELLOW}This script will:${NC}"
echo "  1. Create service account: bitbucket-cicd@${PROJECT_ID}.iam.gserviceaccount.com"
echo "  2. Grant necessary IAM roles"
echo "  3. Generate and download service account key"
echo "  4. Base64 encode the key for Bitbucket"
echo ""
read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo -e "${GREEN}Step 1: Creating service account...${NC}"

# Check if service account exists
if gcloud iam service-accounts describe bitbucket-cicd@${PROJECT_ID}.iam.gserviceaccount.com &>/dev/null; then
    echo -e "${YELLOW}Service account already exists. Skipping creation.${NC}"
else
    gcloud iam service-accounts create bitbucket-cicd \
        --display-name="Bitbucket Pipelines CI/CD" \
        --description="Service account for Bitbucket Pipelines deployments"
    echo -e "${GREEN}✓ Service account created${NC}"
fi

echo ""
echo -e "${GREEN}Step 2: Granting IAM roles...${NC}"

# Array of roles to grant
roles=(
    "roles/run.admin"
    "roles/cloudbuild.builds.editor"
    "roles/iam.serviceAccountUser"
    "roles/artifactregistry.admin"
    "roles/storage.admin"
)

for role in "${roles[@]}"; do
    echo "  Granting ${role}..."
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:bitbucket-cicd@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="${role}" \
        --condition=None \
        --quiet &>/dev/null || true
done

echo -e "${GREEN}✓ All roles granted${NC}"

echo ""
echo -e "${GREEN}Step 3: Generating service account key...${NC}"

KEY_FILE="bitbucket-cicd-key-${PROJECT_ID}.json"
KEY_FILE_BASE64="bitbucket-cicd-key-${PROJECT_ID}-base64.txt"

# Remove old keys if they exist
rm -f $KEY_FILE $KEY_FILE_BASE64

# Generate new key
gcloud iam service-accounts keys create $KEY_FILE \
    --iam-account=bitbucket-cicd@${PROJECT_ID}.iam.gserviceaccount.com

echo -e "${GREEN}✓ Key generated: ${KEY_FILE}${NC}"

echo ""
echo -e "${GREEN}Step 4: Base64 encoding key...${NC}"

# Base64 encode for Bitbucket (single line, no wrapping)
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    base64 -i $KEY_FILE > $KEY_FILE_BASE64
else
    # Linux
    base64 -w 0 $KEY_FILE > $KEY_FILE_BASE64
fi

echo -e "${GREEN}✓ Encoded key saved: ${KEY_FILE_BASE64}${NC}"

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}📋 Next Steps:${NC}"
echo ""
echo "1. Configure Bitbucket Repository Variables:"
echo "   Go to: Repository Settings → Pipelines → Repository variables"
echo ""
echo "   Add these variables:"
echo "   ┌─────────────────────────────┬──────────────────────┬──────────┐"
echo "   │ Variable Name               │ Value                │ Secured  │"
echo "   ├─────────────────────────────┼──────────────────────┼──────────┤"
echo "   │ GCP_SERVICE_ACCOUNT_KEY     │ (from file below)    │ ✅ Yes   │"
echo "   │ GCP_PROJECT_ID              │ ${PROJECT_ID}        │ ❌ No    │"
echo "   │ GCP_REGION                  │ us-central1          │ ❌ No    │"
echo "   └─────────────────────────────┴──────────────────────┴──────────┘"
echo ""
echo -e "${BLUE}2. Copy the base64 encoded key:${NC}"
echo "   File: ${KEY_FILE_BASE64}"
echo ""
echo "   To display key:"
echo "   ${YELLOW}cat ${KEY_FILE_BASE64}${NC}"
echo ""
echo "   To copy to clipboard (macOS):"
echo "   ${YELLOW}cat ${KEY_FILE_BASE64} | pbcopy${NC}"
echo ""
echo "   To copy to clipboard (Linux):"
echo "   ${YELLOW}cat ${KEY_FILE_BASE64} | xclip -selection clipboard${NC}"
echo ""
echo -e "${BLUE}3. Enable Bitbucket Pipelines:${NC}"
echo "   Repository Settings → Pipelines → Settings → Enable Pipelines"
echo "   Enable Docker support (required)"
echo ""
echo -e "${BLUE}4. Test the pipeline:${NC}"
echo "   Create a PR and verify pipeline runs"
echo ""
echo -e "${RED}⚠️  Security Warning:${NC}"
echo "   - Keep ${KEY_FILE} secure (it's sensitive!)"
echo "   - Do NOT commit to git"
echo "   - Store backup in secure password manager"
echo "   - Delete from disk after uploading to Bitbucket"
echo "   - Rotate keys every 90 days"
echo ""
echo -e "${GREEN}📚 Full Documentation:${NC}"
echo "   docs/deployment/BITBUCKET_CICD_SETUP.md"
echo ""
echo -e "${GREEN}🚀 Ready to deploy!${NC}"

