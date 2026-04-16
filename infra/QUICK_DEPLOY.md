# Quick Deployment Guide

## One Command Deploys Everything

```bash
./infra/scripts/deploy.sh --project kn-dev-01 --env dev
```

This single command:
1. ✅ Sets up Terraform state bucket
2. ✅ Builds all Docker images (Cloud Build)
3. ✅ Deploys all infrastructure (Terraform)
4. ✅ Deploys all services (Cloud Run)

## Step-by-Step (If You Need More Control)

### Option 1: Deploy Infrastructure Only (Terraform)

```bash
cd infra/terraform

# Initialize with your project
terraform init \
  -backend-config="bucket=kn-dev-01-terraform-state" \
  -backend-config="prefix=terraform/state"

# Plan changes
terraform plan -var-file=terraform.tfvars

# Apply infrastructure
terraform apply -var-file=terraform.tfvars
```

### Option 2: Build Images Only (Cloud Build)

```bash
gcloud builds submit \
  --config=infra/cloudbuild.yaml \
  --project=kn-dev-01 \
  --substitutions=_REGION=us-central1,_ENVIRONMENT=dev,_PLATFORM_DOMAIN=demo.kentron.ai,_IMAGE_TAG=latest
```

### Option 3: Full Deployment (Recommended)

```bash
# This does everything - infrastructure + builds + deployment
./infra/scripts/deploy.sh --project kn-dev-01 --env dev
```

## Prerequisites

1. **GCP CLI authenticated:**
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```

2. **Required secrets exist:**
   ```bash
   gcloud secrets list --project=kn-dev-01
   ```
   
   Required:
   - `database-url`
   - `openai-api-key`
   - `clerk-publishable-key`
   - `clerk-secret-key`
   - `clerk-webhook-secret`
   - `hf-token` (create if missing)

3. **Create missing hf-token secret:**
   ```bash
   gcloud secrets create hf-token \
     --project=kn-dev-01 \
     --data-file=- <<< "your_hf_token_here"
   ```

## Troubleshooting

### Error: "BUCKET is not a valid built-in substitution"
✅ **Fixed!** The issue was in `cloudbuild.yaml` - it's now resolved.

### Error: "Secret not found"
Create the missing secret:
```bash
gcloud secrets create <secret-name> \
  --project=kn-dev-01 \
  --data-file=- <<< "your-value"
```

### Error: "State bucket not found"
The script creates it automatically, but if it fails:
```bash
gsutil mb -p kn-dev-01 -l us-central1 gs://kn-dev-01-terraform-state
gsutil versioning set on gs://kn-dev-01-terraform-state
```

## What Gets Deployed

### Infrastructure (Terraform)
- Cloud SQL (PostgreSQL database)
- Memorystore (Redis cache)
- VPC Connector (for private networking)
- Cloud Load Balancer (unified entry point)
- Artifact Registry (Docker images)
- GCS buckets (ONNX models storage)

### Services (Cloud Run)
- ControlNet Gateway (port 8000)
- ModelGuard (port 8001)
- ONNX Inference Service (port 8002)
- Web App (port 8080)

### All Connected Via
- Load Balancer routes traffic
- VPC Connector for Redis/DB access
- Secret Manager for credentials

## After Deployment

Check outputs:
```bash
cd infra/terraform
terraform output
```

You'll see:
- Load balancer URL
- Cloud Run service URLs
- Database connection info
- Redis connection info

## Summary

**Just run:**
```bash
./infra/scripts/deploy.sh --project kn-dev-01 --env dev
```

That's it! 🚀

