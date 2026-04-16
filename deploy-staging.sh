#!/bin/bash
# Staging Environment Deployment Script
# This script automates the deployment of a complete staging environment to GCP

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Banner
echo "╔════════════════════════════════════════════════════════╗"
echo "║   AI Governance Platform - Staging Deployment         ║"
echo "║   Complete Infrastructure Setup                        ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# ============================================
# CONFIGURATION
# ============================================

log_info "Step 1: Configuration"
echo ""

# Check if PROJECT_ID is provided
if [ -z "$1" ]; then
  read -p "Enter GCP Project ID for staging: " PROJECT_ID
else
  PROJECT_ID=$1
fi

# Set defaults
REGION=${REGION:-"us-central1"}
ENVIRONMENT="staging"

log_info "Configuration:"
echo "  Project ID: $PROJECT_ID"
echo "  Region: $REGION"
echo "  Environment: $ENVIRONMENT"
echo ""

read -p "Continue with this configuration? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  log_error "Deployment cancelled"
  exit 1
fi

# ============================================
# PREREQUISITES CHECK
# ============================================

log_info "Step 2: Checking prerequisites..."

# Check gcloud
if ! command -v gcloud &> /dev/null; then
  log_error "gcloud CLI not found. Please install Google Cloud SDK"
  exit 1
fi

# Check terraform
if ! command -v terraform &> /dev/null; then
  log_error "terraform not found. Please install Terraform"
  exit 1
fi

# Check docker
if ! command -v docker &> /dev/null; then
  log_error "docker not found. Please install Docker"
  exit 1
fi

log_success "All prerequisites installed"

# Set active project
gcloud config set project $PROJECT_ID

# ============================================
# ENABLE APIS
# ============================================

log_info "Step 3: Enabling required APIs..."

gcloud services enable \
  run.googleapis.com \
  redis.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  sqladmin.googleapis.com \
  vpcaccess.googleapis.com \
  compute.googleapis.com \
  storage.googleapis.com \
  servicenetworking.googleapis.com \
  --project=$PROJECT_ID \
  --quiet

log_success "APIs enabled"

# Wait for APIs to propagate
log_info "Waiting for APIs to propagate (30 seconds)..."
sleep 30

# ============================================
# TERRAFORM STATE BUCKET
# ============================================

log_info "Step 4: Creating Terraform state bucket..."

STATE_BUCKET="${PROJECT_ID}-terraform-state"

# Check if bucket exists
if gsutil ls -p $PROJECT_ID gs://${STATE_BUCKET} 2>/dev/null; then
  log_warning "State bucket already exists: gs://${STATE_BUCKET}"
else
  gsutil mb -p $PROJECT_ID -l $REGION gs://${STATE_BUCKET}
  gsutil versioning set on gs://${STATE_BUCKET}
  log_success "State bucket created: gs://${STATE_BUCKET}"
fi

# ============================================
# SECRET MANAGER
# ============================================

log_info "Step 5: Setting up Secret Manager secrets..."

# Check if create-secrets-from-env.sh exists
if [ -f "./create-secrets-from-env.sh" ]; then
  log_info "Found create-secrets-from-env.sh script"
  
  # Check if .env file exists with secrets
  if [ -f ".env" ] && grep -q "OPENAI_API_KEY" .env && grep -q "CLERK_SECRET_KEY" .env; then
    log_info "Using automated secret creation from .env file"
    ./create-secrets-from-env.sh
    log_success "Secrets created from .env file"
  else
    log_warning ".env file not found or missing required secrets"
    log_info "Falling back to manual secret creation..."
    
    # Create empty secrets
    SECRETS=(
      "database-url"
      "openai-api-key"
      "clerk-publishable-key"
      "clerk-secret-key"
      "clerk-webhook-secret"
    )

    for SECRET in "${SECRETS[@]}"; do
      if gcloud secrets describe $SECRET --project=$PROJECT_ID &>/dev/null; then
        log_warning "Secret already exists: $SECRET"
      else
        gcloud secrets create $SECRET \
          --replication-policy="automatic" \
          --project=$PROJECT_ID \
          --quiet
        log_success "Secret created: $SECRET"
      fi
    done
    
    log_warning "Please add secret values manually using:"
    echo "  echo 'YOUR-VALUE' | gcloud secrets versions add SECRET-NAME --data-file=- --project=$PROJECT_ID"
    echo ""
    log_info "Required secrets:"
    echo "  - openai-api-key"
    echo "  - clerk-publishable-key"
    echo "  - clerk-secret-key"
    echo "  - clerk-webhook-secret"
    echo ""
    log_info "Note: database-url will be auto-populated by Terraform"
    echo ""
    read -p "Press Enter after adding secret values..."
  fi
