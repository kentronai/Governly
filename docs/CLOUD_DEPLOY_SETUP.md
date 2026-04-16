# Cloud Deploy Setup - GCP-Native Promotion & Rollback

Google Cloud Deploy is GCP's native continuous delivery service with built-in:
- ✅ Promotion pipelines (dev → staging → production)
- ✅ Audit trails (who promoted what, when)
- ✅ Rollback support with history
- ✅ Approval gates
- ✅ Automated canary/blue-green deployments

## Why Cloud Deploy?

### Current Approach (Custom Scripts)
- ❌ No built-in audit trail
- ❌ Manual rollback tracking
- ❌ No approval workflows
- ❌ Custom scripting maintenance

### With Cloud Deploy
- ✅ Complete audit trail in Cloud Logging
- ✅ One-click rollbacks with history
- ✅ Built-in approval gates
- ✅ GCP-managed, no maintenance
- ✅ Integration with Cloud Build
- ✅ Automated deployment strategies (canary, blue-green)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Cloud Deploy Pipeline                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────┐      ┌─────────┐      ┌─────────┐           │
│  │   DEV   │─────▶│ STAGING │─────▶│  PROD   │           │
│  │ Project │ Auto │ Project │Manual│ Project │           │
│  └─────────┘      └─────────┘      └─────────┘           │
│                          │                                 │
│                    ┌─────▼─────┐                          │
│                    │ Approval  │                          │
│                    │   Gate    │                          │
│                    └───────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

## Setup Steps

### 1. Enable Cloud Deploy API

```bash
gcloud services enable clouddeploy.googleapis.com --project=kn-dev-01
gcloud services enable clouddeploy.googleapis.com --project=kn-staging-01
gcloud services enable clouddeploy.googleapis.com --project=kn-prod-01
```

### 2. Create Cloud Deploy Configuration

Create `infra/clouddeploy/pipeline.yaml`:

```yaml
apiVersion: deploy.cloud.google.com/v1
kind: DeliveryPipeline
metadata:
  name: ai-governance-pipeline
description: AI Governance Platform Deployment Pipeline
serialPipeline:
  stages:
    - targetId: dev
      profiles: [dev]
    - targetId: staging
      profiles: [staging]
      strategy:
        standard:
          verify: false
    - targetId: prod
      profiles: [prod]
      strategy:
        standard:
          verify: false
      deployParameters:
        - values:
            requireApproval: "true"
```

### 3. Define Deployment Targets

Create `infra/clouddeploy/targets.yaml`:

```yaml
apiVersion: deploy.cloud.google.com/v1
kind: Target
metadata:
  name: dev
description: Development Environment
requireApproval: false
run:
  location: projects/kn-dev-01/locations/us-central1
---
apiVersion: deploy.cloud.google.com/v1
kind: Target
metadata:
  name: staging
description: Staging Environment
requireApproval: false
run:
  location: projects/kn-staging-01/locations/us-central1
---
apiVersion: deploy.cloud.google.com/v1
kind: Target
metadata:
  name: prod
description: Production Environment
requireApproval: true  # Require manual approval
run:
  location: projects/kn-prod-01/locations/us-central1
```

### 4. Create Skaffold Configuration

Create `skaffold.yaml` at project root:

```yaml
apiVersion: skaffold/v4beta6
kind: Config
metadata:
  name: ai-governance
profiles:
  - name: dev
    deploy:
      cloudrun:
        projectid: kn-dev-01
        region: us-central1
        services:
          - controlnet-gateway-dev
          - web-app-dev
          - model-guard-dev
          - onnx-inference-service-dev
  
  - name: staging
    deploy:
      cloudrun:
        projectid: kn-staging-01
        region: us-central1
        services:
          - controlnet-gateway-staging
          - web-app-staging
          - model-guard-staging
          - onnx-inference-service-staging
  
  - name: prod
    deploy:
      cloudrun:
        projectid: kn-prod-01
        region: us-central1
        services:
          - controlnet-gateway-prod
          - web-app-prod
          - model-guard-prod
          - onnx-inference-service-prod
```

### 5. Register Pipeline

```bash
# Register the pipeline
gcloud deploy apply --file=infra/clouddeploy/pipeline.yaml --region=us-central1 --project=kn-dev-01

# Register targets
gcloud deploy apply --file=infra/clouddeploy/targets.yaml --region=us-central1 --project=kn-dev-01
```

## Usage

### Create a Release

```bash
# Create a new release with version tag
gcloud deploy releases create release-v1-2-3 \
  --delivery-pipeline=ai-governance-pipeline \
  --region=us-central1 \
  --project=kn-dev-01 \
  --images=controlnet=us-central1-docker.pkg.dev/kn-dev-01/ai-governance/controlnet:v1.2.3,web=us-central1-docker.pkg.dev/kn-dev-01/ai-governance/web:v1.2.3,model-guard=us-central1-docker.pkg.dev/kn-dev-01/ai-governance/model-guard:v1.2.3,onnx=us-central1-docker.pkg.dev/kn-dev-01/ai-governance/onnx-inference-service-dev:v1.2.3
```

