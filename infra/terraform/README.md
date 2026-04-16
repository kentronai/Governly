# Terraform Configuration Files

This directory contains Terraform configuration for deploying the AI Governance platform to GCP.

## Configuration Files

| File | Purpose |
|------|---------|
| `terraform.tfvars` | Development defaults (low cost) |
| `terraform.tfvars.staging` | Staging defaults (production-like) |
| `terraform.tfvars.production` | Production defaults (HA + scale) |
| `terraform.tfvars.example` | Exhaustive reference of all variables |

## Usage

All environments now share the same Terraform source. Backend configuration (state bucket + prefix) is supplied when you run `terraform init`.

### Quick Start
```bash
cd infra/terraform

# Choose environment specific tfvars
TF_ENV=terraform.tfvars                # or terraform.tfvars.staging / .production

# Configure backend dynamically (bucket must exist once per project)
PROJECT_ID=your-project-id
STATE_BUCKET=${PROJECT_ID}-terraform-state

terraform init -reconfigure \
  -backend-config="bucket=${STATE_BUCKET}" \
  -backend-config="prefix=terraform/state"

terraform plan  -var-file=${TF_ENV}
terraform apply -var-file=${TF_ENV}
```

Ensure the `hf-token` secret exists in Secret Manager; Terraform mounts it into the services automatically.

### Helper Script
`./setup.sh <project-id> <environment>` automates:
1. Validating the requested tfvars file (`terraform.tfvars`, `.staging`, `.production`)
2. Creating the remote state bucket if it does not exist
3. Running `terraform init` with the correct backend parameters

## Key Configuration Differences

| Setting | Demo/Dev | Staging | Production |
|---------|----------|---------|------------|
| **Redis Tier** | BASIC | BASIC | STANDARD_HA |
| **Redis Memory** | 1GB | 2GB | 4GB |
| **ControlNet Min** | 1 | 1 | 2 |
| **ControlNet Max** | 10 | 12 | 20 |
| **Web Min** | 0 | 1 | 1 |
| **Log Level** | INFO | DEBUG | INFO |

## Environment Isolation

Each environment should use:
1. **Separate GCP Project** - Ensures complete resource isolation
2. **Separate Terraform State Bucket** - `${PROJECT_ID}-terraform-state`
3. **Separate Secret Manager Secrets** - Created per project
4. **Environment-specific tfvars** - Pass via `-var-file`

## Creating Secrets for New Environment

When deploying to a new environment:

```bash
# Set your project
gcloud config set project YOUR-PROJECT-ID

# Create required secrets
gcloud secrets create database-url --project=YOUR-PROJECT-ID
gcloud secrets create openai-api-key --project=YOUR-PROJECT-ID
gcloud secrets create clerk-publishable-key --project=YOUR-PROJECT-ID
gcloud secrets create clerk-secret-key --project=YOUR-PROJECT-ID
gcloud secrets create clerk-webhook-secret --project=YOUR-PROJECT-ID
gcloud secrets create hf-token --project=YOUR-PROJECT-ID

# Add values
echo 'YOUR-VALUE' | gcloud secrets versions add SECRET-NAME --data-file=- --project=YOUR-PROJECT-ID

# IMPORTANT: Database is provisioned externally (not managed by Terraform)
# Set DATABASE_URL manually:
echo 'postgresql://user:password@host:port/database' | gcloud secrets versions add database-url --data-file=- --project=YOUR-PROJECT-ID
```

## Backend State Management

The Terraform state is stored in GCS. For each environment:

1. Create state bucket:
   ```bash
   gsutil mb -p YOUR-PROJECT-ID -l us-central1 gs://YOUR-PROJECT-ID-terraform-state
   gsutil versioning set on gs://YOUR-PROJECT-ID-terraform-state
   ```

2. Initialize:
   ```bash
   terraform init -reconfigure \
     -backend-config="bucket=YOUR-PROJECT-ID-terraform-state" \
     -backend-config="prefix=terraform/state"
   ```

## Variable Precedence

Terraform loads variables in this order (later overrides earlier):
1. `variables.tf` - Default values (none set for required vars)
2. `terraform.tfvars` - Main config file
3. Environment variables (`TF_VAR_name`)
4. `-var` command line flags

For CI/CD, you can override via command line:
```bash
terraform apply \
  -var="project_id=my-project" \
  -var="environment=production"
```

