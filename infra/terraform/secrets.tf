# Secret Manager - Use existing secrets
# Note: Project-level isolation means each GCP project has its own secrets with standard names

# Database URL
data "google_secret_manager_secret" "database_url" {
  secret_id = "database-url"
}

# OpenAI API Key  
data "google_secret_manager_secret" "openai_api_key" {
  secret_id = "openai-api-key"
}

# Clerk Publishable Key
data "google_secret_manager_secret" "clerk_publishable_key" {
  secret_id = "clerk-publishable-key"
}

# Clerk Secret Key
data "google_secret_manager_secret" "clerk_secret_key" {
  secret_id = "clerk-secret-key"
}

# Clerk Webhook Secret
data "google_secret_manager_secret" "clerk_webhook_secret" {
  secret_id = "clerk-webhook-secret"
}

# Hugging Face Token
data "google_secret_manager_secret" "hf_token" {
  secret_id = "hf-token"
}

# Note: You need to manually add secret versions:
# gcloud secrets create database-url --data-file=- <<< "postgresql+asyncpg://..."
# gcloud secrets create openai-api-key --data-file=- <<< "sk-..."
# gcloud secrets create clerk-publishable-key --data-file=- <<< "pk_..."
# gcloud secrets create clerk-secret-key --data-file=- <<< "sk_..."
# gcloud secrets create clerk-webhook-secret --data-file=- <<< "whsec_..."
# gcloud secrets create hf-token --data-file=- <<< "hf_xxx..."

