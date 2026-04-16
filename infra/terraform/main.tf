# AI Governance Platform - GCP Infrastructure
# Simplified, performant setup with managed services

terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.1"
    }
  }

  # Backend configuration is supplied during `terraform init` via -backend-config flags.
  # Example:
  #   terraform init \
  #     -backend-config="bucket=${PROJECT_ID}-terraform-state" \
  #     -backend-config="prefix=terraform/state"
  backend "gcs" {}
}

provider "google" {
  project = var.project_id
  region  = var.region
}

data "google_project" "current" {
  project_id = var.project_id
}

# Enable required APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "redis.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "vpcaccess.googleapis.com",
    "compute.googleapis.com",  # For Cloud Load Balancer
    "storage.googleapis.com",  # For GCS ONNX models bucket
    "sqladmin.googleapis.com", # Required for Cloud SQL (even if external)
  ])

  project = var.project_id
  service = each.value

  disable_dependent_services = false
}

# Artifact Registry for Docker images
resource "google_artifact_registry_repository" "images" {
  location      = var.region
  repository_id = "ai-governance"
  description   = "Docker images for AI Governance platform"
  format        = "DOCKER"

  depends_on = [google_project_service.apis]
}

# VPC Connector for Cloud Run to access Redis
# Optimize: Use minimum instances for faster cold starts
resource "google_vpc_access_connector" "connector" {
  name          = "ai-gov-connector${local.env_suffix}"
  region        = var.region
  network       = "default"
  ip_cidr_range = "10.8.1.0/28"
  min_instances = 2 # Keep warm for faster connections
  max_instances = 3 # Limit scale for cost control

  depends_on = [google_project_service.apis]
}


# Memorystore Redis (Managed Redis for policy cache)
# Optimized: Basic tier for dev/testing (faster provisioning, lower cost)
resource "google_redis_instance" "cache" {
  name           = "ai-governance-redis${local.env_suffix}"
  tier           = var.redis_tier      # BASIC for dev, STANDARD_HA for prod
  memory_size_gb = var.redis_memory_gb # 1GB for dev, 4GB for prod
  region         = var.region
  redis_version  = "REDIS_7_0"

  # Performance settings
  connect_mode = "DIRECT_PEERING"

  depends_on = [google_project_service.apis]
}

# Service Account for Cloud Run services
resource "google_service_account" "app_sa" {
  account_id   = "ai-governance${local.env_suffix}"
  display_name = "AI Governance Service Account"
}

# Note: IAM permissions need to be granted manually by project owner
# Run these commands to grant Cloud Build permissions:
# gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
#   --member="serviceAccount:PROJECT_NUMBER@cloudbuild.gserviceaccount.com" \
#   --role="roles/run.admin" \
#   --condition=None
# gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
#   --member="serviceAccount:PROJECT_NUMBER@cloudbuild.gserviceaccount.com" \
#   --role="roles/iam.serviceAccountUser" \
#   --condition=None

# GCS Bucket for ONNX Models (per environment)
resource "google_storage_bucket" "onnx_models" {
  name          = "${var.project_id}-onnx-models${local.env_suffix}"
  location      = var.region
  force_destroy = false # Prevent accidental deletion

  # Enable versioning for model rollbacks
  versioning {
    enabled = true
  }

  # Lifecycle rules - old versions auto-deleted after 90 days
  lifecycle_rule {
    condition {
      num_newer_versions = 5 # Keep last 5 versions
      age                = 90
    }
    action {
      type = "Delete"
    }
  }

  # Uniform bucket-level access for IAM
  uniform_bucket_level_access = true

  labels = {
    environment = var.environment
    purpose     = "onnx-models"
  }
}

# IAM for app service account to read models
resource "google_storage_bucket_iam_member" "app_sa_onnx_reader" {
  bucket = google_storage_bucket.onnx_models.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.app_sa.email}"
}

