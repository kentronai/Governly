"""
Authentication Middleware

Handles tenant authentication and API key validation.
Attaches TenantContext to request.state for downstream use.
"""

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware

from ..auth import require_tenant_auth, TenantContext
from ..logging import get_logger

logger = get_logger(__name__)


class AuthenticationMiddleware(BaseHTTPMiddleware):
    """
    Authenticate all requests and attach TenantContext to request.state
    
    Flow:
    1. Extract API key from X-API-KEY header
    2. Validate against database
    3. Attach tenant_id, policy_id to request.state
    4. Pass through to next middleware
    """
    
    async def dispatch(self, request: Request, call_next):
        # Skip auth for health checks and docs
        if request.url.path in ["/healthz", "/readyz", "/health", "/", "/docs", "/redoc", "/openapi.json"]:
            return await call_next(request)
        
        try:
            # Use existing auth dependency to get tenant context
            # This preserves ALL auth logic (API key, JWT, BYOK mode, etc.)
            from ..auth import require_tenant_auth
            
            tenant_context = await require_tenant_auth(request)
            
            # Attach FULL tenant context to request state for downstream middleware
            request.state.tenant_context = tenant_context
            request.state.tenant_id = tenant_context.tenant_id
            request.state.auth = tenant_context.auth
            
            logger.debug(f"Authenticated tenant: {tenant_context.tenant_id}")
            
        except HTTPException as e:
            # Auth failed - return the proper status code (401/403/400)
            logger.warning(
                "authentication_failed",
                path=request.url.path,
                status_code=e.status_code,
                detail=e.detail
            )
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=e.status_code,
                content={"error": {"type": "authentication_error", "message": e.detail}}
            )
        except Exception as e:
            logger.error(
                "authentication_error",
                path=request.url.path,
                error=str(e),
                error_type=type(e).__name__,
                exc_info=True
            )
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=401,
                content={"error": {"type": "authentication_error", "message": f"Authentication failed: {str(e)}"}}
            )
        
        # Continue to next middleware
        return await call_next(request)

