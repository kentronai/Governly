"""
Gateway Middleware

Clean middleware architecture inspired by Trylon Gateway.
Each middleware handles ONE responsibility:
- Authentication: Verify tenant/API keys
- Policy: Load and cache policies
- Input Guards: Run T0/T1/T2 guards on requests
- Output Guards: Run guards on responses
- Observability: Log requests/responses
- Error Handling: Centralized error responses
"""

from .auth import AuthenticationMiddleware
from .policy import PolicyMiddleware
from .input_guards import InputGuardsMiddleware
from .observability import ObservabilityMiddleware

__all__ = [
    "AuthenticationMiddleware",
    "PolicyMiddleware",
    "InputGuardsMiddleware",
    "ObservabilityMiddleware",
]