# GCS Bucket for General Storage (policies, documents, etc.)
resource "google_storage_bucket" "general_storage" {
  name          = "${var.project_id}_ai-governance"
  location      = var.region
  force_destroy = false # Prevent accidental deletion

  # Enable versioning for document rollbacks
  versioning {
    enabled = true
  }

  # Lifecycle rules - old versions auto-deleted after 90 days
  lifecycle_rule {
    condition {
      num_newer_versions = 5 # Keep last 5 versions
      age                = 90
    }
    action {
      type = "Delete"
    }
  }

  # Uniform bucket-level access for IAM
  uniform_bucket_level_access = true

  labels = {
    environment = var.environment
    purpose     = "general-storage"
  }
}

# IAM for app service account to read/write general storage
resource "google_storage_bucket_iam_member" "app_sa_storage_admin" {
  bucket = google_storage_bucket.general_storage.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.app_sa.email}"
}

# Grant app service account necessary permissions
# NOTE: Secret Manager permissions are handled at secret-level
# Uncomment when you have project owner access

resource "google_project_iam_member" "app_sa_redis" {
  project = var.project_id
  role    = "roles/redis.editor"
  member  = "serviceAccount:${google_service_account.app_sa.email}"
}

resource "google_project_iam_member" "app_sa_secrets" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.app_sa.email}"
}

# Note: Database is provisioned externally. DATABASE_URL is managed manually in Secret Manager.

# ControlNet Gateway (Performance-critical with ONNX)
resource "google_cloud_run_v2_service" "controlnet" {
  name     = "controlnet-gateway${local.env_suffix}"
  location = var.region

  # Only allow ingress from HTTP(S) Load Balancer
  ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    service_account = google_service_account.app_sa.email

    # VPC access for Redis/DB connectivity; external APIs stay on public egress
    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    # Critical for performance: T0/T1/T2 pipeline with ONNX
    scaling {
      min_instance_count = var.controlnet_min_instances
      max_instance_count = var.controlnet_max_instances
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/ai-governance/controlnet:${var.image_tag}"

      ports {
        container_port = 8000
      }

      # Performance requirements: 4+ cores, 8GB+ RAM for ONNX
      resources {
        limits = {
          cpu    = "4"   # ONNX inference needs CPU
          memory = "8Gi" # Model caching + ONNX sessions
        }
        cpu_idle = true # Scale to zero when idle
      }

      # Common environment variables (standardized across all services)
      env {
        name  = "ENVIRONMENT"
        value = var.environment
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "LOG_LEVEL"
        value = var.log_level
      }

      env {
        name  = "REDIS_URL"
        value = "redis://${google_redis_instance.cache.host}:${google_redis_instance.cache.port}"
      }

      # Service-specific environment variables
      env {
        name  = "GS_BUCKET_NAME"
        value = google_storage_bucket.general_storage.name # General storage (policies, documents)
      }

      env {
        name  = "GCS_MODEL_BUCKET"
        value = google_storage_bucket.onnx_models.name # ML models bucket
      }

      env {
        name  = "ENABLE_ONNX_MODELS"
        value = "true"
      }

      env {
        name  = "ENABLE_EMBEDDING_ROUTER"
        value = "true"
      }

      env {
        name  = "PRELOAD_ALL_MODELS"
        value = "false" # Preload models for faster cold starts
      }

      env {
        name  = "ONNX_INFERENCE_TIMEOUT"
        value = "5.0" # Faster timeout for production
      }

      env {
        name  = "MAX_ONNX_MODEL_SIZE_MB"
        value = "1000.0" # Allow larger models in production
      }

      env {
        name  = "MAX_CONCURRENT_REQUESTS"
        value = "100"
      }

      env {
        name  = "GUARD_TIMEOUT"
        value = "0.2" # 0.2ms per guard for T0/T1 targets
      }

      env {
        name  = "CLERK_FRONTEND_API"
        value = var.clerk_frontend_api # Clerk domain for JWT validation
      }

      env {
        name = "HF_TOKEN"
        value_source {
          secret_key_ref {
            secret  = data.google_secret_manager_secret.hf_token.secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "ONNX_SERVICE_URL"
        value = "https://${var.platform_domain}/onnx" # Access via load balancer
      }

      # Secrets from Secret Manager
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = data.google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "OPENAI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = data.google_secret_manager_secret.openai_api_key.secret_id
            version = "latest"
          }
        }
      }

      # Startup probe - more generous timeouts for ONNX/embedding model loading
      # Total time: 30s + (5 checks × 10s period) = 80s startup window
      startup_probe {
        http_get {
          path = "/healthz"
        }
        initial_delay_seconds = 30
        timeout_seconds       = 3
        period_seconds        = 10
        failure_threshold     = 5
      }

      # Liveness probe
      liveness_probe {
        http_get {
          path = "/healthz"
        }
        period_seconds    = 60
        timeout_seconds   = 5
        failure_threshold = 2
      }
    }

    # Performance: Timeout for long-running requests
    timeout = "300s"
  }

  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }

  depends_on = [
    google_project_service.apis,
    google_redis_instance.cache
  ]
}

