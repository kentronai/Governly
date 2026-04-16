# Production Deployment Workflow

Complete guide to deploying to production using image promotion for safety and consistency.

## Overview

We use **image promotion** for production deployments: build once in staging, test thoroughly, then promote the exact same images to production. This ensures what you tested is exactly what you deploy.

## Two Deployment Strategies

### Strategy 1: Image Promotion (Recommended) ✅

Build images in staging → Test → Promote to production → Deploy

**Advantages:**
- ✅ Guarantees identical code in all environments
- ✅ Much faster (no rebuild time for production)
- ✅ Lower CI/CD costs
- ✅ True "test in staging, deploy same artifacts to prod" workflow
- ✅ Industry best practice

### Strategy 2: Rebuild for Production

Build images separately for each environment

**When to use:**
- Only if you have environment-specific build requirements
- Not recommended for most use cases

---

## Production Deployment Flow (Strategy 1: Image Promotion)

### Step 1: Deploy to Staging

```bash
# Deploy to staging with a versioned tag
./infra/scripts/deploy.sh \
  --project kn-staging-01 \
  --env staging \
  --image-tag v1.2.3
```

This will:
1. Build all Docker images with tag `v1.2.3`
2. Push images to staging's Artifact Registry
3. Deploy infrastructure with Terraform
4. Deploy all services to Cloud Run
5. Run database migrations

### Step 2: Test in Staging

```bash
# Check deployment status
./dev status

# View logs
./dev logs:gcp

# Run integration tests
./dev test

# Manual testing in staging environment
```

### Step 3: Promote Images to Production

```bash
# Promote tested images from staging to production
./infra/scripts/promote-images.sh \
  --from-project kn-staging-01 \
  --to-project kn-prod-01 \
  --tag v1.2.3

# Or use ./dev wrapper
./dev promote --from-project kn-staging-01 --to-project kn-prod-01 --tag v1.2.3
```

This will:
1. Verify all images exist in staging
2. Copy (retag) images to production's Artifact Registry
3. **No rebuilding** - guarantees same images

### Step 4: Deploy to Production

```bash
# Deploy promoted images to production
./infra/scripts/deploy.sh \
  --project kn-prod-01 \
  --env prod \
  --image-tag v1.2.3
```

This will:
1. **Skip image builds** (images already exist from promotion)
2. Apply Terraform infrastructure
3. Deploy services with promoted images
4. Run database migrations

**Production Safeguards:**
- ✅ Must be on `main` branch
- ✅ No uncommitted changes allowed
- ✅ Must use versioned tag (not `latest`)

---

## Quick Reference

### Complete Workflow (Dev → Staging → Production)

```bash
# 1. Develop and test locally
./dev up
./dev logs

# 2. Deploy to dev for testing
./infra/scripts/deploy.sh --project kn-dev-01 --env dev --image-tag v1.2.3

# 3. Deploy to staging
./infra/scripts/deploy.sh --project kn-staging-01 --env staging --image-tag v1.2.3

# 4. Test in staging thoroughly
./dev logs:gcp
# Run your test suite, manual testing, etc.

# 5. Promote staging images to production
./infra/scripts/promote-images.sh \
  --from-project kn-staging-01 \
  --to-project kn-prod-01 \
  --tag v1.2.3

# 6. Deploy to production (using promoted images)
./infra/scripts/deploy.sh \
  --project kn-prod-01 \
  --env prod \
  --image-tag v1.2.3
```

### Dry Run (Preview Promotion)

```bash
# See what would be promoted without actually doing it
./infra/scripts/promote-images.sh \
  --from-project kn-staging-01 \
  --to-project kn-prod-01 \
  --tag v1.2.3 \
  --dry-run
```

---

## Image Tagging Convention

### Versioned Tags (Production)

```bash
v1.2.3          # Semantic version
v1.2.3-hotfix   # Hotfix release
v1.2.3-rc.1     # Release candidate
```

### Environment Tags (Dev/Staging)

```bash
latest          # Always points to most recent build
dev-20240115    # Date-based dev builds
staging-20240115 # Date-based staging builds
```

### Git-Based Tags

```bash
# Use git commit SHA for traceability
git rev-parse --short HEAD  # Get short SHA
# Example: v1.2.3-abc123f
```

---

## Infrastructure Updates

### If Only Infrastructure Changed (No Code Changes)

```bash
# Use apply-terraform to skip image builds
./infra/scripts/apply-terraform.sh \
  --project kn-prod-01 \
  --env prod \
  --image-tag v1.2.3
```

This:
- ✅ Uses existing images
- ✅ Only applies Terraform changes
- ✅ Much faster (~2 minutes vs ~15 minutes)

### If Both Code and Infrastructure Changed

```bash
# Full deployment (rebuilds images)
./infra/scripts/deploy.sh \
  --project kn-prod-01 \
  --env prod \
  --image-tag v1.2.4
```

---

## Rollback Strategies

### Option 1: Rollback to Previous Image Tag

```bash
# Deploy previous version (images already exist)
./infra/scripts/apply-terraform.sh \
  --project kn-prod-01 \
  --env prod \
  --image-tag v1.2.2  # Previous working version
```

### Option 2: Single Service Rollback

```bash
# Rollback just one service
gcloud run deploy controlnet-gateway-prod \
  --image=us-central1-docker.pkg.dev/kn-prod-01/ai-governance/controlnet:v1.2.2 \
  --region=us-central1 \
  --project=kn-prod-01
```

