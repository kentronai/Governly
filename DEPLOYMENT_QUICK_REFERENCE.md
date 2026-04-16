# Deployment Quick Reference

## 🚀 Three Ways to Deploy

### 1. Single Service (Fastest - 3-5 min) ⚡

Deploy just one service when you've changed code in a single app:

```bash
# Web app (frontend)
./infra/scripts/deploy-service.sh web prod

# ControlNet Gateway (API)
./infra/scripts/deploy-service.sh controlnet prod

# Model Guard
./infra/scripts/deploy-service.sh model-guard prod

# ONNX Service
./infra/scripts/deploy-service.sh onnx prod
```

**Use when:**
- Quick iteration on a single service
- Frontend changes only
- Backend API changes only
- Hot fixes

### 2. All Services (8-10 min)

Deploy all services when you've made code changes across multiple apps:

```bash
./infra/scripts/deploy-services-only.sh --project kentron-production --env prod
```

**Use when:**
- Multiple code changes across services
- Bug fixes affecting multiple services
- Feature updates that span services
- **NO infrastructure changes needed**

### 3. Full Deployment (15-20 min)

Deploy everything including infrastructure:

```bash
./infra/scripts/deploy.sh --env prod
```

**Use when:**
- First deployment
- Infrastructure changes (scaling, Redis, VPC)
- Database configuration changes
- Load balancer or networking changes

## 📝 Production Service Names

Production uses **no environment suffix**:
- `controlnet-gateway` (not `controlnet-gateway-prod`)
- `web-app` (not `web-app-prod`)
- `model-guard` (not `model-guard-prod`)
- `onnx-inference-service` (not `onnx-inference-service-prod`)

## 🎯 Common Workflows

### Frontend Update
```bash
# Edit code in apps/web/
./infra/scripts/deploy-service.sh web prod
```

### Backend API Update
```bash
# Edit code in apps/controlnet/
./infra/scripts/deploy-service.sh controlnet prod
```

### Multiple Services Updated
```bash
# Edit code in multiple apps/
./infra/scripts/deploy-services-only.sh --project kentron-production --env prod
```

### Infrastructure + Code Changes
```bash
# Edit infra/terraform/ AND apps/
./infra/scripts/deploy.sh --env prod
```

## 🔍 Check Deployment Status

```bash
# List all services
gcloud run services list --project=kentron-production --region=us-central1

# Check specific service logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=controlnet-gateway" \
  --project=kentron-production --limit=20

# Check service health
curl https://app.kentron.ai/healthz
```

## 💡 Tips

1. **Auto-detection**: Scripts auto-detect project ID based on environment
   - `prod` → `kentron-production`
   - `dev` → `kn-dev-01`
   - `staging` → `kentron-staging`

2. **Version Tags**: Use `--tag v1.2.3` for versioned deployments

3. **Speed**: Single service deployments are 3-4x faster than full deployments

4. **Safety**: Infrastructure changes ALWAYS require full deployment (`deploy.sh`)

5. **Development**: Same commands work for dev, just replace `prod` with `dev`

## 🆘 Troubleshooting

### Service won't start
```bash
# Check recent logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=SERVICE_NAME" \
  --project=kentron-production --limit=50 --format=json

# Check service configuration
gcloud run services describe SERVICE_NAME --region=us-central1 --project=kentron-production
```

### Build fails
```bash
# Check Cloud Build logs
gcloud builds list --project=kentron-production --limit=5

# View specific build
gcloud builds log BUILD_ID --project=kentron-production
```

### Database connection issues
```bash
# Check database-url secret
gcloud secrets versions access latest --secret=database-url --project=kentron-production

# Verify SSL parameter: should use ssl=require for asyncpg
```