# ModelGuard Service (Model Security Scanner)
resource "google_cloud_run_v2_service" "modelguard" {
  name     = "model-guard${local.env_suffix}"
  location = var.region

  # Only allow ingress from HTTP(S) Load Balancer
  ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    service_account = google_service_account.app_sa.email

    # VPC access for Redis/DB connectivity; external APIs stay on public egress
    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    # Scaling for model scanning workloads
    scaling {
      min_instance_count = 0 # Scale to zero when idle
      max_instance_count = 10
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/ai-governance/model-guard:${var.image_tag}"

      ports {
        container_port = 8001
      }

      # Resources for model scanning (memory-intensive)
      resources {
        limits = {
          cpu    = "2"
          memory = "4Gi" # Models can be large
        }
        cpu_idle = true
      }

      # Common environment variables (standardized across all services)
      env {
        name  = "ENVIRONMENT"
        value = var.environment
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "LOG_LEVEL"
        value = var.log_level
      }

      env {
        name  = "REDIS_URL"
        value = "redis://${google_redis_instance.cache.host}:${google_redis_instance.cache.port}"
      }

      # Service-specific environment variables
      # Note: PORT is auto-set by Cloud Run, HOST can be set
      env {
        name  = "HOST"
        value = "0.0.0.0"
      }

      env {
        name  = "SCAN_TIMEOUT_SECONDS"
        value = "300"
      }

      env {
        name  = "MAX_CONCURRENT_SCANS"
        value = "5"
      }

      # Secrets from Secret Manager
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = data.google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "CLERK_SECRET_KEY"
        value_source {
          secret_key_ref {
            secret  = data.google_secret_manager_secret.clerk_secret_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "OPENAI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = data.google_secret_manager_secret.openai_api_key.secret_id
            version = "latest"
          }
        }
      }

      # Startup probe - more generous for model scanning startup
      startup_probe {
        http_get {
          path = "/health"
        }
        initial_delay_seconds = 20
        timeout_seconds       = 3
        period_seconds        = 10
        failure_threshold     = 5
      }

      # Liveness probe
      liveness_probe {
        http_get {
          path = "/health"
        }
        period_seconds    = 60
        timeout_seconds   = 5
        failure_threshold = 2
      }
    }

    # Timeout for long-running model scans
    timeout = "600s" # 10 minutes
  }

  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }

  depends_on = [
    google_project_service.apis,
    google_redis_instance.cache
  ]
}

