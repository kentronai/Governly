"""
JWT Utilities for Clerk Authentication
Validates Clerk-issued JWT tokens using JWKS
"""

from typing import Dict, Any, Optional
from functools import lru_cache
import structlog

import jwt
from jwt import PyJWKClient
from fastapi import HTTPException, status

from gateway.config import get_settings

logger = structlog.get_logger(__name__)


# Configuration
@lru_cache()
def get_clerk_config() -> Dict[str, str]:
    """Get Clerk configuration from settings"""
    settings = get_settings()
    
    if not settings.clerk_enabled:
        logger.warning("clerk_not_configured", message="Clerk authentication not configured")
    
    # Accept clerk_frontend_api with or without a scheme prefix
    # (env var sometimes set as "https://clerk.kentron.ai", sometimes as "clerk.kentron.ai")
    domain = (settings.clerk_frontend_api or "").strip()
    host = domain.removeprefix("https://").removeprefix("http://").rstrip("/")

    return {
        "domain": host,
        "secret_key": settings.clerk_secret_key,
        "jwks_url": f"https://{host}/.well-known/jwks.json" if host else None
    }


@lru_cache(maxsize=1)
def get_jwks_client() -> Optional[PyJWKClient]:
    """Get cached JWKS client for JWT signature verification"""
    try:
        config = get_clerk_config()
        jwks_url = config.get("jwks_url")
        
        if not jwks_url:
            logger.warning("JWKS URL not configured (CLERK_FRONTEND_API not set)")
            return None
        
        logger.info(f"Initializing JWKS client with URL: {jwks_url}")
        return PyJWKClient(jwks_url, cache_keys=True)
    except Exception as e:
        logger.error(f"Failed to initialize JWKS client: {e}")
        return None


def extract_token_from_header(auth_header: str) -> str:
    """Extract JWT token from Authorization header"""
    if not auth_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    parts = auth_header.split()
    
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format. Expected: Bearer <token>",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return parts[1]


def decode_jwt_with_jwks(token: str) -> Dict[str, Any]:
    """Decode and validate JWT using JWKS from Clerk with full security checks"""
    jwks_client = get_jwks_client()
    
    if not jwks_client:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JWT validation not configured",
        )
    
    try:
        # Get signing key from JWKS
        logger.debug(f"Fetching signing key from JWKS for token...")
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        logger.debug(f"Got signing key: {signing_key.key_id if hasattr(signing_key, 'key_id') else 'unknown'}")
        
        # Get Clerk configuration for issuer validation
        config = get_clerk_config()
        clerk_domain = config.get("domain")
        
        # Clerk JWTs should have issuer (iss) claim matching your Clerk domain
        # Example: "https://your-domain.clerk.accounts.dev"
        expected_issuer = f"https://{clerk_domain}" if clerk_domain else None
        
        # Decode and verify JWT with full validation
        decode_options = {
            "verify_signature": True,
            "verify_exp": True,
            "verify_iat": True,
        }
        
        # Validate issuer if Clerk domain is configured
        if expected_issuer:
            decode_options["verify_iss"] = True
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                issuer=expected_issuer,  # ✅ Validates token is from your Clerk instance
                options=decode_options
            )
            logger.debug(f"JWT validated with issuer: {expected_issuer}")
        else:
            # Development mode - no issuer validation
            logger.warning("JWT issuer validation disabled (CLERK_FRONTEND_API not set)")
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                options=decode_options
            )
        
        return payload
        
    except jwt.exceptions.InvalidKeyError as e:
        logger.error(f"Invalid signing key from JWKS: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid JWT signing key",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        logger.error(f"JWT validation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token validation failed",
            headers={"WWW-Authenticate": "Bearer"},
        )


def decode_jwt_with_secret(token: str, secret_key: str) -> Dict[str, Any]:
    """Decode and validate JWT using secret key (for testing)"""
    try:
        payload = jwt.decode(
            token,
            secret_key,
            algorithms=["HS256", "RS256"],
            options={
                "verify_signature": True,
                "verify_exp": True,
            }
        )
        
        return payload
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def extract_user_info_from_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Extract user information from JWT payload"""
    # Clerk session tokens v1 carry org_id/org_role; v2 nests them as
    # "o": {"id", "rol", "slg"}. Read both so the org always comes from the
    # signed token, never from a caller-supplied header.
    org_claim = payload.get("o") if isinstance(payload.get("o"), dict) else {}
    return {
        "user_id": payload.get("sub"),
        "session_id": payload.get("sid"),
        "organization_id": payload.get("org_id") or org_claim.get("id"),
        "email": payload.get("email"),
        "username": payload.get("username"),
        "metadata": payload.get("metadata", {}),
        "roles": payload.get("org_role") or org_claim.get("rol") or payload.get("roles", []),
    }


def validate_clerk_jwt(auth_header: str) -> Dict[str, Any]:
    """
    Validate Clerk JWT token and extract user information
    
    Args:
        auth_header: Authorization header value (Bearer token)
        
    Returns:
        Dict containing user information
        
    Raises:
        HTTPException: If validation fails
    """
    # Extract token from header
    token = extract_token_from_header(auth_header)
    
    # Get config
    config = get_clerk_config()
    
    # Try JWKS validation first (production)
    if config.get("jwks_url"):
        try:
            payload = decode_jwt_with_jwks(token)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"JWKS validation failed: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"JWT validation failed: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"},
            )
    # Fallback to secret key validation (development/testing)
    elif config.get("secret_key"):
        try:
            payload = decode_jwt_with_secret(token, config["secret_key"])
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Secret key validation failed: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"JWT validation failed: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"},
            )
    else:
        logger.error("JWT validation not configured - missing CLERK_FRONTEND_API or CLERK_SECRET_KEY")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JWT validation not configured. Set CLERK_FRONTEND_API or CLERK_SECRET_KEY",
        )
    
    # Extract and return user info
    return extract_user_info_from_payload(payload)


def validate_optional_jwt(auth_header: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    Validate JWT if present, return None if not
    For endpoints that support optional authentication
    """
    if not auth_header:
        return None
    
    try:
        return validate_clerk_jwt(auth_header)
    except HTTPException:
        return None

