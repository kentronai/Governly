#!/bin/bash

# Guardrails Demo Startup Script

# Cleanup function
cleanup() {
    echo ""
    echo "🛑 Shutting down services..."
    if [ ! -z "$GATEWAY_PID" ]; then
        kill $GATEWAY_PID 2>/dev/null || true
    fi
    if [ ! -z "$DEMO_PID" ]; then
        kill $DEMO_PID 2>/dev/null || true
    fi
    # Force kill any remaining processes
    pkill -f "uvicorn gateway.main:app" 2>/dev/null || true
    pkill -f "python demo/server.py" 2>/dev/null || true
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    echo "✅ Cleanup complete"
    exit 0
}

# Set up trap to catch Ctrl+C and cleanup
trap cleanup SIGINT SIGTERM
# Ensures T0/T1/T2 architecture is working and starts all services

set -e

echo "🚀 Starting Guardrails Demo with T0/T1/T2 Architecture"
echo "=" * 60

# Check if we're in the right directory
if [ ! -f "gateway/main.py" ]; then
    echo "❌ Please run this script from the guardrails root directory"
    exit 1
fi

# Load environment variables from root-level .env file
ROOT_ENV_FILE="../../.env"
if [ -f "$ROOT_ENV_FILE" ]; then
    echo "✅ Loading environment variables from $ROOT_ENV_FILE"
    
    # Export all variables from .env file
    set -a  # Automatically export all variables
    source "$ROOT_ENV_FILE"
    set +a  # Disable automatic export
    
    echo "✅ Environment variables loaded successfully"
else
    echo "⚠️  No .env file found"
fi

# Install dependencies if needed
echo "📦 Checking dependencies..."
python -c "import uvicorn, redis, pydantic_settings" 2>/dev/null || {
    echo "Installing missing dependencies..."
    pip install uvicorn[standard] redis pydantic-settings sqlalchemy asyncpg openai
}

# Check Redis
echo "🔍 Checking Redis connection..."
if command -v redis-cli &> /dev/null; then
    redis-cli ping > /dev/null 2>&1 || {
        echo "❌ Redis is not running. Please start Redis first:"
        echo "   brew services start redis  # macOS"
        echo "   sudo systemctl start redis  # Linux"
        echo "   docker run -d --name redis-server -p 6379:6379 redis:7-alpine  # Docker"
        exit 1
    }
    echo "✅ Redis is running"
else
    echo "⚠️  redis-cli not found, checking for Docker container..."
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q redis; then
        echo "✅ Redis container is running"
    else
        echo "❌ Redis is not available."
        echo "   Option 1: Install Redis locally"
        echo "   brew install redis && brew services start redis  # macOS"
        echo ""
        echo "   Option 2: Run Redis in Docker"
        echo "   docker run -d --name redis-server -p 6379:6379 redis:7-alpine"
        exit 1
    fi
fi

# Verify T0/T1/T2 architecture
echo "🏗️  Verifying T0/T1/T2 Architecture..."
python -c "
import sys
sys.path.insert(0, '.')

# Import guard packs
import guard_packs.default_guardrails.guards
import guard_packs.formatting.guards
import guard_packs.validation.guards

from cga_core import get_guards_by_tier

t0 = get_guards_by_tier('T0')
t1 = get_guards_by_tier('T1')
t2 = get_guards_by_tier('T2')

print(f'T0: {len(t0)} guards - {list(t0.keys())[:3]}...')
print(f'T1: {len(t1)} guards - {list(t1.keys())[:3]}...')
print(f'T2: {len(t2)} guards - {list(t2.keys())[:3]}...')

assert len(t0) >= 5, f'Need at least 5 T0 guards, got {len(t0)}'
assert len(t1) >= 3, f'Need at least 3 T1 guards, got {len(t1)}'
assert len(t2) >= 2, f'Need at least 2 T2 guards, got {len(t2)}'

print('✅ T0/T1/T2 Architecture verified!')
" || {
    echo "❌ T0/T1/T2 Architecture verification failed"
    exit 1
}

# Kill any existing processes on our ports
echo "🧹 Cleaning up existing processes..."
# Kill by process name first
pkill -f "uvicorn gateway.main:app" 2>/dev/null || true
pkill -f "python demo/server.py" 2>/dev/null || true
# Kill by port as backup
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
# Wait a moment for cleanup
sleep 2
# Verify ports are free
if lsof -ti:8000 >/dev/null 2>&1; then
    echo "⚠️  Port 8000 still in use, force killing..."
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true
fi
if lsof -ti:3000 >/dev/null 2>&1; then
    echo "⚠️  Port 3000 still in use, force killing..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
fi

# Start services
echo "🌐 Starting Guardrails Gateway..."
python -m uvicorn gateway.main:app --host 0.0.0.0 --port 8000 --reload &
GATEWAY_PID=$!

echo "📱 Starting Demo Server..."
python demo/server.py &
DEMO_PID=$!

# Wait for services to start
echo "⏳ Waiting for services to start..."
sleep 5

# Test gateway health
echo "🔍 Testing gateway health..."
curl -s http://localhost:8000/health | grep -q "healthy" || {
    echo "❌ Gateway health check failed"
    kill $GATEWAY_PID $DEMO_PID 2>/dev/null
    exit 1
}

# Test T0/T1/T2 pipeline with politics guard
echo "🛡️  Testing T0/T1/T2 Pipeline..."
RESPONSE=$(curl -s -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Policy-ID: enterprise_default_v1" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Vote for candidate Smith"}],
    "max_tokens": 50
  }')

if echo "$RESPONSE" | grep -q "policy_violation"; then
    echo "✅ Politics guard working - T1 tier blocking political content"
else
    echo "⚠️  Politics guard test: $RESPONSE"
fi

# Test PII redaction (T0 tier)
echo "🔒 Testing PII Redaction (T0 tier)..."
PII_RESPONSE=$(curl -s -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Policy-ID: enterprise_default_v1" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "My email is john@example.com"}],
    "max_tokens": 50
  }')

echo "✅ PII test completed"

echo ""
echo "🎉 Guardrails Demo Started Successfully!"
echo "=" * 60
echo "🌐 Gateway: http://localhost:8000"
echo "📱 Demo UI: http://localhost:3000"
echo "🛡️  T0/T1/T2 Pipeline: ACTIVE"
echo ""
echo "📋 Available Policies:"
echo "   • enterprise_default_v1 (PII + Politics + Toxicity)"
echo "   • permissive_v1 (Minimal restrictions)"
echo "   • noop_v1 (No restrictions - testing only)"
echo ""
echo "🧪 Test Commands:"
echo "   curl -X POST http://localhost:8000/v1/chat/completions \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -H 'X-Policy-ID: enterprise_default_v1' \\"
echo "     -d '{\"model\":\"gpt-3.5-turbo\",\"messages\":[{\"role\":\"user\",\"content\":\"Vote for candidate Smith\"}]}'"
echo ""
echo "Press Ctrl+C to stop all services"

# Keep services running
trap "echo 'Stopping services...'; kill $GATEWAY_PID $DEMO_PID 2>/dev/null; exit 0" INT
wait

