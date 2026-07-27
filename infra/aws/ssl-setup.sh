#!/bin/bash
# Sets up Let's Encrypt SSL for app.kentron.ai on EC2
# Run AFTER DNS is pointed at the EC2 Elastic IP
# Usage: bash infra/aws/ssl-setup.sh [EC2_PUBLIC_IP]
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
die()     { echo -e "${RED}[ERR]${NC}   $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY_FILE="${SCRIPT_DIR}/kentron-deployer.pem"
DOMAIN="app.kentron.ai"
REMOTE_DIR="/opt/kentron"
EMAIL="satish@kentron.ai"

if [ $# -eq 1 ]; then
  EC2_IP="$1"
elif [ -f "${SCRIPT_DIR}/.ec2_ip" ]; then
  EC2_IP=$(cat "${SCRIPT_DIR}/.ec2_ip")
else
  die "EC2 IP not provided. Pass as argument or run provision.sh first."
fi

SSH="ssh -o StrictHostKeyChecking=no -i ${KEY_FILE} ubuntu@${EC2_IP}"

echo "╔══════════════════════════════════════════════╗"
echo "║   Kentron — SSL Setup (Let's Encrypt)       ║"
echo "╚══════════════════════════════════════════════╝"
info "Domain: ${DOMAIN}"
info "EC2 IP: ${EC2_IP}"

# Verify DNS points to this instance
info "Verifying DNS for ${DOMAIN}..."
RESOLVED=$(dig +short "${DOMAIN}" A 2>/dev/null | head -1 || true)
if [ "${RESOLVED}" != "${EC2_IP}" ]; then
  warn "DNS check: ${DOMAIN} resolves to '${RESOLVED}', expected '${EC2_IP}'"
  warn "SSL certificate request will fail if DNS is not propagated."
  read -p "Continue anyway? (yes/no): " cont
  [ "${cont}" = "yes" ] || die "Aborted. Point DNS first: ${DOMAIN} A ${EC2_IP}"
else
  success "DNS OK: ${DOMAIN} → ${EC2_IP}"
fi

# Run certbot on EC2 (standalone mode — temporarily stops nginx)
info "Obtaining Let's Encrypt certificate for ${DOMAIN}..."
$SSH "
  set -e
  # Stop nginx to free port 80 for certbot standalone
  cd ${REMOTE_DIR}
  sudo docker compose stop nginx 2>/dev/null || docker compose stop nginx
  echo 'nginx stopped'

  # Run certbot
  sudo certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --email ${EMAIL} \
    -d ${DOMAIN}
  echo 'Certificate obtained'
"
success "Certificate obtained"

# Update docker-compose.yml to mount certs and expose 443
info "Updating nginx configuration for HTTPS..."

# Write nginx SSL config on EC2
$SSH "cat > /tmp/nginx_ssl.conf << 'NGINXCONF'
events {
    worker_connections 1024;
}

http {
    upstream web_upstream {
        server web:8080;
    }
    upstream controlnet_upstream {
        server controlnet:8000;
    }
    upstream onnx_upstream {
        server onnx-service:8002;
    }
    # NOTE: model-guard is intentionally NOT deployed in this environment.
    # Do not add a model-guard upstream — nginx would crash-loop on an
    # unresolvable host and take the whole site down.

    # HTTP → HTTPS redirect
    server {
        listen 80;
        server_name ${DOMAIN};
        location /.well-known/acme-challenge/ { root /var/www/certbot; }
        location / { return 301 https://\$host\$request_uri; }
    }

    # Health check (nginx itself)
    server {
        listen 80;
        server_name _;
        location /healthz { return 200 'ok'; add_header Content-Type text/plain; }
    }

    # HTTPS
    server {
        listen 443 ssl;
        server_name ${DOMAIN};

        ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_session_cache shared:SSL:10m;

        client_max_body_size 100M;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;

        # Web app (root)
        location / {
            proxy_pass http://web_upstream;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }

        # ControlNet API
        location /api/controlnet/ {
            proxy_pass http://controlnet_upstream/;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }

        # ONNX Service
        location /api/onnx/ {
            proxy_pass http://onnx_upstream/;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }

        # ControlNet Gateway direct routes (frontend calls these via /v1/*)
        # Bypasses Next.js rewrites so requests reach FastAPI directly.
        location /v1/ {
            proxy_pass http://controlnet_upstream;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_read_timeout 120s;
            client_max_body_size 100M;
        }

        # model-guard is not deployed — fail fast with a clean 503.
        location /modelguard/ {
            default_type application/json;
            return 503 '{\"error\":\"model-guard service is not deployed in this environment\"}';
        }

        location = /docs {
            proxy_pass http://controlnet_upstream;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }

        location = /redoc {
            proxy_pass http://controlnet_upstream;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }
    }
}
NGINXCONF
sudo cp /tmp/nginx_ssl.conf ${REMOTE_DIR}/nginx.conf
echo 'nginx.conf updated'
"

# Update docker-compose.yml on EC2 to add 443 port and cert volume to nginx
info "Patching docker-compose.yml on EC2 for port 443 and cert mounts..."
$SSH "
  cd ${REMOTE_DIR}
  # Add port 443 and cert volume to nginx service if not already present
  if ! grep -q '443:443' docker-compose.yml; then
    sed -i 's/      - \"80:80\"  # Single port for everything/      - \"80:80\"\n      - \"443:443\"/' docker-compose.yml
    echo 'Port 443 added'
  fi
  if ! grep -q 'letsencrypt' docker-compose.yml; then
    sed -i '/volumes:\n.*nginx.conf/a\      - /etc/letsencrypt:/etc/letsencrypt:ro' docker-compose.yml || true
    # Use Python for more reliable YAML patching
    python3 - << 'PYEOF'
import re
with open('docker-compose.yml', 'r') as f:
    content = f.read()
if '/etc/letsencrypt:/etc/letsencrypt:ro' not in content:
    content = content.replace(
        '      - ./nginx.conf:/etc/nginx/nginx.conf:ro',
        '      - ./nginx.conf:/etc/nginx/nginx.conf:ro\n      - /etc/letsencrypt:/etc/letsencrypt:ro'
    )
    with open('docker-compose.yml', 'w') as f:
        f.write(content)
    print('Cert volume added to nginx')
else:
    print('Cert volume already present')
PYEOF
  fi
"

# Restart nginx with new config
info "Restarting nginx with SSL configuration..."
$SSH "cd ${REMOTE_DIR} && (sudo docker compose up -d nginx || docker compose up -d nginx)"
sleep 5
$SSH "cd ${REMOTE_DIR} && (sudo docker compose ps nginx || docker compose ps nginx)"
success "nginx restarted with SSL"

# Set up certbot auto-renewal cron
info "Setting up certbot auto-renewal cron..."
$SSH "
  CRON_CMD='0 3 * * * certbot renew --quiet --deploy-hook \"docker compose -f ${REMOTE_DIR}/docker-compose.yml restart nginx\"'
  (sudo crontab -l 2>/dev/null | grep -v certbot; echo \"\$CRON_CMD\") | sudo crontab -
  echo 'Cron job installed'
"
success "Auto-renewal cron configured"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   SSL Setup Complete!                        ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
success "HTTPS live at: https://${DOMAIN}"
echo ""
echo "Certificate auto-renews at 3am daily."
