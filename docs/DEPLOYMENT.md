# Deployment Guide

## Overview

The AI Governance Platform deploys to Google Cloud Platform (GCP) using Terraform for infrastructure and Cloud Build for CI/CD.

## Architecture

### Components

- **Cloud Run**: Containerized services
  - **Dockerfile**: `apps/controlnet/Dockerfile` (lines 1-73)
  - **Dockerfile**: `apps/web/Dockerfile` (lines 1-84)
  - **Dockerfile**: `apps/model-guard/Dockerfile` (lines 1-60)
- **Cloud SQL**: PostgreSQL database
- **Cloud Memorystore**: Redis cache
  - **Terraform**: `infra/terraform/main.tf` (lines 68-79)
- **Load Balancer**: Ingress for web traffic
  - **Terraform**: `infra/terraform/load_balancer.tf`

### Services

**Terraform Configuration**: `infra/terraform/main.tf` (lines 1-588)

1. **ControlNet Gateway** - FastAPI service
   - **Build**: `infra/cloudbuild.yaml` (lines 6-15, 62-76)
   - **Dockerfile**: `apps/controlnet/Dockerfile` (multi-stage build)
2. **Web Dashboard** - Next.js application
   - **Build**: `infra/cloudbuild.yaml` (lines 27-36, 94-113)
   - **Dockerfile**: `apps/web/Dockerfile` (multi-stage build)
3. **Model Guard** - Model security scanner
   - **Build**: `infra/cloudbuild.yaml` (lines 16-25, 78-92)
   - **Dockerfile**: `apps/model-guard/Dockerfile` (multi-stage build)

## Prerequisites

1. **GCP Account**
2. **Terraform** installed
3. **gcloud CLI** configured
4. **Service Account** with proper permissions

## Initial Setup

**Terraform Auto-Configuration**: `infra/terraform/main.tf` (lines 27-44)
APIs are automatically enabled by Terraform.

### 1. Configure GCP

```bash
# Login
gcloud auth login

# Set project
gcloud config set project YOUR_PROJECT_ID

# Enable APIs (or let Terraform handle it)
gcloud services enable \
  run.googleapis.com \
  sql-component.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  cloudbuild.googleapis.com
```

### 2. Create Service Account

**Terraform Service Account**: `infra/terraform/main.tf` (lines 82-96)
- Creates service account automatically

**Manual setup** (if not using Terraform):
```bash
# Create service account
gcloud iam service-accounts create controlnet-deployer \
  --display-name="ControlNet Deployer"

# Grant permissions
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:controlnet-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:controlnet-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudsql.admin"

# Create key
gcloud iam service-accounts keys create gcs-credentials.json \
  --iam-account=controlnet-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

### 3. Setup Terraform

**Terraform Files**: `infra/terraform/`
- **Main config**: `main.tf` (lines 1-588)
- **Variables**: `variables.tf` (lines 1-59)
- **Load balancer**: `load_balancer.tf`
- **Secrets**: `secrets.tf`

```bash
cd infra/terraform

# Initialize
terraform init

# Plan
terraform plan -var="project_id=YOUR_PROJECT_ID"

# Apply
terraform apply -var="project_id=YOUR_PROJECT_ID"
```

## Environment Variables

**Template**: `env.example` (lines 1-36)  
**Production**: Create `.env.production`

```env
# Database
DATABASE_URL=postgresql://user:pass@/db?host=/cloudsql/project:region:instance
DATABASE_URL_ASYNC=postgresql+asyncpg://user:pass@/db?host=/cloudsql/project:region:instance

# Redis
REDIS_URL=redis://redis-ip:6379

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
CLERK_WEBHOOK_SECRET=whsec_...

# OpenAI
OPENAI_API_KEY=sk-...

# URLs
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_API_URL=https://api.your-domain.com

