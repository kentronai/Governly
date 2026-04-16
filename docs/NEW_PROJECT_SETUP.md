# Setting Up a New Production Project

This guide explains what happens automatically vs. what you need to set up manually when deploying to a new GCP project.

## Quick Answer

**Almost everything is automated**, but you need to set up **secrets** and **IAM permissions** first. Here's what happens:

## What's Automated ✅

When you run:
```bash
./infra/scripts/deploy.sh --project YOUR-NEW-PROJECT-ID --env prod --image-tag v1.0.0
```

The following happens **automatically**:

### 1. **APIs Enabled** (Terraform)
- Cloud Run API
- Redis API
- Secret Manager API
- Artifact Registry API
- Cloud Build API
- Cloud SQL API
- VPC Access API
- Compute API (Load Balancer)
- Storage API
- Service Networking API

### 2. **Infrastructure Created** (Terraform)
- ✅ Terraform state bucket (`{project-id}-terraform-state`)
- ✅ Artifact Registry repository
- ✅ VPC Connector
- ✅ Redis instance
- ✅ Cloud SQL database (with private IP)
- ✅ Service account (`ai-governance-prod`)
- ✅ Cloud Run services (Web, ControlNet, ModelGuard, ONNX)
- ✅ Load Balancer with SSL certificate
- ✅ GCS bucket for ONNX models
- ✅ IAM bindings for service accounts
- ✅ Migration job

### 3. **Docker Images Built** (Cloud Build)
- ✅ ControlNet image
- ✅ ModelGuard image
- ✅ Web image
- ✅ ONNX service image

### 4. **Services Deployed** (Terraform)
- ✅ All services deployed to Cloud Run
- ✅ Load balancer configured
- ✅ Database migrations run

## What You Must Set Up Manually ⚠️

### 1. **Secrets in Secret Manager** (REQUIRED)

Before deploying, create these secrets in the new project:

```bash
# Set your project
export PROJECT_ID="your-new-prod-project-id"
gcloud config set project $PROJECT_ID

# Create all required secrets
gcloud secrets create database-url \
  --project=$PROJECT_ID \
  --data-file=- <<< "postgresql://user:pass@host/db"

gcloud secrets create openai-api-key \
  --project=$PROJECT_ID \
  --data-file=- <<< "sk-..."

gcloud secrets create clerk-publishable-key \
  --project=$PROJECT_ID \
  --data-file=- <<< "pk_live_..."

gcloud secrets create clerk-secret-key \
  --project=$PROJECT_ID \
  --data-file=- <<< "sk_live_..."

gcloud secrets create clerk-webhook-secret \
  --project=$PROJECT_ID \
  --data-file=- <<< "whsec_..."

gcloud secrets create hf-token \
  --project=$PROJECT_ID \
  --data-file=- <<< "hf_..."
```

**Notes:**
- The `database-url` secret will be **automatically updated** by Terraform after the database is created. You can create it with a placeholder value initially.
- **Redis URL is automatically configured** - Terraform sets it directly as an environment variable (`REDIS_URL`) using the Redis instance's host and port. No secret needed!
- **Storage buckets:**
  - **ONNX Models Bucket** (`GCS_MODEL_BUCKET`): ✅ **Automatically created** by Terraform with name `${project-id}-onnx-models-${environment}`
  - **General Storage Bucket** (`GS_BUCKET_NAME`): ✅ **Automatically created** by Terraform with name `${project-id}_ai-governance`

### 2. **Cloud Build Service Account Permissions** (REQUIRED)

Grant Cloud Build permission to deploy:

```bash
export PROJECT_ID="your-new-prod-project-id"
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")

# Grant Cloud Build permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 3. **VPC Peering Connection** (One-time per project)

The VPC peering connection for Cloud SQL private access is created automatically by Terraform when you first deploy. However, if it fails, you may need to create it manually:

```bash
# This is usually automatic, but if needed:
gcloud services vpc-peerings connect \
  --service=servicenetworking.googleapis.com \
  --ranges=ai-governance-db-private-ip-prod \
  --network=default \
  --project=$PROJECT_ID
```

### 4. **DNS Configuration** (After deployment)

After deployment, configure DNS:

1. Get the load balancer IP:
   ```bash
   terraform output -raw load_balancer_ip
   ```

2. Add DNS A record:
   - Domain: `app.example.com` (your `platform_domain`)
   - Type: A
   - Value: `<load-balancer-ip>`

3. Wait for SSL certificate provisioning (10-60 minutes)

### 5. **Production Configuration File**

Create or update `infra/terraform/terraform.tfvars.production`:

```hcl
project_id      = "your-new-prod-project-id"
region          = "us-central1"
environment     = "prod"
platform_domain = "app.example.com"  # Your production domain
image_tag       = "v1.0.0"            # Use versioned tags for prod

# Production settings
controlnet_min_instances = 2
controlnet_max_instances = 20
web_min_instances        = 1
web_max_instances        = 10

redis_tier      = "STANDARD_HA"
redis_memory_gb = 4

