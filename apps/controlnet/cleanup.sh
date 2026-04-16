#!/bin/bash

# Guardrails Cleanup Script
# Kills all running guardrails processes and frees up ports

echo "🧹 Cleaning up Guardrails processes..."

# Kill by process name
echo "Killing uvicorn processes..."
pkill -f "uvicorn gateway.main:app" 2>/dev/null || true

echo "Killing demo server processes..."
pkill -f "python demo/server.py" 2>/dev/null || true

# Kill by port
echo "Freeing port 8000..."
lsof -ti:8000 | xargs kill -9 2>/dev/null || true

echo "Freeing port 3000..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Wait and verify
sleep 1

# Check if ports are free
if lsof -ti:8000 >/dev/null 2>&1; then
    echo "⚠️  Port 8000 still in use, force killing..."
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true
else
    echo "✅ Port 8000 is free"
fi

if lsof -ti:3000 >/dev/null 2>&1; then
    echo "⚠️  Port 3000 still in use, force killing..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
else
    echo "✅ Port 3000 is free"
fi

echo "🎉 Cleanup complete! All guardrails processes stopped."