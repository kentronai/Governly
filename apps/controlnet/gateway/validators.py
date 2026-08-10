"""
Pydantic-based parameter validation for guardrails

Uses Pydantic models for declarative validation - no hardcoded rules!
Simple, type-safe, and functional.
"""

from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field, field_validator
from functools import lru_cache
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


# =====================================================
# Pydantic Models for Guard Parameters
# =====================================================

class PIIDetectParams(BaseModel):
    """Parameters for PII detection guard"""
    types: Optional[List[str]] = Field(default=None, description="PII types to detect (None = all)")
    threshold: float = Field(ge=1.0, default=1.0, description="Minimum occurrences to trigger")
    anonymize_mode: Literal["mask", "remove"] = Field(default="mask", description="How to anonymize PII")
    severity: Literal["low", "med", "high", "critical"] = Field(default="high", description="Severity level")


class PIIRedactParams(BaseModel):
    """Parameters for PII redaction guard (never blocks; rewrites text in place)"""
    types: Optional[List[str]] = Field(default=None, description="PII types to redact (None = all)")
    mode: Literal["mask", "remove"] = Field(default="mask", description="How to redact PII")


class ToxicityDetectParams(BaseModel):
    """Parameters for toxicity detection guard"""
    categories: Optional[List[str]] = Field(default=None, description="Toxicity categories (None = all)")
    threshold: float = Field(ge=0.0, le=1.0, default=0.5, description="Detection threshold")
    severity: Literal["low", "med", "high", "critical"] = Field(default="high", description="Severity level")


class JailbreakDetectParams(BaseModel):
    """Parameters for jailbreak detection guard"""
    threshold: float = Field(ge=0.0, le=1.0, default=0.6, description="Detection threshold (lower = more sensitive)")
    severity: Literal["low", "med", "high", "critical"] = Field(default="critical", description="Severity level")


class ProfanityDetectParams(BaseModel):
    """Parameters for profanity detection guard"""
    threshold: float = Field(ge=1.0, default=1.0, description="Minimum profane words to trigger")
    severity: Literal["low", "med", "high", "critical"] = Field(default="high", description="Severity level")
    categories: Optional[List[str]] = Field(default=None, description="Profanity categories (mild/moderate/severe)")


class HarmfulInstructionsDetectParams(BaseModel):
    """Parameters for actionable harmful-instructions detection."""
    threshold: float = Field(
        ge=0.0,
        le=1.0,
        default=0.75,
        description="Detection threshold",
    )
    severity: Literal["low", "med", "high", "critical"] = Field(
        default="high",
        description="Severity level",
    )
    categories: Optional[List[str]] = Field(
        default=None,
        description="Harmful instruction categories (None = all)",
    )


class PoliticsDetectParams(BaseModel):
    """Parameters for politics detection guard"""
    patterns_strong: Optional[List[str]] = Field(default=None, description="Strong political patterns")
    patterns_weak: Optional[List[str]] = Field(default=None, description="Weak political patterns")
    allow: Optional[List[str]] = Field(default=None, description="Allowed patterns")
    threshold: float = Field(ge=0.0, le=1.0, default=0.5)


class ToolsAllowlistParams(BaseModel):
    """Parameters for tools allowlist guard"""
    allowed_tools: List[str] = Field(description="List of allowed tool names")


class ToolsDenylistParams(BaseModel):
    """Parameters for tools denylist guard"""
    denied_tools: List[str] = Field(description="List of denied tool names")


class ToolsResultFilterParams(BaseModel):
    """Parameters for tool result filter guard"""
    forbidden_patterns: List[str] = Field(description="Patterns to block in tool results")


class ToolsArgsValidatorParams(BaseModel):
    """Parameters for tool args validator guard"""
    required_args: Optional[Dict[str, List[str]]] = Field(default=None, description="Required arguments per tool")
    forbidden_patterns: Optional[Dict[str, List[str]]] = Field(default=None, description="Forbidden patterns per tool")


class SecuritySecretsParams(BaseModel):
    """Parameters for secrets detection guard"""
    patterns: List[str] = Field(description="Secret patterns to detect")
    threshold: float = Field(ge=0.0, le=1.0, default=0.8)


class SecuritySQLInjectionParams(BaseModel):
    """Parameters for SQL injection detection"""
    forbidden_keywords: List[str] = Field(default=["DROP", "DELETE", "EXEC"])
    threshold: float = Field(ge=0.0, le=1.0, default=0.9)


class SecurityXSSPreventParams(BaseModel):
    """Parameters for XSS prevention"""
    whitelist_tags: Optional[List[str]] = Field(default=None, description="Allowed HTML tags")


class SecurityCodeInjectionParams(BaseModel):
    """Parameters for code injection detection"""
    forbidden_functions: List[str] = Field(default=["eval", "exec", "compile"])


