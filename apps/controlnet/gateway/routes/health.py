"""
Health check and monitoring endpoints
"""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter()


@router.get("/metrics")
async def metrics(request: Request):
    """Prometheus metrics endpoint with real performance data"""
    from cga_core.registry import get_performance_metrics
    
    # Get actual performance metrics from the registry
    perf_metrics = get_performance_metrics()
    
    # Calculate aggregate metrics
    total_requests = len(perf_metrics)
    avg_duration = sum(m.execution_time_ms for m in perf_metrics) / max(total_requests, 1) / 1000.0
    budget_violations = sum(1 for m in perf_metrics if m.exceeded_budget)
    
    # Get Redis status - Access through policy_cache
    redis_status = "connected"
    try:
        if hasattr(request.app.state, 'policy_cache'):
            policy_cache = request.app.state.policy_cache
            if policy_cache.redis_client:
                await policy_cache.redis_client.ping()
            else:
                redis_status = "not_initialized"
        else:
            redis_status = "not_available"
    except Exception as e:
        logger.warning(f"Redis health check failed: {e}")
        redis_status = "disconnected"
    
    return JSONResponse(
        content={
            "gateway_requests_total": total_requests,
            "gateway_request_duration_seconds": round(avg_duration, 4),
            "guard_violations_total": budget_violations,
            "guard_execution_duration_seconds": round(avg_duration, 4),
            "redis_connection_status": redis_status,
            "guard_performance_metrics": {
                "total_executions": total_requests,
                "average_execution_time_ms": round(sum(m.execution_time_ms for m in perf_metrics) / max(total_requests, 1), 2),
                "budget_exceeded_count": budget_violations,
                "unique_guards_executed": len(set(m.guard_id for m in perf_metrics))
            }
        }
    )


@router.get("/info")
async def info(request: Request):
    """Service information endpoint"""
    settings = request.app.state.settings
    return JSONResponse(
        content={
            "service": "guardrails-gateway",
            "version": "1.7.0",
            "description": "OpenAI-compatible API gateway with guard enforcement",
            "features": [
                "OpenAI API compatibility",
                "Composable Guard Algebra (CGA)",
                "Streaming support",
                "Policy enforcement",
                "Redis caching",
                "Structured logging"
            ],
            "config": {
                "openai_api_key_configured": bool(settings.openai_api_key),
                "anthropic_api_key_configured": bool(settings.anthropic_api_key),
                "redis_url": settings.redis_url,
                "default_policy_id": settings.default_policy_id
            }
        }
    )
