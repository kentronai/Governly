#!/bin/bash

# Guardrails Gateway Deployment Script
set -e

# Configuration
PROJECT_ID=${PROJECT_ID:-"your-gcp-project-id"}
REGION=${REGION:-"us-central1"}
ENVIRONMENT=${ENVIRONMENT:-"prod"}
IMAGE_TAG=${IMAGE_TAG:-"latest"}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

echo_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    echo_info "Checking prerequisites..."
    
    # Check if gcloud is installed
    if ! command -v gcloud &> /dev/null; then
        echo_error "gcloud CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check if docker is installed
    if ! command -v docker &> /dev/null; then
        echo_error "Docker is not installed. Please install it first."
        exit 1
    fi
    
    # Check if terraform is installed
    if ! command -v terraform &> /dev/null; then
        echo_error "Terraform is not installed. Please install it first."
        exit 1
    fi
    
    echo_info "Prerequisites check passed"
}

# Build and push Docker image
build_and_push_image() {
    echo_info "Building Docker image..."
    
    # Build image
    docker build -t gcr.io/${PROJECT_ID}/guardrails-gateway:${IMAGE_TAG} \
        -f infra/docker/Dockerfile .
    
    # Push to GCR
    echo_info "Pushing image to Google Container Registry..."
    docker push gcr.io/${PROJECT_ID}/guardrails-gateway:${IMAGE_TAG}
    
    echo_info "Image pushed successfully"
}

# Deploy infrastructure
deploy_infrastructure() {
    echo_info "Deploying infrastructure with Terraform..."
    
    cd infra/gcp
    
    # Initialize Terraform
    terraform init
    
    # Plan deployment
    terraform plan -var="project_id=${PROJECT_ID}" \
                   -var="region=${REGION}" \
                   -var="environment=${ENVIRONMENT}"
    
    # Apply deployment
    terraform apply -auto-approve \
                    -var="project_id=${PROJECT_ID}" \
                    -var="region=${REGION}" \
                    -var="environment=${ENvironment}"
    
    cd ../..
    
    echo_info "Infrastructure deployed successfully"
}

# Set up secrets
setup_secrets() {
    echo_info "Setting up secrets..."
    
    # Check if secrets exist
    if gcloud secrets describe openai-api-key-${ENVIRONMENT} --project=${PROJECT_ID} &> /dev/null; then
        echo_warn "OpenAI API key secret already exists"
    else
        echo "Please enter your OpenAI API key:"
        read -s OPENAI_API_KEY
        echo ${OPENAI_API_KEY} | gcloud secrets create openai-api-key-${ENVIRONMENT} \
            --data-file=- \
            --project=${PROJECT_ID}
        echo_info "OpenAI API key secret created"
    fi
    
    if gcloud secrets describe anthropic-api-key-${ENVIRONMENT} --project=${PROJECT_ID} &> /dev/null; then
        echo_warn "Anthropic API key secret already exists"
    else
        echo "Please enter your Anthropic API key (optional, press Enter to skip):"
        read -s ANTHROPIC_API_KEY
        if [ -n "${ANTHROPIC_API_KEY}" ]; then
            echo ${ANTHROPIC_API_KEY} | gcloud secrets create anthropic-api-key-${ENVIRONMENT} \
                --data-file=- \
                --project=${PROJECT_ID}
            echo_info "Anthropic API key secret created"
        fi
    fi
}

# Deploy application
deploy_application() {
    echo_info "Deploying application to Cloud Run..."
    
    # Get the service URL from Terraform output
    SERVICE_URL=$(cd infra/gcp && terraform output -raw gateway_url)
    
    echo_info "Gateway will be available at: ${SERVICE_URL}"
    
    # Wait for deployment to complete
    echo_info "Waiting for deployment to complete..."
    sleep 30
    
    # Test health endpoint
    echo_info "Testing health endpoint..."
    if curl -f "${SERVICE_URL}/health"; then
        echo_info "Health check passed"
    else
        echo_error "Health check failed"
        exit 1
    fi
}

# Main deployment function
main() {
    echo_info "Starting Guardrails Gateway deployment..."
    echo_info "Project: ${PROJECT_ID}"
    echo_info "Region: ${REGION}"
    echo_info "Environment: ${ENVIRONMENT}"
    echo_info "Image tag: ${IMAGE_TAG}"
    
    check_prerequisites
    build_and_push_image
    deploy_infrastructure
    setup_secrets
    deploy_application
    
    echo_info "Deployment completed successfully!"
    echo_info "Gateway URL: $(cd infra/gcp && terraform output -raw gateway_url)"
}

# Run main function
main "$@"
