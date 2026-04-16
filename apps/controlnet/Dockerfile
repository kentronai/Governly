# ControlNet Gateway Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
# Critical: ONNX Runtime requires libgomp1 and libprotobuf for CPU inference
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    libpq5 \
    libgomp1 \
    libprotobuf32 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user early
RUN groupadd -r controlnet && useradd -r -g controlnet controlnet

# Copy and install dependencies FIRST (better layer caching)
COPY pyproject.toml ./
RUN pip install --no-cache-dir -e .[onnx]

# Copy application code (changes more frequently)
COPY gateway ./gateway
COPY cga_core ./cga_core
COPY guard_packs ./guard_packs

# Clean up unnecessary files
RUN find /app -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true && \
    find /app -type f -name "*.pyc" -delete 2>/dev/null || true

# Create credentials directory
RUN mkdir -p /app/credentials

# Create writable directories for ONNX Runtime and ML models
# Cloud Run filesystem is read-only except /tmp, so use /tmp for model cache
RUN mkdir -p /tmp/onnx_cache /tmp/transformers_cache /tmp/huggingface_cache /tmp/model_cache && \
    chmod -R 777 /tmp/onnx_cache /tmp/transformers_cache /tmp/huggingface_cache /tmp/model_cache

# Create model cache directory with proper permissions (for Docker volume mount)
RUN mkdir -p /app/model_cache && \
    chown -R controlnet:controlnet /app/model_cache && \
    chmod -R 777 /app/model_cache

# Set ownership
RUN chown -R controlnet:controlnet /app

USER controlnet

# Set environment
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PORT=8000
# GCS credentials: Uses Application Default Credentials (ADC)
# - Cloud Run: Service account attached to Cloud Run service
# - Local dev: gcloud auth credentials
# ONNX Runtime cache directories (Cloud Run filesystem is read-only except /tmp)
ENV ORT_DYLIB_CACHE=/tmp/onnx_cache
ENV TRANSFORMERS_CACHE=/tmp/transformers_cache
ENV HF_HOME=/tmp/huggingface_cache
ENV ONNX_MODEL_CACHE_PATH=/tmp/model_cache

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8000/healthz || exit 1

# Start with uvicorn
CMD ["uvicorn", "gateway.main:app", "--host", "0.0.0.0", "--port", "8000"]