else
  log_warning "create-secrets-from-env.sh not found, using manual creation"
  
  # Create empty secrets
  SECRETS=(
    "database-url"
    "openai-api-key"
    "clerk-publishable-key"
    "clerk-secret-key"
    "clerk-webhook-secret"
  )

  for SECRET in "${SECRETS[@]}"; do
    if gcloud secrets describe $SECRET --project=$PROJECT_ID &>/dev/null; then
      log_warning "Secret already exists: $SECRET"
    else
      gcloud secrets create $SECRET \
        --replication-policy="automatic" \
        --project=$PROJECT_ID \
        --quiet
      log_success "Secret created: $SECRET"
    fi
  done

  log_warning "Please add secret values manually:"
  echo "  gcloud secrets versions add openai-api-key --data-file=- --project=$PROJECT_ID"
  echo "  gcloud secrets versions add clerk-publishable-key --data-file=- --project=$PROJECT_ID"
  echo "  gcloud secrets versions add clerk-secret-key --data-file=- --project=$PROJECT_ID"
  echo "  gcloud secrets versions add clerk-webhook-secret --data-file=- --project=$PROJECT_ID"
  echo ""
  log_info "Note: database-url will be auto-populated by Terraform"
  echo ""
  read -p "Press Enter after adding secret values..."
fi

# ============================================
# IAM PERMISSIONS
# ============================================

log_info "Step 6: Granting IAM permissions..."

PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")

# Grant Cloud Build permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin" \
  --condition=None \
  --quiet

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" \
  --condition=None \
  --quiet

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --condition=None \
  --quiet

log_success "IAM permissions granted"

# ============================================
# TERRAFORM CONFIGURATION
# ============================================

log_info "Step 7: Configuring Terraform..."

cd infra/terraform

# Update backend
cat > backend_override.tf <<EOF
terraform {
  backend "gcs" {
    bucket = "${STATE_BUCKET}"
    prefix = "terraform/state"
  }
}
EOF

# Create terraform.tfvars from template
cp terraform.tfvars.staging terraform.tfvars

# Update with actual values
sed -i.bak "s/your-staging-project-id/${PROJECT_ID}/g" terraform.tfvars
sed -i.bak "s/us-central1/${REGION}/g" terraform.tfvars
rm terraform.tfvars.bak

log_success "Terraform configured"

log_warning "Please update terraform.tfvars with:"
echo "  - platform_domain (your staging domain)"
echo "  - hf_token (your HuggingFace token)"
echo ""
read -p "Press Enter after updating terraform.tfvars..."

# ============================================
# TERRAFORM INITIALIZATION
# ============================================

log_info "Step 8: Initializing Terraform..."

terraform init -reconfigure

log_success "Terraform initialized"

# ============================================
# TERRAFORM PLAN
# ============================================

log_info "Step 9: Planning infrastructure..."

terraform plan -out=tfplan -lock=false

log_info "Review the plan above"
echo ""
read -p "Deploy infrastructure? (yes/no): " deploy_confirm

if [ "$deploy_confirm" != "yes" ]; then
  log_error "Deployment cancelled"
  exit 1
fi

# ============================================
# TERRAFORM APPLY
# ============================================

log_info "Step 10: Deploying infrastructure (takes ~10-15 minutes)..."

terraform apply -lock=false tfplan

log_success "Infrastructure deployed"

# Get outputs
REDIS_HOST=$(terraform output -raw redis_host)
DB_PRIVATE_IP=$(terraform output -raw database_private_ip)
ONNX_BUCKET=$(terraform output -raw onnx_models_bucket)

log_info "Infrastructure details:"
echo "  Redis Host: $REDIS_HOST"
echo "  Database IP: $DB_PRIVATE_IP"
echo "  ONNX Bucket: $ONNX_BUCKET"
echo ""

# ============================================
# BUILD AND PUSH IMAGES
# ============================================

log_info "Step 11: Building and pushing Docker images..."

cd ../..  # Back to project root
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/ai-governance"

# Authenticate Docker
gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet

# Get platform domain from terraform.tfvars for web build
PLATFORM_DOMAIN=$(grep "platform_domain" infra/terraform/terraform.tfvars | cut -d'"' -f2 || echo "demo.kentron.ai")
BACKEND_URL="https://${PLATFORM_DOMAIN}"

# Get Clerk publishable key from Secret Manager for web build
log_info "Fetching Clerk publishable key from Secret Manager..."
CLERK_PUBLISHABLE_KEY=$(gcloud secrets versions access latest --secret="clerk-publishable-key" --project="${PROJECT_ID}" 2>/dev/null || echo "")

if [ -z "$CLERK_PUBLISHABLE_KEY" ]; then
  log_error "Clerk publishable key not found in Secret Manager. Build will fail without it."
  log_info "The key is required for Next.js build-time prerendering."
  log_info "Add it with: echo 'YOUR_KEY' | gcloud secrets versions add clerk-publishable-key --data-file=- --project=${PROJECT_ID}"
  log_error "Cannot proceed with web build without Clerk key."
  exit 1
