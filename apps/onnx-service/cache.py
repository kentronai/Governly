"""
Redis cache for ONNX inference results

Caches inference results to avoid re-computation for identical prompts.
Follows functional programming principles with fail-fast behavior.
"""

import asyncio
import hashlib
import json
import logging
from typing import Optional

import redis.asyncio as redis

from config import get_settings

logger = logging.getLogger(__name__)


# =====================================================
# Pure Functions
# =====================================================

def generate_cache_key(prompt: str, risk_category: str) -> str:
    """
    Generate cache key for inference result
    
    Pure function: (prompt, risk_category) → cache_key
    Uses SHA256 hash to handle long prompts efficiently
    """
    content = f"{risk_category}:{prompt}"
    hash_digest = hashlib.sha256(content.encode('utf-8')).hexdigest()
    return f"onnx:inference:{risk_category}:{hash_digest[:16]}"


# =====================================================
# Redis Client (Singleton with fail-fast initialization)
# =====================================================

class InferenceCache:
    """
    Redis cache for inference results
    
    Architecture:
    - Fail-fast initialization (no fallbacks)
    - Connection pooling for performance
    - TTL management for memory efficiency
    - Immutable data with JSON serialization
    """
    
    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self.redis_client: Optional[redis.Redis] = None
        self.cache_ttl = 3600  # 1 hour TTL for inference results
    
    async def initialize(self):
        """Initialize Redis connection pool - FAIL FAST if unavailable"""
        try:
            # Use connection pool for better performance
            self.redis_client = redis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True,
                max_connections=20,  # Smaller pool than ControlNet (inference service)
                socket_timeout=5.0,
                socket_connect_timeout=5.0,
                retry_on_timeout=False,
                health_check_interval=30  # Health check every 30s
            )
            # Test connection with timeout
            await asyncio.wait_for(self.redis_client.ping(), timeout=5.0)
            logger.info(f"✅ Connected to Redis at {self.redis_url} (pool: 20 connections)")
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
            logger.info("✅ Redis connection pool closed")
    
    async def get_cached_result(
        self, 
        prompt: str, 
        risk_category: str
    ) -> Optional[dict]:
        """
        Get cached inference result
        
        Args:
            prompt: Input prompt
            risk_category: Risk category (toxicity, jailbreak, etc.)
            
        Returns:
            Cached result dict or None if not found
        """
        if not self.redis_client:
            logger.warning("Redis client not initialized")
            return None
        
        try:
            cache_key = generate_cache_key(prompt, risk_category)
            cached_json = await self.redis_client.get(cache_key)
            
            if cached_json:
                result = json.loads(cached_json)
                logger.debug(f"✅ Cache hit: {risk_category} ({cache_key[:32]}...)")
                return result
            
            logger.debug(f"❌ Cache miss: {risk_category}")
            return None
            
        except Exception as e:
            logger.warning(f"Failed to get cached result: {e}")
            # Don't fail request on cache error - continue with inference
            return None
    
    async def cache_result(
        self,
        prompt: str,
        risk_category: str,
        result: dict
    ) -> bool:
        """
        Cache inference result
        
        Args:
            prompt: Input prompt
            risk_category: Risk category
            result: Inference result to cache
            
        Returns:
            True if cached successfully, False otherwise
        """
        if not self.redis_client:
            logger.warning("Redis client not initialized")
            return False
        
        try:
            cache_key = generate_cache_key(prompt, risk_category)
            result_json = json.dumps(result)
            
            await self.redis_client.setex(
                cache_key,
                self.cache_ttl,
                result_json
            )
            
            logger.debug(f"✅ Cached result: {risk_category} (TTL: {self.cache_ttl}s)")
            return True
            
        except Exception as e:
            logger.warning(f"Failed to cache result: {e}")
            # Don't fail request on cache error
            return False
    
    async def get_stats(self) -> dict:
        """Get cache statistics for monitoring"""
        stats = {
            "redis_connected": False,
            "redis_used_memory_mb": 0,
            "cache_ttl_seconds": self.cache_ttl
        }
        
        if self.redis_client:
            try:
                info = await self.redis_client.info("memory")
                stats["redis_used_memory_mb"] = int(info.get("used_memory", 0)) / 1024 / 1024
                stats["redis_connected"] = True
            except Exception as e:
                logger.warning(f"Failed to get Redis stats: {e}")
        
        return stats
    
    async def clear_cache(self, risk_category: Optional[str] = None) -> int:
        """
        Clear cached results
        
        Args:
            risk_category: If specified, only clear for this category
            
        Returns:
            Number of keys deleted
        """
        if not self.redis_client:
            logger.warning("Redis client not initialized")
            return 0
        
        try:
            if risk_category:
                # Clear specific category
                pattern = f"onnx:inference:{risk_category}:*"
            else:
                # Clear all inference cache
                pattern = "onnx:inference:*"
            
            deleted_count = 0
            cursor = 0
            
            # Use SCAN for production safety (non-blocking)
            while True:
                cursor, keys = await self.redis_client.scan(
                    cursor=cursor,
                    match=pattern,
                    count=100
                )
                
                if keys:
                    deleted = await self.redis_client.delete(*keys)
                    deleted_count += deleted
                
                if cursor == 0:
                    break
            
            logger.info(f"✅ Cleared {deleted_count} cached results (pattern: {pattern})")
            return deleted_count
            
        except Exception as e:
            logger.error(f"Failed to clear cache: {e}")
            return 0


# =====================================================
# Global instance (initialized in main.py)
# =====================================================

_inference_cache: Optional[InferenceCache] = None


def get_inference_cache() -> Optional[InferenceCache]:
    """Get global inference cache instance"""
    return _inference_cache


def set_inference_cache(cache: InferenceCache):
    """Set global inference cache instance (called from main.py)"""
    global _inference_cache
    _inference_cache = cache

