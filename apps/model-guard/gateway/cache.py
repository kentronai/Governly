"""
Redis cache integration for ModelGuard.

This module provides caching functionality to:
- Avoid re-scanning identical models (SHA256 dedup)
- Cache SBOM extractions
- Cache scan results for quick lookup
"""

import json
import logging
from typing import Any, Dict, Optional
from datetime import timedelta

import redis.asyncio as aioredis
from redis.asyncio import Redis

from .config import get_settings


logger = logging.getLogger(__name__)

# Global Redis client
_redis_client: Optional[Redis] = None


async def get_redis() -> Redis:
    """
    Get Redis client instance.
    
    Returns:
        Redis client
    """
    global _redis_client
    
    if _redis_client is None:
        settings = get_settings()
        
        if not settings.redis_url:
            logger.warning("Redis URL not configured, caching disabled")
            raise RuntimeError("Redis not configured")
        
        try:
            _redis_client = await aioredis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
                max_connections=10
            )
            
            # Test connection
            await _redis_client.ping()
            logger.info("Connected to Redis successfully")
            
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            raise
    
    return _redis_client


async def close_redis():
    """Close Redis connection."""
    global _redis_client
    
    if _redis_client:
        try:
            await _redis_client.close()
            logger.info("Redis connection closed")
        except Exception as e:
            logger.error(f"Error closing Redis: {e}")
        finally:
            _redis_client = None


