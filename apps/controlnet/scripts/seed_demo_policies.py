"""
Seed demo policies into the database

This script loads policy YAML files from the policies/ directory and inserts them
into the database for the demo tenant. This ensures demo policies work exactly
like customer policies - loaded from DB with Redis caching.
"""

import asyncio
import hashlib
import sys
from pathlib import Path
from datetime import datetime
import argparse

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from gateway.db import get_session
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Default configuration (can be overridden via CLI)
DEFAULT_TENANT_ID = "demo"
DEMO_USER_ID = "system"  # System user for seeding

# Policies to seed
DEMO_POLICIES = [
    "playground_v1",
    "playground_default_v1",  # NEW: Uses default guardrails (profanity, jailbreak, toxicity, PII)
    "simple_default_test",    # NEW: Simple test with only pii.detect
    "enterprise_default_v1",
    "business_financial_v1",
    "enterprise_tools_v1",
    "permissive_v1",
    "noop_v1",
]

# ONNX policies (requires models to be present in guard_packs/safety/models/)
# Uncomment and seed when ONNX models are available:
# ONNX_POLICIES = [
#     "enterprise_onnx_v1",
#     "business_onnx_enhanced_v1", 
#     "user_choice_onnx_v1",
# ]


async def seed_policy(session, policy_id: str, policies_dir: Path, tenant_id: str):
    """Seed a single policy into the database"""
    
    policy_file = policies_dir / f"{policy_id}.yaml"
    
    if not policy_file.exists():
        logger.warning(f"⚠️  Policy file not found: {policy_file}")
        return False
    
    # Read YAML content
    with open(policy_file, 'r') as f:
        yaml_content = f.read()
    
    # Compute hash
    yaml_hash = hashlib.sha256(yaml_content.encode('utf-8')).hexdigest()
    
    # Extract name from policy_id (remove _v1 suffix)
    name = policy_id.replace("_v1", "").replace("_", " ").title()
    
    # Check if policy already exists
    check_query = text("""
        SELECT id, hash FROM policies 
        WHERE tenant_id = :tenant_id AND slug = :slug
    """)
    
    result = await session.execute(
        check_query,
        {"tenant_id": tenant_id, "slug": policy_id}
    )
    existing = result.fetchone()
    
    if existing:
        # Update if hash changed
        if existing[1] == yaml_hash:
            logger.info(f"✅ Policy already up-to-date: {policy_id}")
            return True
        
        update_query = text("""
            UPDATE policies 
            SET yaml = :yaml,
                hash = :hash,
                updated_by = :updated_by,
                updated_at = NOW()
            WHERE tenant_id = :tenant_id AND slug = :slug
        """)
        
        await session.execute(
            update_query,
            {
                "tenant_id": tenant_id,
                "slug": policy_id,
                "yaml": yaml_content,
                "hash": yaml_hash,
                "updated_by": DEMO_USER_ID
            }
        )
        
        logger.info(f"🔄 Policy updated: {policy_id}")
        return True
    
    # Insert new policy
    insert_query = text("""
        INSERT INTO policies (
            tenant_id,
            name,
            version,
            slug,
            description,
            yaml,
            hash,
            status,
            is_active,
            metadata,
            created_by,
            updated_by
        ) VALUES (
            :tenant_id,
            :name,
            :version,
            :slug,
            :description,
            :yaml,
            :hash,
            :status,
            :is_active,
            :metadata,
            :created_by,
            :updated_by
        )
    """)
    
    await session.execute(
        insert_query,
        {
            "tenant_id": tenant_id,
            "name": name,
            "version": "v1",
            "slug": policy_id,
            "description": f"Demo policy: {name}",
            "yaml": yaml_content,
            "hash": yaml_hash,
            "status": "active",
            "is_active": True,
            "metadata": "{}",
            "created_by": DEMO_USER_ID,
            "updated_by": DEMO_USER_ID
        }
    )
    
    logger.info(f"✅ Policy created: {policy_id}")
    return True


async def ensure_system_user(session):
    """Ensure system user exists in the database"""
    
    check_query = text("""
        SELECT id FROM users WHERE id = :user_id
    """)
    
    result = await session.execute(check_query, {"user_id": DEMO_USER_ID})
    existing = result.fetchone()
    
    if existing:
        logger.info(f"✅ System user exists: {DEMO_USER_ID}")
        return True
    
    # Create system user (uses Clerk user ID format for consistency)
    insert_query = text("""
        INSERT INTO users (
            id,
            email,
            name
        ) VALUES (
            :id,
            :email,
            :name
        )
    """)
    
    await session.execute(
        insert_query,
        {
            "id": DEMO_USER_ID,  # System user ID (Clerk format: user_xxx)
            "email": "system@kentron.ai",
            "name": "System"
        }
    )
    
    logger.info(f"✅ System user created: {DEMO_USER_ID}")
    return True


async def ensure_demo_tenant(session, tenant_id: str):
    """Ensure tenant exists in the database"""
    
    check_query = text("""
        SELECT id FROM tenants WHERE id = :tenant_id
    """)
    
    result = await session.execute(check_query, {"tenant_id": tenant_id})
    existing = result.fetchone()
    
    if existing:
        logger.info(f"✅ Tenant exists: {tenant_id}")
        return True
    
    logger.warning(f"⚠️  Tenant {tenant_id} does not exist in database")
    logger.warning("Policies will be seeded, but tenant should be created via Clerk webhook or admin")
    return False


async def main():
    """Main seeding function"""
    
    # Parse CLI arguments
    parser = argparse.ArgumentParser(description='Seed policies into the database')
    parser.add_argument(
        '--tenant-id',
        type=str,
        default=DEFAULT_TENANT_ID,
        help=f'Tenant ID to seed policies for (default: {DEFAULT_TENANT_ID})'
    )
    parser.add_argument(
        '--policy',
        type=str,
        help='Specific policy to seed (seeds all if not specified)'
    )
    args = parser.parse_args()
    
    tenant_id = args.tenant_id
    
    logger.info("🌱 Starting policy seeding...")
    logger.info(f"🏢 Target tenant: {tenant_id}")
    
    # Check for DATABASE_URL
    import os
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        logger.error("❌ DATABASE_URL environment variable not set!")
        logger.error("Set it with: export DATABASE_URL='your-cloud-db-url'")
        return
    
    logger.info(f"✅ Using database: {db_url[:50]}...")
    
    # Get policies directory
    script_dir = Path(__file__).parent
    policies_dir = script_dir.parent / "policies"
    
    if not policies_dir.exists():
        logger.error(f"❌ Policies directory not found: {policies_dir}")
        return
    
    logger.info(f"📂 Policies directory: {policies_dir}")
    
    # Determine which policies to seed
    policies_to_seed = [args.policy] if args.policy else DEMO_POLICIES
    
    try:
        async with get_session() as session:
            # Ensure system user exists first (required for foreign key)
            await ensure_system_user(session)
            
            # Check if tenant exists
            await ensure_demo_tenant(session, tenant_id)
            
            # Seed each policy
            success_count = 0
            for policy_id in policies_to_seed:
                try:
                    if await seed_policy(session, policy_id, policies_dir, tenant_id):
                        success_count += 1
                except Exception as e:
                    logger.error(f"❌ Failed to seed policy {policy_id}: {e}")
            
            logger.info(f"\n✅ Seeding complete: {success_count}/{len(policies_to_seed)} policies")
    
    except Exception as e:
        logger.error(f"❌ Seeding failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())

