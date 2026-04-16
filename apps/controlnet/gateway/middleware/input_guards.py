"""
Input Guards Middleware

Runs T0/T1/T2 guards on incoming requests.
Blocks requests that violate policies.

IMPORTANT: This middleware does NOT log to database directly.
It only populates request.state with data for ObservabilityMiddleware.
"""

import json
import time
import structlog
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from cga_core import is_left, get_violations, get_context, chat_completions_pipeline

logger = structlog.get_logger(__name__)


class InputGuardsMiddleware(BaseHTTPMiddleware):
    """
    Run input guards on requests before proxying to LLM providers.
    
    Flow:
    1. Check if this is a chat completions request
    2. Parse request body
    3. Run functional pipeline (extract params → resolve model → run guards)
    4. If Left (violation) → populate request.state and return 400
    5. If Right (success) → attach updated context to request.state
    6. Pass through to route handler
    
    DOES NOT log to database - only populates request.state for ObservabilityMiddleware.
    """
    
    async def dispatch(self, request: Request, call_next):
        # Only run guards on chat completions POST requests
        if request.method != "POST" or "/chat/completions" not in request.url.path:
            return await call_next(request)
        
        # Use request_id from ObservabilityMiddleware (SINGLE SOURCE OF TRUTH)
        request_id = getattr(request.state, "request_id", "unknown")
        start_time = getattr(request.state, "start_time", time.time())
        
        try:
            # Parse request body
            body = await request.json()
            
            # Store original body for observability logging
            request.state.original_body = body
            
            # Build pipeline context
            initial_ctx = {
                "request": request,
                "body": body,
                "tenant_context": request.state.tenant_context,
                "request_id": request_id,
                "start_time": start_time
            }
            
            # Run functional pipeline (composable guards)
            logger.info("running_input_guards_pipeline", request_id=request_id)
            pipeline = chat_completions_pipeline()
            result = await pipeline(initial_ctx)
            
            # Handle violations (Left result)
            if is_left(result):
                violations = get_violations(result)
                violation = violations[0] if violations else {}
                
                logger.warning(
                    "input_guard_violation",
                    request_id=request_id,
                    rule_id=violation.get('rule_id'),
                    violations_count=len(violations),
                    phase=violation.get('phase', 'input')
                )
                
                # Extract policy_id for logging (pipeline may not have set it yet)
                policy_id = self._extract_policy_id(request, body)
                
                # Get guard metadata for logging
                input_guards_list = await self._get_input_guards_metadata(
                    request, policy_id, violation
                )
                
                # Calculate execution time
                latency_ms = int((time.time() - start_time) * 1000)
                
                # ================================================
                # POPULATE request.state FOR OBSERVABILITY MIDDLEWARE
                # ================================================
                request.state.policy_id = policy_id
                request.state.violations = violations
                request.state.violation_phase = violation.get('phase', 'input')
                request.state.input_guards_executed = input_guards_list
                request.state.output_guards_executed = []
                request.state.total_guard_time_ms = latency_ms
                
                # Return error response (ObservabilityMiddleware will log)
                return JSONResponse(
                    status_code=400,
                    content={
                        "error": {
                            "type": "policy_violation",
                            "message": violation.get("message"),
                            "rule_id": violation.get("rule_id"),
                            "severity": violation.get("severity"),
                            "evidence": violation.get("evidence"),
                            "request_id": request_id
                        }
                    }
                )
            
            # Success - extract context and populate request.state
            ctx = get_context(result)
            
            # Store policy_id for observability
            if ctx.get("policy_id"):
                request.state.policy_id = ctx["policy_id"]
            
            # Store processed context for route handler
            request.state.processed_body = ctx.get("body", body)
            request.state.provider_client = ctx.get("provider_client")
            request.state.guard_execution_time = (time.time() - start_time) * 1000
            
            logger.info(
                "input_guards_passed",
                request_id=request_id,
                execution_time_ms=request.state.guard_execution_time
            )
            
        except json.JSONDecodeError:
            return JSONResponse(
                status_code=400,
                content={"error": {"type": "invalid_request", "message": "Invalid JSON body"}}
            )
        except Exception as e:
            logger.error(
                "input_guard_error",
                request_id=request_id,
                error=str(e),
                error_type=type(e).__name__,
                exc_info=True
            )
            return JSONResponse(
                status_code=500,
                content={"error": {"type": "internal_error", "message": str(e)}}
            )
        
        # Continue to route handler
        return await call_next(request)
    
    def _extract_policy_id(self, request: Request, body: dict) -> str:
        """Extract policy_id using priority: header > body > settings default"""
        # Priority 1: X-Policy-ID header
        policy_id = request.headers.get("x-policy-id")
        
        # Priority 2: policy_id in request body
        if not policy_id and body and isinstance(body, dict):
            policy_id = body.get("policy_id")
        
        # Priority 3: Default from settings
        if not policy_id:
            settings = getattr(request.app.state, 'settings', None)
            if settings and hasattr(settings, 'default_policy_id'):
                policy_id = settings.default_policy_id
        
        return policy_id
    
    async def _get_input_guards_metadata(
        self, 
        request: Request, 
        policy_id: str, 
        violation: dict
    ) -> list:
        """Get input guards metadata from policy cache for logging"""
        input_guards_list = []
        
        tenant_id = getattr(request.state, "tenant_context", None)
        if tenant_id:
            tenant_id = tenant_id.tenant_id
        
        if not policy_id or not tenant_id:
            return input_guards_list
        
        try:
            if hasattr(request.app.state, 'policy_cache'):
                from ..guard_metadata import get_input_guards_metadata
                policy_cache = request.app.state.policy_cache
                _, policy_metadata = await policy_cache.get_policy(
                    tenant_id=tenant_id,
                    policy_id=policy_id
                )
                input_guards_list = get_input_guards_metadata(policy_metadata)
                
                # Mark the violated guard
                for guard in input_guards_list:
                    if guard.get("id") == violation.get("rule_id"):
                        guard["status"] = "blocked"
        except Exception as e:
            logger.warning(f"Could not fetch guards metadata: {e}")
        
        return input_guards_list
