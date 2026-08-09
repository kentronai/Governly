"""
Observability Middleware - SINGLE SOURCE OF TRUTH for All Observability

This is the ONLY place that:
1. Generates request_id (consistent format for all requests)
2. Logs to database (no other code should call log_request directly)
3. Manages trace correlation

Architecture:
- request_id is generated ONCE here and stored in request.state
- All downstream code (InputGuardsMiddleware, chat.py) uses request.state.request_id
- All downstream code populates request.state with data to be logged
- This middleware reads request.state and logs to database ONCE

The ONLY exception is streaming responses which complete asynchronously.
For streaming, the handler calls log_to_database() directly but through
the exported function, ensuring consistent data format.

request.state contract (populated by handlers):
- request_id: str (set by this middleware)
- trace_id: str (set by this middleware)
- start_time: float (set by this middleware)
- tenant_id: str (set by AuthMiddleware)
- policy_id: str (set by InputGuardsMiddleware or chat.py)
- policy_hash: str (optional)
- original_body: dict (request payload)
- response_payload: dict (response payload)
- violations: list (if request was blocked)
- violation_phase: str ("input" | "output" | "tool_args")
- input_guards_executed: list (guard execution details)
- output_guards_executed: list (guard execution details)
- total_guard_time_ms: float
- logged_by_handler: bool (set by streaming handler to prevent double logging)
"""

import time
import asyncio
import uuid
import structlog
from typing import Optional, Set
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = structlog.get_logger(__name__)

# Task reference set to prevent garbage collection of background logging tasks
_background_tasks: Set[asyncio.Task] = set()


class ObservabilityMiddleware(BaseHTTPMiddleware):
    """
    Centralized observability - generates request_id and handles ALL database logging.
    
    Other middleware/handlers ONLY populate request.state, never log directly.
    The only exception is streaming handlers which must log after stream completion.
    """
    
    # Paths that don't need database logging
    SKIP_LOGGING_PATHS = [
        "/healthz",
        "/readyz", 
        "/health",
        "/docs",
        "/redoc",
        "/openapi.json",
        "/metrics",
        "/favicon.ico",
    ]
    
    async def dispatch(self, request: Request, call_next):
        # ============================================
        # STEP 1: Generate request_id (SINGLE SOURCE)
        # ============================================
        # Use incoming header if present, otherwise generate consistent UUID format
        incoming_request_id = request.headers.get("x-request-id")
        request_id = incoming_request_id or f"req_{uuid.uuid4().hex[:16]}"
        trace_id = request.headers.get("x-trace-id", request_id)
        start_time = time.time()
        
        # Store in request.state - ALL downstream code must use these values
        request.state.request_id = request_id
        request.state.trace_id = trace_id
        request.state.start_time = start_time
        
        # Bind to structured logger context
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            trace_id=trace_id,
            request_id=request_id
        )
        
        # Check if path should skip logging
        skip_logging = any(
            request.url.path.startswith(path) 
            for path in self.SKIP_LOGGING_PATHS
        )
        
        if not skip_logging:
            logger.info(
                "request_started",
                method=request.method,
                path=request.url.path,
                request_id=request_id
            )
        
        try:
            # ============================================
            # STEP 2: Execute request chain
            # ============================================
            response = await call_next(request)
            
            # Get response status
            try:
                response_status_code = response.status_code
            except (AttributeError, Exception):
                response_status_code = 500
            
            latency_ms = int((time.time() - start_time) * 1000)
            
            if not skip_logging:
                logger.info(
                    "request_completed",
                    method=request.method,
                    path=request.url.path,
                    status_code=response_status_code,
                    latency_ms=latency_ms,
                    request_id=request_id
                )
            
            # ============================================
            # STEP 3: Log to database (SINGLE POINT)
            # ============================================
            should_log = (
                not skip_logging and
                hasattr(request.state, "tenant_id") and
                not getattr(request.state, "logged_by_handler", False)  # Streaming handles its own
            )
            
            if should_log:
                # ================================================
                # BACKGROUND LOGGING - NOT IN CRITICAL PATH
                # ================================================
                # Response is returned immediately to user.
                # Database write happens asynchronously after response.
                task = asyncio.create_task(
                    _log_request_to_database(
                        request=request,
                        request_id=request_id,
                        latency_ms=latency_ms,
                        response_status_code=response_status_code
                    )
                )
                # Store task reference to prevent garbage collection
                _background_tasks.add(task)
                task.add_done_callback(_background_tasks.discard)
            
            return response
            
        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            
            if not skip_logging:
                logger.error(
                    "request_failed",
                    method=request.method,
                    path=request.url.path,
                    error=str(e),
                    latency_ms=latency_ms,
                    request_id=request_id,
                    exc_info=True
                )
            
            # Log error to database (background - not blocking exception propagation)
            if hasattr(request.state, "tenant_id"):
                task = asyncio.create_task(
                    _log_error_to_database(
                        request=request,
                        request_id=request_id,
                        latency_ms=latency_ms,
                        error=e
                    )
                )
                _background_tasks.add(task)
                task.add_done_callback(_background_tasks.discard)
            
            raise
        finally:
            structlog.contextvars.clear_contextvars()


