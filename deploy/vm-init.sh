#!/usr/bin/env bash
# Installs or upgrades Governly on a fresh Ubuntu VM. The AWS, Azure and GCP one-click deploys run
# this as root; re-run it any time to pull the latest code and redeploy in place (.env is kept).
#
#   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY   required on first install
#   GOVERNLY_URL   public URL (default: http://<this VM's public IP>)
#   GOVERNLY_DIR   checkout location (default: /opt/governly)
set -euo pipefail
export HOME="${HOME:-/root}" GOVERNLY_DIR="${GOVERNLY_DIR:-/opt/governly}"

command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
command -v git >/dev/null || { apt-get update -y && apt-get install -y git; }

if [ -z "${GOVERNLY_URL:-}" ]; then
  GOVERNLY_URL="http://$(curl -fsS https://checkip.amazonaws.com | tr -d '[:space:]')"
  export GOVERNLY_URL
fi

[ -d "$GOVERNLY_DIR/.git" ] && git -C "$GOVERNLY_DIR" pull --ff-only
curl -fsSL https://raw.githubusercontent.com/kentronai/Norix/main/install.sh | bash
