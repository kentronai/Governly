"""
Policy Check API Route

`POST /v1/guard/check` — evaluate a message against the caller's NORIX policy
and return the decision. **No model is ever called.**

This is the endpoint NORIX hands to customers. They keep their own LLM and their
own provider credentials; NORIX is the security checkpoint in front of it:

    user message
        │
        ▼
    POST /v1/guard/check   ──►  {"allowed": false, "violation": {...}}  ──► show the block
        │
        │ {"allowed": true}
        ▼
    customer calls THEIR OWN LLM with THEIR OWN key

The proxying endpoint (`/v1/chat/completions`) still exists for callers who want
NORIX to forward to a provider, but it is not required — and a customer using
guard-check is never exposed to provider errors, model-registry routing, or
anyone else's API key.

OBSERVABILITY: like chat.py, this route ONLY populates request.state.
ObservabilityMiddleware performs the single database write.
"""

import time
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse

from cga_core import is_left, get_violations, get_context, guard_check_pipeline
from ..guard_metadata import get_input_guards_metadata, mark_violated_guard

router = APIRouter()
logger = logging.getLogger(__name__)


def _extract_text(body: Dict[str, Any]) -> Optional[str]:
    """Accept either an OpenAI-style `messages` array or a plain string field.

    Customers arrive here from two directions: some already build an OpenAI
    request and want it vetted before sending it on, others just have the raw
    user turn. Both are first-class.
    """
    messages = body.get("messages")
    if isinstance(messages, list) and messages:
        for message in reversed(messages):
            if isinstance(message, dict) and message.get("role") == "user":
                content = message.get("content")
                if isinstance(content, str):
                    return content
        return None

    for key in ("input", "text", "prompt", "content", "message"):
        value = body.get(key)
        if isinstance(value, str):
            return value

    return None


def _normalise_body(body: Dict[str, Any], text: str) -> Dict[str, Any]:
    """Give the shared pipeline the `messages` shape it evaluates.

    The guards must see exactly what a proxied completion would see, otherwise
    a message could be allowed by the check endpoint and blocked by the proxy.
    """
    if isinstance(body.get("messages"), list) and body["messages"]:
        return body
    return {**body, "messages": [{"role": "user", "content": text}]}


@router.post("/guard/check")
async def guard_check(request: Request):
    """Evaluate a message against the caller's policy. Never calls a model."""
    request_id = getattr(request.state, "request_id", "unknown")
    start_time = getattr(request.state, "start_time", time.time())
    tenant_context = request.state.tenant_context

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Request body must be JSON.",
        )

    if not isinstance(body, dict):
        raise HTTPException(
            status_code=400,
            detail="Request body must be a JSON object.",
        )

    text = _extract_text(body)
    if not text or not text.strip():
        detail = (
            "No message to check. Provide either a 'messages' array with a "
            "user turn, or an 'input' string."
        )
        request.state.original_body = body
        request.state.response_payload = {
            "error": {"type": "invalid_request", "message": detail}
        }
        raise HTTPException(status_code=400, detail=detail)

    evaluated_body = _normalise_body(body, text)

    # Store for observability. The dashboard renders the user prompt from this,
    # so it must carry the messages shape the guards actually saw.
    request.state.original_body = evaluated_body

    policy_id_early = request.headers.get("x-policy-id") or body.get("policy_id")
    if policy_id_early:
        request.state.policy_id = policy_id_early

    initial_ctx = {
        "request": request,
        "body": evaluated_body,
        "tenant_context": tenant_context,
        "request_id": request_id,
        "start_time": start_time,
        # Tells extract_request_params not to demand a model id or a provider
        # key — there is no provider in this flow.
        "guard_only": True,
    }

    try:
        pipeline = guard_check_pipeline()
        result = await pipeline(initial_ctx)
    except Exception as e:
        logger.error(f"Guard check failed: {e}", exc_info=True)
        request.state.response_payload = {
            "error": {
                "type": "internal_error",
                "message": "The policy check failed unexpectedly.",
                "error_type": type(e).__name__,
            }
        }
        raise HTTPException(
            status_code=500,
            detail="The policy check failed unexpectedly.",
        )

    guard_time_ms = (time.time() - start_time) * 1000

    if is_left(result):
        violations = get_violations(result)
        violation = violations[0] if violations else {}
        phase = violation.get("phase")

        await _record_identity(request, body, tenant_context)

        # A guard firing is a *successful* check with a "block" answer. A
        # pipeline failure (no policy, unusable policy) is not a decision at
        # all, and must not be reported to the customer as "your user said
        # something bad".
        if phase not in ("input", "output", "tool_args"):
            request.state.violations = violations
            request.state.violation_phase = violation.get("phase", "pipeline")
            request.state.total_guard_time_ms = guard_time_ms
            return _pipeline_error_response(
                violation, request_id, tenant_context, request.state
            )

        request.state.violations = violations
        request.state.violation_phase = phase
        request.state.total_guard_time_ms = guard_time_ms

        return _decision_response(
            allowed=False,
            request_id=request_id,
            tenant_context=tenant_context,
            policy_id=getattr(request.state, "policy_id", None),
            guards=[],
            guard_time_ms=guard_time_ms,
            violation=violation,
            request_state=request.state,
        )

    ctx = get_context(result)

    if ctx.get("policy_id"):
        request.state.policy_id = ctx["policy_id"]
    request.state.application_id = ctx.get("application_id")
    request.state.agent_id = ctx.get("agent_id")
    request.state.policy_resolution_source = ctx.get("policy_resolution_source")

    guards = get_input_guards_metadata(ctx["policy_metadata"])
    request.state.input_guards_executed = guards
    request.state.total_guard_time_ms = guard_time_ms

    return _decision_response(
        allowed=True,
        request_id=request_id,
        tenant_context=tenant_context,
        policy_id=ctx.get("policy_id"),
        guards=guards,
        guard_time_ms=guard_time_ms,
        violation=None,
        request_state=request.state,
    )