async def _log_request_to_database(
    request: Request,
    request_id: str,
    latency_ms: int,
    response_status_code: int
):
    """
    Internal function to log request to database.
    Extracts all data from request.state populated by handlers.
    """
    try:
        from ..db import get_session
        from ..services.observability_service import log_request as db_log_request, sanitize_payload
        
        # Extract data from request.state
        tenant_id = getattr(request.state, "tenant_id", None)
        if not tenant_id:
            return
        
        policy_id = getattr(request.state, "policy_id", None)
        agent_id = getattr(request.state, "agent_id", None)
        policy_hash = getattr(request.state, "policy_hash", "unknown")
        trace_id = getattr(request.state, "trace_id", request_id)
        body = getattr(request.state, "original_body", None)
        response_payload = getattr(request.state, "response_payload", None)
        violations = getattr(request.state, "violations", None)
        input_guards = getattr(request.state, "input_guards_executed", [])
        output_guards = getattr(request.state, "output_guards_executed", [])
        total_guard_time = getattr(request.state, "total_guard_time_ms", 0)
        
        # Build guardrail_results
        guardrail_results = _build_guardrail_results(
            violations=violations,
            input_guards=input_guards,
            output_guards=output_guards,
            total_guard_time=total_guard_time
        )
        
        # Build metadata
        metadata = {
            "trace_id": trace_id,
            "policy_hash": policy_hash,
            "model": body.get("model") if body and isinstance(body, dict) else None,
            "stream": body.get("stream", False) if body and isinstance(body, dict) else False,
            "user_agent": request.headers.get("user-agent"),
            "policy_resolution_source": getattr(request.state, "policy_resolution_source", None),
            # Where the request was actually sent. "model" above is what the
            # caller asked for; the tenant's Model Registry selection can send
            # it somewhere else entirely, and without this the dashboard cannot
            # explain a provider rejection.
            "routed_model": getattr(request.state, "routed_model", None),
            "routed_provider": getattr(request.state, "routed_provider", None),
            "routed_base_url": getattr(request.state, "routed_base_url", None),
        }
        
        if response_status_code >= 400:
            metadata["error"] = True
            metadata["error_type"] = "server_error" if response_status_code >= 500 else "client_error"
        
        if violations:
            metadata["violation_phase"] = getattr(request.state, "violation_phase", "unknown")
        
        # Log to database
        async with get_session() as db_session:
            await db_log_request(
                db_session=db_session,
                tenant_id=tenant_id,
                request_id=request_id,
                method=request.method,
                path=request.url.path,
                status_code=response_status_code,
                latency_ms=latency_ms,
                request_payload=sanitize_payload(body) if body else None,
                response_payload=sanitize_payload(response_payload) if response_payload else None,
                guardrail_results=guardrail_results,
                policy_id=policy_id,
                application_id=getattr(request.state, "application_id", None),
                agent_id=agent_id,
                metadata=metadata
            )
        
        logger.debug("request_logged_to_database", request_id=request_id)
        
    except Exception as e:
        logger.error(
            "database_logging_failed",
            request_id=request_id,
            error=str(e),
            exc_info=True
        )


