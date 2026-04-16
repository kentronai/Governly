# Local vs Remote Development

> Simple guide to developing ControlNet Gateway locally or remotely

## Overview

ControlNet Gateway can run in two ways:
1. **Local**: Everything runs on your machine
2. **Remote**: Gateway runs on GCP, you proxy to it

Both support hot reload.

## Local Development

**Run**: `./start_local_dev.sh`

Runs everything locally:
- ControlNet Gateway (port 8000)
- Web Dashboard (port 3000)  
- Redis cache
- All services connected via Docker

**Hot Reload**: Edit any file → auto-restarts in < 1 second

**Architecture**:
```
localhost (you)
  ├─ ControlNet Gateway  (apps/controlnet)
  ├─ Web Dashboard       (apps/web)
  └─ Redis
```

**Configuration**: `docker-compose.dev.yml`

**When to Use**:
- Writing/editing guard logic
- Testing ONNX models
- Full backend debugging
- Adding new endpoints

## Remote Development (Gateway on GCP)

**Run**: `./start_remote.sh`

Runs frontend locally, proxies API calls to remote gateway:
- Next.js UI on port 3000 (local)
- All API calls → `https://demo.kentron.ai`
- Production database, models, Redis

**Setup**:
```bash
# Just start Next.js
cd apps/web
npm run dev

# API calls automatically proxy to production
```

**Proxy Config**: `apps/web/next.config.js` lines 39-60

```javascript
// Proxies /v1/* to https://demo.kentron.ai/v1/*
async rewrites() {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
  return [{
    source: '/v1/:path*',
    destination: `${backendUrl}/v1/:path*`,
  }];
}
```

**When to Use**:
- Frontend UI work
- Testing with production data
- Quick iterations (no Docker needed)

## Switching Between Local and Remote

**To use remote backend**:
1. Open the repo root `.env`.
2. Set `NEXT_PUBLIC_BACKEND_URL=https://demo.kentron.ai` (or whatever remote origin you need).
3. Restart the web dev server: `cd apps/web && npm run dev`.

**To use local backend**:
1. Update the same entry in `.env` back to `http://localhost:8000`.
2. Restart Docker/local services (`./start_local_dev.sh`) and the web dev server.

## How Models Actually Work (Important!)

### ⚠️ Models Always Run Locally (After Download)

When you run gateway locally, **embeddings and ONNX models download from GCS and run on YOUR machine**, not remotely.

**The Flow**:
```
1. Start gateway locally
2. First embedding call:
   a. Check if model in /tmp/embedding_models/ (already cached?)
   b. If not, download from gs://bucket/embeddings/all-MiniLM-L6-v2/
   c. Store in /tmp/embedding_models/
   d. Load model (SentenceTransformer)
   e. Run inference LOCALLY on your machine
   
3. First ONNX call:
   a. Check if model in /tmp/onnx_models/{tenant_id}/ (already cached?)
   b. If not, download from gs://bucket/models/toxicity.onnx
   c. Store in /tmp/onnx_models/
   d. Load ONNX Runtime session
   e. Run inference LOCALLY on your machine
```

**Files**:
- `apps/controlnet/cga_core/embedding_service.py` (lines 59-103)
- `apps/controlnet/cga_core/model_loader.py` (lines 68-134)

**There is NO remote inference API**. Models always run on your local machine after download.

### Why Download Instead of Remote Inference?

**Current Architecture**:
- Downloads from GCS → Runs locally
- Pros: Fast inference, no latency, works offline after download
- Cons: Need to download (storage), runs on your machine (CPU/RAM)

**Why Not Remote Inference?**
```python
# Would need to add this (doesn't exist):
import requests
embeddings = requests.post("https://inference.example.com/embeddings", {
    "text": prompt
}).json()
```

This isn't implemented because:
1. Adds network latency (every embedding call waits)
2. Requires separate inference service
3. Complex to manage GPU instances
4. More expensive (pay for remote compute)

### When to Use Each Setup

**Option 1: Fully Local**
```bash
./start_local_dev.sh
# Models pre-installed in apps/controlnet/models/
# No GCS download needed
```

**Option 2: Local Gateway + Remote Models**
```bash
export GCS_MODEL_BUCKET="your-bucket"
docker-compose up controlnet
# Models download from GCS on first use
# Then run locally on your machine
```

**Key Point**: There is **NO** "remote inference" mode. Models download, then run locally.

## Hot Reload

Both local and remote support hot reload.

**Local** (`docker-compose.dev.yml` line 55):
```yaml
command: uvicorn gateway.main:app --reload --host 0.0.0.0 --port 8000
```
Edit Python file → Auto-restarts in < 1 second

