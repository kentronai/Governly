#!/bin/bash

# ControlNet Platform - Docker Startup Script
# Runs the platform locally using GCP Cloud SQL database

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ControlNet Platform - Local Docker Deployment     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}✗ Docker is not running. Please start Docker Desktop.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker is running${NC}"

# Check for OpenAI API key
if [ -z "$OPENAI_API_KEY" ]; then
    echo -e "${YELLOW}⚠ OPENAI_API_KEY not set in environment${NC}"
    echo -e "  Export it: ${YELLOW}export OPENAI_API_KEY=sk-your-key${NC}"
fi

# Stop any existing containers
echo -e "\n${YELLOW}Stopping existing containers...${NC}"
docker-compose down 2>/dev/null || true

# Start Redis (required)
echo -e "\n${YELLOW}Starting Redis...${NC}"
docker-compose up -d redis

# Wait for Redis
echo "Waiting for Redis to be ready..."
until docker-compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; do
    sleep 1
done
echo -e "${GREEN}✓ Redis ready${NC}"

# Run migrations (connects to GCP Cloud SQL)
echo -e "\n${YELLOW}Running database migrations...${NC}"
docker-compose up migrate

# Build and start ControlNet gateway
echo -e "\n${YELLOW}Building and starting ControlNet gateway...${NC}"
docker-compose up -d --build controlnet

# Wait for ControlNet to be healthy
echo "Waiting for ControlNet to be ready..."
for i in {1..30}; do
    if curl -sf http://localhost:8000/healthz > /dev/null 2>&1; then
        echo -e "${GREEN}✓ ControlNet ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}✗ ControlNet failed to start${NC}"
        docker-compose logs controlnet
        exit 1
    fi
    sleep 2
done

# Build and start Web app
echo -e "\n${YELLOW}Building and starting Web app...${NC}"
docker-compose up -d --build web

# Wait for Web to be healthy
echo "Waiting for Web app to be ready..."
for i in {1..60}; do
    if docker-compose exec -T web curl -sf http://localhost:8080 > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Web app ready${NC}"
        break
    fi
    if [ $i -eq 60 ]; then
        echo -e "${RED}✗ Web app failed to start (check logs with: docker-compose logs web)${NC}"
        exit 1
    fi
    sleep 3
done

# Start nginx reverse proxy
echo -e "\n${YELLOW}Starting nginx reverse proxy...${NC}"
docker-compose up -d nginx

# Wait for nginx
echo "Waiting for nginx to be ready..."
for i in {1..10}; do
    if curl -sf http://localhost/healthz > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Nginx ready${NC}"
        break
    fi
    sleep 1
done

echo -e "\n${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              🎉 Platform is Ready! 🎉                ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Access Points (Single URL via nginx):${NC}"
echo -e "  • Platform:          ${YELLOW}http://localhost${NC}"
echo -e "  • Web Dashboard:     ${YELLOW}http://localhost/${NC}"
echo -e "  • ControlNet API:    ${YELLOW}http://localhost/api/${NC}"
echo -e "  • API Documentation: ${YELLOW}http://localhost/docs${NC}"
echo ""
echo -e "${GREEN}Database:${NC}"
echo -e "  • GCP Cloud SQL:     ${YELLOW}controlnet_dev_db${NC}"
echo -e "  • Host:              ${YELLOW}35.226.217.212:5432${NC}"
echo ""
echo -e "${GREEN}View Logs:${NC}"
echo -e "  ${YELLOW}docker-compose logs -f controlnet${NC}  # ControlNet logs"
echo -e "  ${YELLOW}docker-compose logs -f web${NC}         # Web logs"
echo -e "  ${YELLOW}docker-compose logs -f${NC}             # All logs"
echo ""
echo -e "${GREEN}Stop Platform:${NC}"
echo -e "  ${YELLOW}docker-compose down${NC}"
echo ""