fi

log_success "Clerk publishable key retrieved from Secret Manager"

# Build and push each service
SERVICES=("controlnet" "model-guard" "onnx-service" "web")

for SERVICE in "${SERVICES[@]}"; do
  log_info "Building $SERVICE..."
  
  if [ "$SERVICE" == "onnx-service" ]; then
    IMAGE_NAME="onnx-inference-service-staging"
    docker build -t ${REGISTRY}/${IMAGE_NAME}:latest ./apps/${SERVICE}
  elif [ "$SERVICE" == "web" ]; then
    IMAGE_NAME=$SERVICE
    # Pass build args for Next.js build-time environment variables
    # Clerk publishable key is required for build-time prerendering
    log_info "Building web with Clerk key and backend URL..."
    docker build \
      --build-arg NEXT_PUBLIC_BACKEND_URL="${BACKEND_URL}" \
      --build-arg NEXT_PUBLIC_API_URL="${BACKEND_URL}" \
      --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="${CLERK_PUBLISHABLE_KEY}" \
      -t ${REGISTRY}/${IMAGE_NAME}:latest \
      ./apps/${SERVICE}
  else
    IMAGE_NAME=$SERVICE
    docker build -t ${REGISTRY}/${IMAGE_NAME}:latest ./apps/${SERVICE}
  fi
  
  docker push ${REGISTRY}/${IMAGE_NAME}:latest
  
  log_success "$SERVICE built and pushed"
done

# ============================================
# UPDATE CLOUD RUN SERVICES
# ============================================

log_info "Step 12: Updating Cloud Run services..."

cd infra/terraform
terraform apply -auto-approve -lock=false

log_success "Cloud Run services deployed"

# ============================================
# VERIFY DEPLOYMENT
# ============================================

log_info "Step 13: Verifying deployment..."

WEB_URL=$(terraform output -raw web_url)
CONTROLNET_URL=$(terraform output -raw controlnet_url)
MODELGUARD_URL=$(terraform output -raw modelguard_url)
ONNX_URL=$(terraform output -raw onnx_service_url)

sleep 30  # Wait for services to be ready

# Test health endpoints
echo ""
log_info "Testing services..."

if curl -sf ${CONTROLNET_URL}/healthz &>/dev/null; then
  log_success "ControlNet healthy"
else
  log_warning "ControlNet health check failed (may need more time)"
fi

if curl -sf ${MODELGUARD_URL}/health &>/dev/null; then
  log_success "ModelGuard healthy"
else
  log_warning "ModelGuard health check failed (may need more time)"
fi

if curl -sf ${ONNX_URL}/health &>/dev/null; then
  log_success "ONNX Service healthy"
else
  log_warning "ONNX Service health check failed (may need more time)"
fi

if curl -sf ${WEB_URL} &>/dev/null; then
  log_success "Web App healthy"
else
  log_warning "Web App health check failed (may need more time)"
fi

# ============================================
# SUMMARY
# ============================================

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║         🎉 STAGING DEPLOYMENT COMPLETED 🎉             ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

log_success "Staging environment is now live!"
echo ""
echo "📊 Environment Details:"
echo "  Project: $PROJECT_ID"
echo "  Region: $REGION"
echo "  Environment: staging"
echo ""
echo "🌐 Service URLs:"
echo "  Web App: $WEB_URL"
echo "  ControlNet: $CONTROLNET_URL"
echo "  ModelGuard: $MODELGUARD_URL"
echo "  ONNX: $ONNX_URL"
echo ""
echo "💾 Resources Created:"
echo "  ✅ Cloud SQL PostgreSQL (1 vCPU, 4GB RAM)"
echo "  ✅ Redis (BASIC tier, 2GB)"
echo "  ✅ 4 Cloud Run services"
echo "  ✅ VPC connector"
echo "  ✅ 2 GCS buckets"
echo ""
echo "🔐 Security:"
echo "  ✅ Private VPC networking"
echo "  ✅ Secrets in Secret Manager"
echo "  ✅ IAM-based access control"
echo ""
echo "📝 Next Steps:"
echo "  1. Run database migrations"
echo "  2. Upload ONNX models (if needed)"
echo "  3. Configure custom domain (optional)"
echo "  4. Set up monitoring alerts"
echo "  5. Run integration tests"
echo ""
echo "📚 Documentation:"
echo "  - Full guide: /STAGING_DEPLOYMENT_GUIDE.md"
echo "  - Database setup: /infra/terraform/DATABASE_DEPLOYMENT.md"
echo "  - Env vars: /docs/ENVIRONMENT_VARIABLES_GUIDE.md"
echo ""

log_info "View logs:"
echo "  gcloud run services logs read controlnet-gateway-staging --region=$REGION"
echo ""

log_info "Monitor services:"
echo "  gcloud run services list --project=$PROJECT_ID"
echo ""

log_success "Deployment complete! 🚀"

