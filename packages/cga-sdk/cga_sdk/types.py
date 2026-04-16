"""
Core types for CGA SDK

Pure, immutable types following functional programming principles.
"""

from dataclasses import dataclass
from typing import Dict, List, Any, Optional, Literal
from enum import Enum


class OnFailAction(str, Enum):
    """Action to take on guard failure"""
    EXCEPTION = "exception"
    FILTER = "filter"
    REFRAIN = "refrain"
    FIX = "fix"
    NOOP = "noop"


@dataclass(frozen=True)
class SDKConfig:
    """SDK configuration - immutable"""
    gateway_url: str
    api_key: Optional[str] = None
    timeout: float = 30.0


@dataclass(frozen=True)
class Violation:
    """Guard violation - immutable"""
    rule_id: str
    message: str
    severity: Literal["low", "medium", "high", "critical"]
    field: Optional[str] = None
    fix_value: Optional[Any] = None


@dataclass(frozen=True)
class ValidationResult:
    """Result of guard validation - immutable"""
    valid: bool
    violations: List[Violation]
    validated_output: Optional[Any] = None
    metadata: Optional[Dict[str, Any]] = None


class GuardError(Exception):
    """Base exception for guard errors"""
    pass


class PolicyError(GuardError):
    """Policy-related errors"""
    pass


class ValidationError(GuardError):
    """Validation errors with violations"""
    
    def __init__(self, violations: List[Violation], message: str = "Validation failed"):
        self.violations = violations
        self.message = message
        super().__init__(f"{message}: {len(violations)} violation(s)")

