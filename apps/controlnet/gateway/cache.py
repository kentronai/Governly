"""
Policy cache with Redis backend for the Guardrails Gateway

Optimizations:
- Connection pooling for performance
- JSON serialization (no pickle for security)
- SCAN instead of KEYS for production safety
- Proper tenant isolation in cache keys
- TTL management for memory efficiency
"""

import asyncio
import hashlib
import json
import logging
from typing import Dict, Optional, Tuple, Any

import redis.asyncio as redis
import yaml
from sqlalchemy import text

from cga_core import Guard
from cga_core.compiler import compile_policy
from .config import Settings
from .db import get_session
from .policy_categories import get_policy_categories_from_db

# Import guard packs to register them
import guard_packs.default_guardrails.guards  # noqa: F401
import guard_packs.formatting.guards  # noqa: F401
import guard_packs.validation.guards  # noqa: F401


logger = logging.getLogger(__name__)


# === Pure Functions ===

# === Cache Class ===



def sanitize_metadata_for_cache(metadata: Dict[str, Any]) -> Dict[str, Any]:
    """
    Sanitize metadata for Redis caching by removing non-serializable items
    
    Removes:
    - Guard function instances (guards_by_tier contains callable Guard objects)
    - Any other callable objects
    
    Returns:
        Dictionary with only JSON-serializable values
    """
    sanitized = {}
    
    for key, value in metadata.items():
        if key == "guards_by_tier":
            # Convert guards_by_tier to a serializable format
            # Store only guard IDs, not the guard functions
            sanitized[key] = {
                tier: list(guard_dict.keys())  # Just the guard IDs
                for tier, guard_dict in value.items()
            }
        elif callable(value):
            # Skip callable objects (functions, methods, etc.)
            continue
        elif isinstance(value, dict):
            # Recursively sanitize nested dictionaries
            sanitized[key] = sanitize_metadata_for_cache(value)
        elif isinstance(value, (list, tuple)):
            # Sanitize lists/tuples
            sanitized_list = []
            for item in value:
                if callable(item):
                    continue
                elif isinstance(item, dict):
                    sanitized_list.append(sanitize_metadata_for_cache(item))
                else:
                    sanitized_list.append(item)
            sanitized[key] = sanitized_list
        else:
            # Keep primitive types and other serializable values
            sanitized[key] = value
    
    return sanitized