# ONNX Inference Service (High-performance ML inference)
resource "google_cloud_run_v2_service" "onnx" {
  name     = "onnx-inference-service${local.env_suffix}"
  location = var.region

  # Only allow ingress from HTTP(S) Load Balancer
  ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    service_account = google_service_account.app_sa.email

    # VPC access for Redis/DB connectivity; external APIs stay on public egress
    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    # Scaling for inference workloads
    scaling {
      min_instance_count = 1  # Keep warm for fast inference
      max_instance_count = 10 # Scale up under load
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/ai-governance/onnx-inference-service${local.env_suffix}:${var.image_tag}"

      ports {
        container_port = 8002
      }

      # Resources optimized for ONNX inference
      resources {
        limits = {
          cpu    = "8"   # High CPU for fast inference
          memory = "8Gi" # Model caching + loading (needs more during startup)
        }
        cpu_idle = false # Always allocated for warm instances
      }

      # Common environment variables (standardized across all services)
      env {
        name  = "ENVIRONMENT"
        value = var.environment
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "LOG_LEVEL"
        value = var.log_level
      }

      env {
        name  = "REDIS_URL"
        value = "redis://${google_redis_instance.cache.host}:${google_redis_instance.cache.port}"
      }

      # Service-specific environment variables
      env {
        name  = "GCS_MODEL_BUCKET"
        value = google_storage_bucket.onnx_models.name
      }

      env {
        name  = "ONNX_MODEL_CACHE_PATH"
        value = "/app/model_cache"
      }

      env {
        name  = "ONNX_INTRA_OP_NUM_THREADS"
        value = var.onnx_intra_op_num_threads
      }

      env {
        name  = "ONNX_INTER_OP_NUM_THREADS"
        value = var.onnx_inter_op_num_threads
      }

      env {
        name  = "ONNX_EXECUTION_MODE"
        value = var.onnx_execution_mode
      }

      env {
        name = "HF_TOKEN"
        value_source {
          secret_key_ref {
            secret  = data.google_secret_manager_secret.hf_token.secret_id
            version = "latest"
          }
        }
      }

      # Secrets from Secret Manager
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = data.google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }

      # Startup probe - generous timeout for model preloading
      startup_probe {
        http_get {
          path = "/health"
          port = 8002 # ONNX service port
        }
        initial_delay_seconds = 60 # Models load on startup
        timeout_seconds       = 5
        period_seconds        = 10
        failure_threshold     = 10 # Allow up to 100s for startup
      }

      # Liveness probe
      liveness_probe {
        http_get {
          path = "/health"
          port = 8002 # ONNX service port
        }
        period_seconds    = 60
        timeout_seconds   = 5
        failure_threshold = 2
      }
    }

    # Timeout for inference requests
    timeout = "60s"
  }

  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }

  depends_on = [
    google_project_service.apis,
    google_redis_instance.cache,
    google_storage_bucket.onnx_models,
    google_storage_bucket.general_storage
  ]
}

# Web App (Next.js)
resource "google_cloud_run_v2_service" "web" {
  name     = "web-app${local.env_suffix}"
  location = var.region

  # Public ingress - needed for browser access and Clerk authentication flows
  ingress = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.app_sa.email

    # VPC access for Redis/DB connectivity; external APIs stay on public egress
    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    scaling {
      min_instance_count = var.web_min_instances
      max_instance_count = var.web_max_instances
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/ai-governance/web:${var.image_tag}"

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "2"
          memory = "2Gi"
        }
        cpu_idle = true
      }

      # Common environment variables (standardized across all services)
      env {
        name  = "ENVIRONMENT"
        value = var.environment
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "LOG_LEVEL"
        value = var.log_level
      }

      env {
        name  = "REDIS_URL"
        value = "redis://${google_redis_instance.cache.host}:${google_redis_instance.cache.port}"
      }

      # Service-specific environment variables
      env {
        name  = "NODE_ENV"
        value = "production"
      }

      # Point browser to Load Balancer for API calls
      # Load Balancer handles routing to internal services
      env {
        name  = "NEXT_PUBLIC_API_URL"
        value = "https://${var.platform_domain}"
      }

      # Backend URL for Next.js rewrites (points to Load Balancer)
      env {
        name  = "NEXT_PUBLIC_BACKEND_URL"
        value = "https://${var.platform_domain}"
      }

      # Internal ControlNet URL for server-side calls
      env {
        name  = "CONTROLNET_INTERNAL_URL"
        value = google_cloud_run_v2_service.controlnet.uri
      }

      # Secrets
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = data.google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
        value_source {
          secret_key_ref {
            secret  = data.google_secret_manager_secret.clerk_publishable_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "CLERK_SECRET_KEY"
        value_source {
          secret_key_ref {
            secret  = data.google_secret_manager_secret.clerk_secret_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "CLERK_WEBHOOK_SECRET"
        value_source {
          secret_key_ref {
            secret  = data.google_secret_manager_secret.clerk_webhook_secret.secret_id
            version = "latest"
          }
        }
      }
    }
  }

  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }

  depends_on = [google_project_service.apis]
}

