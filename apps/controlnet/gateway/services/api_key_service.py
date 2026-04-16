"""
API Key Resolution Service - BYOK mode with real user tracking
Resolves ControlNet API keys to user context without storing provider keys
"""

from dataclasses import dataclass
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import logging
import hashlib

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ApiKeyContext:
    """Resolved context from ControlNet API key"""
    api_key_id: str
    user_id: str              # Real user ID who created this key
    tenant_id: str
    rate_limit_per_minute: int
    permissions: list[str]
    is_active: bool


def hash_api_key(api_key: str) -> str:
    """
    Hash an API key using SHA-256 (matching web app generation).
    
    Web app creates keys with: crypto.createHash('sha256').update(key).digest('hex')
    Gateway must use same algorithm to validate.
    
    Args:
        api_key: Plain API key (e.g., "sk_live_...")
        
    Returns:
        SHA-256 hex digest
    """
    return hashlib.sha256(api_key.encode()).hexdigest()


async def resolve_api_key(
    api_key: str,
    db_session: AsyncSession
) -> ApiKeyContext:
    """
    Resolve ControlNet API key to user context.
    
    BYOK Mode: We do NOT store provider keys. User brings their own.
    This only validates the ControlNet API key and returns user context.
    
    Args:
        api_key: ControlNet API key (e.g., "sk_live_jJqOjfO6oGmnsi5DKueMJg9E_u6aPmwDjTfljdLNJGE")
        db_session: Database session
        
    Returns:
        ApiKeyContext with user information
        
    Raises:
        ValueError: If API key is invalid or expired
    """
    logger.info(f"Resolving API key: {api_key[:20]}...")
    
    # Hash the incoming key using SHA-256 (matching web app generation)
    api_key_hash = hash_api_key(api_key)
    logger.debug(f"API key hash: {api_key_hash[:16]}...")
    
    # ✅ Changed from bcrypt crypt() to SHA-256 direct comparison
    # Web app stores: SHA-256(key) in key_hash field
    # Gateway validates: SHA-256(incoming_key) == key_hash
    query = text("""
        SELECT 
            id,
            created_by,
            tenant_id,
            rate_limit_per_minute,
            permissions,
            is_active,
            expires_at
        FROM api_keys
        WHERE key_hash = :key_hash
          AND is_active = true
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1
    """)
    
    result = await db_session.execute(query, {"key_hash": api_key_hash})
    row = result.fetchone()
    
    if not row:
        logger.warning(f"Invalid or expired API key: {api_key[:20]}...")
        raise ValueError("Invalid or expired API key")
    
    # Update last_used_at
    update_query = text("""
        UPDATE api_keys
        SET last_used_at = NOW()
        WHERE id = :api_key_id
    """)
    await db_session.execute(update_query, {"api_key_id": row[0]})
    await db_session.commit()
    
    logger.info(
        f"Resolved API key -> user_id={row[1]}, tenant_id={row[2]}"
    )
    
    return ApiKeyContext(
        api_key_id=str(row[0]),
        user_id=row[1],        # Real user ID from created_by
        tenant_id=row[2],
        rate_limit_per_minute=row[3] or 1000,
        permissions=row[4] or [],
        is_active=row[5]
    )


async def validate_api_key(
    api_key: str,
    db_session: AsyncSession
) -> bool:
    """
    Validate API key existence and active status without full context resolution.
    
    Lightweight validation for rate limiting, middleware checks, and health endpoints.
    For full user context, use resolve_api_key() instead.
    
    Args:
        api_key: ControlNet API key to validate
        db_session: Database session
        
    Returns:
        True if API key is valid and active, False otherwise
    """
    # ✅ Changed from bcrypt crypt() to SHA-256 direct comparison
    api_key_hash = hash_api_key(api_key)
    
    query = text("""
        SELECT 1
        FROM api_keys
        WHERE key_hash = :key_hash
          AND is_active = true
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1
    """)
    
    result = await db_session.execute(query, {"key_hash": api_key_hash})
    return result.fetchone() is not None

