#!/bin/bash

# Rapid Local Development - Fast iteration with hot reload
# ControlNet runs locally with Docker volumes (hot reload)
# Web runs locally (hot reload)
# Uses remote GCP services (Redis, GCS, Database)
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
echo -e "  🔗 Uses remote GCP services"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env from .env.example...${NC}"
    cp .env.example .env
fi

echo -e "${GREEN}Starting services...${NC}"

# Start with docker-compose (uses volumes for hot reload)
docker compose -f docker-compose.dev.yml up -d

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Development Environment Ready      ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Access:${NC}"
echo -e "  ${YELLOW}http://localhost${NC}           → Web App"
echo -e "  ${YELLOW}http://localhost/v1/${NC}        → ControlNet API (LOCAL - hot reload)"
echo -e "  ${YELLOW}http://localhost/docs${NC}        → API Docs"
echo -e "  ${YELLOW}https://demo.kentron.ai/v1/${NC}  → Remote GCP Gateway (production)"
echo ""
echo -e "${GREEN}Features:${NC}"
echo -e "  ✓ Hot reload enabled (edit code → auto-restart)"
echo -e "  ✓ No rebuild needed"
echo -e "  ✓ Fast iteration (< 1 sec)"
echo -e "  ✓ Uses remote GCP Redis"
echo -e "  ✓ Uses remote GCP Database"
echo ""
echo -e "${YELLOW}Note: This is for active development only.${NC}"
echo -e "${YELLOW}Production deployments still use GCP.${NC}"
echo ""

echo -e "${GREEN}View logs:${NC}"
echo -e "  ${YELLOW}docker-compose -f docker-compose.dev.yml logs -f controlnet${NC}"
echo ""
echo -e "${GREEN}Stop:${NC}"
echo -e "  ${YELLOW}docker-compose -f docker-compose.dev.yml down${NC}"
echo ""

