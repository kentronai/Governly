#!/bin/bash
# Bootstrap a brand new GCP project for AI Governance Platform
# Run this once when setting up a new environment (dev/staging/prod)
#
# Usage:
#   ./infra/scripts/bootstrap-new-project.sh --project <project-id> --env <dev|staging|prod>

set -euo pipefail

PROJECT_ID=""
ENVIRONMENT=""

usage() {
  cat <<'EOF'
Bootstrap New GCP Project - One-Time Setup

Usage:
  ./infra/scripts/bootstrap-new-project.sh --project <id> --env <dev|staging|prod>

Examples:
  # Bootstrap dev environment
  ./infra/scripts/bootstrap-new-project.sh --project kn-dev-01 --env dev

  # Bootstrap production
  ./infra/scripts/bootstrap-new-project.sh --project kn-prod-01 --env prod

What it does:
  1. ✅ Enables required GCP APIs
  2. ✅ Creates Artifact Registry repository
  3. ✅ Sets up Cloud Build service account permissions
  4. ✅ Creates secrets (prompts for values)
  5. ✅ Creates Terraform state bucket
  6. ✅ Ready for first deployment!

After running this, you can deploy with:
  ./infra/scripts/deploy.sh --project <project-id> --env <env> --image-tag <tag>
EOF
}

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
  
  if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
    echo "❌ Environment must be: dev, staging, or prod"
    exit 1
  fi
}

step() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📋 Step $1: $2"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
}

info() {
  echo "ℹ️  $1"
}

success() {
  echo "✅ $1"
}

warn() {
  echo "⚠️  $1"
}

error() {
  echo "❌ $1"
  exit 1
}

check_prerequisites() {
  step 1 "Checking Prerequisites"
  
  info "Checking required CLI tools..."
  
  if ! command -v gcloud &> /dev/null; then
    error "gcloud CLI not found. Install: https://cloud.google.com/sdk/docs/install"
  fi
  success "gcloud CLI found"
  
  if ! command -v terraform &> /dev/null; then
    error "terraform not found. Install: https://www.terraform.io/downloads"
  fi
  success "terraform found"
  
  info "Authenticating with GCP..."
  if ! gcloud auth application-default print-access-token &> /dev/null; then
    warn "Not authenticated. Running authentication..."
    gcloud auth application-default login
  fi
  success "Authenticated"
  
  info "Setting active project..."
  gcloud config set project "$PROJECT_ID"
  success "Active project set to $PROJECT_ID"
}

enable_apis() {
  step 2 "Enabling Required GCP APIs"
  
  info "This may take 2-3 minutes..."
  
  local apis=(
    "run.googleapis.com"
    "cloudbuild.googleapis.com"
    "artifactregistry.googleapis.com"
    "secretmanager.googleapis.com"
    "compute.googleapis.com"
    "redis.googleapis.com"
    "sqladmin.googleapis.com"
    "vpcaccess.googleapis.com"
    "servicenetworking.googleapis.com"
    "storage.googleapis.com"
    "cloudresourcemanager.googleapis.com"
  )
  
  for api in "${apis[@]}"; do
    info "Enabling $api..."
    gcloud services enable "$api" --project="$PROJECT_ID" --quiet
  done
  
  success "All APIs enabled"
}

setup_artifact_registry() {
  step 3 "Creating Artifact Registry Repository"
  
  local repo_name="ai-governance"
  local region="us-central1"
  
  info "Creating repository: $repo_name"
  
  if gcloud artifacts repositories describe "$repo_name" \
    --location="$region" \
    --project="$PROJECT_ID" &> /dev/null; then
    warn "Repository already exists"
  else
    gcloud artifacts repositories create "$repo_name" \
      --repository-format=docker \
      --location="$region" \
      --description="AI Governance Platform Docker images" \
      --project="$PROJECT_ID"
    success "Repository created"
  fi
  
  info "Configuring Docker authentication..."
  gcloud auth configure-docker us-central1-docker.pkg.dev --quiet
  success "Docker authentication configured"
}

setup_cloud_build_permissions() {
  step 4 "Setting Up Cloud Build Permissions"
  
  info "Getting Cloud Build service account..."
  local project_number=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
  local build_sa="${project_number}@cloudbuild.gserviceaccount.com"
  
  info "Granting permissions to $build_sa..."
  
  # Cloud Run Admin (to deploy services)
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${build_sa}" \
    --role="roles/run.admin" \
    --quiet
  
  # Service Account User (to deploy as service account)
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${build_sa}" \
    --role="roles/iam.serviceAccountUser" \
    --quiet
  
  # Secret Manager Accessor (to read secrets during build)
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${build_sa}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet
  
  success "Cloud Build permissions configured"
}