### Promote to Staging (Automatic)

```bash
# Promotion happens automatically after dev deployment succeeds
# Or manually trigger:
gcloud deploy releases promote \
  --release=release-v1-2-3 \
  --delivery-pipeline=ai-governance-pipeline \
  --region=us-central1 \
  --project=kn-dev-01
```

### Promote to Production (Manual Approval Required)

```bash
# Request promotion to production
gcloud deploy releases promote \
  --release=release-v1-2-3 \
  --delivery-pipeline=ai-governance-pipeline \
  --region=us-central1 \
  --project=kn-dev-01

# This creates an approval request
# Approve in Cloud Console or via CLI:
gcloud deploy rollouts approve release-v1-2-3-to-prod-0001 \
  --delivery-pipeline=ai-governance-pipeline \
  --region=us-central1 \
  --project=kn-dev-01
```

### Rollback

```bash
# List rollouts to find previous version
gcloud deploy rollouts list \
  --delivery-pipeline=ai-governance-pipeline \
  --release=release-v1-2-3 \
  --region=us-central1 \
  --project=kn-dev-01

# Rollback to previous rollout
gcloud deploy targets rollback prod \
  --delivery-pipeline=ai-governance-pipeline \
  --region=us-central1 \
  --project=kn-dev-01 \
  --rollout=release-v1-2-2-to-prod-0001
```

## Audit Trail

### View Deployment History

```bash
# List all releases
gcloud deploy releases list \
  --delivery-pipeline=ai-governance-pipeline \
  --region=us-central1 \
  --project=kn-dev-01

# View specific release details (who, when, what)
gcloud deploy releases describe release-v1-2-3 \
  --delivery-pipeline=ai-governance-pipeline \
  --region=us-central1 \
  --project=kn-dev-01
```

### View Approval History

```bash
# View approval requests
gcloud deploy rollouts describe release-v1-2-3-to-prod-0001 \
  --delivery-pipeline=ai-governance-pipeline \
  --region=us-central1 \
  --project=kn-dev-01 \
  --format="table(approvalState,approver,approveTime)"
```

### Cloud Logging Audit Trail

All Cloud Deploy actions are automatically logged:

```bash
# View all deployment events
gcloud logging read "resource.type=clouddeploy.googleapis.com/DeliveryPipeline" \
  --project=kn-dev-01 \
  --format=json

# View specific release events
gcloud logging read "resource.labels.delivery_pipeline_id=ai-governance-pipeline AND jsonPayload.release=release-v1-2-3" \
  --project=kn-dev-01
```

## Integration with Current Workflow

### Option 1: Full Cloud Deploy (Recommended)

Replace custom scripts with Cloud Deploy:

```bash
# Instead of:
# ./infra/scripts/promote-images.sh --from-project staging --to-project prod --tag v1.2.3

# Use:
gcloud deploy releases promote release-v1-2-3 \
  --delivery-pipeline=ai-governance-pipeline \
  --region=us-central1
```

### Option 2: Hybrid Approach

Use Cloud Deploy for promotion tracking, keep custom scripts for builds:

```bash
# 1. Build with existing script
./infra/scripts/deploy.sh --project kn-dev-01 --env dev --image-tag v1.2.3

# 2. Create Cloud Deploy release for tracking
gcloud deploy releases create release-v1-2-3 \
  --delivery-pipeline=ai-governance-pipeline \
  --region=us-central1 \
  --project=kn-dev-01

# 3. Promote through Cloud Deploy (tracked)
gcloud deploy releases promote release-v1-2-3 \
  --delivery-pipeline=ai-governance-pipeline \
  --region=us-central1
```

## Benefits Summary

| Feature | Custom Scripts | Cloud Deploy |
|---------|---------------|--------------|
| **Audit Trail** | ❌ Manual logging | ✅ Automatic, immutable |
| **Rollback History** | ❌ Manual tracking | ✅ Full history, one-click |
| **Approval Gates** | ❌ Manual process | ✅ Built-in, enforceable |
| **Multi-project** | ✅ Supported | ✅ Native support |
| **Cost** | Free (DIY) | $0.03/hour/pipeline (~$22/month) |
| **Maintenance** | ❌ You maintain | ✅ Google maintains |
| **Integration** | ❌ Custom | ✅ Native GCP |
| **Compliance** | ❌ Manual | ✅ Automatic audit logs |

## Migration Path

### Phase 1: Add Tracking to Current Scripts (Quick Win)

Enhance current promotion script with audit logging.

### Phase 2: Parallel Run (Test Cloud Deploy)

Run both systems in parallel to validate.

### Phase 3: Full Migration (Recommended End State)

Switch fully to Cloud Deploy for all promotions.

---

## Related Documentation

- [Cloud Deploy Official Docs](https://cloud.google.com/deploy/docs)
- [Production Deployment Workflow](./PRODUCTION_DEPLOYMENT_WORKFLOW.md)
- [Infrastructure & Deployment](./INFRASTRUCTURE_AND_DEPLOYMENT.md)