**Remote (Next.js)**:
Edit React file → Browser updates in < 100ms

## Quick Reference

| Setup | Code Runs | Models Run | Infra | How It Works |
|-------|-----------|------------|-------|--------------|
| **Local** | Your machine | Your machine (pre-installed) | Local Docker | Everything local |
| **Remote Proxy** | GCP Cloud Run | GCP Cloud Run | Remote (GCP) | All compute remote |
| **Local Gateway** | Your machine | Your machine (downloaded from GCS) | Remote (GCP) | Models DOWNLOAD from GCS, then run locally |

## How the Connection Works

### GCS Connection (for downloading models)

**Setup**: `GCS_MODEL_BUCKET` and credentials in `.env`

```bash
# .env
GCS_MODEL_BUCKET=your-bucket
GCS_CREDENTIALS_PATH=./gcs-credentials.json
```

**What Happens**:
```python
# embedding_service.py line 40
self.gcs_bucket = os.getenv("GCS_MODEL_BUCKET")

# Downloads using Google Cloud Storage API
from google.cloud import storage
client = storage.Client()
blob.download_to_filename(local_path)
```

**No HTTP API** - Uses GCS Python SDK directly

### Why Not Remote Inference?

Currently, there's **no remote inference API**. Every embedding/ONNX call:
1. Downloads model from GCS (first time only)
2. Runs inference on YOUR machine

**To add remote inference**, you'd need:
- Separate inference service
- HTTP API for embeddings/ONNX
- Network calls for every inference (latency)

## Common Workflows

### Backend Development
```bash
./start_local_dev.sh
vim apps/controlnet/guard_packs/pii/guards.py
# Save → auto-reloads
# Test at http://localhost/v1/
```

### Frontend Development  
```bash
./start_remote.sh
vim apps/web/src/components/control-net/Overview.tsx
# Save → browser updates
# Tests against production API
```

### Gateway Debugging with Production Data
```bash
export DATABASE_URL="..." 
docker-compose up controlnet
# Use breakpoints, step through code
# Models auto-download from GCS
```

## Answer: Do Embeddings/ONNX Run Remote?

**Short answer: NO** - They download from GCS, then run locally.

**Step by step**:
```
You: Make API call → http://localhost:8000/v1/chat/completions
    ↓
Gateway: Need embeddings for routing
    ↓
EmbeddingService: Check /tmp/embedding_models/
    ↓
If not found: Download from gs://bucket/embeddings/all-MiniLM-L6-v2/
    ↓
Download to: /tmp/embedding_models/all-MiniLM-L6-v2/
    ↓
Load model: SentenceTransformer('/tmp/embedding_models/...')
    ↓
Run inference: model.encode(prompt) ← THIS RUNS ON YOUR MACHINE
    ↓
Return result
```

**Connection to GCS**:
- **What**: Download models via Google Cloud Storage SDK
- **URL**: No HTTP API, uses `gs://bucket/path` (GCS protocol)
- **When**: First use only (then cached)
- **Where runs**: Your local machine

**No remote inference exists**. Everything runs locally after download.

### Code Proof

**Embeddings** (`apps/controlnet/cga_core/embedding_service.py` line 185):
```python
# Runs LOCALLY on your machine
embedding = self._model.encode(
    text,
    convert_to_numpy=True,
    normalize_embeddings=normalize,
    show_progress_bar=False
)
# No HTTP API call - direct SentenceTransformer.encode()
```

**ONNX Models** (`apps/controlnet/guard_packs/onnx/guards.py` line 158):
```python
# Runs LOCALLY on your machine
outputs = session.run(None, inputs)
# No HTTP API call - direct ONNX Runtime session.run()
```

**Model Loading** (`apps/controlnet/cga_core/model_loader.py` line 210):
```python
# Downloads from GCS to /tmp/
resolved_path = resolve_model_path(model_path, gcs_bucket, tenant_id)

# Then loads locally
session = ort.InferenceSession(str(resolved_path), ...)
# Models run on YOUR machine after download
```

**Conclusion**: 100% local inference after GCS download.

## Developer Overhead

### What You Actually Experience

**First Time Setup**:
```bash
# 1. Install dependencies
pip install sentence-transformers onnxruntime

# 2. Download models (automatic, happens on first use):
# - Embedding model: ~80MB (all-MiniLM-L6-v2)
# - ONNX models: ~200-500MB each (toxicity, financial, etc.)
# Total: ~1-2 GB

# 3. Storage: Models cached in /tmp/
```

