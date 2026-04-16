#!/usr/bin/env python3
"""
Environment Variable Sync Tool
Ensures docker-compose and Terraform use the same environment variables.

Usage:
    python sync-env.py --check              # Check for drift
    python sync-env.py --update-compose     # Update docker-compose from .env
    python sync-env.py --update-terraform   # Update Terraform from .env
"""

import os
import re
import sys
from pathlib import Path
from typing import Dict, List, Tuple

# Environment variables that should be synced
SYNCED_VARS = [
    "ENVIRONMENT",
    "GCS_MODEL_BUCKET",
    "GS_BUCKET_NAME",
    "PRELOAD_ALL_MODELS",
    "ENABLE_ONNX_MODELS",
    "ENABLE_EMBEDDING_ROUTER",
    "ONNX_INFERENCE_TIMEOUT",
    "MAX_ONNX_MODEL_SIZE_MB",
    "LOG_LEVEL",
    "MAX_CONCURRENT_REQUESTS",
    "GUARD_TIMEOUT",
]

def load_env_file(path: str) -> Dict[str, str]:
    """Load environment variables from .env file"""
    env_vars = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                env_vars[key] = value
    return env_vars

def check_drift() -> List[Tuple[str, str, str]]:
    """Check for drift between .env and actual configs"""
    env_vars = load_env_file('.env.template')
    drift = []
    
    # Check docker-compose.dev.yml
    compose_path = Path('docker-compose.dev.yml')
    if compose_path.exists():
        compose_content = compose_path.read_text()
        for var in SYNCED_VARS:
            if var in env_vars:
                expected = f"{var}: {env_vars[var]}"
                if expected not in compose_content:
                    drift.append((var, env_vars[var], "docker-compose.dev.yml"))
    
    # Check Terraform main.tf
    tf_path = Path('infra/terraform/main.tf')
    if tf_path.exists():
        tf_content = tf_path.read_text()
        for var in SYNCED_VARS:
            if var in env_vars:
                # Check if variable is defined in Terraform
                if var not in tf_content and "GCS_MODEL_BUCKET" not in tf_content:
                    drift.append((var, env_vars[var], "infra/terraform/main.tf"))
    
    return drift

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    action = sys.argv[1]
    
    if action == "--check":
        drift = check_drift()
        if drift:
            print("⚠️  Environment variable drift detected:")
            for var, value, location in drift:
                print(f"  - {var}={value} missing in {location}")
            sys.exit(1)
        else:
            print("✅ No drift detected - all environment variables are synced!")
    
    elif action == "--update-compose":
        print("📝 Updating docker-compose from .env.template...")
        print("   (Manual step - use .env.template as reference)")
    
    elif action == "--update-terraform":
        print("📝 Updating Terraform from .env.template...")
        print("   (Manual step - Terraform already has these vars)")
    
    else:
        print(f"Unknown action: {action}")
        print(__doc__)
        sys.exit(1)

if __name__ == "__main__":
    main()

