"""
Observability routes for monitoring and debugging
"""

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from datetime import datetime, timedelta
from sqlalchemy import text

from cga_core.observability import get_fail_open_stats, flush_fail_open_events
from gateway.db import get_db

router = APIRouter()


@router.get("/fail-open-stats")
async def get_fail_open_statistics():
    """
    Get statistics about fail-open events (in-memory, last hour)
    
    Returns metrics about guard timeouts and exceptions that resulted
    in requests being allowed through (fail-open mode).
    
    For long-term analysis, use /fail-open-history which queries the database.
    
    Useful for:
    - Real-time monitoring of gateway health
    - Identifying recent policy performance issues
    - Alerting on increased failure rates
    """
    stats = get_fail_open_stats()
    return JSONResponse(content=stats)


@router.get("/fail-open-history")
async def get_fail_open_history(
    hours: int = Query(default=24, ge=1, le=168, description="Number of hours to look back (max 168 = 1 week)")
):
    """
    Get fail-open event history from database
    
    Queries observability_logs table for fail-open events over the specified time period.
    This provides long-term tracking and analysis.
    
    Args:
        hours: Number of hours to look back (1-168)
        
    Returns:
        List of fail-open events with:
        - Timestamp
        - Guard phase
        - Failure type (timeout/exception)
        - Tenant and policy info
        - Error details
    """
    try:
        start_time = datetime.utcnow() - timedelta(hours=hours)
        
        async for db_session in get_db():
            query = text("""
                SELECT 
                    id,
                    timestamp,
                    tenant_id,
                    policy_id,
                    request_id,
                    latency_ms as timeout_ms,
                    metadata->>'guard_phase' as guard_phase,
                    metadata->>'failure_type' as failure_type,
                    guardrail_results->>'error_message' as error_message,
                    metadata->>'timestamp' as event_timestamp
                FROM observability_logs
                WHERE metadata->>'fail_open_event' = 'true'
                  AND timestamp >= :start_time
                ORDER BY timestamp DESC
                LIMIT 1000
            """)
            
            result = await db_session.execute(query, {"start_time": start_time})
            events = [dict(row._mapping) for row in result.fetchall()]
            
            # Aggregate statistics
            stats = {
                "total_events": len(events),
                "timeframe_hours": hours,
                "events": events,
                "by_phase": {},
                "by_type": {}
            }
            
            # Count by phase and type
            for event in events:
                phase = event.get("guard_phase", "unknown")
                failure_type = event.get("failure_type", "unknown")
                
                stats["by_phase"][phase] = stats["by_phase"].get(phase, 0) + 1
                stats["by_type"][failure_type] = stats["by_type"].get(failure_type, 0) + 1
            
            return JSONResponse(content=stats)
            
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to query fail-open history: {str(e)}"}
        )


@router.post("/fail-open-flush")
async def manually_flush_fail_open_events():
    """
    Manually trigger flush of fail-open events to database
    
    Normally this happens automatically every 60 seconds.
    Use this endpoint to force immediate persistence.
    """
    try:
        await flush_fail_open_events()
        return JSONResponse(content={
            "status": "success",
            "message": "Fail-open events flushed to database"
        })
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": f"Failed to flush events: {str(e)}"
            }
        )


@router.get("/health/guardrails")
async def guardrail_health_check():
    """
    Health check specifically for guardrail execution
    
    Returns unhealthy if failure rate is too high
    """
    stats = get_fail_open_stats()
    
    total_failures = stats.get("total_failures", 0)
    failure_counts = stats.get("failure_counts", {})
    
    # Simple health check: warn if we have many failures
    health_status = "healthy"
    if total_failures > 100:  # More than 100 failures in last hour
        health_status = "degraded"
    if total_failures > 500:  # Way too many failures
        health_status = "unhealthy"
    
    return JSONResponse(
        status_code=200 if health_status == "healthy" else 503,
        content={
            "status": health_status,
            "total_failures_last_hour": total_failures,
            "failure_breakdown": failure_counts,
            "queued_for_db": stats.get("queued_for_db", 0),
            "message": f"Guardrail execution is {health_status}" + (
                f" ({total_failures} failures in last hour)" if total_failures > 0 else ""
            )
        }
    )


@router.get("/cache-stats")
async def get_cache_statistics(request: Request):
    """
    Get cache statistics for monitoring
    
    Returns:
    - L1 (memory) cache size and usage
    - L2 (Redis) memory usage
    - Cache hit rates (if available)
    """
    try:
        if not hasattr(request.app.state, 'policy_cache'):
            return JSONResponse(
                status_code=503,
                content={"error": "Policy cache not initialized"}
            )
        
        cache = request.app.state.policy_cache
        stats = await cache.get_cache_stats()
        
        return JSONResponse(content={
            "status": "ok",
            "cache_stats": stats
        })
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to get cache stats: {str(e)}"}
        )


@router.get("/cached-policies")
async def list_cached_policies(request: Request):
    """
    List all cached policies with their cache levels
    
    Returns policies in:
    - L1 (memory): Compiled guards cached in-memory
    - L2 (Redis): YAML + metadata cached in Redis
    """
    try:
        if not hasattr(request.app.state, 'policy_cache'):
            return JSONResponse(
                status_code=503,
                content={"error": "Policy cache not initialized"}
            )
        
        cache = request.app.state.policy_cache
        policies = await cache.list_policies()
        
        return JSONResponse(content={
            "status": "ok",
            "total_cached": len(policies),
            "policies": policies
        })
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to list cached policies: {str(e)}"}
        )
