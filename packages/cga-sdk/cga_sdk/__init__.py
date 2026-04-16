"""
CGA SDK - Comprehensive Guardrails Architecture SDK

A Python library for integrating AI safety guardrails.
Inspired by Guardrails AI - simple, composable, and powerful.

Usage:
    from cga_sdk import Guard, SDKConfig, OnFailAction
    
    # Create a guard
    guard = Guard(config=SDKConfig(gateway_url="http://localhost:8000"))
    
    # Use specific guards
    result = await guard.use(["toxicity.block", "pii.detect"]).validate("Hello")
    
    # Use a policy
    guard = guard.use_policy("enterprise_v1")
    result = await guard.validate("User input here")
    
    # Wrap LLM calls
    from cga_sdk import wrap_llm_call
    guarded_llm = await wrap_llm_call(guard, my_llm_function)
    response = await guarded_llm(messages)
"""

from .guard import Guard, wrap_llm_call
from .types import (
    SDKConfig,
    ValidationResult,
    Violation,
    OnFailAction,
    GuardError,
    PolicyError,
    ValidationError
)

# Version info
__version__ = "2.0.0"

# Main exports
__all__ = [
    # Core classes
    "Guard",
    "SDKConfig",
    
    # Types
    "ValidationResult",
    "Violation",
    "OnFailAction",
    
    # Exceptions
    "GuardError",
    "PolicyError",
    "ValidationError",
    
    # Utilities
    "wrap_llm_call",
    
    # Version
    "__version__"
]
