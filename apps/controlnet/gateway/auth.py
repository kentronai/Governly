"""
Centralized authentication for the ControlNet Gateway
Supports dual authentication modes:
1. API Key (X-API-KEY header) - for proxy mode with BYOK
2. Clerk JWT (Authorization Bearer) - for web UI access
Follows functional programming principles with clear separation of concerns
"""

from typing import Dict, Any, Optional
from dataclasses import dataclass
from fastapi import Request, HTTPException, status
import logging
import os
import time
from functools import lru_cache

from .jwt_utils import validate_clerk_jwt
from .services.api_key_service import resolve_api_key, ApiKeyContext
from .db import get_db

logger = logging.getLogger(__name__)

# ✅ CRITICAL PERFORMANCE FIX: In-memory cache for API key lookups
# This prevents DB calls on every request (was 10-50ms latency!)
# Cache format: {api_key: (ApiKeyContext, expiry_timestamp)}
_api_key_cache: Dict[str, tuple[ApiKeyContext, float]] = {}
# ponytail: a revoked key stays valid up to this long on this instance; add a
# Redis revocation channel if that window must be zero.
_API_KEY_CACHE_TTL = 30


@dataclass(frozen=True)
class AuthContext:
    """Immutable authentication context"""
    authenticated: bool
    auth_mode: str  # "api_key" or "clerk_jwt"
    user_id: str  # Clerk user ID (from JWT sub claim) or API key owner
    organization_id: str | None
    session_id: str | None
    email: str | None
    username: str | None
    roles: list[str]
    jwt_payload: Dict[str, Any]
    api_key_context: Optional[ApiKeyContext] = None  # For API key mode


@dataclass(frozen=True)
class TenantContext:
    """Immutable tenant context"""
    tenant_id: str
    auth: AuthContext


# Pure functions for extraction
def extract_tenant_id(request: Request) -> Optional[str]:
    """
    Extract tenant ID from request headers (optional).
    If not provided, will be extracted from API key context.
    """
    return request.headers.get("x-tenant-id")


# Removed extract_user_id() - user ID now comes from JWT 'sub' claim only
# This simplifies the architecture by removing the X-User-ID header requirement


def extract_api_key(request: Request) -> Optional[str]:
    """Extract API key from X-API-KEY header"""
    return request.headers.get("x-api-key")


def extract_auth_header(request: Request) -> Optional[str]:
    """
    Extract authorization header from request.
    Standard Authorization header for Clerk JWT or API key mode.
    """
    return request.headers.get("authorization")


def create_auth_context_from_jwt(user_info: Dict[str, Any], request_path: str) -> AuthContext:
    """
    Create authentication context from validated JWT payload
    
    Args:
        user_info: Extracted from JWT (contains Clerk user ID in 'user_id')
        request_path: Request path for logging
    """
    user_id = user_info.get("user_id")
    if not user_id:
        logger.warning(f"JWT token missing user_id for request to {request_path}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token - missing user information",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    logger.info(f"Authenticated request (JWT): User {user_id} to {request_path}")
    
    return AuthContext(
        authenticated=True,
        auth_mode="clerk_jwt",
        user_id=user_id,  # Clerk user ID - used directly as database primary key
        organization_id=user_info.get("organization_id"),
        session_id=user_info.get("session_id"),
        email=user_info.get("email"),
        username=user_info.get("username"),
        roles=user_info.get("roles", []),
        jwt_payload=user_info
    )


def create_auth_context_from_api_key(
    api_key_context: ApiKeyContext, 
    request_path: str
) -> AuthContext:
    """
    Create authentication context from validated API key.
    
    In proxy mode, we track the real user who owns the API key.
    Provider keys are passed via Authorization header (BYOK).
    """
    logger.info(
        f"Authenticated request (API Key): "
        f"User {api_key_context.user_id} to {request_path}"
    )
    
    return AuthContext(
        authenticated=True,
        auth_mode="api_key",
        user_id=api_key_context.user_id,  # ✅ Real user ID!
        organization_id=api_key_context.tenant_id,
        session_id=None,
        email=None,
        username=None,
        roles=["api_user"],
        jwt_payload={},
        api_key_context=api_key_context  # Store full context
    )


# Async dependency functions for FastAPI
async def require_auth(request: Request) -> AuthContext:
    """
    Enforce authentication using dual mode:
    1. If X-API-KEY header is present, validate API key (proxy mode)
    2. Otherwise, validate Clerk JWT (web UI mode)
    
    Proxy mode (for BYOK forwarding):
    - X-API-KEY: <controlnet-api-key>
    - Authorization: <user's provider key> (passed through to provider)
    
    Web app mode:
    - Authorization: Bearer <clerk-jwt>
    """
    try:
        # Debug logging only in development (use logger.debug for production)
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug(f"Auth - Request path: {request.url.path}")
        
        # Check for API key first (proxy mode)
        api_key = extract_api_key(request)
        if api_key:
            # ✅ PERFORMANCE: Check cache first to avoid DB call
            now = time.time()
            if api_key in _api_key_cache:
                api_key_context, expiry = _api_key_cache[api_key]
                if now < expiry:
                    # Cache hit - no DB call!
                    return create_auth_context_from_api_key(
                        api_key_context, 
                        request.url.path
                    )
                else:
                    # Cache expired, remove it
                    del _api_key_cache[api_key]
            
            # Cache miss - resolve from DB and cache result
            async for db in get_db():
                api_key_context = await resolve_api_key(api_key, db)
                # Never cache past the key's own expiry, so the cache-hit
                # `now < expiry` check also enforces expires_at.
                expiry = now + _API_KEY_CACHE_TTL
                if api_key_context.expires_at is not None:
                    expiry = min(expiry, api_key_context.expires_at.timestamp())
                _api_key_cache[api_key] = (api_key_context, expiry)
                return create_auth_context_from_api_key(
                    api_key_context, 
                    request.url.path
                )
        
        # Fall back to Clerk JWT validation (web UI mode)
        auth_header = extract_auth_header(request)
        if not auth_header:
            # Enhanced error message with debugging info
            available_headers = list(request.headers.keys())
            logger.error(f"🚫 Auth failed - No Authorization header found. Available headers: {available_headers}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Missing authentication credentials (X-API-KEY or Authorization header). Found headers: {', '.join(available_headers)}",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        user_info = validate_clerk_jwt(auth_header)
        return create_auth_context_from_jwt(user_info, request.url.path)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authentication error for request to {request.url.path}: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def require_tenant_auth(request: Request) -> TenantContext:
    """
    Enforce authentication and tenant validation.
    
    Tenant ID resolution:
    1. If API key mode: Use tenant_id from API key context
    2. If Clerk JWT mode: Use organization_id from the signed JWT only
    """
    try:
        auth_context = await require_auth(request)
        
        # Get tenant_id based on auth mode
        if auth_context.auth_mode == "api_key":
            # API key mode: tenant_id comes from API key context
            if not auth_context.api_key_context:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="API key context missing"
                )
            tenant_id = auth_context.api_key_context.tenant_id
        else:
            # Clerk JWT mode: the tenant is the org in the signed token. An
            # X-Tenant-ID header is caller-controlled and is never trusted on
            # its own: a user with no active org could name any tenant.
            tenant_id = auth_context.organization_id
            if not tenant_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="No active organization in token. Select an organization and retry."
                )
        
        return TenantContext(tenant_id=tenant_id, auth=auth_context)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Tenant authentication error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
        )
