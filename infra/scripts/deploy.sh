#!/bin/bash
# Main deployment entry point for AI Governance Platform
# This is the primary script you should use for all deployments

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Delegate to the unified deployment script
exec "${PROJECT_ROOT}/infra/scripts/deploy-to-gcp.sh" "$@"