# Feature Flags
ENVIRONMENT=production
LOG_LEVEL=INFO
ENABLE_ANALYTICS=true
```

## Deployment

### Automated Deployment (Cloud Build)

**Build Config**: `infra/cloudbuild.yaml` (lines 1-120)
- **Build steps**: Lines 4-62 (build all three services)
- **Deploy steps**: Lines 62-113 (deploy to Cloud Run)
- **Substitutions**: Lines 113-120 (environment variables)

```bash
# Trigger build
gcloud builds submit --config infra/cloudbuild.yaml
```

### Manual Deployment

#### 1. ControlNet Gateway

**Dockerfile**: `apps/controlnet/Dockerfile` (lines 1-73)
**Deploy Script**: `infra/scripts/deploy-controlnet.sh` (lines 1-78)

```bash
# Build image
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/controlnet

# Deploy
gcloud run deploy controlnet \
  --image gcr.io/YOUR_PROJECT_ID/controlnet \
  --platform managed \
  --region us-central1 \
  --add-cloudsql-instances YOUR_INSTANCE_CONNECTION_NAME \
  --set-env-vars-from-file .env.production
```

**Manual Deploy Script**: `infra/scripts/deploy-controlnet.sh`
```bash
./infra/scripts/deploy-controlnet.sh [image_tag]
```

#### 2. Web Dashboard

**Dockerfile**: `apps/web/Dockerfile` (lines 1-84)  
**Deploy Script**: `infra/scripts/deploy-web.sh`

```bash
cd apps/web

# Build image
docker build -t gcr.io/YOUR_PROJECT_ID/web .

# Push
docker push gcr.io/YOUR_PROJECT_ID/web

# Deploy
gcloud run deploy web \
  --image gcr.io/YOUR_PROJECT_ID/web \
  --platform managed \
  --region us-central1 \
  --add-cloudsql-instances YOUR_INSTANCE_CONNECTION_NAME \
  --set-env-vars-from-file .env.production
```

#### 3. Model Guard

**Dockerfile**: `apps/model-guard/Dockerfile` (lines 1-60)  
**Deploy Script**: `infra/scripts/deploy-model-guard.sh`

```bash
cd apps/model-guard

# Build and deploy
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/model-guard
gcloud run deploy model-guard \
  --image gcr.io/YOUR_PROJECT_ID/model-guard \
  --platform managed \
  --region us-central1
```

#### All Services Script

**One-command deploy**: `infra/scripts/deploy-all.sh`

```bash
./infra/scripts/deploy-all.sh
```

## Database Migration

**Schema Location**: `apps/web/drizzle/schema.ts` (lines 1-1612)

### Run Migrations

**Commands**: From `apps/web/package.json` scripts

```bash
cd apps/web

# Generate migration (if schema changed)
pnpm db:generate
# Or: npx drizzle-kit generate --config=src/drizzle.config.ts

# Migrations stored in: apps/web/drizzle/XXXX_migration.sql

# Apply migration
gcloud sql connect YOUR_INSTANCE \
  --user=postgres \
  --database=app

# In psql:
\i drizzle/XXXX_migration.sql
```

Or use migration service:

```bash
# Deploy migration job
kubectl apply -f infra/k8s/migration-job.yaml
```

## DNS Setup

### Custom Domain

```bash
# Map domain
gcloud app domains create your-domain.com

# Or use Cloud DNS
gcloud dns record-sets create your-domain.com \
  --rrdatas=YOUR_IP \
  --type=A \
  --zone=YOUR_ZONE
```

### SSL Certificate

Managed by GCP automatically for:
- Custom domains on Cloud Run
- Load balancer HTTPS

## Monitoring

### Cloud Logging

```bash
# View logs
gcloud logging read "resource.type=cloud_run_revision" \
  --limit 50 \
  --format json
```

### Cloud Monitoring

Dashboards available at:
- https://console.cloud.google.com/monitoring

Key metrics:
- Request latency (p50, p95)
- Error rate
- Guard execution time
- Policy violations

## Scaling

### Auto-scaling

**Terraform Scaling**: `infra/terraform/variables.tf` (lines 32-59)

Cloud Run auto-scales based on:
- Request rate
- CPU/memory usage
- Response latency

Configure in Terraform:
```hcl
# ControlNet Gateway
variable "controlnet_min_instances" { default = 1 }  # Always warm for < 100ms p95
variable "controlnet_max_instances" { default = 10 }