create_secrets() {
  step 5 "Creating Secrets in Secret Manager"
  
  warn "You'll need to provide values for these secrets"
  echo ""
  
  # Database URL (placeholder - will be updated after DB is created)
  info "Creating database-url secret..."
  if gcloud secrets describe database-url --project="$PROJECT_ID" &> /dev/null; then
    warn "database-url already exists"
  else
    echo "postgresql://placeholder" | gcloud secrets create database-url \
      --data-file=- \
      --project="$PROJECT_ID" \
      --quiet
    warn "database-url created with placeholder (will be updated after DB creation)"
  fi
  
  # OpenAI API Key
  info "Creating openai-api-key secret..."
  if gcloud secrets describe openai-api-key --project="$PROJECT_ID" &> /dev/null; then
    warn "openai-api-key already exists"
  else
    read -sp "Enter OpenAI API Key (or press Enter to skip): " openai_key
    echo ""
    if [[ -n "$openai_key" ]]; then
      echo "$openai_key" | gcloud secrets create openai-api-key \
        --data-file=- \
        --project="$PROJECT_ID" \
        --quiet
      success "openai-api-key created"
    else
      warn "Skipped - you can create later with: gcloud secrets create openai-api-key --data-file=- --project=$PROJECT_ID"
    fi
  fi
  
  # Clerk Publishable Key
  info "Creating clerk-publishable-key secret..."
  if gcloud secrets describe clerk-publishable-key --project="$PROJECT_ID" &> /dev/null; then
    warn "clerk-publishable-key already exists"
  else
    read -sp "Enter Clerk Publishable Key (or press Enter to skip): " clerk_pub
    echo ""
    if [[ -n "$clerk_pub" ]]; then
      echo "$clerk_pub" | gcloud secrets create clerk-publishable-key \
        --data-file=- \
        --project="$PROJECT_ID" \
        --quiet
      success "clerk-publishable-key created"
    else
      warn "Skipped - you can create later"
    fi
  fi
  
  # Clerk Secret Key
  info "Creating clerk-secret-key secret..."
  if gcloud secrets describe clerk-secret-key --project="$PROJECT_ID" &> /dev/null; then
    warn "clerk-secret-key already exists"
  else
    read -sp "Enter Clerk Secret Key (or press Enter to skip): " clerk_secret
    echo ""
    if [[ -n "$clerk_secret" ]]; then
      echo "$clerk_secret" | gcloud secrets create clerk-secret-key \
        --data-file=- \
        --project="$PROJECT_ID" \
        --quiet
      success "clerk-secret-key created"
    else
      warn "Skipped - you can create later"
    fi
  fi
  
  # Clerk Webhook Secret
  info "Creating clerk-webhook-secret secret..."
  if gcloud secrets describe clerk-webhook-secret --project="$PROJECT_ID" &> /dev/null; then
    warn "clerk-webhook-secret already exists"
  else
    read -sp "Enter Clerk Webhook Secret (or press Enter to skip): " clerk_webhook
    echo ""
    if [[ -n "$clerk_webhook" ]]; then
      echo "$clerk_webhook" | gcloud secrets create clerk-webhook-secret \
        --data-file=- \
        --project="$PROJECT_ID" \
        --quiet
      success "clerk-webhook-secret created"
    else
      warn "Skipped - you can create later"
    fi
  fi
  
  # HuggingFace Token
  info "Creating hf-token secret..."
  if gcloud secrets describe hf-token --project="$PROJECT_ID" &> /dev/null; then
    warn "hf-token already exists"
  else
    read -sp "Enter HuggingFace Token (or press Enter to skip): " hf_token
    echo ""
    if [[ -n "$hf_token" ]]; then
      echo "$hf_token" | gcloud secrets create hf-token \
        --data-file=- \
        --project="$PROJECT_ID" \
        --quiet
      success "hf-token created"
    else
      warn "Skipped - you can create later"
    fi
  fi
  
  success "Secrets setup complete"
  echo ""
  info "Note: You can update secrets anytime with:"
  echo "  echo 'your-value' | gcloud secrets versions add SECRET_NAME --data-file=- --project=$PROJECT_ID"
}

