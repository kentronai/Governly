.PHONY: help init plan apply destroy deploy test clean

# Colors
GREEN  := $(shell tput -Txterm setaf 2)
YELLOW := $(shell tput -Txterm setaf 3)
RED    := $(shell tput -Txterm setaf 1)
RESET  := $(shell tput -Txterm sgr0)

help: ## Show this help
	@echo '${GREEN}AI Governance Infrastructure${RESET}'
	@echo ''
	@echo 'Usage:'
	@echo '  ${YELLOW}make${RESET} ${GREEN}<target>${RESET}'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  ${GREEN}%-15s${RESET} %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# Terraform targets
init: ## Initialize Terraform
	@echo "${GREEN}Initializing Terraform...${RESET}"
	cd terraform && terraform init

plan: ## Show Terraform plan
	@echo "${GREEN}Planning infrastructure changes...${RESET}"
	cd terraform && terraform plan

apply: ## Apply Terraform changes
	@echo "${YELLOW}Applying infrastructure changes...${RESET}"
	cd terraform && terraform apply

destroy: ## Destroy infrastructure
	@echo "${RED}WARNING: This will destroy all infrastructure!${RESET}"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		cd terraform && terraform destroy; \
	fi

fmt: ## Format Terraform files
	@echo "${GREEN}Formatting Terraform files...${RESET}"
	cd terraform && terraform fmt -recursive

validate: ## Validate Terraform configuration
	@echo "${GREEN}Validating Terraform configuration...${RESET}"
	cd terraform && terraform validate

output: ## Show Terraform outputs
	@echo "${GREEN}Terraform outputs:${RESET}"
	cd terraform && terraform output

# GCP setup targets
gcp-login: ## Login to GCP
	@echo "${GREEN}Logging in to GCP...${RESET}"
	gcloud auth login
	gcloud auth application-default login

gcp-set-project: ## Set GCP project
	@read -p "Enter GCP project ID: " project_id; \
	gcloud config set project $$project_id

gcp-create-state-bucket: ## Create Terraform state bucket
	@read -p "Enter GCP project ID: " project_id; \
	gsutil mb -p $$project_id -l us-central1 gs://$$project_id-terraform-state

gcp-setup-secrets: ## Setup secrets in Secret Manager
	@echo "${GREEN}Setting up secrets...${RESET}"
	@echo "You need to run these commands manually with your actual secrets:"
	@echo ""
	@echo "Note: Standard names (no environment suffix) - project-level isolation"
	@echo ""
	@echo "gcloud secrets create database-url --data-file=- <<< 'postgresql+asyncpg://...'"
	@echo "gcloud secrets create openai-api-key --data-file=- <<< 'sk-...'"
	@echo "gcloud secrets create clerk-publishable-key --data-file=- <<< 'pk_...'"
	@echo "gcloud secrets create clerk-secret-key --data-file=- <<< 'sk_...'"
	@echo "gcloud secrets create clerk-webhook-secret --data-file=- <<< 'whsec_...'"

# Deployment targets
deploy: ## Build and deploy all services
	@echo "${GREEN}Building and deploying all services...${RESET}"
	cd .. && gcloud builds submit --config=infra/cloudbuild.yaml

deploy-controlnet: ## Deploy only ControlNet Gateway
	@echo "${GREEN}Deploying ControlNet Gateway...${RESET}"
	cd .. && gcloud builds submit --config=infra/cloudbuild.yaml \
		--substitutions=_STEP_FILTER="build-controlnet,push-controlnet,deploy-controlnet"

deploy-web: ## Deploy only Web App
	@echo "${GREEN}Deploying Web App...${RESET}"
	cd .. && gcloud builds submit --config=infra/cloudbuild.yaml \
		--substitutions=_STEP_FILTER="build-web,push-web,deploy-web"

# Testing targets
test: ## Test deployed services
	@echo "${GREEN}Testing deployed services...${RESET}"
	@CONTROLNET_URL=$$(cd terraform && terraform output -raw controlnet_url 2>/dev/null); \
	if [ -n "$$CONTROLNET_URL" ]; then \
		echo "Testing ControlNet Gateway: $$CONTROLNET_URL"; \
		curl -f "$$CONTROLNET_URL/healthz" && echo " ✓ Healthy" || echo " ✗ Failed"; \
	else \
		echo "${RED}ControlNet URL not found. Run 'make apply' first.${RESET}"; \
	fi
	@WEB_URL=$$(cd terraform && terraform output -raw web_url 2>/dev/null); \
	if [ -n "$$WEB_URL" ]; then \
		echo "Testing Web App: $$WEB_URL"; \
		curl -f "$$WEB_URL" && echo " ✓ Healthy" || echo " ✗ Failed"; \
	else \
		echo "${RED}Web URL not found. Run 'make apply' first.${RESET}"; \
	fi

logs-controlnet: ## View ControlNet logs
	@SERVICE_NAME=$$(cd terraform && terraform output -raw controlnet_url 2>/dev/null | sed 's|https://||' | cut -d'.' -f1); \
	if [ -n "$$SERVICE_NAME" ]; then \
		gcloud run services logs read $$SERVICE_NAME --region=us-central1 --limit=50; \
	else \
		echo "${RED}ControlNet service not found.${RESET}"; \
	fi

logs-web: ## View Web App logs
	@SERVICE_NAME=$$(cd terraform && terraform output -raw web_url 2>/dev/null | sed 's|https://||' | cut -d'.' -f1); \
	if [ -n "$$SERVICE_NAME" ]; then \
		gcloud run services logs read $$SERVICE_NAME --region=us-central1 --limit=50; \
	else \
		echo "${RED}Web service not found.${RESET}"; \
	fi

# Cleanup targets
clean: ## Clean local Terraform files
	@echo "${GREEN}Cleaning Terraform files...${RESET}"
	cd terraform && rm -rf .terraform .terraform.lock.hcl terraform.tfstate terraform.tfstate.backup

# Local development
local-up: ## Start local Docker Compose
	@echo "${GREEN}Starting local environment...${RESET}"
	cd .. && docker-compose up -d

local-down: ## Stop local Docker Compose
	@echo "${GREEN}Stopping local environment...${RESET}"
	cd .. && docker-compose down

local-logs: ## View local logs
	cd .. && docker-compose logs -f

# Quick start workflow
quickstart: gcp-login gcp-set-project gcp-create-state-bucket init plan ## Quick start setup
	@echo "${GREEN}Setup complete! Review the plan above.${RESET}"
	@echo "Next steps:"
	@echo "  1. Setup secrets: ${YELLOW}make gcp-setup-secrets${RESET}"
	@echo "  2. Apply infrastructure: ${YELLOW}make apply${RESET}"
	@echo "  3. Deploy services: ${YELLOW}make deploy${RESET}"
