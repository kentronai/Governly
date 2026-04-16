#!/bin/bash

# Clear all caches that might be causing healthz requests

echo "🧹 Comprehensive Cache Cleanup"
echo "=============================="

# 1. Kill all server processes
echo "1. Killing server processes..."
pkill -f "uvicorn gateway.main:app" 2>/dev/null || true
pkill -f "python demo/server.py" 2>/dev/null || true
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# 2. Clear Python cache
echo "2. Clearing Python cache..."
find . -name "*.pyc" -delete 2>/dev/null || true
find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true

# 3. Clear any temporary files
echo "3. Clearing temporary files..."
rm -rf .pytest_cache 2>/dev/null || true
rm -rf htmlcov 2>/dev/null || true
rm -rf .coverage 2>/dev/null || true

# 4. Instructions for browser cache
echo "4. Browser Cache Instructions:"
echo "   🌐 Close ALL browser tabs pointing to localhost:8000 or localhost:3000"
echo "   🔄 Clear browser cache (Cmd+Shift+Delete on Mac)"
echo "   🔌 Disable any API monitoring browser extensions"
echo "   📱 Close browser developer tools"

# 5. Check for IDE extensions
echo "5. IDE/Editor Check:"
echo "   💻 Check your IDE/editor for extensions that might monitor APIs"
echo "   🔍 Look for 'REST Client', 'API Monitor', or similar extensions"
echo "   ⚙️  Disable any extensions that auto-ping health endpoints"

# 6. Wait and verify
echo "6. Waiting 5 seconds for cleanup..."
sleep 5

# 7. Verify ports are free
if lsof -ti:8000 >/dev/null 2>&1; then
    echo "⚠️  Port 8000 still in use!"
    lsof -i :8000
else
    echo "✅ Port 8000 is free"
fi

if lsof -ti:3000 >/dev/null 2>&1; then
    echo "⚠️  Port 3000 still in use!"
    lsof -i :3000
else
    echo "✅ Port 3000 is free"
fi

echo ""
echo "🎯 Next Steps:"
echo "1. Make sure ALL browser tabs to localhost are closed"
echo "2. Clear browser cache completely"
echo "3. Restart the server with: ./start_demo.sh"
echo "4. If healthz requests still appear, check the server logs for User-Agent"
echo ""
echo "✅ Cache cleanup complete!"