class SecurityURLCheckParams(BaseModel):
    """Parameters for URL checking"""
    allowed_domains: Optional[List[str]] = Field(default=None, description="Allowed domains")


class SecurityCommandInjectionParams(BaseModel):
    """Parameters for command injection detection"""
    forbidden_commands: List[str] = Field(default=["rm", "wget", "curl"])


class SecurityCodeScanParams(BaseModel):
    """Parameters for code scanning"""
    languages: List[str] = Field(default=["python", "javascript"])
    vulnerability_types: List[str] = Field(default=["injection", "xss"])


class QualityFactCheckParams(BaseModel):
    """Parameters for fact checking"""
    sources: Optional[List[str]] = Field(default=None, description="Trusted sources")
    threshold: float = Field(ge=0.0, le=1.0, default=0.7)


class QualityFallacyDetectParams(BaseModel):
    """Parameters for fallacy detection"""
    fallacy_types: List[str] = Field(default=["ad_hominem", "straw_man"])


class QualityBiasDetectParams(BaseModel):
    """Parameters for bias detection"""
    bias_types: List[str] = Field(default=["gender", "racial", "political"])
    threshold: float = Field(ge=0.0, le=1.0, default=0.6)


class PrivacyPIIEnhancedParams(BaseModel):
    """Parameters for enhanced PII detection"""
    entities: List[str] = Field(default=["PERSON", "EMAIL", "PHONE"])
    threshold: float = Field(ge=0.0, le=1.0, default=0.8)


class PrivacyAnonymizationParams(BaseModel):
    """Parameters for data anonymization"""
    anonymization_methods: List[str] = Field(default=["hash", "mask", "tokenize"])


class PrivacyConsentParams(BaseModel):
    """Parameters for consent checking"""
    consent_types: List[str] = Field(default=["marketing", "analytics"])
    data_categories: List[str] = Field(default=["personal", "sensitive"])


class FormattingURLParams(BaseModel):
    """Parameters for URL formatting validation"""
    allowed_schemes: List[str] = Field(default=["http", "https"])


class ValidationEndsWithParams(BaseModel):
    """Parameters for ends-with validation"""
    end: List[str] = Field(description="Expected endings")


class ValidationValidChoicesParams(BaseModel):
    """Parameters for valid choices validation"""
    choices: List[str] = Field(description="Valid choices")


class CommunicationReadabilityParams(BaseModel):
    """Parameters for readability checking"""
    metrics: List[str] = Field(default=["flesch", "gunning_fog"])
    min_score: float = Field(ge=0.0, le=100.0, default=60.0)


class CommunicationToneParams(BaseModel):
    """Parameters for tone detection"""
    tone_categories: List[str] = Field(default=["formal", "casual", "professional"])


class CommunicationCulturalParams(BaseModel):
    """Parameters for cultural sensitivity"""
    cultural_contexts: List[str] = Field(default=["western", "eastern"])


class BusinessCompetitorProtectionParams(BaseModel):
    """Parameters for competitor protection"""
    competitors: List[str] = Field(description="Competitor names")
    restricted_topics: List[str] = Field(default=["pricing", "features"])


class BusinessProfessionalLiabilityParams(BaseModel):
    """Parameters for professional liability protection"""
    blocked_advice_types: List[str] = Field(default=["legal", "medical", "financial"])


class BusinessBrandToneParams(BaseModel):
    """Parameters for brand tone enforcement"""
    unprofessional_patterns: List[str] = Field(description="Unprofessional patterns to block")


class ComplianceMedicalInfoParams(BaseModel):
    """Parameters for medical information compliance"""
    medical_entities: List[str] = Field(default=["DIAGNOSIS", "MEDICATION", "TREATMENT"])


class SafetyNERLocalONNXParams(BaseModel):
    """Parameters for ONNX-based NER"""
    entities: List[str] = Field(default=["PERSON", "ORG", "LOC"])
    threshold: float = Field(ge=0.0, le=1.0, default=0.7)


class ONNXConfigurableParams(BaseModel):
    """Parameters for configurable ONNX models"""
    target_labels: List[str] = Field(description="Target labels to detect")
    ensemble_models: Optional[List[str]] = Field(default=None, description="Ensemble model IDs")
    threshold: float = Field(ge=0.0, le=1.0, default=0.5)


# =====================================================
# Guard Schema Registry
# =====================================================

