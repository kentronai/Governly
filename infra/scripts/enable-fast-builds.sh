#!/bin/bash
# Quick-win script to enable fast Docker builds
# Run this once to set up build caching

set -e

echo "🚀 Enabling Docker BuildKit and Build Caching"
echo "=============================================="

# 1. Enable BuildKit in Docker config
echo ""
echo "📝 Step 1: Configuring Docker BuildKit..."

DOCKER_CONFIG="$HOME/.docker/config.json"
mkdir -p "$HOME/.docker"

if [ -f "$DOCKER_CONFIG" ]; then
    echo "   Docker config exists, backing up..."
    cp "$DOCKER_CONFIG" "$DOCKER_CONFIG.backup"
fi

# Enable BuildKit
cat > "$DOCKER_CONFIG" <<EOF
{
  "features": {
    "buildkit": true
  },
  "experimental": "enabled"
}
EOF

echo "   ✅ BuildKit enabled"

# 2. Add environment variables to shell profile
echo ""
echo "📝 Step 2: Adding BuildKit env vars to shell..."

SHELL_RC=""
if [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
fi

if [ -n "$SHELL_RC" ]; then
    # Check if already added
    if ! grep -q "DOCKER_BUILDKIT" "$SHELL_RC"; then
        cat >> "$SHELL_RC" <<'EOF'

# Docker BuildKit (added by enable-fast-builds.sh)
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
EOF
        echo "   ✅ Environment variables added to $SHELL_RC"
    else
        echo "   ℹ️  Environment variables already present"
    fi
fi

# 3. Export for current session
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# 4. Build and push base image (if GCP configured)
echo ""
echo "📝 Step 3: Building base image..."
echo "   This will take 3-5 minutes (first time only)"

PROJECT_ID=$(gcloud config get-value project)
if [ -z "$PROJECT_ID" ]; then
  echo "❌ GCP project not set. Run: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

REGION=${GCP_REGION:-us-central1}
BASE_IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/ai-governance/base:latest"

if docker build --platform linux/amd64 \
    -t ai-governance-base:latest \
    -t "$BASE_IMAGE" \
    -f infra/Dockerfile.base \
    .; then
    echo "   ✅ Base image built successfully"
    
    # Ask if user wants to push to GCP
    echo ""
    read -p "   Push to GCP Artifact Registry? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if docker push "$BASE_IMAGE"; then
            echo "   ✅ Base image pushed to $BASE_IMAGE"
            
            # Update Dockerfile to use base image
            echo ""
            echo "📝 Step 4: Update Dockerfile to use base image..."
            echo "   Add this to apps/controlnet/Dockerfile:"
            echo ""
            echo "   FROM $BASE_IMAGE"
            echo "   # ... rest of Dockerfile ..."
        else
            echo "   ⚠️  Push failed - make sure you're authenticated:"
            echo "      gcloud auth configure-docker $REGION-docker.pkg.dev"
        fi
    fi
else
    echo "   ⚠️  Base image build failed"
fi

# 5. Test build speed
echo ""
echo "📝 Step 5: Testing build speed..."
echo "   Building controlnet with cache..."

time docker-compose -f docker-compose.dev.yml build controlnet

echo ""
echo "=============================================="
echo "✅ Fast builds enabled!"
echo ""
echo "📊 Expected improvements:"
echo "   • First build: Same as before (~6-8 min)"
echo "   • Subsequent builds: 1-2 min (5-8x faster!)"
echo ""
echo "🔄 Restart your terminal or run:"
echo "   source $SHELL_RC"
echo ""
echo "📚 Next steps:"
echo "   1. Try: docker-compose build (should be much faster now)"
echo "   2. Read: docs/tech/speed-up-builds-cloud-dev.md"
echo "   3. Consider: GitHub Codespaces for instant startup"
echo ""

