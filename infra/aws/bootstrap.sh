#!/bin/bash
# Bootstraps an EC2 instance with Docker, Docker Compose, git, certbot
# Usage: bash infra/aws/bootstrap.sh <EC2_PUBLIC_IP>
# Or run directly on the EC2 instance as: bash bootstrap.sh
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[OK]${NC}    $1"; }
die()     { echo -e "${RED}[ERR]${NC}   $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY_FILE="${SCRIPT_DIR}/kentron-deployer.pem"

# If called with an IP argument, SSH in and run this script remotely
if [ $# -eq 1 ]; then
  EC2_IP="$1"
  info "Copying bootstrap script to EC2 ${EC2_IP}..."
  scp -o StrictHostKeyChecking=no -i "${KEY_FILE}" "$0" "ubuntu@${EC2_IP}:/tmp/bootstrap.sh"
  info "Running bootstrap on EC2..."
  ssh -o StrictHostKeyChecking=no -i "${KEY_FILE}" "ubuntu@${EC2_IP}" "bash /tmp/bootstrap.sh"
  success "Bootstrap complete on ${EC2_IP}"
  exit 0
fi

# ── Runs on EC2 ──────────────────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════╗"
echo "║   Kentron — EC2 Bootstrap                   ║"
echo "╚══════════════════════════════════════════════╝"

# Update system
info "Updating system packages..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq
success "System updated"

# Install prerequisites
info "Installing prerequisites..."
sudo apt-get install -y -qq \
  ca-certificates curl gnupg lsb-release git unzip \
  software-properties-common apt-transport-https
success "Prerequisites installed"

# Install Docker
info "Installing Docker CE..."
if command -v docker &>/dev/null; then
  success "Docker already installed: $(docker --version)"
else
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo systemctl enable --now docker
  sudo usermod -aG docker ubuntu
  success "Docker installed: $(docker --version)"
fi

# Install AWS CLI v2
info "Installing AWS CLI v2..."
if command -v aws &>/dev/null; then
  success "AWS CLI already installed: $(aws --version)"
else
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o /tmp/awscliv2.zip 2>/dev/null || \
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
  unzip -q /tmp/awscliv2.zip -d /tmp/
  sudo /tmp/aws/install
  rm -rf /tmp/aws /tmp/awscliv2.zip
  success "AWS CLI installed: $(aws --version)"
fi

# Install certbot (for Let's Encrypt SSL)
info "Installing certbot..."
if command -v certbot &>/dev/null; then
  success "Certbot already installed"
else
  sudo snap install --classic certbot
  sudo ln -sf /snap/bin/certbot /usr/bin/certbot
  success "Certbot installed"
fi

# Create deployment directory
info "Creating /opt/kentron deployment directory..."
sudo mkdir -p /opt/kentron
sudo chown ubuntu:ubuntu /opt/kentron
success "Deployment directory ready: /opt/kentron"

# Install pnpm (needed for Drizzle migrations inside container build)
info "Installing Node.js + pnpm..."
if command -v node &>/dev/null; then
  success "Node.js already installed: $(node --version)"
else
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
  success "Node.js installed: $(node --version)"
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Bootstrap Complete!                        ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "IMPORTANT: Log out and back in (or run 'newgrp docker') before deploying"
echo "so the ubuntu user's docker group membership takes effect."
echo ""
echo "Next: bash infra/aws/deploy.sh <EC2_IP>"
