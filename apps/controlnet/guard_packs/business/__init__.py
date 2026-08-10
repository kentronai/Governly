"""
Business Guard Pack

Guardrails for business-specific brand and competitive-positioning risk:
- business.competitor_protection: Blocks mentions of named competitors,
  optionally scoped to specific topics (T0)
- business.brand_tone: Blocks configured unprofessional language patterns (T0)

All guards follow the Composable Guard Algebra (CGA) architecture and use
functional programming principles with Either monads for error handling.
"""

from . import guards

__all__ = ["guards"]
