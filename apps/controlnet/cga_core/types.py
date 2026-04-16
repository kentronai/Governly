"""
Core types for Composable Guard Algebra (CGA)

Defines the fundamental types used throughout the guard system:
- Context: The data being processed
- Violation: Represents a policy violation
- Either: Functional result type (Left = failure, Right = success)
- Guard: The core guard function type
"""

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, List, Literal, Tuple, Union, Optional

# Context type - represents the data being processed by guards
Ctx = Dict[str, Any]

@dataclass
class Violation:
    """Represents a policy violation with metadata"""
    rule_id: str
    severity: Literal["low", "med", "high", "critical"]
    message: str
    span: Dict[str, Any] | None = None
    score: float | None = None
    evidence: Any | None = None
    tier: Optional[Literal["T0", "T1", "T2"]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert violation to dictionary for serialization"""
        return {
            "rule_id": self.rule_id,
            "severity": self.severity,
            "message": self.message,
            "span": self.span,
            "score": self.score,
            "evidence": self.evidence,
            "tier": self.tier,
        }

# Either type for functional error handling
# Left represents failure (violations), Right represents success (context)
Left = Dict[str, Any]  # {"_tag": "Left", "left": [Violation, ...]}
Right = Dict[str, Any]  # {"_tag": "Right", "right": Ctx}
Either = Union[Left, Right]

# Guard function type - async function that takes context and returns Either
Guard = Callable[[Ctx], Awaitable[Either]]

def Left_(violations: List[Violation]) -> Left:
    """Create a Left (failure) result with violations"""
    return {
        "_tag": "Left",
        "left": [v.to_dict() if hasattr(v, 'to_dict') else v for v in violations]
    }

def Right_(ctx: Ctx) -> Right:
    """Create a Right (success) result with context"""
    return {
        "_tag": "Right", 
        "right": ctx
    }

def is_left(either: Either) -> bool:
    """Check if an Either is Left (failure)"""
    # ✅ ROOT FIX: Defensive check to prevent KeyError
    if not isinstance(either, dict):
        return False
    return either.get("_tag") == "Left"

def is_right(either: Either) -> bool:
    """Check if an Either is Right (success)"""
    # ✅ ROOT FIX: Defensive check to prevent KeyError
    if not isinstance(either, dict):
        return False
    return either.get("_tag") == "Right"

def get_violations(either: Either) -> List[Dict[str, Any]]:
    """Extract violations from Left result"""
    if not is_left(either):
        raise ValueError("Cannot get violations from Right result")
    return either["left"]

def get_context(either: Either) -> Ctx:
    """Extract context from Right result"""
    if not is_right(either):
        raise ValueError("Cannot get context from Left result")
    return either["right"]

class GuardParamMapping:
    """Maps database parameter names to actual function parameter names"""
    
    # Canonical parameter name mappings for common mismatches
    PARAMETER_MAPPINGS = {
        # From database "entities" to function "types"
        "entities": "types",
        "entity_types": "types",
        "entity_list": "types",
        "pii_types": "types",
        
        # From database "pattern" to function "patterns"
        "pattern": "patterns",
        "patterns_strong": "patterns_strong",
        "patterns_weak": "patterns_weak",
        
        # PII redaction mode mappings
        "replacement": "mode",
        "replacement_mode": "mode",
        
        # Severity/threshold mappings
        "severity_level": "severity",
        "severity_threshold": "threshold",
        
        # Model/category mappings
        "model_type": "model",
        "category_name": "category",
        "categories": "categories",
    }
    
    @classmethod
    def map_parameters(cls, database_params: Dict[str, Any], 
                      function_signature_params: List[str]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        Map database parameter names to function parameter names
        
        Args:
            database_params: Parameters from database (may have mismatched names)
            function_signature_params: Expected parameter names from function signature
            
        Returns:
            Tuple of (mapped_params, unmatched_params)
        """
        mapped_params = {}
        unmatched_params = {}
        
        for db_key, db_value in database_params.items():
            # Try direct match first
            if db_key in function_signature_params:
                mapped_params[db_key] = db_value
            # Try mapped names
            elif db_key in cls.PARAMETER_MAPPINGS:
                canonical_key = cls.PARAMETER_MAPPINGS[db_key]
                if canonical_key in function_signature_params:
                    # Check if canonical_key already exists (avoid duplicates)
                    if canonical_key in mapped_params:
                        # Keep the mapped value
                        pass
                    else:
                        mapped_params[canonical_key] = db_value
                else:
                    unmatched_params[db_key] = db_value
            else:
                unmatched_params[db_key] = db_value
        
        return mapped_params, unmatched_params
