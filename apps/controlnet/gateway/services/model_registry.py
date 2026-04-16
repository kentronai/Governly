"""
Model Registry Service - Resolves model IDs to provider routing configuration
Uses provider_models table to route requests to appropriate endpoints
"""

from dataclasses import dataclass
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from fastapi import HTTPException
import logging

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ModelTarget:
    """Resolved routing configuration for a model"""
    provider: str
    model_id: str
    base_url: str
    auth_header_name: str
    requires_transform: bool


def get_default_base_url(provider: str) -> str:
    """
    DEPRECATED: No longer used - model_url must be explicitly configured.
    
    Kept for reference only. All models must have model_url configured in the
    provider_models table. No defaults are applied.
    
    Reference URLs:
    - openai: https://api.openai.com/v1
    - anthropic: https://api.anthropic.com
    - groq: https://api.groq.com/openai/v1
    - azure_openai: https://api.openai.azure.com
    - together: https://api.together.xyz/v1
    - cohere: https://api.cohere.ai
    - gemini: https://generativelanguage.googleapis.com/v1beta
    """
    raise HTTPException(
        status_code=500,
        detail=f"Model URL not configured for provider '{provider}'. "
               f"Please configure model_url in Model Registry."
    )


def get_provider_auth_header(provider: str) -> str:
    """Get authentication header pattern by provider type"""
    auth_headers = {
        "openai": "Authorization",
        "anthropic": "x-api-key",
        "groq": "Authorization",
        "azure_openai": "api-key",
        "together": "Authorization",
        "cohere": "Authorization",
        "gemini": "x-goog-api-key",
    }
    
    return auth_headers.get(provider.lower(), "Authorization")


def requires_format_transform(provider: str) -> bool:
    """Check if provider requires request/response format transformation"""
    transform_providers = {"anthropic", "gemini", "cohere"}
    return provider.lower() in transform_providers


async def resolve_model(
    model_id: str,
    tenant_id: Optional[str],
    db_session: AsyncSession
) -> ModelTarget:
    """
    Resolve model ID to provider endpoint configuration.
    
    Lookup priority:
    1. Tenant-specific models (tenant_id = ?)
    2. Global models (tenant_id IS NULL)
    
    Args:
        model_id: The model identifier (e.g., 'gpt-4o', 'claude-3-5-sonnet')
        tenant_id: Optional tenant identifier for tenant-specific routing
        db_session: Database session
        
    Returns:
        ModelTarget with resolved routing configuration
        
    Raises:
        ValueError: If model is not found in registry
    """
    logger.info(f"Resolving model: {model_id} for tenant: {tenant_id}")
    
    # Query provider_models table with priority ordering
    query = """
        SELECT 
            provider,
            model_id,
            model_url,
            pricing_metadata
        FROM provider_models
        WHERE model_id = :model_id
          AND (tenant_id = :tenant_id OR tenant_id IS NULL)
          AND availability_status = 'available'
        ORDER BY tenant_id DESC NULLS LAST
        LIMIT 1
    """
    
    result = await db_session.execute(
        text(query),
        {"model_id": model_id, "tenant_id": tenant_id}
    )
    row = result.fetchone()
    
    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"Model '{model_id}' not found in registry. Add it to Model Registry at /model-registry"
        )
    
    provider = row[0]
    resolved_model_id = row[1]
    model_url = row[2]
    pricing_metadata = row[3] or {}
    
    # Require explicit model_url configuration (no defaults)
    if not model_url:
        raise HTTPException(
            status_code=500,
            detail=f"Model '{model_id}' has no model_url configured in registry. "
                   f"Please configure the provider endpoint URL in Model Registry."
        )
    
    base_url = model_url
    
    # Get auth header pattern (can be overridden in metadata)
    auth_header = pricing_metadata.get(
        "auth_header_pattern",
        get_provider_auth_header(provider)
    )
    
    # Check if format transformation is needed
    requires_transform = pricing_metadata.get(
        "requires_transform",
        requires_format_transform(provider)
    )
    
    logger.info(
        f"Resolved {model_id} -> provider={provider}, "
        f"base_url={base_url}, auth_header={auth_header}"
    )
    
    return ModelTarget(
        provider=provider,
        model_id=resolved_model_id,
        base_url=base_url,
        auth_header_name=auth_header,
        requires_transform=requires_transform
    )


async def validate_model_exists(
    model_id: str,
    tenant_id: Optional[str],
    db_session: AsyncSession
) -> bool:
    """
    Check if a model exists in the registry without full resolution.
    Useful for validation endpoints.
    """
    query = """
        SELECT 1
        FROM provider_models
        WHERE model_id = :model_id
          AND (tenant_id = :tenant_id OR tenant_id IS NULL)
          AND availability_status = 'available'
        LIMIT 1
    """
    
    result = await db_session.execute(
        text(query),
        {"model_id": model_id, "tenant_id": tenant_id}
    )
    
    return result.fetchone() is not None

