# Deployment Scripts

## Primary Deployment Script

**Use this for all deployments:**

```bash
./infra/scripts/deploy.sh --project <project-id> --env <dev|staging|prod> [--image-tag <tag>]
```

Or use the full path:
```bash
./infra/scripts/deploy-to-gcp.sh --project <project-id> --env <dev|staging|prod>
```

### Examples

```bash
# Deploy to dev environment
./infra/scripts/deploy.sh --project kn-dev-01 --env dev

# Deploy to staging with specific image tag
./infra/scripts/deploy.sh --project my-staging-project --env staging --image-tag v1.2.3

# Deploy to production (requires main branch + versioned tag)
./infra/scripts/deploy.sh --project my-prod-project --env prod --image-tag v1.2.3
```

## What It Does

The deployment script:
1. ✅ Creates/verifies Terraform state bucket
2. ✅ Initializes Terraform with project-specific backend
3. ✅ Applies all infrastructure (DB, Redis, VPC, Load Balancer, Cloud Run)
4. ✅ Builds and deploys Docker images via Cloud Build
5. ✅ Prints deployment outputs (URLs, IPs)

## Quick Terraform Apply (Skip Image Builds)

**Use this to retry failed Terraform steps without rebuilding Docker images:**

```bash
./infra/scripts/apply-terraform.sh --project kn-dev-01 --env dev
```

This is useful when:
- Terraform apply failed but images are already built
- You only changed Terraform configuration
- You want to retry infrastructure changes quickly

**Note:** This uses existing Docker images. To rebuild images, use `deploy.sh` instead.

## Production Deployment Best Practices

**⚠️ Important:** Production deployments have built-in safeguards to prevent accidental deployments:

### Requirements for Production (`--env prod` or `--env production`):

1. **Must be on `main` or `master` branch**
   - Script validates the current branch
   - Prevents deploying from feature branches

2. **No uncommitted changes**
   - All code must be committed before production deployment
   - Ensures reproducible deployments

3. **Versioned image tag (not `latest`)**
   - Must use `--image-tag v1.2.3` format
   - Enables rollback and version tracking

### Recommended Production Workflow:

```bash
# 1. Ensure you're on main branch
git checkout main
git pull origin main

# 2. Verify no uncommitted changes
git status

# 3. Deploy with versioned tag
./infra/scripts/deploy.sh \
  --project my-prod-project \
  --env prod \
  --image-tag v1.2.3
```

### Override (Not Recommended):

If you must deploy from a different branch (e.g., hotfix), use `--skip-branch-check`:

```bash
./infra/scripts/deploy.sh \
  --project my-prod-project \
  --env prod \
  --image-tag v1.2.3-hotfix \
  --skip-branch-check
```

**Note:** For automated production deployments, use **Bitbucket Pipelines CI/CD** (see `docs/BITBUCKET_CICD.md`). The CI/CD pipeline automatically:
- Deploys from `main` branch only
- Uses versioned tags from git tags
- Runs tests before deployment

## Utility Scripts

- `apply-terraform.sh` - Quick Terraform apply (skips image builds)
- `setup-bitbucket-cicd.sh` - Configure Bitbucket Pipelines CI/CD
- `enable-fast-builds.sh` - Enable Docker BuildKit caching
- `switch-traffic.sh` - Switch Cloud Run traffic between revisions
- `verify-before-checkin.sh` - Pre-commit verification checks
- `sync-env.py` - Environment variable synchronization tool

## Deprecated Scripts

**All deprecated scripts have been removed.** Use `deploy.sh` for all deployments.

## Prerequisites

1. **GCP CLI installed and authenticated:**
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```

2. **Required secrets in Secret Manager:**
   - `database-url`
   - `openai-api-key`
   - `clerk-publishable-key`
   - `clerk-secret-key`
   - `clerk-webhook-secret`
   - `hf-token` (HuggingFace token)

3. **Terraform installed** (v1.5+)

4. **Project configuration:**
   - Set `gcloud config set project <project-id>`, or use `--project` flag
   - Ensure required APIs are enabled (script handles this)

## Troubleshooting

**"Secret not found" error:**
```bash
# Create missing secret
gcloud secrets create <secret-name> --project=<project-id> --data-file=- <<< "your-value"
```

**"State bucket not found" error:**
The script creates it automatically, but if it fails:
```bash
gsutil mb -p <project-id> -l us-central1 gs://<project-id>-terraform-state
gsutil versioning set on gs://<project-id>-terraform-state
```

**"Terraform backend error":**
```bash
cd infra/terraform
terraform init -reconfigure \
  -backend-config="bucket=<project-id>-terraform-state" \
  -backend-config="prefix=terraform/state"
```

