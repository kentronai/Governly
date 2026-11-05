#!/usr/bin/env bash
#
# Fast local dev: run the NORIX web app NATIVELY on this Mac with Turbopack,
# while Postgres / Nango / the gateway keep running in Docker.
#
# Why: running Next inside Docker on macOS means slow bind-mount file I/O +
# Webpack cold compiles (40s+ per route). Running it natively uses the real
# filesystem + Turbopack, so routes compile in a few seconds.
#
# The Docker nginx stays the front door (it proxies /clerk, /api, /v1,
# /nango-* so auth and integrations keep working); its `web` upstream now
# points at this host process (host.docker.internal:3001), see nginx.local.conf.
#
# Usage:
#   ./scripts-not-required — just run:  ./dev-local.sh
#   Then open the SAME url as before:   https://local.kentron.ai
#
set -euo pipefail
cd "$(dirname "$0")/apps/web"

# NORIX_NATIVE=1 makes next.config.js remap the Docker-internal hostnames
# (postgres, nango-server) to the published host ports (localhost).
export NORIX_NATIVE=1

# Match the container's Node tuning. Bind 0.0.0.0 so nginx (in Docker) can
# reach this process through host.docker.internal.
export NODE_OPTIONS="--dns-result-order=ipv4first --max-old-space-size=4096"

echo "▶ NORIX web (native + Turbopack) on http://0.0.0.0:3001"
echo "  DB/Nango → localhost | open the app at: https://local.kentron.ai"
echo

exec pnpm exec next dev --turbopack --hostname 0.0.0.0 --port 3001
