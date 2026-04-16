# Build and Deployment Flow

## ✅ Builds Are Fully Handled

**Yes, builds are automatically handled!** When you run:

```bash
./infra/scripts/deploy.sh --project kn-dev-01 --env dev
```

The entire flow is automated:

## Deployment Flow

### 1. **Infrastructure Setup** (Local)
- Creates/verifies Terraform state bucket
- Initializes Terraform backend

### 2. **Docker Image Builds** (Cloud Build)
Cloud Build automatically builds **all 4 services**:
- ✅ **ControlNet Gateway** (`apps/controlnet/`)
- ✅ **ModelGuard** (`apps/model-guard/`)
- ✅ **Web App** (`apps/web/`)
- ✅ **ONNX Inference Service** (`apps/onnx-service/`)

Images are tagged with:
- `${IMAGE_TAG}` (e.g., `latest`, `v1.2.3`)
- `latest` (for convenience)

### 3. **Image Push** (Cloud Build)
All images are pushed to Artifact Registry:
```
${REGION}-docker.pkg.dev/${PROJECT_ID}/ai-governance/
  ├── controlnet:${IMAGE_TAG}
  ├── model-guard:${IMAGE_TAG}
  ├── web:${IMAGE_TAG}
  └── onnx-inference-service-${ENVIRONMENT}:${IMAGE_TAG}
```

### 4. **Infrastructure & Deployment** (Cloud Build)
Terraform applies all infrastructure and deploys services:
- Cloud SQL (PostgreSQL)
- Memorystore (Redis)
- VPC Connector
- Cloud Load Balancer
- **Cloud Run services** (using the newly built images)

### 5. **Outputs** (Local)
Prints deployment URLs, IPs, and connection info

## What Changed (Fixed Issues)

### Before (❌ Had Problems)
1. Terraform applied locally (services with old/missing images)
2. Cloud Build built images
3. Cloud Build applied Terraform again (redundant)
4. **Result:** Slow, redundant, potential race conditions

### After (✅ Fixed)
1. Cloud Build builds all images first
2. Cloud Build applies Terraform once (deploys services with new images)
3. **Result:** Fast, efficient, no redundancy

## Build Configuration

All builds are configured in `infra/cloudbuild.yaml`:

- **Build machines:** `E2_HIGHCPU_8` (fast builds)
- **Timeout:** 30 minutes
- **Parallel builds:** All 4 services build in parallel
- **Secrets:** Automatically injected from Secret Manager

## Manual Build (If Needed)

If you need to build images separately:

```bash
gcloud builds submit \
  --config=infra/cloudbuild.yaml \
  --project=kn-dev-01 \
  --substitutions=_REGION=us-central1,_ENVIRONMENT=dev,_PLATFORM_DOMAIN=demo.kentron.ai,_IMAGE_TAG=latest
```

## Summary

**You don't need to worry about builds** - they're fully automated:

1. ✅ All 4 services are built automatically
2. ✅ Images are pushed to Artifact Registry
3. ✅ Services are deployed with the new images
4. ✅ Everything happens in the correct order

Just run:
```bash
./infra/scripts/deploy.sh --project kn-dev-01 --env dev
```

That's it! 🚀

