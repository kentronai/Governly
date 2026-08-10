"""
Default Guardrails Package

Core production-ready guardrails for common AI safety use cases.
These guardrails are designed to be fast, reliable, and easy to configure.

Guardrails:
- profanity.detect: Detects profane and offensive language (T0)
- jailbreak.detect: Detects prompt injection and jailbreak attempts (T1)
- toxicity.detect: Detects toxic, harmful, and abusive content (T1)
- harmful_instructions.detect: Blocks actionable wrongdoing instructions (T0)
- pii.detect: Detects and anonymizes Personal Identifiable Information (T0)
- pii.redact: Silently redacts PII without blocking the request (T0)

All guards follow the Composable Guard Algebra (CGA) architecture and use
functional programming principles with Either monads for error handling.

Example usage in policy YAML:
```yaml
guards:
  - id: profanity.detect
    target: messages[*].content
    with:
      threshold: 1.0
      severity: high
      
  - id: pii.detect
    target: messages[*].content
    with:
      types: ["EMAIL", "PHONE", "SSN"]
      anonymize_mode: mask
```
"""

from . import guards

__all__ = ["guards"]
