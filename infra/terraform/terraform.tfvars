# AI Governance Platform - Terraform Variables (Development)
# Development environment settings optimized for low cost

project_id      = "kn-dev-01" # Override via -var or TF_VAR_project_id
region          = "us-central1"
environment     = "dev" # dev, staging, or prod
platform_domain = "demo.kentron.ai"
image_tag       = "latest"
log_level       = "INFO"

# Performance tuning
controlnet_min_instances = 1 # Keep warm for < 100ms p95 latency
controlnet_max_instances = 10
web_min_instances        = 0 # Can scale to zero
web_max_instances        = 5

# Redis configuration - BASIC tier for dev
redis_tier      = "BASIC"
redis_memory_gb = 1

# ONNX Configuration
onnx_intra_op_num_threads = 1
onnx_inter_op_num_threads = 1
onnx_execution_mode       = "SEQUENTIAL"
# Clerk Configuration (dev uses default Clerk development instance)
clerk_frontend_api = "top-shark-67.clerk.accounts.dev"

# hf_token is managed via Secret Manager (secret id: hf-token)

# Database configuration
# Database is provisioned externally (not managed by Terraform)
# DATABASE_URL is stored in Secret Manager and managed manually


