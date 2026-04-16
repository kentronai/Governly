"""
Database models for the Guardrails Gateway

Models match the actual database schema exactly.
"""

from datetime import datetime
from typing import Optional, Dict, Any, List
from uuid import UUID
from pydantic import BaseModel, Field, validator
from enum import Enum


# ============================================================================
# ENUMS (Match database enum types)
# ============================================================================

class GuardTier(str, Enum):
    """Guard performance tier enum - matches guard_tier database type"""
    T0 = "T0"
    T1 = "T1"
    T2 = "T2"

class CompositionStrategy(str, Enum):
    """Composition strategy for guard execution."""
    ALL_OF = "allOf"
    ANY_OF = "anyOf"
    CUSTOM = "custom"


class GuardrailPhase(str, Enum):
    """Execution phase for guardrails."""
    INPUT = "input"
    OUTPUT = "output"
    TOOL_ARGS = "tool_args"
    TOOL_RESULT = "tool_result"




# ============================================================================
# GUARDRAIL MODELS (matches guardrails table exactly)
# ============================================================================

class GuardrailBase(BaseModel):
    """
    Base guardrail model for requests
    
    Note: tenant_id is NOT included - it comes from authenticated X-Tenant-ID header
    """
    # tenant_id removed - comes from require_tenant_auth() dependency
    key: str  # e.g., "pii.redact", "toxicity.detect"
    version: str = "v1"
    category: Optional[str] = None  # "privacy", "safety", "business", etc.
    description: Optional[str] = None
    tier: GuardTier  # T0, T1, or T2
    performance_budget_ms: Optional[float] = None
    requires_onnx: bool = False
    onnx_model_id: Optional[str] = None
    default_params: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    is_enabled: bool = True
    pack_name: Optional[str] = None  # Python module name (e.g., "pii")
    function_name: Optional[str] = None  # Python function name (e.g., "pii_redact")
    input_schema: Optional[Dict[str, Any]] = None
    output_schema: Optional[Dict[str, Any]] = None
    fallback_strategy: str = "skip"  # "skip", "error", "warn"
    # Note: created_by/updated_by removed - derived from auth context, not user input


class GuardrailCreate(GuardrailBase):
    """
    Create guardrail request
    
    Security: created_by/updated_by are NOT accepted from client.
    These are derived from authenticated context (X-User-ID header) to prevent spoofing.
    """
    pass


class GuardrailUpdate(BaseModel):
    """Update guardrail request (all fields optional)"""
    category: Optional[str] = None
    description: Optional[str] = None
    performance_budget_ms: Optional[float] = None
    default_params: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None
    is_enabled: Optional[bool] = None
    pack_name: Optional[str] = None
    function_name: Optional[str] = None
    input_schema: Optional[Dict[str, Any]] = None
    output_schema: Optional[Dict[str, Any]] = None
    fallback_strategy: Optional[str] = None
    updated_by: Optional[str] = None


class GuardrailResponse(GuardrailBase):
    """Guardrail response with computed fields"""
    id: UUID
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True




# class GuardrailResponse(BaseModel):
#     """Response model for guardrail data."""
#     id: str
#     tenant_id: str
#     key: str
#     version: str
#     category: str
#     description: Optional[str]
#     tier: str
#     pack_name: str
#     function_name: str
#     default_params: Dict[str, Any]
#     requires_onnx: bool
#     onnx_model_id: Optional[str]
#     metadata: Dict[str, Any]
#     created_at: datetime
#     updated_at: datetime

