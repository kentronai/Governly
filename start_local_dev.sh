#!/bin/bash

# Rapid Local Development - Fast iteration with hot reload
# ControlNet runs locally with Docker volumes (hot reload)
# Web runs locally (hot reload)
# Uses local PostgreSQL and Redis. GCP-backed model/GCS features are optional.
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║    Rapid Local Development Mode         ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}This mode provides:${NC}"
echo -e "  ⚡ Instant hot reload (no rebuild)"
echo -e "  🚀 Fast iteration (< 1 second)"
echo -e "  🐳 Uses local PostgreSQL and Redis"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env from .env.example...${NC}"
    cp .env.example .env
fi

echo -e "${GREEN}Starting services...${NC}"

# Start stateful/backend services first. Next.js runs natively on the host to
# avoid Docker Desktop bind-mount latency during route compilation and HMR.
docker compose -f docker-compose.dev.yml up -d --wait --wait-timeout 600 \
    postgres redis migrate controlnet onnx-service model-guard

if ! curl -fsS http://127.0.0.1:3001/sign-in >/dev/null 2>&1; then
    if [ ! -x apps/web/node_modules/.bin/next ]; then
        echo -e "${YELLOW}Installing web dependencies...${NC}"
        (cd apps/web && npm install)
    fi

    echo -e "${GREEN}Starting host-native Next.js...${NC}"
    (
        cd apps/web
        mkdir -p .next
        nohup npm run dev:turbo > .next/host-dev.log 2>&1 &
        echo $! > .next/host-dev.pid
    )

    web_ready=false
    for attempt in $(seq 1 90); do
        if curl -fsS http://127.0.0.1:3001/sign-in >/dev/null 2>&1; then
            web_ready=true
            break
        fi
        sleep 1
    done
    if [ "$web_ready" != "true" ]; then
        echo -e "${RED}Next.js did not become ready. Check apps/web/.next/host-dev.log${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}Reusing the host Next.js server already running on port 3001.${NC}"
fi

# Nginx starts only after its host-native web upstream is reachable, avoiding
# transient 502 responses during startup.
docker compose -f docker-compose.dev.yml up -d nginx

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Development Environment Ready      ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Access:${NC}"
echo -e "  ${YELLOW}https://localhost${NC}          → Web App"
echo -e "  ${YELLOW}http://localhost/v1/${NC}        → ControlNet API (LOCAL - hot reload)"
echo -e "  ${YELLOW}http://localhost/docs${NC}        → API Docs"
echo -e "  ${YELLOW}https://demo.kentron.ai/v1/${NC}  → Remote GCP Gateway (production)"
echo ""
echo -e "${GREEN}Features:${NC}"
echo -e "  ✓ Hot reload enabled (edit code → auto-restart)"
echo -e "  ✓ No rebuild needed"
echo -e "  ✓ Fast iteration (< 1 sec)"
echo -e "  ✓ Uses local Redis"
echo -e "  ✓ Uses local PostgreSQL"
echo -e "  ⚠ GCS/remote model features require GCP credentials"
echo ""
echo -e "${YELLOW}Note: This is for active development only.${NC}"
echo -e "${YELLOW}Production deployments still use GCP.${NC}"
echo ""

echo -e "${GREEN}View logs:${NC}"
echo -e "  ${YELLOW}docker compose -f docker-compose.dev.yml logs -f controlnet${NC}"
echo ""
echo -e "${GREEN}Stop:${NC}"
echo -e "  ${YELLOW}docker compose -f docker-compose.dev.yml down${NC}"
echo ""