class CacheService:
    """Service for caching scan results and metadata."""
    
    # Cache key prefixes
    SCAN_RESULT_PREFIX = "modelguard:scan:"
    SBOM_PREFIX = "modelguard:sbom:"
    ARTIFACT_PREFIX = "modelguard:artifact:"
    
    # Cache TTLs
    SCAN_RESULT_TTL = timedelta(days=7)  # 7 days
    SBOM_TTL = timedelta(days=30)  # 30 days
    ARTIFACT_TTL = timedelta(days=30)  # 30 days
    
    def __init__(self):
        """Initialize cache service."""
        self.redis: Optional[Redis] = None
    
    async def _get_redis(self) -> Optional[Redis]:
        """Get Redis client, return None if unavailable."""
        if self.redis is None:
            try:
                self.redis = await get_redis()
            except Exception as e:
                logger.warning(f"Redis unavailable: {e}")
                return None
        return self.redis
    
    async def cache_scan_result(
        self,
        sha256: str,
        scan_data: Dict[str, Any],
        ttl: Optional[timedelta] = None
    ) -> bool:
        """
        Cache scan result by SHA256.
        
        Args:
            sha256: File SHA256 hash
            scan_data: Scan result data
            ttl: Time to live (default: 7 days)
            
        Returns:
            True if cached successfully, False otherwise
        """
        redis = await self._get_redis()
        if not redis:
            return False
        
        try:
            key = f"{self.SCAN_RESULT_PREFIX}{sha256}"
            value = json.dumps(scan_data)
            ttl = ttl or self.SCAN_RESULT_TTL
            
            await redis.setex(key, int(ttl.total_seconds()), value)
            logger.info(f"Cached scan result for SHA256: {sha256[:8]}...")
            return True
            
        except Exception as e:
            logger.error(f"Failed to cache scan result: {e}")
            return False
    
    async def get_cached_scan(self, sha256: str) -> Optional[Dict[str, Any]]:
        """
        Get cached scan result by SHA256.
        
        Args:
            sha256: File SHA256 hash
            
        Returns:
            Cached scan data or None if not found
        """
        redis = await self._get_redis()
        if not redis:
            return None
        
        try:
            key = f"{self.SCAN_RESULT_PREFIX}{sha256}"
            value = await redis.get(key)
            
            if value:
                logger.info(f"Cache hit for scan result: {sha256[:8]}...")
                return json.loads(value)
            
            logger.debug(f"Cache miss for scan result: {sha256[:8]}...")
            return None
            
        except Exception as e:
            logger.error(f"Failed to get cached scan: {e}")
            return None
    
    async def cache_sbom(
        self,
        sha256: str,
        sbom_data: Dict[str, Any],
        ttl: Optional[timedelta] = None
    ) -> bool:
        """
        Cache SBOM data by SHA256.
        
        Args:
            sha256: File SHA256 hash
            sbom_data: SBOM data
            ttl: Time to live (default: 30 days)
            
        Returns:
            True if cached successfully, False otherwise
        """
        redis = await self._get_redis()
        if not redis:
            return False
        
        try:
            key = f"{self.SBOM_PREFIX}{sha256}"
            value = json.dumps(sbom_data)
            ttl = ttl or self.SBOM_TTL
            
            await redis.setex(key, int(ttl.total_seconds()), value)
            logger.info(f"Cached SBOM for SHA256: {sha256[:8]}...")
            return True
            
        except Exception as e:
            logger.error(f"Failed to cache SBOM: {e}")
            return False
    
    async def get_cached_sbom(self, sha256: str) -> Optional[Dict[str, Any]]:
        """
        Get cached SBOM by SHA256.
        
        Args:
            sha256: File SHA256 hash
            
        Returns:
            Cached SBOM data or None if not found
        """
        redis = await self._get_redis()
        if not redis:
            return None
        
        try:
            key = f"{self.SBOM_PREFIX}{sha256}"
            value = await redis.get(key)
            
            if value:
                logger.info(f"Cache hit for SBOM: {sha256[:8]}...")
                return json.loads(value)
            
            logger.debug(f"Cache miss for SBOM: {sha256[:8]}...")
            return None
            
        except Exception as e:
            logger.error(f"Failed to get cached SBOM: {e}")
            return None
    
    async def cache_artifact_metadata(
        self,
        sha256: str,
        metadata: Dict[str, Any],
        ttl: Optional[timedelta] = None
    ) -> bool:
        """
        Cache artifact metadata by SHA256.
        
        Args:
            sha256: File SHA256 hash
            metadata: Artifact metadata
            ttl: Time to live (default: 30 days)
            
        Returns:
            True if cached successfully, False otherwise
        """
        redis = await self._get_redis()
        if not redis:
            return False
        
        try:
            key = f"{self.ARTIFACT_PREFIX}{sha256}"
            value = json.dumps(metadata)
            ttl = ttl or self.ARTIFACT_TTL
            
            await redis.setex(key, int(ttl.total_seconds()), value)
            logger.info(f"Cached artifact metadata for SHA256: {sha256[:8]}...")
            return True
            
        except Exception as e:
            logger.error(f"Failed to cache artifact metadata: {e}")
            return False
    
    async def get_cached_artifact_metadata(self, sha256: str) -> Optional[Dict[str, Any]]:
        """
        Get cached artifact metadata by SHA256.
        
        Args:
            sha256: File SHA256 hash
            
        Returns:
            Cached metadata or None if not found
        """
        redis = await self._get_redis()
        if not redis:
            return None
        
        try:
            key = f"{self.ARTIFACT_PREFIX}{sha256}"
            value = await redis.get(key)
            
            if value:
                logger.info(f"Cache hit for artifact metadata: {sha256[:8]}...")
                return json.loads(value)
            
            logger.debug(f"Cache miss for artifact metadata: {sha256[:8]}...")
            return None
            
        except Exception as e:
            logger.error(f"Failed to get cached artifact metadata: {e}")
            return None
    
    async def invalidate_scan(self, sha256: str) -> bool:
        """
        Invalidate cached scan result.
        
        Args:
            sha256: File SHA256 hash
            
        Returns:
            True if invalidated successfully, False otherwise
        """
        redis = await self._get_redis()
        if not redis:
            return False
        
        try:
            key = f"{self.SCAN_RESULT_PREFIX}{sha256}"
            await redis.delete(key)
            logger.info(f"Invalidated scan cache for SHA256: {sha256[:8]}...")
            return True
            
        except Exception as e:
            logger.error(f"Failed to invalidate scan cache: {e}")
            return False
    
    async def invalidate_all(self, sha256: str) -> bool:
        """
        Invalidate all cached data for a given SHA256.
        
        Args:
            sha256: File SHA256 hash
            
        Returns:
            True if invalidated successfully, False otherwise
        """
        redis = await self._get_redis()
        if not redis:
            return False
        
        try:
            keys = [
                f"{self.SCAN_RESULT_PREFIX}{sha256}",
                f"{self.SBOM_PREFIX}{sha256}",
                f"{self.ARTIFACT_PREFIX}{sha256}"
            ]
            await redis.delete(*keys)
            logger.info(f"Invalidated all cache for SHA256: {sha256[:8]}...")
            return True
            
        except Exception as e:
            logger.error(f"Failed to invalidate cache: {e}")
            return False


# Global cache service instance
_cache_service: Optional[CacheService] = None


def get_cache_service() -> CacheService:
    """
    Get global cache service instance.
    
    Returns:
        CacheService instance
    """
    global _cache_service
    
    if _cache_service is None:
        _cache_service = CacheService()
    
    return _cache_service