class PolicyCache:
    """
    Simple policy cache with Redis backend
    
    Architecture:
    - Redis: Cached (YAML + metadata) - fast, shared across instances
    - PostgreSQL: Source of truth - authoritative
    
    Redis stores serializable data (YAML + metadata). Guards are compiled on-demand.
    """
    
    def __init__(self, redis_url: str, default_policy_id: str, settings: Optional[Settings] = None):
        self.redis_url = redis_url
        self.default_policy_id = default_policy_id
        self.settings = settings or Settings()
        self.redis_client: Optional[redis.Redis] = None
        self.policy_ttl = 86400  # 24 hours
    
    async def initialize(self):
        """Initialize Redis connection pool - FAIL FAST if unavailable"""
        try:
            # Use connection pool for better performance
            self.redis_client = redis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True,
                max_connections=50,  # Connection pool size
                socket_timeout=5.0,
                socket_connect_timeout=5.0,
                retry_on_timeout=False,
                health_check_interval=30  # Health check every 30s
            )
            # Test connection with timeout
            await asyncio.wait_for(self.redis_client.ping(), timeout=5.0)
            logger.info(f"✅ Connected to Redis at {self.redis_url} (pool: 50 connections)")
        except (asyncio.TimeoutError, Exception) as e:
            # FAIL FAST - Redis is required infrastructure, no degraded mode
            logger.error(f"❌ FATAL: Redis connection required but failed: {e}")
            logger.error(f"   Redis URL: {self.redis_url}")
            logger.error(f"   This is a critical infrastructure failure - service cannot start")
            raise RuntimeError(f"Redis connection failed: {e}") from e
    
    async def close(self):
        """Close Redis connection pool"""
        if self.redis_client:
            await self.redis_client.close()
            logger.info("Redis connection pool closed")
    
    def _get_policy_hash(self, policy_content: bytes) -> str:
        """Generate SHA256 hash of policy content"""
        return hashlib.sha256(policy_content).hexdigest()
    
    def _get_redis_key(self, tenant_id: str, policy_id: str, suffix: str) -> str:
        """
        Generate Redis cache key with proper tenant isolation
        
        Format: policy:{tenant_id}:{policy_id}:{suffix}
        Example: policy:tenant_123:policy_456:yaml
        """
        return f"policy:{tenant_id}:{policy_id}:{suffix}"
    
    async def get_policy(
        self, 
        tenant_id: str = "default", 
        policy_id: Optional[str] = None
    ) -> Tuple[Guard, Dict[str, Any]]:
        """
        Get compiled policy for tenant
        
        Cache hierarchy:
        1. Redis cache (YAML + metadata) - 1-5ms
        2. PostgreSQL (source) - 10-50ms
        
        Args:
            tenant_id: Tenant identifier
            policy_id: Policy ID (uses default if None)
            
        Returns:
            Tuple of (compiled_guard, policy_metadata)
        """
        if policy_id is None:
            policy_id = self.default_policy_id
        
        # Try Redis cache (fast - YAML + metadata only)
        if self.redis_client:
            try:
                yaml_key = self._get_redis_key(tenant_id, policy_id, "yaml")
                metadata_key = self._get_redis_key(tenant_id, policy_id, "metadata")
                
                # Get both in single pipeline for efficiency
                pipe = self.redis_client.pipeline()
                pipe.get(yaml_key)
                pipe.get(metadata_key)
                results = await pipe.execute()
                
                policy_yaml, metadata_json = results
                
                if policy_yaml and metadata_json:
                    # Compile policy from cached YAML
                    policy_bytes = policy_yaml.encode('utf-8')
                    compiled_guards, metadata = compile_policy(policy_bytes)
                    
                    # ALWAYS query categories FRESH from database (NEVER cached!)
                    # This ensures categories are always up-to-date and avoids cache bugs
                    async with get_session() as session:
                        policy_risk_categories = await get_policy_categories_from_db(
                            session,
                            policy_id=policy_id,
                            tenant_id=tenant_id
                        )
                    
                    # Add fresh data to metadata
                    metadata["policy_risk_categories"] = policy_risk_categories
                    metadata["policy_id"] = policy_id
                    metadata["tenant_id"] = tenant_id
                    
                    logger.debug(
                        "cache_hit",
                        policy_id=policy_id,
                        tenant_id=tenant_id,
                        categories=policy_risk_categories,
                        source="fresh_db_query"
                    )
                    
                    return compiled_guards, metadata
                    
            except Exception as e:
                logger.warning(f"Redis cache error: {e}")
        
        # Cache miss - load from database and compile
        logger.info(f"❌ Cache miss, loading from database: {policy_id}")
        compiled_guards, metadata = await self._compile_and_cache_policy(
            tenant_id, policy_id
        )
        
        return compiled_guards, metadata
    
    async def _compile_and_cache_policy(
        self, 
        tenant_id: str, 
        policy_id: str
    ) -> Tuple[Guard, Dict[str, Any]]:
        """
        Compile policy and store in cache
        
        Loads from database first, falls back to filesystem for backward compatibility
        """
        policy_bytes = None
        policy_source = None
        
        # Try to load from database first
        try:
            async with get_session() as session:
                # Query active policy by tenant_id and policy_id (id, slug, or name)
                query = text("""
                    SELECT yaml, hash, description, name, version, metadata
                    FROM policies 
                    WHERE tenant_id = :tenant_id 
                    AND (id::text = :policy_id OR slug = :policy_id OR name = :policy_id)
                    AND is_active = true
                    AND deleted_at IS NULL
                    ORDER BY created_at DESC
                    LIMIT 1
                """)
                
                result = await session.execute(
                    query, 
                    {"tenant_id": tenant_id, "policy_id": policy_id}
                )
                row = result.fetchone()
                
                if row:
                    policy_bytes = row[0].encode('utf-8')  # yaml field
                    policy_source = "database"
                    logger.info(f"✅ Policy loaded from database: {tenant_id}/{policy_id}")
                else:
                    logger.warning(f"Policy not found in database: {tenant_id}/{policy_id}")
        
        except Exception as e:
            logger.error(f"Database query failed for policy {tenant_id}/{policy_id}: {e}")
            raise ValueError(
                f"Failed to load policy '{policy_id}' for tenant '{tenant_id}': {e}"
            )
        
        # Fail-fast: Policy must be in database
        if policy_bytes is None:
            logger.error(f"❌ Policy not found in database: {tenant_id}/{policy_id}")
            raise ValueError(
                f"Policy '{policy_id}' not found for tenant '{tenant_id}'. "
                "Please create the policy via the API or seed it using the seed script."
            )
        
        # Compile policy
        try:
            compiled_guards, metadata = compile_policy(policy_bytes)
        except Exception as e:
            logger.error(f"Failed to compile policy {policy_id}: {e}")
            raise ValueError(f"Failed to compile policy '{policy_id}': {e}")
        
        # Query risk categories from database - FOOLPROOF APPROACH
        # Queries policy_guardrails -> guardrails.category field directly
        # NO naming conventions, NO string parsing!
        async with get_session() as session:
            policy_risk_categories = await get_policy_categories_from_db(
                session,
                policy_id=policy_id,
                tenant_id=tenant_id
            )
        
        # Add to metadata (for return value only - not cached in Redis!)
        metadata["policy_risk_categories"] = policy_risk_categories
        metadata["policy_id"] = policy_id
        metadata["tenant_id"] = tenant_id
        
        logger.info(
            "policy_categories_loaded",
            policy_id=policy_id,
            categories=policy_risk_categories,
            count=len(policy_risk_categories),
            source="database_query"
        )
        
        # Add policy hash and source to metadata
        policy_hash = self._get_policy_hash(policy_bytes)
        metadata["hash"] = policy_hash
        metadata["source"] = policy_source
        metadata["tenant_id"] = tenant_id
        
        # Store in Redis cache for fast lookup (YAML + metadata only)
        if self.redis_client:
            try:
                # Sanitize metadata to remove non-serializable items (like Guard functions)
                sanitized_metadata = sanitize_metadata_for_cache(metadata)
                
                # Use pipeline for atomic multi-key writes
                yaml_key = self._get_redis_key(tenant_id, policy_id, "yaml")
                metadata_key = self._get_redis_key(tenant_id, policy_id, "metadata")
                
                pipe = self.redis_client.pipeline()
                pipe.setex(yaml_key, self.policy_ttl, policy_bytes.decode('utf-8'))
                pipe.setex(metadata_key, self.policy_ttl, json.dumps(sanitized_metadata))
                await pipe.execute()
                
                logger.info(f"✅ Policy cached in Redis: {tenant_id}/{policy_id}")
            except Exception as e:
                logger.warning(f"Failed to cache policy in Redis: {e}")
        
        return compiled_guards, metadata
    
    async def invalidate_policy(self, tenant_id: str, policy_id: str):
        """
        Invalidate cached policy for specific tenant
        
        Uses direct key deletion (efficient)
        """
        # Remove from Redis cache
        if self.redis_client:
            try:
                # Direct key deletion (known keys)
                yaml_key = self._get_redis_key(tenant_id, policy_id, "yaml")
                metadata_key = self._get_redis_key(tenant_id, policy_id, "metadata")
                
                pipe = self.redis_client.pipeline()
                pipe.delete(yaml_key)
                pipe.delete(metadata_key)
                await pipe.execute()
                
                logger.info(f"✅ Policy invalidated: {tenant_id}/{policy_id}")
            except Exception as e:
                logger.warning(f"Failed to invalidate policy in Redis: {e}")
    
    async def list_policies(self) -> Dict[str, Any]:
        """
        List all cached policies
        
        Uses SCAN for production safety
        """
        policies = {}
        
        # Scan Redis cache using SCAN for production safety
        if self.redis_client:
            try:
                cursor = 0
                pattern = "policy:*:*:yaml"
                
                # SCAN is non-blocking and safe for production
                while True:
                    cursor, keys = await self.redis_client.scan(
                        cursor=cursor,
                        match=pattern,
                        count=100
                    )
                    
                    for key in keys:
                        # Extract tenant_id and policy_id from key format:
                        # policy:tenant_id:policy_id:yaml
                        parts = key.split(":")
                        if len(parts) == 4:
                            tenant_id = parts[1]
                            policy_id = parts[2]
                            policy_key = f"{tenant_id}/{policy_id}"
                            
                            if policy_key not in policies:
                                policies[policy_key] = {
                                    "cache_level": "Redis"
                                }
                    
                    if cursor == 0:
                        break
                        
            except Exception as e:
                logger.warning(f"Failed to scan Redis cache: {e}")
        
        return policies
    
    async def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics for monitoring"""
        stats = {}
        
        # Get Redis stats if available
        if self.redis_client:
            try:
                info = await self.redis_client.info("memory")
                stats["redis_used_memory_mb"] = int(info.get("used_memory", 0)) / 1024 / 1024
                stats["redis_connected"] = True
            except Exception as e:
                logger.warning(f"Failed to get Redis stats: {e}")
                stats["redis_connected"] = False
        else:
            stats["redis_connected"] = False
        
        return stats

