# Security Changes - ONNX Service Lockdown

## Summary
Made `/infer` endpoint internal-only (accessible only by ControlNet) since it has no authentication.

## ⚠️ IMPORTANT: Cloud Run Ingress Configuration

After making ONNX internal-only, you **MUST** configure two things correctly:

### 1. Ingress Setting
```terraform
# CORRECT - Allows Cloud Run services to call each other
ingress = "INGRESS_TRAFFIC_INTERNAL_ONLY"

# WRONG - Only load balancer can call it (causes 404 errors)
ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
```

### 2. Health Probe Ports
The health probes **MUST** specify the correct port (8002 for ONNX):

```terraform
startup_probe {
  http_get {
    path = "/health"
    port = 8002  # REQUIRED - defaults to 8080 if omitted
  }
  # ... other settings
}

liveness_probe {
  http_get {
    path = "/health"
    port = 8002  # REQUIRED - defaults to 8080 if omitted
  }
  # ... other settings
}
```

**Without the port specification, Cloud Run checks port 8080 (default) and the container fails to start!**

### Common Errors

| Symptom | Cause | Fix |
|---------|-------|-----|
| 404 errors, "ONNX service error" | Wrong ingress setting | Use `INGRESS_TRAFFIC_INTERNAL_ONLY` |
| "Container failed startup probe" | Missing port in health checks | Add `port = 8002` to probes |
| Works locally, fails on GCP | Any of the above | Check both ingress and port settings |

## Changes Made

### 1. Removed Public `/infer` Routes

**Local Development (nginx.conf)**
- ❌ Removed: Public `/infer` proxy route
- ✅ ControlNet now accesses ONNX directly via: `http://onnx-service:8002/infer`

**GCP Production (load_balancer.tf)**
- ❌ Removed: Public `/infer`, `/infer/*`, and `/cache/stats` routes from load balancer
- ✅ ControlNet now accesses ONNX directly via internal service URL

### 2. Fixed HF_TOKEN Hardcoding

**Files Updated:**
- `env.example` - Added HF_TOKEN configuration
- `infra/terraform/variables.tf` - Added hf_token variable (sensitive)
- `infra/terraform/terraform.tfvars.example` - Added hf_token example
- `infra/terraform/main.tf` - Changed from hardcoded value to `var.hf_token`
- `infra/scripts/deploy-onnx-service.sh` - Now reads from `$HF_TOKEN` environment variable with validation

### 3. Updated ControlNet ONNX Access

**Terraform (main.tf)**
```terraform
env {
  name  = "ONNX_SERVICE_URL"
  value = google_cloud_run_v2_service.onnx.uri  # Internal direct access
}
```

## Migration Steps

### For Local Development:
1. No changes needed - ControlNet already uses `http://onnx-service:8002`

### For GCP Deployment:

1. **Set HF_TOKEN in your environment:**
```bash
export HF_TOKEN=your_actual_token_here
```

2. **Update Terraform variables:**
```bash
cd infra/terraform
# Add to terraform.tfvars:
hf_token = "your_actual_token_here"
```

3. **Apply Terraform changes:**
```bash
terraform plan
terraform apply
```

This will:
- Remove public `/infer` routes from load balancer
- Update ControlNet to use internal ONNX service URL
- Configure HF_TOKEN from Terraform variables
- **Set ONNX ingress to `INGRESS_TRAFFIC_INTERNAL_ONLY`** (allows ControlNet to call it)

4. **For script-based deployments:**
```bash
export HF_TOKEN=your_actual_token_here
./dev deploy onnx-service
```

## Security Benefits

✅ **No public access to `/infer`** - Can't be called from internet
✅ **Internal-only communication** - Only Cloud Run services can access ONNX
✅ **No hardcoded secrets** - HF_TOKEN now from environment/variables
✅ **Fail-fast validation** - Deploy script validates HF_TOKEN is set

## Testing

```bash
# This should now fail (404):
curl https://demo.kentron.ai/infer -X POST -d '{"prompt": "test", "risk_category": "pii"}'

# ControlNet can still access internally via direct service URL
```
