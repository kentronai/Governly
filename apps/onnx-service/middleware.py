"""
Middleware for ONNX Inference Service

Lightweight logging middleware with structured JSON logging and trace_id support.
"""

import time
import structlog
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = structlog.get_logger(__name__)


class LoggingMiddleware(BaseHTTPMiddleware):
    """
    Structured logging middleware with trace_id correlation
    
    Flow:
    1. Extract trace_id from X-Trace-ID header (from gateway)
    2. Bind trace_id to logger context
    3. Log incoming request (structured JSON)
    4. Call next middleware/route
    5. Log response with latency (structured JSON)
    6. Clear logger context
    """
    
    SKIP_PATHS = ["/healthz", "/health", "/docs", "/redoc", "/openapi.json"]
    
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        request_id = request.headers.get("x-request-id", f"req_{int(time.time() * 1000)}")
        trace_id = request.headers.get("x-trace-id", request_id)
        
        # Attach to state
        request.state.request_id = request_id
        request.state.trace_id = trace_id
        request.state.start_time = start_time
        
        # Bind trace_id to logger context (all logs will include it)
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            trace_id=trace_id,
            request_id=request_id,
            service="onnx-inference"
        )
        
        # Check if should skip logging
        skip = any(request.url.path.startswith(p) for p in self.SKIP_PATHS)
        
        if not skip:
            logger.info(
                "inference_request_started",
                method=request.method,
                path=request.url.path,
                trace_id=trace_id
            )
        
        try:
            response = await call_next(request)
            latency_ms = (time.time() - start_time) * 1000
            
            if not skip:
                logger.info(
                    "inference_request_completed",
                    method=request.method,
                    path=request.url.path,
                    status_code=response.status_code,
                    latency_ms=int(latency_ms),
                    trace_id=trace_id
                )
            
            return response
            
        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            
            if not skip:
                logger.error(
                    "inference_request_failed",
                    method=request.method,
                    path=request.url.path,
                    error=str(e),
                    latency_ms=int(latency_ms),
                    trace_id=trace_id,
                    exc_info=True
                )
            
            raise
        finally:
            # Clear context vars after request
            structlog.contextvars.clear_contextvars()