async def _log_error_to_database(
    request: Request,
    request_id: str,
    latency_ms: int,
    error: Exception
):
    """Log exception to database"""
    try:
        from ..db import get_session
        from ..services.observability_service import log_request as db_log_request, sanitize_payload
        
        tenant_id = getattr(request.state, "tenant_id", None)
        if not tenant_id:
            return
        
        body = getattr(request.state, "original_body", None)
        policy_id = getattr(request.state, "policy_id", None)
        agent_id = getattr(request.state, "agent_id", None)
        
        async with get_session() as db_session:
            await db_log_request(
                db_session=db_session,
                tenant_id=tenant_id,
                request_id=request_id,
                method=request.method,
                path=request.url.path,
                status_code=500,
                latency_ms=latency_ms,
                request_payload=sanitize_payload(body) if body else None,
                response_payload={"error": str(error), "error_type": type(error).__name__},
                guardrail_results=None,
                policy_id=policy_id,
                agent_id=agent_id,
                metadata={
                    "error": True,
                    "error_type": type(error).__name__,
                    "error_message": str(error),
                    "trace_id": getattr(request.state, "trace_id", request_id),
                }
            )
            
    except Exception as e:
        logger.error(f"Failed to log error to database: {e}", exc_info=True)


def _build_guardrail_results(
    violations: Optional[list],
    input_guards: list,
    output_guards: list,
    total_guard_time: float
) -> Optional[dict]:
    """Build standardized guardrail_results structure for database"""
    if not (violations or input_guards or output_guards):
        return None

    if violations and len(violations) > 0:
        violation = violations[0]
        # Only a guard firing on request/response content is a policy block.
        # Pipeline failures (missing provider key, unresolvable model) also
        # travel as violations, and recording them as "block" made the
        # dashboard count broken requests as guardrail activity.
        if violation.get("phase") not in ("input", "output", "tool_args"):
            return {
                "input_guards": input_guards,
                "output_guards": output_guards,
                "policy_decision": "error",
                "blocked": False,
                "violated_guard": None,
                "_summary": {
                    "decision": "error",
                    "was_blocked": False,
                    "total_guards": len(input_guards) + len(output_guards),
                    "error": {
                        "phase": violation.get("phase", "pipeline"),
                        "message": violation.get("message"),
                        "rule_id": violation.get("rule_id"),
                    },
                },
                "all_violations": violations,
                "total_execution_time_ms": total_guard_time,
            }

        return {
            "input_guards": input_guards,
            "output_guards": output_guards,
            "policy_decision": "block",
            "blocked": True,
            "violated_guard": violation,
            "violated_rule": {"rule_id": violation.get("rule_id")},
            "_summary": {
                "decision": "block",
                "was_blocked": True,
                "total_guards": len(input_guards) + len(output_guards),
                "violation": {
                    "phase": violation.get("phase", "input"),
                    "message": violation.get("message"),
                    "rule_id": violation.get("rule_id"),
                    "severity": violation.get("severity")
                }
            },
            "all_violations": violations,
            "total_execution_time_ms": total_guard_time
        }
    else:
        return {
            "input_guards": input_guards,
            "output_guards": output_guards,
            "policy_decision": "allow",
            "blocked": False,
            "violated_guard": None,
            "_summary": {
                "decision": "allow",
                "was_blocked": False,
                "total_guards": len(input_guards) + len(output_guards)
            },
            "total_execution_time_ms": total_guard_time
        }


# ============================================
# EXPORTED FUNCTION FOR STREAMING HANDLERS
# ============================================
# This is the ONLY way handlers should log directly (for streaming only)

async def log_streaming_completion(
    request: Request,
    request_id: str,
    latency_ms: int,
    response_status_code: int
):
    """
    Log streaming response completion to database.
    
    ONLY for use by streaming handlers after stream completes.
    The handler MUST set request.state.logged_by_handler = True after calling this.
    
    All data is extracted from request.state which the handler must populate:
    - original_body
    - response_payload
    - violations (if any)
    - input_guards_executed
    - output_guards_executed
    - total_guard_time_ms
    """
    await _log_request_to_database(
        request=request,
        request_id=request_id,
        latency_ms=latency_ms,
        response_status_code=response_status_code
    )
