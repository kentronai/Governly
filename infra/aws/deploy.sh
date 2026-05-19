#!/bin/bash
# Deploys Kentron to EC2: syncs code, builds images, starts services, runs migrations
# Usage: bash infra/aws/deploy.sh [EC2_PUBLIC_IP]
# If EC2_PUBLIC_IP is omitted, reads from infra/aws/.ec2_ip
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
die()     { echo -e "${RED}[ERR]${NC}   $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
KEY_FILE="${SCRIPT_DIR}/kentron-deployer.pem"
REMOTE_DIR="/opt/kentron"

# Determine EC2 IP
if [ $# -eq 1 ]; then
  EC2_IP="$1"
elif [ -f "${SCRIPT_DIR}/.ec2_ip" ]; then
  EC2_IP=$(cat "${SCRIPT_DIR}/.ec2_ip")
else
  die "EC2 IP not found. Pass as argument or run provision.sh first."
fi

SSH="ssh -o StrictHostKeyChecking=no -i ${KEY_FILE} ubuntu@${EC2_IP}"

echo "╔══════════════════════════════════════════════╗"
echo "║   Kentron — Deploy to EC2                   ║"
echo "╚══════════════════════════════════════════════╝"
info "Target: ${EC2_IP}"
info "Project: ${PROJECT_ROOT}"
echo ""

# ── Preflight checks ─────────────────────────────────────────────────────────
[ -f "${KEY_FILE}" ] || die "SSH key not found: ${KEY_FILE}"

ENV_FILE="${PROJECT_ROOT}/.env.prod"
if [ ! -f "${ENV_FILE}" ]; then
  ENV_FILE="${PROJECT_ROOT}/.env"
  warn ".env.prod not found, using .env instead"
fi
[ -f "${ENV_FILE}" ] || die "No .env or .env.prod found in ${PROJECT_ROOT}"
info "Using env file: ${ENV_FILE}"

# Test SSH connectivity
info "Testing SSH connection to ${EC2_IP}..."
$SSH "echo 'SSH OK'" || die "SSH connection failed. Is the instance running and bootstrap complete?"
success "SSH connection OK"

# ── Sync project files ───────────────────────────────────────────────────────
info "Syncing project files to ${REMOTE_DIR}..."
rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude '.env' \
  --exclude '.env.prod' \
  --exclude '.env.local' \
  --exclude 'infra/aws/*.pem' \
  --exclude 'infra/aws/.ec2_*' \
  -e "ssh -o StrictHostKeyChecking=no -i ${KEY_FILE}" \
  "${PROJECT_ROOT}/" "ubuntu@${EC2_IP}:${REMOTE_DIR}/"
success "Project files synced"

# ── Copy .env ────────────────────────────────────────────────────────────────
info "Copying environment file..."
scp -o StrictHostKeyChecking=no -i "${KEY_FILE}" \
  "${ENV_FILE}" "ubuntu@${EC2_IP}:${REMOTE_DIR}/.env"
success ".env copied to EC2"

# ── Build Docker images ──────────────────────────────────────────────────────
info "Building Docker images on EC2 (this may take 5-15 minutes first time)..."
$SSH "cd ${REMOTE_DIR} && sudo docker compose build --pull 2>&1" || \
$SSH "cd ${REMOTE_DIR} && docker compose build --pull 2>&1"
success "Docker images built"

# ── Start services ───────────────────────────────────────────────────────────
info "Starting all services..."
$SSH "cd ${REMOTE_DIR} && (sudo docker compose up -d 2>&1 || docker compose up -d 2>&1)"
success "Services started"

# ── Wait for Postgres ────────────────────────────────────────────────────────
info "Waiting for PostgreSQL to be healthy..."
for i in $(seq 1 30); do
  STATUS=$($SSH "cd ${REMOTE_DIR} && (sudo docker compose ps --format json 2>/dev/null || docker compose ps --format json 2>/dev/null) | grep -o '\"Health\":\"[^\"]*\"' | grep postgres || true")
  if echo "${STATUS}" | grep -q "healthy"; then
    success "PostgreSQL is healthy"
    break
  fi
  if [ $i -eq 30 ]; then
    warn "Postgres health check timed out — checking logs..."
    $SSH "cd ${REMOTE_DIR} && (sudo docker compose logs postgres --tail=20 || docker compose logs postgres --tail=20)"
    die "PostgreSQL did not become healthy in time"
  fi
  echo -n "."
  sleep 5
done

# ── Run Drizzle migrations ───────────────────────────────────────────────────
info "Running Drizzle database migrations..."
$SSH "cd ${REMOTE_DIR} && (sudo docker compose exec -T web pnpm db:migrate 2>&1 || docker compose exec -T web pnpm db:migrate 2>&1)"
success "Drizzle migrations complete"

# ── Health check ─────────────────────────────────────────────────────────────
info "Checking service health..."
sleep 10
$SSH "cd ${REMOTE_DIR} && (sudo docker compose ps || docker compose ps)"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Deployment Complete!                       ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
success "App is running at: http://${EC2_IP}"
success "App URL (after DNS): http://app.kentron.ai"
echo ""
echo "Next steps:"
echo "  1. Ensure DNS: app.kentron.ai A ${EC2_IP}"
echo "  2. Enable HTTPS: bash infra/aws/ssl-setup.sh ${EC2_IP}"
echo ""
echo "Useful commands:"
echo "  View logs:    ssh -i ${KEY_FILE} ubuntu@${EC2_IP} 'cd /opt/kentron && sudo docker compose logs -f'"
echo "  Restart app:  ssh -i ${KEY_FILE} ubuntu@${EC2_IP} 'cd /opt/kentron && sudo docker compose restart'"
echo "  App status:   ssh -i ${KEY_FILE} ubuntu@${EC2_IP} 'cd /opt/kentron && sudo docker compose ps'"
