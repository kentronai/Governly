"""
Guard metadata extraction from policies and registry

Dynamically builds guard execution information from policy YAML and guard registry,
eliminating hardcoded policy-specific logic.
"""

from typing import Dict, Any, List, Optional
from cga_core.registry import get_guard_metadata, has_guard
import logging

logger = logging.getLogger(__name__)


def extract_guards_by_phase(policy_metadata: Dict[str, Any], phase: str) -> List[Dict[str, Any]]:
    """
    Extract guard information for a specific phase from policy metadata
    
    Args:
        policy_metadata: Policy metadata from compiler (contains parsed YAML)
        phase: Phase to extract guards for (input, output, tool_args, tool_result)
        
    Returns:
        List of guard execution information with metadata from registry
    """
    guards_info = []
    
    # Get guards from policy metadata
    guards_list = policy_metadata.get("guards", [])
    
    for guard_def in guards_list:
        guard_id = guard_def.get("id")
        if not guard_id:
            continue
            
        # Get guard metadata from registry
        if not has_guard(guard_id):
            logger.warning(f"Guard '{guard_id}' not found in registry")
            continue
            
        try:
            metadata = get_guard_metadata(guard_id)
            
            # Extract guard information
            guard_info = {
                "id": guard_id,
                "name": _format_guard_name(guard_id),
                "tier": metadata.tier or "T1",  # Default to T1 if not specified
                "status": "passed",  # Will be updated if violation occurs
                "description": metadata.description or _generate_description(guard_id)
            }
            
            guards_info.append(guard_info)
            
        except KeyError as e:
            logger.warning(f"Could not get metadata for guard '{guard_id}': {e}")
            continue
    
    return guards_info


def mark_violated_guard(
    guards_list: List[Dict[str, Any]], 
    violation: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """
    Mark a specific guard as blocked based on violation
    
    Args:
        guards_list: List of guard execution information
        violation: Violation information with rule_id
        
    Returns:
        Updated guards list with violation marked
    """
    rule_id = violation.get("rule_id")
    if not rule_id:
        return guards_list
    
    for guard in guards_list:
        if guard["id"] == rule_id:
            guard["status"] = "blocked"
            guard["violation_message"] = violation.get("message", "Policy violation")
            break
    
    return guards_list


def _format_guard_name(guard_id: str) -> str:
    """
    Format guard ID into a human-readable name
    
    Examples:
        pii.detect -> PII Detection
        profanity.detect -> Profanity Detection
        formatting.json -> JSON Validation
    """
    parts = guard_id.split(".")
    
    # Handle common patterns
    if len(parts) >= 2:
        category = parts[0].upper() if parts[0] in ["pii", "ner"] else parts[0].title()
        action = parts[-1].title().replace("_", " ")
        
        # Special cases
        if parts[0] == "pii":
            return "PII Protection"
        elif parts[0] == "toxicity" and parts[-1] == "block":
            return "Toxicity Filter"
        else:
            return f"{category} {action}"
    
    # Fallback: just title case
    return guard_id.title().replace("_", " ").replace(".", " ")


def _generate_description(guard_id: str) -> str:
    """
    Generate a description for a guard based on its ID
    
    Args:
        guard_id: Guard identifier
        
    Returns:
        Human-readable description
    """
    # Common patterns
    descriptions = {
        "profanity.detect": "Detects profanity and inappropriate language",
        "jailbreak.detect": "Detects prompt injection and jailbreak attempts",
        "toxicity.detect": "Detects toxic, insulting, and threatening content",
        "pii.detect": "Detects and anonymizes Personal Identifiable Information",
        
        # Formatting Guards
        "formatting.json": "Validates JSON format",
        "formatting.xml": "Validates XML format",
        "formatting.csv": "Validates CSV format",
        "formatting.url": "Validates URL format",
        "formatting.email": "Validates email format",
        "formatting.phone": "Validates phone number format",
        "formatting.date": "Validates date format",
        "formatting.credit_card": "Validates credit card format",
        
        # Validation Guards
        "validation.contains_string": "Validates text contains required strings",
        "validation.matches_pattern": "Validates text matches regex pattern",
        "validation.length_check": "Validates text length constraints",
        "validation.forbidden_patterns": "Validates text doesn't contain forbidden patterns",
    }
    
    return descriptions.get(guard_id, f"Enforces {guard_id.replace('.', ' ').replace('_', ' ')}")


def get_input_guards_metadata(policy_metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Get metadata for all input guards in a policy
    
    Args:
        policy_metadata: Policy metadata from compiler
        
    Returns:
        List of input guard metadata
    """
    return extract_guards_by_phase(policy_metadata, "input")


def get_output_guards_metadata(policy_metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Get metadata for all output guards in a policy
    
    Args:
        policy_metadata: Policy metadata from compiler
        
    Returns:
        List of output guard metadata
    """
    # For output guards, we filter to only those that make sense in output context
    all_guards = extract_guards_by_phase(policy_metadata, "output")
    
    # Some guards only apply to input, filter them out for output
    output_relevant = []
    for guard in all_guards:
        guard_id = guard["id"]
        # Skip pure input guards like PII redaction on input
        if guard_id.startswith("pii.") or guard_id.startswith("schema."):
            continue
        output_relevant.append(guard)
    
    return output_relevant