### Option 3: Traffic Splitting (Gradual Rollback)

```bash
# Route 90% to old version, 10% to new version
gcloud run services update-traffic controlnet-gateway-prod \
  --to-revisions=controlnet-gateway-prod-v122=90,controlnet-gateway-prod-v123=10 \
  --region=us-central1 \
  --project=kn-prod-01

# After validation, shift back to 100%
gcloud run services update-traffic controlnet-gateway-prod \
  --to-latest \
  --region=us-central1 \
  --project=kn-prod-01
```

---

## CI/CD Integration

### Bitbucket Pipelines (Automated)

```yaml
# Example pipeline configuration
pipelines:
  tags:
    'v*':
      - step:
          name: Deploy to Staging
          script:
            - ./infra/scripts/deploy.sh --project kn-staging-01 --env staging --image-tag $BITBUCKET_TAG
      
      - step:
          name: Integration Tests
          script:
            - ./scripts/run-integration-tests.sh staging
      
      - step:
          name: Promote to Production
          trigger: manual
          script:
            - ./infra/scripts/promote-images.sh --from-project kn-staging-01 --to-project kn-prod-01 --tag $BITBUCKET_TAG
            - ./infra/scripts/deploy.sh --project kn-prod-01 --env prod --image-tag $BITBUCKET_TAG
```

---

## Troubleshooting

### Image Not Found in Source Project

```bash
# Check if images exist
gcloud container images list --project=kn-staging-01 --repository=us-central1-docker.pkg.dev/kn-staging-01/ai-governance

# List tags for specific image
gcloud container images list-tags us-central1-docker.pkg.dev/kn-staging-01/ai-governance/controlnet
```

**Solution:** Build the images first:
```bash
./infra/scripts/deploy.sh --project kn-staging-01 --env staging --image-tag v1.2.3
```

### Permission Denied During Promotion

**Error:** `denied: Permission "artifactregistry.repositories.downloadArtifacts" denied`

**Solution:** Grant cross-project permissions:
```bash
# Allow staging service account to read from staging registry
gcloud artifacts repositories add-iam-policy-binding ai-governance \
  --project=kn-staging-01 \
  --location=us-central1 \
  --member="serviceAccount:your-account@kn-prod-01.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.reader"
```

### Production Deployment Blocked

**Error:** `❌ Production deployments must be from 'main' or 'master' branch`

**Solutions:**
```bash
# Option 1: Switch to main branch
git checkout main
git pull origin main

# Option 2: Override (not recommended)
./infra/scripts/deploy.sh --project kn-prod-01 --env prod --image-tag v1.2.3 --skip-branch-check
```

---

## Best Practices

### ✅ DO

1. **Always use versioned tags for production**
   ```bash
   --image-tag v1.2.3  # Good
   ```

2. **Test thoroughly in staging before promoting**
   - Run integration tests
   - Perform manual testing
   - Monitor logs and metrics

3. **Use semantic versioning**
   - `v1.0.0` - Major release
   - `v1.1.0` - Minor features
   - `v1.1.1` - Patches/fixes

4. **Document each release**
   - Create git tags
   - Write release notes
   - Track what changed

5. **Promote images (don't rebuild)**
   - Guarantees consistency
   - Faster deployments
   - Lower costs

### ❌ DON'T

1. **Never use `latest` in production**
   ```bash
   --image-tag latest  # Bad - not reproducible
   ```

2. **Don't deploy directly to production without testing**
   - Always go through staging first

3. **Don't rebuild images for production**
   - Use promotion instead
   - Rebuilding can introduce differences

4. **Don't skip production safeguards**
   - The checks exist for a reason
   - Use `--skip-branch-check` only for emergencies

---

## Monitoring After Deployment

```bash
# View live logs
./dev logs:gcp

# Check error rates
./dev logs:errors

# View service status
./dev status

# Check specific service health
gcloud run services describe controlnet-gateway-prod \
  --region=us-central1 \
  --project=kn-prod-01 \
  --format="table(status.url,status.conditions[0].status,status.traffic[0].percent)"
```

---

## Summary

| Task | Command | Time | Notes |
|------|---------|------|-------|
| Build & deploy to staging | `./infra/scripts/deploy.sh --project staging --env staging --image-tag v1.2.3` | ~15 min | Builds images |
| Test in staging | Manual + automated tests | Varies | Thorough testing |
| Promote to production | `./infra/scripts/promote-images.sh --from-project staging --to-project prod --tag v1.2.3` | ~2 min | Copies images |
| Deploy to production | `./infra/scripts/deploy.sh --project prod --env prod --image-tag v1.2.3` | ~5 min | Uses promoted images |
| Rollback | `./infra/scripts/apply-terraform.sh --project prod --env prod --image-tag v1.2.2` | ~2 min | Previous version |

**Total time for safe production deployment: ~25 minutes**

---

## Related Documentation

- [Deployment Scripts README](../infra/scripts/README.md)
- [Infrastructure & Deployment Architecture](./INFRASTRUCTURE_AND_DEPLOYMENT.md)
- [New Project Setup](./NEW_PROJECT_SETUP.md)
- [Build and Deploy Flow](../infra/scripts/BUILD_AND_DEPLOY_FLOW.md)