locals {
  lb_invoker_member = "serviceAccount:${data.google_project.current.number}-compute@developer.gserviceaccount.com"
  app_sa_member     = "serviceAccount:${google_service_account.app_sa.email}"
}

# Grant Load Balancer access to invoke Cloud Run services
# Load Balancer makes unauthenticated requests, so services need allUsers access
# Security is provided by INTERNAL_LOAD_BALANCER ingress (not accessible directly from internet)
resource "google_cloud_run_v2_service_iam_member" "controlnet_lb_invoker" {
  project  = var.project_id
  location = google_cloud_run_v2_service.controlnet.location
  name     = google_cloud_run_v2_service.controlnet.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "modelguard_lb_invoker" {
  project  = var.project_id
  location = google_cloud_run_v2_service.modelguard.location
  name     = google_cloud_run_v2_service.modelguard.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ONNX is behind Load Balancer - allow unauthenticated access from LB
resource "google_cloud_run_v2_service_iam_member" "onnx_lb_invoker" {
  project  = var.project_id
  location = google_cloud_run_v2_service.onnx.location
  name     = google_cloud_run_v2_service.onnx.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Web is public - allow unauthenticated access for browser + Clerk flows
resource "google_cloud_run_v2_service_iam_member" "web_public_invoker" {
  project  = var.project_id
  location = google_cloud_run_v2_service.web.location
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ONNX service is internal-only - app service account can invoke it
resource "google_cloud_run_v2_service_iam_member" "onnx_internal_invoker" {
  project  = var.project_id
  location = google_cloud_run_v2_service.onnx.location
  name     = google_cloud_run_v2_service.onnx.name
  role     = "roles/run.invoker"
  member   = local.app_sa_member
}

# Outputs
output "controlnet_url" {
  value       = google_cloud_run_v2_service.controlnet.uri
  description = "ControlNet Gateway Direct URL (for debugging)"
}

output "web_url" {
  value       = google_cloud_run_v2_service.web.uri
  description = "Web App Direct URL (for debugging)"
}

output "modelguard_url" {
  value       = google_cloud_run_v2_service.modelguard.uri
  description = "ModelGuard Direct URL (for debugging)"
}

output "redis_host" {
  value       = google_redis_instance.cache.host
  description = "Redis host for caching"
  sensitive   = true
}

output "redis_port" {
  value       = google_redis_instance.cache.port
  description = "Redis port"
}

output "artifact_registry" {
  value       = google_artifact_registry_repository.images.id
  description = "Artifact Registry repository"
}

output "onnx_models_bucket" {
  value       = google_storage_bucket.onnx_models.name
  description = "GCS bucket for ONNX models"
}

output "onnx_models_bucket_url" {
  value       = "gs://${google_storage_bucket.onnx_models.name}"
  description = "GCS URL for ONNX models bucket"
}

output "general_storage_bucket" {
  value       = google_storage_bucket.general_storage.name
  description = "GCS bucket for general storage (policies, documents)"
}

output "general_storage_bucket_url" {
  value       = "gs://${google_storage_bucket.general_storage.name}"
  description = "GCS URL for general storage bucket"
}

output "onnx_service_url" {
  value       = google_cloud_run_v2_service.onnx.uri
  description = "ONNX Inference Service URL (internal only)"
}
