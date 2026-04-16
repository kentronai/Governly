#!/bin/bash

# ControlNet Platform - Local Web App with Remote Gateway
# Runs web app locally, proxies API to GCP gateway
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ControlNet - Local Web + Remote API   ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js not found${NC}"
    echo "Install Node.js from: https://nodejs.org/"
    exit 1
fi

echo -e "${BLUE}Gateway: https://demo.kentron.ai${NC}"
echo ""

# Navigate to web app
cd apps/web

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
    echo -e "${GREEN}✓ Dependencies installed${NC}"
    echo ""
fi

echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Starting Development            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}How it works:${NC}"
echo -e "  📱 Next.js runs locally (port 3000)"
echo -e "  🔄 API calls are proxied to https://demo.kentron.ai"
echo -e "  ⚡ Hot reload enabled for UI changes"
echo ""
echo -e "${GREEN}Access:${NC}"
echo -e "  ${YELLOW}http://localhost:3000${NC}             → Web App"
echo -e "  ${YELLOW}http://localhost:3000/v1/${NC}         → API (proxied to remote)"
echo -e "  ${YELLOW}http://localhost:3000/docs${NC}        → API Docs"
echo -e "  ${YELLOW}http://localhost:3000/healthz${NC}     → Health Check"
echo ""

echo -e "${BLUE}Remote Gateway URLs:${NC}"
echo -e "  ${YELLOW}https://demo.kentron.ai/v1/${NC}            → Direct API access"
echo -e "  ${YELLOW}https://demo.kentron.ai/docs${NC}          → API Documentation"
echo ""

echo -e "${GREEN}Features:${NC}"
echo -e "  ✓ Web app runs locally (hot reload)"
echo -e "  ✓ All API calls proxy to remote GCP gateway"
echo -e "  ✓ No local backend needed"
echo -e "  ✓ No heavy dependencies"
echo -e "  ✓ Edit files → Browser updates instantly"
echo ""

echo -e "${YELLOW}Press CTRL+C to stop${NC}"
echo ""
echo -e "${BLUE}Starting Next.js...${NC}"
echo ""

# Start Next.js dev server
npm run dev

