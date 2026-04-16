"""
Centralized authentication for the ModelGuard Gateway
Uses Clerk JWT validation for proper authentication
Follows functional programming principles with clear separation of concerns
"""

from typing import Dict, Any
from dataclasses import dataclass
from fastapi import Request, HTTPException, status
import logging

from .jwt_utils import validate_clerk_jwt

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AuthContext:
    """Immutable authentication context"""
    authenticated: bool
    user_id: str  # Clerk user ID (from JWT sub claim) - used as database primary key
    organization_id: str | None
    session_id: str | None
    email: str | None
    username: str | None
    roles: list[str]
    jwt_payload: Dict[str, Any]


@dataclass(frozen=True)
class TenantContext:
    """Immutable tenant context"""
    tenant_id: str
    auth: AuthContext


# Pure functions for extraction
def extract_tenant_id(request: Request) -> str:
    """
    Extract tenant ID from request headers
    
    Note: In this database schema, tenant.id stores Clerk org IDs (text), not UUIDs.
    The web app sends the database tenant.id which is the Clerk org ID.
    """
    tenant_id = request.headers.get("x-tenant-id")
    
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing x-tenant-id header"
        )
    
    return tenant_id


# Removed extract_user_id() - user ID now comes from JWT 'sub' claim only
# This simplifies the architecture by removing the X-User-ID header requirement


def extract_auth_header(request: Request) -> str:
    """Extract authorization header from request"""
    auth_header = request.headers.get("authorization", "")
    
    if not auth_header:
        logger.warning(f"Unauthorized request to {request.url.path} - missing authorization header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return auth_header


def create_auth_context(user_info: Dict[str, Any], request_path: str) -> AuthContext:
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
    
    logger.info(f"Authenticated request: User {user_id} to {request_path}")
    
    return AuthContext(
        authenticated=True,
        user_id=user_id,  # Clerk user ID - used directly as database primary key
        organization_id=user_info.get("organization_id"),
        session_id=user_info.get("session_id"),
        email=user_info.get("email"),
        username=user_info.get("username"),
        roles=user_info.get("roles", []),
        jwt_payload=user_info
    )


# Async dependency functions for FastAPI
async def require_auth(request: Request) -> AuthContext:
    """
    Enforce authentication using Clerk JWT validation
    FastAPI dependency that validates JWT and extracts user ID from 'sub' claim
    
    Web app sends:
    - Authorization: Bearer <jwt> (Clerk JWT contains user ID in 'sub' claim)
    """
    try:
        auth_header = extract_auth_header(request)
        user_info = validate_clerk_jwt(auth_header)
        return create_auth_context(user_info, request.url.path)
        
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
    Enforce authentication and tenant validation
    FastAPI dependency that returns complete tenant context
    """
    try:
        tenant_id = extract_tenant_id(request)
        auth_context = await require_auth(request)
        
        return TenantContext(tenant_id=tenant_id, auth=auth_context)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Tenant authentication error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
        )
