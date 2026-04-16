"""
Remote ONNX Inference Client

Calls the ONNX Inference Service via internal Docker network.
This is the default behavior - no local inference fallback.

Supports trace_id propagation for end-to-end request correlation.
Uses persistent HTTP client with connection pooling for optimal performance.
"""

import os
import structlog
import httpx
from typing import Any, Optional

logger = structlog.get_logger(__name__)

# Internal Docker network URL (service name resolution)
# Configurable via ONNX_SERVICE_URL environment variable
ONNX_SERVICE_URL = os.getenv("ONNX_SERVICE_URL", "http://onnx-service:8002")

# Global persistent HTTP client (initialized once)
_http_client: Optional[httpx.AsyncClient] = None


async def get_http_client() -> httpx.AsyncClient:
    """
    Get or create persistent HTTP client with connection pooling
    
    ✅ OPTIMIZATION: Reuses TCP connections across requests
    This saves 10-20ms per request by avoiding connection setup overhead
    """
    global _http_client
    
    if _http_client is None:
        _http_client = httpx.AsyncClient(
            timeout=30.0,
            limits=httpx.Limits(
                max_keepalive_connections=20,  # Keep 20 idle connections
                max_connections=50,  # Max 50 concurrent connections
                keepalive_expiry=30.0  # Keep connections alive for 30s
            ),
            http2=True  # Enable HTTP/2 for better performance
        )
        logger.info(
            "http_client_initialized",
            max_connections=50,
            keepalive=20,
            http2=True
        )
    
    return _http_client


async def close_http_client():
    """Close HTTP client on shutdown"""
    global _http_client
    if _http_client:
        await _http_client.aclose()
        _http_client = None
        logger.info("http_client_closed")


def get_trace_id_from_context() -> str | None:
    """Extract trace_id from structlog context (set by middleware)"""
    try:
        # Get bound context from structlog
        context = structlog.contextvars.get_contextvars()
        return context.get("trace_id")
    except Exception:
        return None


async def run_remote_inference(
    prompt: str,
    risk_category: str,
    trace_id: str | None = None
) -> dict[str, Any]:
    """
    Run inference via remote ONNX service with persistent connection
    
    Pure function: (prompt, risk_category, trace_id) → result dict
    Propagates trace_id for end-to-end correlation
    Raises on failure (fail-fast)
    """
    # Get trace_id from context if not provided
    if not trace_id:
        trace_id = get_trace_id_from_context()
    
    try:
        # Build headers with trace_id for correlation
        headers = {"Content-Type": "application/json"}
        if trace_id:
            headers["X-Trace-ID"] = trace_id
        
        # ✅ OPTIMIZATION: Reuse persistent HTTP client
        client = await get_http_client()
        response = await client.post(
            f"{ONNX_SERVICE_URL}/infer",
            json={
                "prompt": prompt,
                "risk_category": risk_category
            },
            headers=headers
        )
        
        if response.status_code == 404:
            # Model not found for this risk category
            logger.warning(
                "onnx_model_not_found",
                risk_category=risk_category,
                trace_id=trace_id
            )
            return {
                "status": "no_model",
                "risk_category": risk_category,
                "note": f"No model available for {risk_category}"
            }
        
        if response.status_code != 200:
            error_msg = f"ONNX service error: {response.status_code}"
            logger.error(
                "onnx_service_error",
                status_code=response.status_code,
                risk_category=risk_category,
                trace_id=trace_id
            )
            raise RuntimeError(error_msg)
        
        data = response.json()
        
        logger.info(
            "remote_inference_completed",
            risk_category=risk_category,
            latency_ms=int(data['latency_ms']),
            model_id=data["model_id"],
            max_confidence=data["max_confidence"],
            trace_id=trace_id
        )
        
        return {
            "status": "success",
            "model_id": data["model_id"],
            "model_name": data["model_name"],
            "risk_category": data["risk_category"],
            "predictions": data["predictions"],
            "max_confidence": data["max_confidence"],
            "latency_ms": data["latency_ms"]
        }
            
    except httpx.TimeoutException:
        error_msg = f"ONNX service timeout for {risk_category}"
        logger.error(
            "onnx_service_timeout",
            risk_category=risk_category,
            trace_id=trace_id
        )
        raise RuntimeError(error_msg)
    except httpx.ConnectError as e:
        error_msg = f"ONNX service unavailable at {ONNX_SERVICE_URL}: {str(e)}"
        logger.error(
            "onnx_service_unavailable",
            service_url=ONNX_SERVICE_URL,
            error=str(e),
            trace_id=trace_id
        )
        raise RuntimeError(error_msg) from e
    except Exception as e:
        logger.error(
            "remote_inference_failed",
            error=str(e),
            risk_category=risk_category,
            trace_id=trace_id
        )
        raise


async def run_batch_remote_inference(
    prompt: str,
    risk_categories: list[str],
    trace_id: str | None = None
) -> dict[str, Any]:
    """
    Run batch inference via remote ONNX service with persistent connection
    
    Pure function: (prompt, risk_categories, trace_id) → results dict
    Propagates trace_id for correlation
    """
    # Get trace_id from context if not provided
    if not trace_id:
        trace_id = get_trace_id_from_context()
    
    try:
        # Build headers with trace_id
        headers = {"Content-Type": "application/json"}
        if trace_id:
            headers["X-Trace-ID"] = trace_id
        
        # ✅ OPTIMIZATION: Reuse persistent HTTP client
        client = await get_http_client()
        response = await client.post(
            f"{ONNX_SERVICE_URL}/infer/batch",
            json={
                "prompt": prompt,
                "risk_categories": risk_categories
            },
            headers=headers
        )
        
        if response.status_code != 200:
            error_msg = f"Batch ONNX service error: {response.status_code}"
            logger.error(
                "batch_onnx_service_error",
                status_code=response.status_code,
                risk_categories=risk_categories,
                trace_id=trace_id
            )
            raise RuntimeError(error_msg)
        
        data = response.json()
        
        logger.info(
            "batch_inference_completed",
            category_count=len(risk_categories),
            total_latency_ms=int(data['total_latency_ms']),
            trace_id=trace_id
        )
        
        # Convert response format
        results = {}
        for risk_category, result in data["results"].items():
            results[risk_category] = {
                "status": "success",
                "model_id": result["model_id"],
                "model_name": result["model_name"],
                "risk_category": result["risk_category"],
                "predictions": result["predictions"],
                "max_confidence": result["max_confidence"],
                "latency_ms": result["latency_ms"]
            }
        
        return results
            
    except httpx.ConnectError as e:
        error_msg = f"ONNX service unavailable at {ONNX_SERVICE_URL}: {str(e)}"
        logger.error(
            "batch_onnx_service_unavailable",
            service_url=ONNX_SERVICE_URL,
            error=str(e),
            trace_id=trace_id
        )
        raise RuntimeError(error_msg) from e
    except Exception as e:
        logger.error(
            "batch_remote_inference_failed",
            error=str(e),
            service_url=ONNX_SERVICE_URL,
            trace_id=trace_id
        )
        raise


__all__ = ['run_remote_inference', 'run_batch_remote_inference', 'close_http_client']


