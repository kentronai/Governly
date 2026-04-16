# ONNX Inference Service

Lightweight, high-performance ONNX model inference service for AI governance.

## Overview

- **Preloads models on startup** from database → Fast inference (100-300ms)
- **No environment variables** → Remote inference is the default
- **Internal Docker network** → Accessed via `http://onnx-service:8002`
- **Nginx routing** → External access via `/infer` endpoint

## Architecture

```
ControlNet Gateway → http://onnx-service:8002/infer → ONNX Service
                                                        ↓
                                                   Cached Models
                                                   (in-memory)
```

## Key Features

- ⚡ **Fast**: Models preloaded in memory (no GCS download latency)
- 🔒 **Type-safe**: Pydantic validation for all requests/responses
- 📊 **Observable**: Structured logging with latency tracking
- 🚀 **Scalable**: Runs on Cloud Run with auto-scaling
- 🧬 **Functional**: Pure functions with Either error handling

## API Endpoints

### POST /infer
Run inference for a single risk category.

**Request:**
```json
{
  "prompt": "Your text here",
  "risk_category": "toxicity"
}
```

**Response:**
```json
{
  "model_id": "toxicity-bert-v1",
  "model_name": "Toxicity Detector",
  "risk_category": "toxicity",
  "predictions": [
    {"class_index": 0, "confidence": 0.95}
  ],
  "max_confidence": 0.95,
  "latency_ms": 120.5
}
```

### POST /infer/batch
Run inference for multiple risk categories.

**Request:**
```json
{
  "prompt": "Your text here",
  "risk_categories": ["toxicity", "jailbreak", "pii"]
}
```

### GET /health
Health check endpoint.

### GET /cache/stats
Get statistics about loaded models.

## Development

### Local Testing
```bash
# Run service locally
cd apps/onnx-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8002

# Test inference
curl -X POST http://localhost:8002/infer \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test", "risk_category": "toxicity"}'
```

### Docker Compose
```bash
# Start all services (including ONNX)
docker-compose up -d

# Check logs
docker logs controlnet-onnx-service

# Test via nginx
curl -X POST http://localhost/infer \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test", "risk_category": "toxicity"}'
```

## Deployment

### Cloud Run
```bash
# Deploy to GCP Cloud Run
./infra/scripts/deploy-onnx-service.sh dev

# Service will be available at:
# https://onnx-inference-service-dev-<region>.run.app
```

## Configuration

Uses same `.env` file as controlnet gateway:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string (optional)
- `GCS_MODEL_BUCKET` - GCS bucket for ONNX models
- `ONNX_MODEL_CACHE_PATH` - Local cache path (default: `/app/model_cache`)
- `LOG_LEVEL` - Logging level (default: `INFO`)

## Code Structure

```
apps/onnx-service/
├── main.py              # FastAPI app with endpoints
├── config.py            # Settings (Pydantic)
├── db.py                # Database connection
├── model_loader.py      # Model preloading logic
├── inference.py         # Inference engine
├── middleware.py        # Logging middleware
├── logging_config.py    # Logging setup
├── Dockerfile           # Container image
└── requirements.txt     # Python dependencies
```

## Performance

| Metric | Value |
|--------|-------|
| **Inference Time** | 100-300ms |
| **Model Load Time** | Instant (preloaded) |
| **Concurrent Requests** | 80 per instance |
| **Memory Usage** | 2-4GB (depends on models) |
| **CPU** | 8 vCPU (Cloud Run) |

## Integration

The controlnet gateway automatically uses the remote ONNX service:

```python
# apps/controlnet/cga_core/onnx_client.py
ONNX_SERVICE_URL = "http://onnx-service:8002"

# No environment variables needed - remote is the default!
```

## Monitoring

- Check health: `curl http://localhost/infer/health`
- View cache: `curl http://localhost/infer/cache/stats`
- Logs: `docker logs controlnet-onnx-service`

