FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for ONNX Runtime
RUN apt-get update && apt-get install -y \
    libgomp1 \
    libprotobuf32 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user early (matches ControlNet pattern)
RUN groupadd -r onnx && useradd -r -g onnx onnx

# Install uv for fast dependency management
RUN pip install --no-cache-dir uv

# Copy pyproject.toml first for better caching
COPY pyproject.toml ./

# Install Python dependencies using uv
RUN uv pip install --system -r pyproject.toml

# Copy application code
COPY *.py ./

# Create cache directories with proper permissions
RUN mkdir -p /app/model_cache && chmod 777 /app/model_cache
RUN mkdir -p /tmp/transformers_cache && chmod 777 /tmp/transformers_cache

# Set ownership
RUN chown -R onnx:onnx /app

# Switch to non-root user
USER onnx

# Environment variables
ENV ONNX_MODEL_CACHE_PATH=/app/model_cache
ENV TRANSFORMERS_CACHE=/tmp/transformers_cache
ENV HF_HOME=/tmp/transformers_cache
ENV PORT=8002
ENV PYTHONUNBUFFERED=1

# Expose port (Cloud Run will set PORT=8080)
EXPOSE 8002 8080

# Health check (use PORT env var, fallback to 8002)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD sh -c 'curl -f http://localhost:${PORT:-8002}/health || exit 1'

# Run the service (Cloud Run sets PORT=8080, local uses 8002)
# Use exec form to ensure proper signal handling and PORT env var usage
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8002}"]

