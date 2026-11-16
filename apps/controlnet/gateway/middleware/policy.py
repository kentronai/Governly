"""
Policy Middleware

Resolves and caches policies for each request.
Attaches compiled guards to request.state.
"""

import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


class PolicyMiddleware(BaseHTTPMiddleware):
    """
    Load policy and compile guards for each request
    
    Flow:
    1. Get policy_id from X-Policy-ID header or tenant default
    2. Load policy from cache (PolicyCache handles caching)
    3. Compile guards if not cached
    4. Attach compiled_guards and policy_metadata to request.state
    5. Pass through to next middleware
    """
    
    # Only the guarded routes use a policy. Everything else (/v1/policies,
    # /v1/guardrails, /v1/cache, /v1/observability, ...) passes straight through.
    POLICY_PATHS = ("/v1/chat/completions", "/v1/guard/check")

    async def dispatch(self, request: Request, call_next):
        if request.url.path not in self.POLICY_PATHS:
            return await call_next(request)

        policy_id = request.headers.get("x-policy-id")
        application_id = request.headers.get("x-application-id")
        tenant_id = getattr(request.state, "tenant_id", None)

        # No header? The route resolves policy from its JSON body or the tenant
        # default; never pre-load the global settings default here.
        if not tenant_id or not (policy_id or application_id):
            return await call_next(request)

        try:
            if application_id:
                from gateway.services.application_policy_service import resolve_application_policy
                policy_id, source = await resolve_application_policy(
                    tenant_id=tenant_id,
                    application_id=application_id,
                    explicit_policy_id=policy_id,
                )
                request.state.application_id = application_id
                request.state.policy_resolution_source = source

            if policy_id:
                policy_cache = request.app.state.policy_cache
                compiled_guards, policy_metadata = await policy_cache.get_policy(
                    tenant_id=tenant_id,
                    policy_id=policy_id,
                )
                request.state.policy_id = policy_id
                request.state.compiled_guards = compiled_guards
                request.state.policy_metadata = policy_metadata
                request.state.policy_hash = (policy_metadata or {}).get("hash", "unknown")
        except Exception as e:
            # The route's own pipeline fails closed with a proper violation;
            # this middleware only pre-populates observability state.
            logger.warning(f"Policy pre-load skipped for {request.url.path}: {e}")

        return await call_next(request)
