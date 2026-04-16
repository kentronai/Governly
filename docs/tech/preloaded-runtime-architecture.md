# Preloaded Runtime Architecture

> Implementing a modal.com-like preconfigured runtime with all ONNX and embedding models preloaded

## Overview

This document describes how to create a **preloaded runtime** where all models are:
1. **Downloaded** from GCS during Docker build
2. **Preloaded** into memory at application startup
3. **Warmed up** to ensure fast cold-start performance
4. **Always available** without per-request model loading overhead

## Architecture Comparison

### Current Architecture (Lazy Loading)

```
Request → Gateway → EmbeddingService (lazy load on first call)
                  → ONNXLoader (lazy load on first call)
                  
First request: 30-60s (model download + load)
Subsequent: < 50ms (cached)
```

### Preloaded Architecture (Modal.com-like)

```
Container Start → Download all models from GCS → Load all into memory
Request → Gateway → EmbeddingService (instant)
                  → ONNXLoader (instant)
                  
All requests: < 5ms (preloaded and ready)
```

## Implementation Strategy

### Phase 1: Preload at Startup (Current Code Path)

**What**: Use existing initialization, but ensure models are loaded synchronously during startup.

**Files to modify**:
- `apps/controlnet/gateway/main.py` - Wait for model loading instead of background task
- `apps/controlnet/cga_core/onnx_loader.py` - Add synchronous preload
- `apps/controlnet/cga_core/embedding_service.py` - Ensure loaded before app starts

**Environment Variables**:
```bash
ENABLE_ONNX_MODELS=true
ENABLE_EMBEDDING_ROUTER=true
GCS_MODEL_BUCKET=your-bucket
PRELOAD_ALL_MODELS=true  # New flag
```

**Cold Start Impact**:
- First container: 45-90s (download + load)
- Subsequent containers: 30-60s (GCS download cache)

### Phase 2: Preload During Build (Docker Image)

**What**: Download models during `docker build`, bundle them in the image.

**Files to create**:
- `apps/controlnet/Dockerfile.preload` - New Dockerfile with models baked in
- `scripts/download_models.sh` - Script to download all models during build

**Dockerfile Strategy**:
```dockerfile
# Stage 1: Download all models
FROM python:3.11-slim AS model-downloader

WORKDIR /app

# Install GCS SDK
RUN pip install google-cloud-storage

# Copy download script
COPY scripts/download_models.sh .
COPY gcs-credentials.json .

# Download all models
RUN ./download_models.sh

# Stage 2: Build runtime with models
FROM python:3.11-slim AS runtime

# Copy models from downloader
COPY --from=model-downloader /app/models /app/models

# Models are now available in /app/models at runtime
```

**Cold Start Impact**:
- First container: 5-10s (load from disk)
- Subsequent containers: 5-10s (models in image, no download)

**Image Size**: ~2-3GB (was ~500MB)

### Phase 3: Standalone Inference Service (Modal.com-like)

**What**: Dedicated service that:
1. Preloads all models
2. Exposes HTTP API for inference
3. Runs 24/7 or with min_instances
4. Separate from gateway

**Service Structure**:
```
apps/
  inference-service/
    main.py          # Inference API
    models.py        # Model manager
    api.py           # HTTP endpoints
    Dockerfile       # Preconfigured runtime
```

**API Endpoints**:
```python
POST /v1/inference/embeddings
    {"text": "hello world"}
    → {"embedding": [0.1, 0.2, ...]}

POST /v1/inference/onnx/{model_id}
    {"input_data": {...}}
    → {"output": {...}}
```

## Recommended Approach

### Option A: Startup Preloading (Easiest)

**Pros**:
- Minimal code changes
- Uses existing infrastructure
- Models from GCS (single source of truth)

**Cons**:
- Cold start penalty (45-90s)
- Uses instance RAM during runtime

**Implementation**: Modify `apps/controlnet/gateway/main.py` to wait for model loading

```python
# In lifespan() function
if enable_onnx:
    logger.info("🤖 Preloading ONNX models...")
    await initialize_onnx_models(enable=True)  # Wait instead of background task
    logger.info("✅ All ONNX models loaded and ready")
```

### Option B: Docker Image Preloading (Best Performance)

**Pros**:
- Fastest cold start (5-10s)
- No per-container download overhead
- Models versioned with image tag

**Cons**:
- Large image size (2-3GB)
- Need to rebuild image when models change
- Longer build times

**Implementation**: Create `apps/controlnet/Dockerfile.preload`

### Option C: Dedicated Inference Service (Enterprise)

**Pros**:
- Separation of concerns
- Can scale independently
- Preload once, serve many gateways
- Models always warm

**Cons**:
- Additional service to manage
- Network hop for inference
- More infrastructure

**Implementation**: Create new `apps/inference-service/`

## Implementation Guide

### For Your Demo Environment on GCP

Based on your existing setup at `demo.kentron.ai`, here's the recommended path:

#### Step 1: Enable Startup Preloading

Modify the gateway to preload models at startup:

**File**: `apps/controlnet/gateway/main.py`