create_terraform_state_bucket() {
  step 6 "Creating Terraform State Bucket"
  
  local bucket="${PROJECT_ID}-terraform-state"
  local region="us-central1"
  
  if gsutil ls -b "gs://${bucket}" &> /dev/null; then
    warn "State bucket already exists: gs://${bucket}"
  else
    info "Creating bucket: gs://${bucket}"
    gsutil mb -p "$PROJECT_ID" -l "$region" "gs://${bucket}"
    
    info "Enabling versioning..."
    gsutil versioning set on "gs://${bucket}"
    
    success "State bucket created"
  fi
}

verify_setup() {
  step 7 "Verifying Setup"
  
  info "Checking APIs..."
  if gcloud services list --enabled --project="$PROJECT_ID" | grep -q "run.googleapis.com"; then
    success "Cloud Run API enabled"
  else
    error "Cloud Run API not enabled"
  fi
  
  info "Checking Artifact Registry..."
  if gcloud artifacts repositories describe ai-governance \
    --location=us-central1 \
    --project="$PROJECT_ID" &> /dev/null; then
    success "Artifact Registry repository exists"
  else
    error "Artifact Registry repository not found"
  fi
  
  info "Checking secrets..."
  local required_secrets=(
    "database-url"
    "openai-api-key"
    "clerk-publishable-key"
    "clerk-secret-key"
    "clerk-webhook-secret"
    "hf-token"
  )
  
  local missing_secrets=0
  for secret in "${required_secrets[@]}"; do
    if gcloud secrets describe "$secret" --project="$PROJECT_ID" &> /dev/null; then
      success "Secret exists: $secret"
    else
      warn "Secret missing: $secret"
      missing_secrets=$((missing_secrets + 1))
    fi
  done
  
  if [[ $missing_secrets -gt 0 ]]; then
    warn "$missing_secrets secret(s) missing - create them before deploying"
  fi
  
  info "Checking Terraform state bucket..."
  if gsutil ls -b "gs://${PROJECT_ID}-terraform-state" &> /dev/null; then
    success "Terraform state bucket exists"
  else
    error "Terraform state bucket not found"
  fi
}

print_next_steps() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🎉 Bootstrap Complete!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "Your project is ready for deployment! 🚀"
  echo ""
  echo "Next steps:"
  echo ""
  echo "1. Configure tfvars file:"
  if [[ "$ENVIRONMENT" == "prod" ]]; then
    echo "   Edit: infra/terraform/terraform.tfvars.production"
  elif [[ "$ENVIRONMENT" == "staging" ]]; then
    echo "   Edit: infra/terraform/terraform.tfvars.staging"
  else
    echo "   Edit: infra/terraform/terraform.tfvars"
  fi
  echo "   - Set project_id = \"$PROJECT_ID\""
  echo "   - Set platform_domain = \"your-domain.com\""
  echo ""
  echo "2. Deploy everything:"
  echo "   ./infra/scripts/deploy.sh --project $PROJECT_ID --env $ENVIRONMENT --image-tag latest"
  echo ""
  echo "   This will:"
  echo "   - Build all Docker images"
  echo "   - Create Cloud SQL database"
  echo "   - Create Redis instance"
  echo "   - Deploy all services to Cloud Run"
  echo "   - Set up Load Balancer"
  echo "   - Run database migrations"
  echo ""
  echo "3. After deployment, configure DNS:"
  echo "   - Get load balancer IP:"
  echo "     cd infra/terraform && terraform output load_balancer_ip"
  echo "   - Create A record: your-domain.com → <load-balancer-ip>"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

main() {
  parse_args "$@"
  validate_args
  
  echo ""
  echo "╔════════════════════════════════════════════════════════╗"
  echo "║     AI Governance Platform - New Project Bootstrap    ║"
  echo "╚════════════════════════════════════════════════════════╝"
  echo ""
  echo "Project:     $PROJECT_ID"
  echo "Environment: $ENVIRONMENT"
  echo ""
  
  read -p "Continue with bootstrap? (Y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Nn]$ ]]; then
    echo "Cancelled"
    exit 0
  fi
  
  check_prerequisites
  enable_apis
  setup_artifact_registry
  setup_cloud_build_permissions
  create_secrets
  create_terraform_state_bucket
  verify_setup
  print_next_steps
}

main "$@"

