"""
Policy Middleware

Resolves and caches policies for each request.
Attaches compiled guards to request.state.
"""

import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


class PolicyMiddleware(BaseHTTPMiddleware):
    """
    Load policy and compile guards for each request
    
    Flow:
    1. Get policy_id from X-Policy-ID header or tenant default
    2. Load policy from cache (PolicyCache handles caching)
    3. Compile guards if not cached
    4. Attach compiled_guards and policy_metadata to request.state
    5. Pass through to next middleware
    """
    
    async def dispatch(self, request: Request, call_next):
        # Skip for health checks and endpoints that don't need policies
        skip_paths = [
            "/healthz", 
            "/readyz", 
            "/health", 
            "/",
            "/v1/router/sync-to-lancedb",     # LanceDB sync doesn't need policy
            "/v1/router/bulk-upload",         # Router training doesn't need policy
            "/v1/router/test-prompt",        # Router test endpoint doesn't need policy
            "/v1/router/config/",            # Router config endpoints don't need policy
            "/v1/models/",                    # Model download endpoints
            "/docs",                          # API documentation
            "/redoc",                         # API documentation
            "/openapi.json",                  # OpenAPI spec
        ]
        
        # Check if path should skip policy loading
        if any(request.url.path.startswith(skip_path) for skip_path in skip_paths):
            return await call_next(request)
        
        try:
            # Get policy_id from header or use system default
            policy_id = request.headers.get("x-policy-id")
            
            if not policy_id:
                # Use system default policy (configured in settings)
                # PolicyCache handles this via default_policy_id from settings
                policy_id = None  # PolicyCache will use default_policy_id if None
            
            # Ensure tenant_id is set (from AuthenticationMiddleware)
            if not hasattr(request.state, 'tenant_id') or not request.state.tenant_id:
                logger.warning(f"Policy middleware: tenant_id not set for {request.url.path}")
                # Skip policy loading if tenant_id not available (auth might have failed)
                return await call_next(request)
            
            # Load policy from cache
            policy_cache = request.app.state.policy_cache
            compiled_guards, policy_metadata = await policy_cache.get_policy(
                tenant_id=request.state.tenant_id,
                policy_id=policy_id
            )
            
            # Attach to request state
            request.state.policy_id = policy_id
            request.state.compiled_guards = compiled_guards
            request.state.policy_metadata = policy_metadata
            # Extract policy_hash from metadata for observability logging
            request.state.policy_hash = policy_metadata.get("hash", "unknown")
            
            # Extract policy_hash from metadata for observability logging
            request.state.policy_hash = policy_metadata.get("hash", "unknown") if policy_metadata else "unknown"
            
        except Exception as e:
            logger.error(f"Policy loading error: {e}")
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=404,
                content={
                    "error": {
                        "type": "policy_not_found",
                        "message": f"Policy '{policy_id}' not found"
                    }
                }
            )
        
        # Continue to next middleware
        return await call_next(request)