```python
# Around line 73, change from:
asyncio.create_task(initialize_onnx_models(enable=True))

# To:
await initialize_onnx_models(enable=True)
```

#### Step 2: Configure Cloud Run with Persistent Model Cache

**File**: `infra/terraform/main.tf`

```hcl
resource "google_cloud_run_v2_service" "controlnet" {
  # ... existing config ...
  
  containers {
    # Increase memory for model preloading
    resources {
      limits = {
        cpu    = "4"
        memory = "16Gi"  # Increased from 8Gi
      }
    }
    
    env {
      name  = "PRELOAD_ALL_MODELS"
      value = "true"
    }
  }
  
  # Keep at least 1 instance always running to avoid cold starts
  scaling {
    min_instance_count = 1  # Always warm
    max_instance_count = 10
  }
}
```

#### Step 3: Add Readiness Probe

The service should return "ready" only after models are loaded:

```python
@app.get("/readyz")
async def readiness_check():
    """Readiness: models must be loaded"""
    checks = {
        "api": "healthy",
    }
    
    # Check embedding service
    if hasattr(app.state, 'embedding_service'):
        checks["embedding_model"] = "ready"
    else:
        checks["embedding_model"] = "not_loaded"
    
    # Check ONNX models
    from cga_core.onnx_loader import get_onnx_loader
    loader = get_onnx_loader()
    if loader._initialized:
        checks["onnx_models"] = f"ready ({len(loader.list_loaded_models())} loaded)"
    else:
        checks["onnx_models"] = "initializing"
    
    # Only ready if everything is loaded
    ready = all(v == "ready" or "loaded" in str(v) for v in checks.values())
    
    return {
        "status": "ready" if ready else "initializing",
        "checks": checks
    }
```

#### Step 4: Add Startup Warmup Script

Create a simple script to warm up the service:

```bash
#!/bin/bash
# scripts/warmup-controlnet.sh

GATEWAY_URL="${1:-https://demo.kentron.ai}"

echo "🔥 Warming up ControlNet Gateway..."

# Health check (waits for readiness)
while ! curl -sf "${GATEWAY_URL}/readyz" > /dev/null; do
    echo "Waiting for service to be ready..."
    sleep 2
done

echo "✅ Service is ready"

# Make a test request to ensure models are loaded
curl -sf "${GATEWAY_URL}/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: test" \
  -d '{"model": "gpt-3.5-turbo", "messages": [{"role": "user", "content": "test"}]}' \
  > /dev/null

echo "✅ Models are warmed up and ready"
```

## Deployment Workflow

### Development
```bash
# Start local with preloading
./start_local_dev.sh

# Models download and load on first request
# Check logs to see preload status
docker logs -f controlnet-gateway
```

### Staging (GCP)
```bash
# Deploy with preloading enabled
./infra/scripts/deploy-controlnet.sh

# Monitor startup
gcloud run services logs tail controlnet-gateway-dev \
  --region=us-central1 | grep "Preloading"

# Warmup after deployment
./scripts/warmup-controlnet.sh https://demo.kentron.ai
```

### Production
```bash
# Deploy with min_instances=1 to avoid cold starts
gcloud run deploy controlnet-gateway-prod \
  --min-instances=1 \
  --max-instances=10 \
  --memory=16Gi \
  --cpu=4
```

## Monitoring

### Startup Time
```python
# Add to gateway/main.py
startup_time = time.time()
# ... preload models ...
print(f"🎯 Model preloading took {time.time() - startup_time:.2f}s")
```

### Model Memory Usage
```python
import psutil

def log_model_stats():
    process = psutil.Process(os.getpid())
    memory_mb = process.memory_info().rss / 1024 / 1024
    logger.info(f"📊 Model memory: {memory_mb:.0f} MB")
```

### Health Endpoint with Model Status
```python
@app.get("/v1/models/status")
async def model_status():
    """Get status of all loaded models"""
    from cga_core.onnx_loader import get_onnx_loader
    
    loader = get_onnx_loader()
    models = loader.list_loaded_models()
    
    return {
        "total_models": len(models),
        "loaded_models": models,
        "memory_usage_mb": psutil.Process().memory_info().rss / 1024 / 1024
    }
```

## Performance Targets

With preloaded models:
- **Inference latency**: < 5ms (was 50ms with lazy loading)
- **Cold start**: 45-90s (first time), 30-60s (cached)
- **Memory overhead**: ~2-3GB for all models
- **Model loading**: All at startup (blocking)

## Cost Analysis

### Without Preloading (Lazy Load)
- First request: 45-60s (model download)
- Cold starts: Expensive (multi-call model loading)
- Memory: Low (loads on demand)

### With Preloading
- Cold start: 45-90s (one-time, during startup)
- Memory: +2-3GB per instance
- CPU: No additional cost
- Benefit: Always fast inference

**ROI**: Worth it if:
- Traffic > 10 req/s sustained
- Cold start frequency > 1/day
- Inference speed matters (real-time)

## Next Steps

1. **Immediate**: Enable startup preloading (Option A)
2. **Next Sprint**: Docker image preloading (Option B)
3. **Future**: Dedicated inference service (Option C)

Choose based on traffic patterns and cost constraints.