**Every Day Development**:
```bash
# Start gateway
docker-compose up controlnet

# First API call (if models not cached):
# - Download models: 30-60 seconds (one-time)
# - Store in /tmp/ (persists until reboot)

# Subsequent calls:
# - Use cached models (0 download time)
# - Fast inference (< 50ms per embedding/ONNX call)
```

**Resource Usage on Your Machine**:
- CPU: Models use 1-2 cores when running inference
- RAM: ~500MB-1GB for loaded models
- Storage: 1-2 GB in `/tmp/`
- Network: One-time download (30-60 seconds)

### Is This The Best Solution?

**Current: Download from GCS, Run Locally**

✅ **Pros**:
- Fast inference (no network latency)
- Works offline after download
- Simple architecture (no separate service)
- Free (no compute costs)

❌ **Cons**:
- Initial download time (~30-60s)
- Uses your CPU/RAM
- Storage overhead (~1-2GB)
- Need GCS credentials

**Alternative 1: Remote Inference API**

```python
# Would work like this (not implemented):
embeddings = requests.post("https://inference-api.com/embeddings", {
    "text": prompt
}).json()
```

✅ **Pros**:
- No storage on dev machine
- No CPU usage
- Always latest models

❌ **Cons**:
- Network latency (50-200ms per call)
- Requires separate service
- More complex (auth, deployment)
- Costs money (compute time)
- Doesn't work offline

**Alternative 2: Pre-install in Docker Image**

```dockerfile
# Dockerfile
COPY models/ /app/models/
# Models already in image (no download needed)
```

✅ **Pros**:
- No download time
- Works offline
- Fast inference

❌ **Cons**:
- Large Docker image (1-2GB)
- Slow builds
- Image grows with every model

### Recommendation

**Current approach (download from GCS) is best for development because**:

1. **One-time cost** (30-60s download) vs **every-request cost** (50-200ms latency)
2. **Better for debugging** - Can step through model code locally
3. **Works offline** - No network needed after download
4. **No ongoing costs** - Free compute on your machine

**Only switch to remote inference if**:
- Models are too large for dev machines (>5GB)
- Need specialized GPU hardware
- Multiple developers sharing infrastructure

### Reducing Developer Overhead

**Option 1**: Pre-download in Dockerfile (add to setup)
```dockerfile
# Download models during build
RUN python -c "from sentence_transformers import SentenceTransformer; \
     SentenceTransformer('all-MiniLM-L6-v2')"
```

**Option 2**: Shared dev environment
```bash
# Models on network drive
export MODEL_CACHE_PATH=/shared/team/models
```

**Option 3**: Use smaller models for dev
```python
# Use tiny model for dev, full model for prod
model_name = "sentence-transformers/all-MiniLM-L6-v2"  # 80MB
# vs "all-mpnet-base-v2"  # 400MB
```

## Configuration

**Local Dev**: `docker-compose.dev.yml` - All services with hot reload

**Remote Backend**: Set `NEXT_PUBLIC_BACKEND_URL` in the repo root `.env`

**Nginx Config**: `nginx.conf` - Routes to local services

## Connecting to Containers

### Local Containers

```bash
# Connect to ControlNet Gateway
docker exec -it controlnet-gateway bash

# View logs
docker logs -f controlnet-gateway

# Restart service
docker-compose restart controlnet
```

### Remote Containers (GCP Cloud Run)

Cloud Run doesn't allow SSH, but you can:

**View Logs**:
```bash
# Stream logs live
gcloud run services logs tail controlnet-gateway-dev \
  --region=us-central1

# Recent logs
gcloud run services logs read controlnet-gateway-dev \
  --region=us-central1 --limit=50
```

**Check Status**:
```bash
gcloud run services describe controlnet-gateway-dev \
  --region=us-central1
```

**Debug with Logs**:
```bash
# Search for errors
gcloud run services logs read controlnet-gateway-dev \
  --region=us-central1 | grep ERROR

# Watch specific endpoint
gcloud run services logs tail controlnet-gateway-dev \
  --region=us-central1 | grep "/v1/chat/completions"
```

**Re-deploy for Changes**:
```bash
# After making code changes
./infra/scripts/deploy-controlnet.sh
```

## Tips

1. Keep it simple: Local for backend, remote for frontend
2. Use remote when you need production data
3. Hot reload works in both modes
4. Check logs: `docker logs -f controlnet-gateway` (local)
5. Remote debug via logs (can't SSH into Cloud Run)

## Code References

- `start_local_dev.sh` - Start local everything
- `start_remote.sh` - Start frontend with remote backend
- `docker-compose.dev.yml` - Local Docker setup with hot reload
- `apps/web/next.config.js` - API proxy configuration
- `nginx.conf` - Reverse proxy for local mode