async def _record_identity(request: Request, body: Dict[str, Any], tenant_context: Any) -> None:
    """Attribute a blocked check to its application/agent for the dashboard.

    The pipeline stops before it reaches this resolution when it fails early, so
    without this a blocked request would be invisible on the application's
    Overview page.
    """
    try:
        from gateway.services.agent_identity_service import resolve_agent_identity

        agent_id, application_id = await resolve_agent_identity(
            tenant_id=tenant_context.tenant_id,
            agent_identifier=request.headers.get("x-agent-id") or body.get("agent_id"),
            application_id=request.headers.get("x-application-id") or body.get("application_id"),
        )
        request.state.agent_id = agent_id
        request.state.application_id = application_id

        explicit_policy_id = request.headers.get("x-policy-id") or body.get("policy_id")
        if application_id:
            from gateway.services.application_policy_service import resolve_application_policy

            try:
                resolved_policy_id, policy_source = await resolve_application_policy(
                    tenant_id=tenant_context.tenant_id,
                    application_id=application_id,
                    explicit_policy_id=explicit_policy_id,
                )
                request.state.policy_id = resolved_policy_id
                request.state.policy_resolution_source = policy_source
            except ValueError:
                request.state.policy_id = explicit_policy_id
                request.state.policy_resolution_source = "invalid_explicit"
    except Exception:
        # Attribution is best-effort; it must never turn a clean policy
        # decision into a 500.
        logger.warning("guard_check_identity_resolution_failed", exc_info=True)


def _decision_response(
    allowed: bool,
    request_id: str,
    tenant_context: Any,
    policy_id: Optional[str],
    guards: List[Dict[str, Any]],
    guard_time_ms: float,
    violation: Optional[Dict[str, Any]],
    request_state: Any,
) -> JSONResponse:
    """Build the allow/block answer.

    Both answers are HTTP 200: the *check* succeeded either way. Callers branch
    on `allowed`, not on the status code — that keeps a policy block clearly
    distinct from an outage, a bad key, or a malformed request, all of which are
    genuine non-2xx.
    """
    decision = "allow" if allowed else "block"

    if not allowed and violation:
        guards = mark_violated_guard(guards, violation) if guards else guards

    payload: Dict[str, Any] = {
        "allowed": allowed,
        "decision": decision,
        "request_id": request_id,
        "policy_id": policy_id or "default",
        "guardrails": {
            "input_guards": guards,
            "total_guards_executed": len(guards),
            "execution_time_ms": round(guard_time_ms, 2),
        },
    }

    if violation:
        payload["violation"] = {
            "rule_id": violation.get("rule_id"),
            "message": violation.get("message"),
            "severity": violation.get("severity", "high"),
            "phase": violation.get("phase", "input"),
            "score": violation.get("score"),
            "evidence": violation.get("evidence"),
        }
    else:
        payload["violation"] = None

    # The full response is what the dashboard's View panel shows.
    request_state.response_payload = payload

    return JSONResponse(
        status_code=200,
        content=payload,
        headers={
            "x-request-id": request_id,
            "x-tenant-id": tenant_context.tenant_id,
            # Lets a proxy or edge rule branch without parsing the body.
            "x-norix-decision": decision,
        },
    )


def _pipeline_error_response(
    violation: Dict[str, Any],
    request_id: str,
    tenant_context: Any,
    request_state: Any,
) -> JSONResponse:
    """The check could not be performed — this is not a policy decision."""
    rule_id = violation.get("rule_id", "")
    status_code = 404 if rule_id.startswith("policy.") else 400

    payload = {
        "error": {
            "type": "policy_check_failed",
            "message": violation.get("message"),
            "rule_id": violation.get("rule_id"),
            "request_id": request_id,
        }
    }
    # Without this the dashboard shows a failed check with no explanation, which
    # is the exact dead end that made the proxy's provider errors undiagnosable.
    request_state.response_payload = payload

    return JSONResponse(
        status_code=status_code,
        content=payload,
        headers={
            "x-request-id": request_id,
            "x-tenant-id": tenant_context.tenant_id,
        },
    )