# Web App
variable "web_min_instances" { default = 0 }
variable "web_max_instances" { default = 10 }
```

Or in `cloudbuild.yaml`:
```yaml
minInstances: 1
maxInstances: 100
cpu: 2
memory: 4Gi
```

### Manual Scaling

```bash
gcloud run services update controlnet \
  --min-instances 5 \
  --max-instances 50
```

## Backup & Recovery

### Database Backup

```bash
# Create backup
gcloud sql backups create \
  --instance YOUR_INSTANCE \
  --description "Daily backup"

# List backups
gcloud sql backups list --instance YOUR_INSTANCE

# Restore
gcloud sql backups restore BACKUP_ID \
  --instance YOUR_INSTANCE
```

### Redis Backup

Cloud Memorystore automatic backups:
- Retention: 7 days
- Frequency: Daily

## Security

### Secrets Management

Use Secret Manager:

```bash
# Create secret
echo -n "your-secret" | gcloud secrets create openai_api_key --data-file=-

# Grant access
gcloud secrets add-iam-policy-binding openai_api_key \
  --member="serviceAccount:YOUR_SERVICE_ACCOUNT" \
  --role="roles/secretmanager.secretAccessor"

# Use in Cloud Run
gcloud run services update controlnet \
  --update-secrets OPENAI_API_KEY=openai_api_key:latest
```

### Network Security

1. **VPC**: Isolate services
2. **Firewall**: Restrict access
3. **Private IP**: Internal communication
4. **Cloud Armor**: DDoS protection

## Troubleshooting

### Service Won't Start

```bash
# Check logs
gcloud logging read "resource.type=cloud_run_revision" \
  --limit 100

# Check service status
gcloud run services describe controlnet \
  --region us-central1
```

### Database Connection Issues

```bash
# Check Cloud SQL proxy
gcloud sql instances describe YOUR_INSTANCE

# Test connection
psql $DATABASE_URL
```

### High Latency

```bash
# Check metrics
gcloud monitoring dashboards create --config-dir=monitoring/

# Check slow queries
gcloud logging read "resource.type=cloudsql_database" \
  --limit 50
```

## Rollback

### Cloud Run Rollback

```bash
# List revisions
gcloud run revisions list --service controlnet

# Rollback
gcloud run services update-traffic controlnet \
  --to-revisions REVISION_ID=100
```

### Database Rollback

```bash
# Point-in-time recovery
gcloud sql operations list \
  --instance YOUR_INSTANCE

# Restore to point
gcloud sql backups restore BACKUP_ID \
  --backup-instance YOUR_INSTANCE
```

## Cost Optimization

### Right-sizing

```bash
# Check usage
gcloud billing budgets list

# Optimize Cloud Run
gcloud run services update controlnet \
  --cpu 1 \
  --memory 512Mi
```

### Caching

- Redis for policy cache
- Cloud CDN for static assets
- Query result caching

## Disaster Recovery

### Backup Strategy

1. **Database**: Daily backups, 30-day retention
2. **Code**: Git repository
3. **Config**: Terraform state in GCS
4. **Secrets**: Secret Manager

### Recovery Procedures

1. Restore database from backup
2. Redeploy services from Git
3. Restore configuration from Terraform
4. Verify service health

## CI/CD Pipeline

**Build Config**: `infra/cloudbuild.yaml` (lines 1-120)

Pipeline steps:
1. **Test**: Run test suite (not shown, add in `cloudbuild.yaml`)
2. **Build**: Create Docker images (lines 4-36)
   - ControlNet: Lines 6-15
   - ModelGuard: Lines 16-25
   - Web: Lines 27-36
3. **Push**: Push to Artifact Registry (lines 38-60)
4. **Deploy**: Deploy to Cloud Run (lines 62-113)
5. **Verify**: Health check endpoints

**Local Docker Compose**: `docker-compose.yml` (lines 1-130)
For local development:
```bash
docker-compose up -d
# Services: nginx, redis, controlnet, model-guard, web
```

Trigger on push to `main`:

```yaml
triggers:
  - name: deploy
    github:
      owner: your-org
      name: ai-governance
      push:
        branch: ^main$
```

