FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libmagic1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching (use minimal by default)
COPY requirements.txt ./

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create scan cache directory
RUN mkdir -p /tmp/model-guard-scans

# Expose port
EXPOSE 8001

# Run the application
CMD ["uvicorn", "gateway.main:app", "--host", "0.0.0.0", "--port", "8001"]