db_tier                    = "db-custom-2-8192"
db_availability_type       = "REGIONAL"
db_disk_size_gb            = 100
db_deletion_protection     = true
db_point_in_time_recovery  = true
```

## Step-by-Step Setup for New Production Project

### Step 1: Prerequisites

```bash
# Authenticate
gcloud auth login
gcloud auth application-default login

# Set project
export PROJECT_ID="your-new-prod-project-id"
gcloud config set project $PROJECT_ID
```

### Step 2: Create Secrets

```bash
# Use the script if available, or create manually (see above)
./create-secrets-from-env.sh  # If you have one
# OR create secrets manually (see section above)
```

### Step 3: Grant Cloud Build Permissions

```bash
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Step 4: Configure Production Variables

Edit `infra/terraform/terraform.tfvars.production` with your project details.

### Step 5: Deploy

```bash
# Ensure you're on main branch
git checkout main
git pull origin main

# Deploy with versioned tag
./infra/scripts/deploy.sh \
  --project your-new-prod-project-id \
  --env prod \
  --image-tag v1.0.0
```

### Step 6: Configure DNS

After deployment completes:

```bash
cd infra/terraform
terraform output load_balancer_ip

# Add DNS A record pointing to this IP
```

## What Happens During Deployment

```mermaid
sequenceDiagram
    participant You as You
    participant Script as deploy.sh
    participant CB as Cloud Build
    participant TF as Terraform
    participant GCP as GCP Project

    You->>Script: deploy.sh --project NEW-PROJECT --env prod
    Script->>Script: Validate (branch, changes, tags)
    Script->>CB: Submit build
    
    Note over CB: Builds 4 Docker images
    CB->>GCP: Push images to Artifact Registry
    
    CB->>TF: terraform init
    CB->>TF: terraform apply
    
    Note over TF: Creates infrastructure
    TF->>GCP: Enable APIs
    TF->>GCP: Create state bucket
    TF->>GCP: Create VPC connector
    TF->>GCP: Create Redis
    TF->>GCP: Create Cloud SQL
    TF->>GCP: Create service accounts
    TF->>GCP: Create Cloud Run services
    TF->>GCP: Create Load Balancer
    TF->>GCP: Update DATABASE_URL secret
    
    TF->>GCP: Run migrations
    GCP-->>TF: Complete
    TF-->>CB: Success
    CB-->>Script: Deployment done
    Script-->>You: ✅ Complete
```

## Troubleshooting

### Error: "Secret not found"

**Solution:** Create the missing secret:
```bash
gcloud secrets create <secret-name> \
  --project=$PROJECT_ID \
  --data-file=- <<< "your-value"
```

### Error: "Permission denied" during Cloud Build

**Solution:** Grant Cloud Build permissions (see Step 3 above)

### Error: "VPC peering connection failed"

**Solution:** This is usually automatic, but if it fails:
```bash
# Check if peering exists
gcloud services vpc-peerings list --network=default

# If not, Terraform will create it on first apply
```

### Error: "State bucket doesn't exist"

**Solution:** The script creates it automatically, but if it fails:
```bash
gsutil mb -p $PROJECT_ID -l us-central1 gs://${PROJECT_ID}-terraform-state
gsutil versioning set on gs://${PROJECT_ID}-terraform-state
```

## Summary

| Task | Automated? | Notes |
|------|------------|-------|
| APIs | ✅ Yes | Terraform enables all required APIs |
| State Bucket | ✅ Yes | Created by deploy script |
| Infrastructure | ✅ Yes | All resources created by Terraform |
| Storage Buckets | ✅ Yes | Both ONNX and general storage buckets created automatically |
| Docker Images | ✅ Yes | Built by Cloud Build |
| Service Accounts | ✅ Yes | Created by Terraform |
| IAM Bindings | ⚠️ Partial | Service account bindings: Yes<br/>Cloud Build bindings: **Manual** |
| Secrets | ❌ No | **Must create manually** before deploy |
| VPC Peering | ✅ Yes | Created automatically by Terraform |
| DNS | ❌ No | **Configure after deployment** |
| SSL Certificate | ✅ Yes | Managed SSL certificate (auto-provisions) |

## Quick Checklist

Before deploying to a new production project:

- [ ] GCP project created
- [ ] Authenticated with `gcloud auth login`
- [ ] All 6 secrets created in Secret Manager
- [ ] Cloud Build service account has required permissions
- [ ] `terraform.tfvars.production` configured
- [ ] On `main` branch with no uncommitted changes
- [ ] Versioned image tag ready (not `latest`)
- [ ] DNS ready to configure after deployment

After deployment:

- [ ] Get load balancer IP from Terraform outputs
- [ ] Configure DNS A record
- [ ] Wait for SSL certificate (10-60 minutes)
- [ ] Test application access
- [ ] Verify all services are running

---

**Bottom Line:** You need to set up **secrets** and **Cloud Build permissions** first, then the deployment script handles everything else automatically! 🚀

