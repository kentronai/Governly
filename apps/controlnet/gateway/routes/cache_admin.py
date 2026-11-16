"""
Cache Administration Endpoints

Provides endpoints to inspect and clear Redis cache for debugging.
"""

import re

from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import JSONResponse
import structlog

from gateway.auth import require_tenant_auth, TenantContext

logger = structlog.get_logger(__name__)

router = APIRouter()


def _tenant_key_pattern(tenant: TenantContext) -> str:
    """Redis SCAN pattern for the caller's own policy keys only. Every API key /
    token belongs to one tenant, so these endpoints never touch other tenants."""
    tenant_id = tenant.tenant_id or ""
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", tenant_id):
        raise HTTPException(status_code=400, detail="Invalid tenant")
    return f"policy:{tenant_id}:*"


@router.get("/cache/inspect")
async def inspect_cache(request: Request, tenant: TenantContext = Depends(require_tenant_auth)):
    """
    Inspect what's in the Redis cache
    
    Returns all policy cache keys and their metadata
    """
    try:
        policy_cache = request.app.state.policy_cache
        
        if not policy_cache.redis_client:
            return JSONResponse(
                status_code=503,
                content={"error": "Redis not available"}
            )
        
        # Get all policy keys
        keys = []
        async for key in policy_cache.redis_client.scan_iter(match=_tenant_key_pattern(tenant)):
            keys.append(key)
        
        # Get details for each key
        cache_data = {}
        for key in keys:
            key_type = await policy_cache.redis_client.type(key)
            ttl = await policy_cache.redis_client.ttl(key)
            
            value = None
            if key_type == "string":
                value = await policy_cache.redis_client.get(key)
                # Truncate long values
                if value and len(value) > 200:
                    value = value[:200] + "..."
            
            cache_data[key] = {
                "type": key_type,
                "ttl": ttl,
                "value_preview": value
            }
        
        return JSONResponse(content={
            "total_keys": len(keys),
            "keys": cache_data
        })
        
    except Exception as e:
        logger.error("cache_inspect_failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cache/clear")
async def clear_cache(request: Request, tenant: TenantContext = Depends(require_tenant_auth)):
    """
    Clear all policy cache in Redis
    
    Forces reload from database on next request
    """
    try:
        policy_cache = request.app.state.policy_cache
        
        if not policy_cache.redis_client:
            return JSONResponse(
                status_code=503,
                content={"error": "Redis not available"}
            )
        
        # Find all policy keys
        keys_to_delete = []
        async for key in policy_cache.redis_client.scan_iter(match=_tenant_key_pattern(tenant)):
            keys_to_delete.append(key)
        
        # Delete all keys
        deleted_count = 0
        if keys_to_delete:
            deleted_count = await policy_cache.redis_client.delete(*keys_to_delete)
        
        logger.info(
            "cache_cleared",
            deleted_count=deleted_count,
            keys=keys_to_delete
        )
        
        return JSONResponse(content={
            "status": "success",
            "deleted_count": deleted_count,
            "deleted_keys": keys_to_delete
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("cache_clear_failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cache/clear/{tenant_id}/{policy_id}")
async def clear_specific_policy_cache(
    tenant_id: str,
    policy_id: str,
    request: Request,
    tenant: TenantContext = Depends(require_tenant_auth),
):
    """
    Clear cache for a specific tenant/policy
    
    More targeted than clearing everything
    """
    try:
        policy_cache = request.app.state.policy_cache
        
        if not policy_cache.redis_client:
            return JSONResponse(
                status_code=503,
                content={"error": "Redis not available"}
            )
        
        if tenant_id != tenant.tenant_id:
            raise HTTPException(status_code=403, detail="Cannot clear another tenant's cache")

        # Build keys
        yaml_key = f"policy:{tenant_id}:{policy_id}:yaml"
        metadata_key = f"policy:{tenant_id}:{policy_id}:metadata"
        
        # Delete keys
        deleted = await policy_cache.redis_client.delete(yaml_key, metadata_key)
        
        logger.info(
            "policy_cache_cleared",
            tenant_id=tenant_id,
            policy_id=policy_id,
            deleted=deleted
        )
        
        return JSONResponse(content={
            "status": "success",
            "tenant_id": tenant_id,
            "policy_id": policy_id,
            "deleted_count": deleted
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("cache_clear_failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