GUARD_SCHEMAS: Dict[str, type[BaseModel]] = {
    # Default guardrails with new naming convention
    "pii.detect": PIIDetectParams,
    "pii.redact": PIIRedactParams,
    "toxicity.detect": ToxicityDetectParams,
    "jailbreak.detect": JailbreakDetectParams,
    "profanity.detect": ProfanityDetectParams,
    "harmful_instructions.detect": HarmfulInstructionsDetectParams,
    
    # Legacy mappings (for backward compatibility)
    "pii.detect_pii": PIIDetectParams,
    "toxicity.block": ToxicityDetectParams,
    "safety.toxicity": ToxicityDetectParams,
    "politics.detect": PoliticsDetectParams,
    "politics.block": PoliticsDetectParams,
    "tools.allowlist": ToolsAllowlistParams,
    "tools.denylist": ToolsDenylistParams,
    "tools.result.filter": ToolsResultFilterParams,
    "tools.args.validator": ToolsArgsValidatorParams,
    "security.secrets": SecuritySecretsParams,
    "security.sql_injection": SecuritySQLInjectionParams,
    "security.xss_prevent": SecurityXSSPreventParams,
    "security.code_injection": SecurityCodeInjectionParams,
    "security.url_check": SecurityURLCheckParams,
    "security.command_injection": SecurityCommandInjectionParams,
    "security.code_scan": SecurityCodeScanParams,
    "quality.fact_check": QualityFactCheckParams,
    "quality.fallacy_detect": QualityFallacyDetectParams,
    "quality.bias_detect": QualityBiasDetectParams,
    "privacy.pii_enhanced": PrivacyPIIEnhancedParams,
    "privacy.anonymization": PrivacyAnonymizationParams,
    "privacy.consent": PrivacyConsentParams,
    "formatting.url": FormattingURLParams,
    "validation.ends_with": ValidationEndsWithParams,
    "validation.valid_choices": ValidationValidChoicesParams,
    "communication.readability": CommunicationReadabilityParams,
    "communication.tone": CommunicationToneParams,
    "communication.cultural": CommunicationCulturalParams,
    "business.competitor_protection": BusinessCompetitorProtectionParams,
    "business.professional_liability": BusinessProfessionalLiabilityParams,
    "business.brand_tone": BusinessBrandToneParams,
    "compliance.medical_info": ComplianceMedicalInfoParams,
    "safety.ner.local_onnx": SafetyNERLocalONNXParams,
    "onnx.configurable": ONNXConfigurableParams,
}


# =====================================================
# Validation Functions
# =====================================================

@lru_cache(maxsize=100)
async def get_guard_default_params(guardrail_key: str, db: AsyncSession) -> Dict[str, Any]:
    """
    Get default parameters for a guard from database
    
    Args:
        guardrail_key: Guard key (e.g., 'pii.detect_pii')
        db: Database session
        
    Returns:
        Default parameters dict
    """
    result = await db.execute(
        text("""
            SELECT default_params
            FROM guardrails
            WHERE key = :key AND deleted_at IS NULL
            LIMIT 1
        """),
        {"key": guardrail_key}
    )
    
    row = result.fetchone()
    if not row or not row[0]:
        return {}
    
    return dict(row[0])


async def validate_guard_params(
    guardrail_key: str,
    params: Dict[str, Any],
    db: AsyncSession
) -> Dict[str, Any]:
    """
    Validate and normalize parameters using Pydantic
    
    Args:
        guardrail_key: Guard key
        params: Parameters to validate
        db: Database session
        
    Returns:
        Validated and normalized parameters
        
    Raises:
        ValueError: If validation fails
    """
    # Get schema for this guard
    schema = GUARD_SCHEMAS.get(guardrail_key)
    
    if not schema:
        # No schema defined - return params as-is
        return params
    
    # Get default params from database
    default_params = await get_guard_default_params(guardrail_key, db)
    
    # Clean null values from params (convert None to missing key)
    cleaned_params = {k: v for k, v in params.items() if v is not None}
    
    # Merge: database defaults < user params (excluding nulls)
    merged_params = {}
    merged_params.update(default_params)
    merged_params.update(cleaned_params)
    
    # Validate with Pydantic (auto-converts types, validates constraints)
    try:
        validated = schema(**merged_params)
        return validated.model_dump(exclude_none=True)
    except Exception as e:
        raise ValueError(f"Invalid parameters for {guardrail_key}: {str(e)}")


async def validate_policy_guardrails(
    guardrails: List[Dict[str, Any]],
    db: AsyncSession
) -> List[str]:
    """
    Validate all guardrails in a policy
    
    Args:
        guardrails: List of guardrail configurations
        db: Database session
        
    Returns:
        List of error messages (empty if valid)
    """
    errors = []
    
    for i, guardrail in enumerate(guardrails):
        guardrail_key = guardrail.get("guardrail_key") or guardrail.get("key")
        params = guardrail.get("params", {})
        
        if not guardrail_key:
            errors.append(f"Guardrail #{i+1}: Missing guardrail_key")
            continue
        
        try:
            await validate_guard_params(guardrail_key, params, db)
        except ValueError as e:
            errors.append(f"{guardrail_key}: {str(e)}")
    
    return errors
