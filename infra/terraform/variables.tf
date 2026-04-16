# Variables for AI Governance Platform

variable "project_id" {
  description = "GCP Project ID - provides environment isolation"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment label (for tagging/monitoring)"
  type        = string
}

# Local variable for environment suffix
# Production uses no suffix (cleaner names), dev/staging use suffixes
locals {
  env_suffix            = var.environment == "prod" ? "" : "-${var.environment}"
  redis_name_suffix     = var.environment == "prod" ? "" : "-${var.environment}"
  vpc_connector_suffix  = var.environment == "prod" ? "" : "-${var.environment}"
  storage_bucket_suffix = var.environment == "prod" ? "" : "-${var.environment}"
}

variable "platform_domain" {
  description = "Public domain served by the HTTP(S) load balancer"
  type        = string
}

variable "image_tag" {
  description = "Docker image tag to deploy"
  type        = string
  default     = "latest"
}

variable "log_level" {
  description = "Application log level"
  type        = string
  default     = "INFO"
}

# ControlNet Gateway Scaling
# Performance-critical: handles T0/T1/T2 pipeline
variable "controlnet_min_instances" {
  description = "Minimum instances for ControlNet Gateway"
  type        = number
  default     = 1 # Always keep warm for < 100ms p95
}

variable "controlnet_max_instances" {
  description = "Maximum instances for ControlNet Gateway"
  type        = number
  default     = 10
}

# Web App Scaling
variable "web_min_instances" {
  description = "Minimum instances for Web App"
  type        = number
  default     = 0 # Can scale to zero
}

variable "web_max_instances" {
  description = "Maximum instances for Web App"
  type        = number
  default     = 5
}

# Clerk Configuration
variable "clerk_frontend_api" {
  description = "Clerk frontend API domain for JWT validation"
  type        = string
  default     = "top-shark-67.clerk.accounts.dev" # Default for dev
}

# Redis Configuration
# BASIC tier for dev (faster provisioning, cheaper), STANDARD_HA for prod
variable "redis_tier" {
  description = "Redis tier (BASIC or STANDARD_HA)"
  type        = string
  default     = "BASIC"
}

variable "redis_memory_gb" {
  description = "Redis memory in GB"
  type        = number
  default     = 1
}

# ==============================================================================
# ONNX CONFIGURATION
# ==============================================================================

variable "onnx_intra_op_num_threads" {
  description = "ONNX intra-op threads (default: 1 for max throughput)"
  type        = number
  default     = 1
}

variable "onnx_inter_op_num_threads" {
  description = "ONNX inter-op threads (default: 1 for max throughput)"
  type        = number
  default     = 1
}

variable "onnx_execution_mode" {
  description = "ONNX execution mode: SEQUENTIAL or PARALLEL"
  type        = string
  default     = "SEQUENTIAL"
}

# ==============================================================================
# DATABASE CONFIGURATION
# ==============================================================================
# Database is provisioned externally (not managed by Terraform)
# DATABASE_URL is stored in Secret Manager and managed manually

