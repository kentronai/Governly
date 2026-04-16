# Deployment Guide - Simplified Script Structure

## ✅ Use This Script (Always)

```bash
./infra/scripts/deploy.sh --project <project-id> --env <dev|staging|prod>
```

**This is the only script you need for deployments.**

## Quick Reference

### For Your Current Setup (kn-dev-01)

```bash
# Deploy everything to dev
./infra/scripts/deploy.sh --project kn-dev-01 --env dev

# Or if gcloud project is already set
./infra/scripts/deploy.sh --env dev
```

### What It Does

1. ✅ **Infrastructure** - Creates/updates all GCP resources:
   - Cloud SQL (PostgreSQL)
   - Memorystore (Redis)
   - VPC Connector
   - Cloud Load Balancer
   - Cloud Run services (ControlNet, ModelGuard, ONNX, Web)
   - Artifact Registry
   - GCS buckets

2. ✅ **Docker Images** - Builds and pushes via Cloud Build:
   - ControlNet Gateway
   - ModelGuard
   - ONNX Service
   - Web App

3. ✅ **Deployment** - Deploys all services with correct configuration

4. ✅ **Outputs** - Prints URLs, IPs, and connection info

## Script Structure (Refactored)

### Primary Scripts
- **`deploy.sh`** ⭐ - Main entry point (use this!)
- **`deploy-to-gcp.sh`** - Implementation (deploy.sh calls this)

### Utility Scripts (Keep These)
- `setup-bitbucket-cicd.sh` - CI/CD setup
- `enable-fast-builds.sh` - Docker BuildKit setup
- `switch-traffic.sh` - Cloud Run traffic management
- `verify-before-checkin.sh` - Pre-commit checks
- `sync-env.py` - Environment sync tool

### Deprecated Scripts

**All deprecated scripts have been removed.** Use `deploy.sh` for all deployments.

## Before First Deployment

### 1. Create Missing Secrets

Check if `hf-token` exists:
```bash
gcloud secrets describe hf-token --project=kn-dev-01
```

If missing, create it:
```bash
# Get token from your .env or wherever you store it
HF_TOKEN="your_actual_token_here"
gcloud secrets create hf-token \
  --project=kn-dev-01 \
  --data-file=- <<< "${HF_TOKEN}"
```

### 2. Verify Other Secrets Exist

```bash
gcloud secrets list --project=kn-dev-01 --format="value(name)" | grep -E "(database-url|openai-api-key|clerk|hf-token)"
```

Required secrets:
- ✅ `database-url`
- ✅ `openai-api-key`
- ✅ `clerk-publishable-key`
- ✅ `clerk-secret-key`
- ✅ `clerk-webhook-secret`
- ⚠️  `hf-token` (may need to create)

## Common Commands

```bash
# Deploy to dev
./infra/scripts/deploy.sh --project kn-dev-01 --env dev

# Deploy to staging
./infra/scripts/deploy.sh --project my-staging-project --env staging

# Deploy to production
./infra/scripts/deploy.sh --project my-prod-project --env prod

# Deploy with specific image tag
./infra/scripts/deploy.sh --project kn-dev-01 --env dev --image-tag v1.2.3

# Show help
./infra/scripts/deploy.sh --help
```

## Troubleshooting

### "Secret not found" Error
```bash
# Create the missing secret
gcloud secrets create <secret-name> --project=<project-id> --data-file=- <<< "value"
```

### "State bucket not found" Error
The script creates it automatically, but if it fails:
```bash
gsutil mb -p <project-id> -l us-central1 gs://<project-id>-terraform-state
gsutil versioning set on gs://<project-id>-terraform-state
```

### "Terraform backend error"
```bash
cd infra/terraform
terraform init -reconfigure \
  -backend-config="bucket=<project-id>-terraform-state" \
  -backend-config="prefix=terraform/state"
```

## Summary

**Always use:**
```bash
./infra/scripts/deploy.sh --project <project-id> --env <env>
```

**For kn-dev-01:**
```bash
./infra/scripts/deploy.sh --project kn-dev-01 --env dev
```

That's it! One command deploys everything. 🚀

