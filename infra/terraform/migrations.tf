# Cloud Run Job for Database Migrations - DISABLED
# Migrations are now run externally from local machine or CI/CD
# 
# To run migrations locally:
#   cd apps/web
#   npm run db:migrate
#
# Uncomment the resource below if you want to enable automated migrations via Cloud Run

/*
resource "google_cloud_run_v2_job" "migrations" {
  name     = "run-migrations${local.env_suffix}"
  location = var.region

  template {
    template {
      service_account = google_service_account.app_sa.email

      # VPC access for private Cloud SQL connection
      vpc_access {
        connector = google_vpc_access_connector.connector.id
        egress    = "PRIVATE_RANGES_ONLY"
      }

      containers {
        # Use the same web image (has all dependencies and drizzle-kit)
        image = "${var.region}-docker.pkg.dev/${var.project_id}/ai-governance/web:${var.image_tag}"

        # Override command to run migrations instead of starting server
        command = ["sh", "-c"]
        args = [
          <<-EOT
            set -e
            cd /app
            echo "🔄 Running database migrations..."
            echo "📋 Migration files: $(ls drizzle/*.sql 2>/dev/null | wc -l | tr -d ' ') SQL files found"
            echo "🚀 Applying migrations one at a time..."
            node scripts/migrate-staged.mjs
            echo "✅ Migrations completed successfully!"
          EOT
        ]

        resources {
          limits = {
            cpu    = "1"
            memory = "2Gi"
          }
        }

        # Environment variables
        env {
          name  = "NODE_ENV"
          value = "production"
        }

        # Get DATABASE_URL from Secret Manager
        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = data.google_secret_manager_secret.database_url.secret_id
              version = "latest"
            }
          }
        }
      }

      # Timeout for migrations (10 minutes should be enough)
      timeout = "600s"

      # Retry policy
      max_retries = 1
    }

    # Run one task at a time
    parallelism = 1
    task_count  = 1
  }

  depends_on = [
    google_vpc_access_connector.connector,
    google_cloud_run_v2_service.web
  ]
}
*/

# Output commented out since migration job is disabled
/*
# Output the job name for easy execution
output "migration_job_name" {
  value       = google_cloud_run_v2_job.migrations.name
  description = "Cloud Run Job name for running migrations. Execute with: gcloud run jobs execute <name> --region=<region> --project=<project>"
}
*/

