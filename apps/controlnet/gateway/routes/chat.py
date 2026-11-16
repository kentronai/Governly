"""
Chat Completions API Route

OpenAI-compatible chat completions endpoint with guard enforcement.

OBSERVABILITY: This route ONLY populates request.state.
Database logging is handled by ObservabilityMiddleware (for non-streaming)
or log_streaming_completion() (for streaming responses).

request.state is populated with:
- original_body: dict
- policy_id: str
- violations: list (if blocked)
- violation_phase: str
- input_guards_executed: list
- output_guards_executed: list
- total_guard_time_ms: float
- response_payload: dict
- logged_by_handler: bool (for streaming only)
"""

import asyncio
import json
import time
import logging
from collections import deque
from typing import Dict, Any, Optional, List

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse

from cga_core import is_left, get_violations, get_context, chat_completions_pipeline
from ..guards import run_output_guards, run_tool_args_guards
from ..guard_metadata import get_input_guards_metadata, get_output_guards_metadata, mark_violated_guard

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/chat/completions")
async def chat_completions(request: Request):
    """
    OpenAI-compatible chat completions endpoint with guard enforcement.
    
    Uses request_id from ObservabilityMiddleware (SINGLE SOURCE OF TRUTH).
    Populates request.state for observability logging.
    """
    # Use request_id from ObservabilityMiddleware (NEVER generate our own)
    request_id = getattr(request.state, "request_id", "unknown")
    start_time = getattr(request.state, "start_time", time.time())
    
    # Get tenant context from auth middleware
    tenant_context = request.state.tenant_context
    
    try:
        # Parse request body
        body = await request.json()
        
        # Store for observability
        request.state.original_body = body
        
        # Extract policy_id early for observability
        policy_id_early = request.headers.get("x-policy-id") or body.get("policy_id")
        if policy_id_early:
            request.state.policy_id = policy_id_early
        
        # Build pipeline context
        initial_ctx = {
            "request": request,
            "body": body,
            "tenant_context": tenant_context,
            "request_id": request_id,
            "start_time": start_time
        }
        
        # Run functional pipeline
        logger.info(f"Starting chat pipeline for {request_id}")
        pipeline = chat_completions_pipeline()
        result = await pipeline(initial_ctx)
        
        # Handle pipeline violation
        if is_left(result):
            violations = get_violations(result)
            
            # Populate request.state for observability
            request.state.violations = violations
            request.state.violation_phase = violations[0].get('phase', 'input') if violations else 'input'
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
                    # The pipeline already produced a fail-closed violation.
                    # Observability enrichment must never replace that response
                    # with an unrelated HTTP 500.
                    request.state.policy_id = explicit_policy_id
                    request.state.policy_resolution_source = "invalid_explicit"
            
            return _build_violation_response(result, initial_ctx, tenant_context)
        
        # Extract successful context
        ctx = get_context(result)
        
        # Store policy_id for observability
        if ctx.get("policy_id"):
            request.state.policy_id = ctx["policy_id"]
        request.state.application_id = ctx.get("application_id")
        request.state.agent_id = ctx.get("agent_id")
        request.state.policy_resolution_source = ctx.get("policy_resolution_source")

        # Record where the request was actually routed. The tenant's Model
        # Registry selection overrides the requested model, so "requested
        # gpt-4o-mini" can leave for a different provider entirely — and when
        # that provider rejects the caller's BYOK key the only symptom was an
        # opaque 400. Log the routing so the mismatch is visible.
        model_target = ctx.get("model_target")
        if model_target is not None:
            request.state.routed_model = getattr(model_target, "model_id", None)
            request.state.routed_provider = getattr(model_target, "provider", None)
            request.state.routed_base_url = getattr(model_target, "base_url", None)
            requested_model = (body or {}).get("model")
            if requested_model and requested_model != request.state.routed_model:
                logger.warning(
                    "model_registry_override: requested=%s routed=%s provider=%s base_url=%s",
                    requested_model,
                    request.state.routed_model,
                    request.state.routed_provider,
                    request.state.routed_base_url,
                )
        
        # Get guard metadata
        input_guards_executed = get_input_guards_metadata(ctx["policy_metadata"])
        input_guard_time = (time.time() - start_time) * 1000
        
        # Store for observability
        request.state.input_guards_executed = input_guards_executed
        request.state.total_guard_time_ms = input_guard_time
        
        # Route to streaming or non-streaming handler
        if ctx["body"].get("stream", False):
            return await _handle_streaming(
                request=request,
                request_id=request_id,
                body=ctx["body"],
                compiled_guards=ctx["compiled_guards"],
                policy_metadata=ctx["policy_metadata"],
                tenant_id=tenant_context.tenant_id,
                policy_id=ctx["policy_id"],
                trace_id=ctx.get("trace_id", request_id),
                start_time=start_time,
                input_guards_executed=input_guards_executed,
                input_guard_time=input_guard_time,
                provider_client=ctx["provider_client"]
            )
        else:
            return await _handle_non_streaming(
                request=request,
                request_id=request_id,
                body=ctx["body"],
                compiled_guards=ctx["compiled_guards"],
                policy_metadata=ctx["policy_metadata"],
                tenant_id=tenant_context.tenant_id,
                policy_id=ctx["policy_id"],
                trace_id=ctx.get("trace_id", request_id),
                start_time=start_time,
                input_guards_executed=input_guards_executed,
                input_guard_time=input_guard_time,
                provider_client=ctx["provider_client"]
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chat completions error: {e}", exc_info=True)
        request.state.response_payload = {
            "error": {
                "type": "internal_error",
                "message": str(e),
                "error_type": type(e).__name__,
            }
        }
        raise HTTPException(status_code=500, detail=str(e))


def _build_violation_response(result: Any, initial_ctx: Dict, tenant_context: Any) -> JSONResponse:
    """Build error response for pipeline violation"""
    violations = get_violations(result)
    violation = violations[0] if violations else {}
    request_id = initial_ctx["request_id"]
    
    # Determine status code
    rule_id = violation.get("rule_id", "")
    if rule_id.startswith("request.") or rule_id.startswith("model."):
        status_code = 400
    elif rule_id.startswith("policy."):
        status_code = 404
    elif violation.get("phase") == "input":
        status_code = 400
    else:
        status_code = 500
    
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "type": "policy_violation" if violation.get("phase") in ["input", "output"] else "pipeline_violation",
                "message": violation.get("message"),
                "rule_id": violation.get("rule_id"),
                "severity": violation.get("severity", "high"),
                "phase": violation.get("phase", "pipeline"),
                "request_id": request_id
            }
        },
        headers={
            "x-request-id": request_id,
            "x-tenant-id": tenant_context.tenant_id,
        }
    )


async def _handle_streaming(
    request: Request,
    request_id: str,
    body: Dict[str, Any],
    compiled_guards: Any,
    policy_metadata: Dict[str, Any],
    tenant_id: str,
    policy_id: Optional[str],
    trace_id: str,
    start_time: float,
    input_guards_executed: List[Dict[str, Any]],
    input_guard_time: float,
    provider_client: Any
) -> StreamingResponse:
    """Handle streaming chat completion with guards"""
    
    streaming_output_guard_time = 0.0
    streaming_violations = None
    output_guards_executed = get_output_guards_metadata(policy_metadata)
    
    async def stream_generator():
        nonlocal streaming_output_guard_time, streaming_violations, output_guards_executed
        
        policy_hash = policy_metadata.get("hash", "unknown")
        settings = request.app.state.settings
        window_size = settings.streaming_window_size
        
        # Send guardrails metadata chunk
        guardrails_chunk = {
            "guardrails": {
                "input_guards": input_guards_executed,
                "output_guards": output_guards_executed,
                "execution_time_ms": {"input": input_guard_time, "output": 0},
                "policy_id": policy_id or "default",
                "total_guards_executed": len(input_guards_executed) + len(output_guards_executed),
                "modified_messages": body.get("messages", [])
            }
        }
        yield f"data: {json.dumps(guardrails_chunk)}\n\n"
        
        try:
            # Per-choice state: with n > 1 every choice is streamed to the
            # client, so every choice gets its own window and checks.
            windows: Dict[int, deque] = {}
            full_text: Dict[int, List[str]] = {}
            # Tool-call deltas are buffered (not forwarded) until the stream
            # ends, then enforced like the non-streaming path. The provider's
            # finish chunk is held back so it still arrives after the calls.
            tool_buf: Dict[tuple, Dict[str, Any]] = {}
            held_chunks: List[Dict[str, Any]] = []
            last_chunk: Dict[str, Any] = {}

            def _filtered_chunk(index: int) -> Dict[str, Any]:
                return {
                    **{k: last_chunk[k] for k in ("id", "object", "created", "model") if k in last_chunk},
                    "choices": [{
                        "index": index,
                        "delta": {"content": "[Content filtered by policy]"},
                        "finish_reason": "content_filter"
                    }]
                }

            def _record_violation(violations: List[Dict[str, Any]]) -> None:
                nonlocal streaming_violations
                streaming_violations = violations
                request.state.violations = violations
                request.state.violation_phase = "output"
                logger.warning(f"Streaming output blocked: {violations[0].get('rule_id')}")

            async for chunk in provider_client.stream_completions(body):
                last_chunk = chunk
                choices = chunk.get("choices") or []
                has_tool_delta = False
                blocked_index = None
                for choice in choices:
                    index = choice.get("index", 0)
                    delta = choice.get("delta") or {}
                    for tc in delta.get("tool_calls") or []:
                        has_tool_delta = True
                        buf = tool_buf.setdefault(
                            (index, tc.get("index", 0)),
                            {"id": None, "type": "function", "function": {"name": "", "arguments": ""}},
                        )
                        if tc.get("id"):
                            buf["id"] = tc["id"]
                        fn = tc.get("function") or {}
                        buf["function"]["name"] += fn.get("name") or ""
                        buf["function"]["arguments"] += fn.get("arguments") or ""

                    token = delta.get("content")
                    if not token:
                        continue
                    window = windows.setdefault(index, deque(maxlen=window_size))
                    window.append(token)
                    full_text.setdefault(index, []).append(token)

                    # Run T0/T1 guards on window before this token is sent
                    guard_start = time.time()
                    output_result = await run_output_guards(
                        compiled_guards,
                        {"output": "".join(window)},
                        tiers=["T0", "T1"],
                        policy_metadata=policy_metadata
                    )
                    streaming_output_guard_time += (time.time() - guard_start) * 1000
                    if is_left(output_result):
                        _record_violation(get_violations(output_result))
                        blocked_index = index
                        break

                if blocked_index is not None:
                    yield f"data: {json.dumps(_filtered_chunk(blocked_index))}\n\n"
                    break

                if tool_buf and any(c.get("finish_reason") for c in choices):
                    held_chunks.append(chunk)
                    continue
                if has_tool_delta:
                    # Forward any content in this chunk, never the raw tool-call deltas.
                    stripped = [
                        {**c, "delta": {k: v for k, v in (c.get("delta") or {}).items() if k != "tool_calls"}}
                        for c in choices
                    ]
                    if any(c["delta"].get("content") for c in stripped):
                        yield f"data: {json.dumps({**chunk, 'choices': stripped})}\n\n"
                    continue
                yield f"data: {json.dumps(chunk)}\n\n"

            if not streaming_violations:
                # Final T2 check on each choice's FULL text, before the stream
                # is closed, so a violation can still be reported in-band.
                for index, tokens in full_text.items():
                    t2_start = time.time()
                    final_result = await run_output_guards(
                        compiled_guards,
                        {"output": "".join(tokens)},
                        tiers=["T2"],
                        policy_metadata=policy_metadata
                    )
                    streaming_output_guard_time += (time.time() - t2_start) * 1000
                    if is_left(final_result):
                        _record_violation(get_violations(final_result))
                        yield f"data: {json.dumps(_filtered_chunk(index))}\n\n"
                        break

            if not streaming_violations and tool_buf:
                by_choice: Dict[int, List[tuple]] = {}
                for (choice_index, tc_index), call in sorted(tool_buf.items()):
                    by_choice.setdefault(choice_index, []).append((tc_index, call))
                blocked_choices = set()
                for choice_index, calls in by_choice.items():
                    allowed = await _enforce_tool_args([c for _, c in calls], compiled_guards, request_id)
                    allowed_ids = {id(c) for c in allowed}
                    if allowed:
                        delta_calls = [
                            {"index": tc_index, **call}
                            for tc_index, call in calls if id(call) in allowed_ids
                        ]
                        out = {
                            **{k: last_chunk[k] for k in ("id", "object", "created", "model") if k in last_chunk},
                            "choices": [{"index": choice_index, "delta": {"tool_calls": delta_calls}, "finish_reason": None}]
                        }
                        yield f"data: {json.dumps(out)}\n\n"
                    else:
                        blocked_choices.add(choice_index)
                        yield f"data: {json.dumps({**_filtered_chunk(choice_index), 'choices': [{'index': choice_index, 'delta': {'content': 'Tool calls were blocked by policy'}, 'finish_reason': 'content_filter'}]})}\n\n"
                for chunk in held_chunks:
                    chunk_choices = [c for c in (chunk.get("choices") or []) if c.get("index", 0) not in blocked_choices]
                    if chunk_choices or not chunk.get("choices"):
                        yield f"data: {json.dumps({**chunk, 'choices': chunk_choices})}\n\n"
            elif not streaming_violations:
                for chunk in held_chunks:
                    yield f"data: {json.dumps(chunk)}\n\n"

            yield "data: [DONE]\n\n"

        except Exception as e:
            from ..llm_client import ProviderAPIError

            if isinstance(e, ProviderAPIError):
                error_chunk = {
                    "error": {
                        "type": "provider_error",
                        "code": e.code,
                        "message": str(e),
                        "trace_id": trace_id,
                    }
                }
            else:
                logger.error("Streaming completion failed", exc_info=True)
                error_chunk = {
                    "error": {
                        "type": "internal_error",
                        "message": "The response stream failed unexpectedly.",
                        "trace_id": trace_id,
                    }
                }
            yield f"data: {json.dumps(error_chunk)}\n\n"
        
        finally:
            # ================================================
            # POPULATE request.state FOR OBSERVABILITY
            # ================================================
            request.state.input_guards_executed = input_guards_executed
            request.state.output_guards_executed = output_guards_executed
            request.state.total_guard_time_ms = input_guard_time + streaming_output_guard_time
            request.state.response_payload = {"stream": True, "completed": True}
            
            if streaming_violations:
                request.state.violations = streaming_violations
                request.state.violation_phase = "output"
            
            # ================================================
            # LOG STREAMING COMPLETION
            # ================================================
            # Streaming responses complete asynchronously after middleware returns,
            # so we must log here using the centralized function.
            try:
                from ..middleware.observability import log_streaming_completion, _background_tasks
                
                # Mark as logged to prevent middleware from double-logging
                request.state.logged_by_handler = True
                
                latency_ms = int((time.time() - start_time) * 1000)
                status_code = 400 if streaming_violations else 200
                
                # Background logging - response already sent to user
                task = asyncio.create_task(log_streaming_completion(
                    request=request,
                    request_id=request_id,
                    latency_ms=latency_ms,
                    response_status_code=status_code
                ))
                _background_tasks.add(task)
                task.add_done_callback(_background_tasks.discard)
            except Exception as e:
                logger.error(f"Failed to log streaming completion: {e}", exc_info=True)
    
    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
            "x-request-id": request_id,
            "x-policy-id": policy_id or "default",
            "x-policy-hash": f"sha256:{policy_metadata.get('hash', 'unknown')}",
            "x-tenant-id": tenant_id,
            "x-trace-id": trace_id
        }
    )


async def _handle_non_streaming(
    request: Request,
    request_id: str,
    body: Dict[str, Any],
    compiled_guards: Any,
    policy_metadata: Dict[str, Any],
    tenant_id: str,
    policy_id: Optional[str],
    trace_id: str,
    start_time: float,
    input_guards_executed: List[Dict[str, Any]],
    input_guard_time: float,
    provider_client: Any
) -> JSONResponse:
    """Handle non-streaming chat completion with guards"""
    
    policy_hash = policy_metadata.get("hash", "unknown")
    
    try:
        # Make request to provider
        response = await provider_client.create_completion(body)
        
        # Every choice is returned to the client (n > 1), so every choice's
        # tool calls and content must be guarded, not just choices[0].
        choices = response.get("choices") or []

        # Handle tool calls
        for index, choice in enumerate(choices):
            tool_calls = _extract_tool_calls(response, index)
            if not tool_calls:
                continue
            filtered_calls = await _enforce_tool_args(tool_calls, compiled_guards, request_id)
            message = choice.get("message", {})
            if filtered_calls:
                message["tool_calls"] = filtered_calls
            else:
                message.pop("tool_calls", None)
                message.pop("function_call", None)
                message["content"] = "Tool calls were blocked by policy"
                choice["finish_reason"] = "content_filter"
        
        # Run output guards
        output_guard_start = time.time()
        contents = [
            (choice.get("message") or {}).get("content") or "" for choice in choices
        ] or [""]
        choice_results = await asyncio.gather(*[
            run_output_guards(
                compiled_guards,
                {"output": text},
                policy_metadata=policy_metadata
            )
            for text in contents
        ])
        # First violating choice decides the response; otherwise keep all results
        # so each choice gets its own (possibly redacted) output.
        output_result = next((r for r in choice_results if is_left(r)), choice_results[0])
        output_guard_time = (time.time() - output_guard_start) * 1000
        
        # Get output guards metadata
        output_guards_executed = get_output_guards_metadata(policy_metadata)
        
        if is_left(output_result):
            violations = get_violations(output_result)
            output_guards_executed = mark_violated_guard(output_guards_executed, violations[0])
            
            # Populate request.state for observability
            request.state.violations = violations
            request.state.violation_phase = "output"
            request.state.output_guards_executed = output_guards_executed
            request.state.total_guard_time_ms = input_guard_time + output_guard_time
            
            return JSONResponse(
                status_code=400,
                content={
                    "error": {
                        "type": "policy_violation",
                        "message": f"Output policy violation: {violations[0]['message']}",
                        "rule_id": violations[0]["rule_id"],
                        "request_id": request_id
                    },
                    "guardrails": {
                        "input_guards": input_guards_executed,
                        "output_guards": output_guards_executed,
                        "execution_time_ms": {"input": input_guard_time, "output": output_guard_time}
                    }
                },
                headers={
                    "x-request-id": request_id,
                    "x-policy-id": policy_id or "default",
                    "x-tenant-id": tenant_id,
                }
            )

        # A guard may pass the request through while rewriting ctx["output"]
        # (e.g. pii.redact silently scrubbing PII instead of blocking).
        # Write that back into the response before returning it, otherwise
        # the rewrite is computed and discarded. Only applies to non-streaming
        # responses - streamed chunks are already sent to the client by the
        # time later output guards would run, so this cannot redact a stream.
        for choice, text, result in zip(choices, contents, choice_results):
            redacted_output = get_context(result).get("output", text)
            if redacted_output != text:
                choice.setdefault("message", {})["content"] = redacted_output

        # Success - populate request.state for observability
        request.state.output_guards_executed = output_guards_executed
        request.state.total_guard_time_ms = input_guard_time + output_guard_time
        request.state.response_payload = response

        # Add guardrails info to response
        if "choices" in response:
            response["guardrails"] = {
                "input_guards": input_guards_executed,
                "output_guards": output_guards_executed,
                "execution_time_ms": {"input": input_guard_time, "output": output_guard_time},
                "policy_id": policy_id or "default",
                "total_guards_executed": len(input_guards_executed) + len(output_guards_executed),
            }
        
        return JSONResponse(
            content=response,
            headers={
                "x-request-id": request_id,
                "x-policy-id": policy_id or "default",
                "x-policy-hash": f"sha256:{policy_hash}",
                "x-tenant-id": tenant_id,
                "x-trace-id": trace_id
            }
        )
        
    except Exception as e:
        from ..llm_client import ProviderAPIError

        # An HTTPException raised here is turned into a response before it
        # reaches ObservabilityMiddleware, so the failure reason is only in the
        # log row if we put it on request.state first. Without this the
        # dashboard showed a failed request with no explanation at all.
        if isinstance(e, ProviderAPIError):
            request.state.response_payload = {
                "error": {
                    "type": "provider_error",
                    "code": e.code,
                    "message": str(e),
                    "provider_message": e.provider_message,
                    "provider_status_code": e.status_code,
                }
            }
            raise HTTPException(
                status_code=e.status_code,
                detail={
                    "type": "provider_error",
                    "code": e.code,
                    "message": str(e),
                },
            )
        logger.error(f"Completion error: {e}", exc_info=True)
        request.state.response_payload = {
            "error": {
                "type": "internal_error",
                "message": "The model provider request failed unexpectedly.",
                "error_type": type(e).__name__,
            }
        }
        raise HTTPException(
            status_code=500,
            detail="The model provider request failed unexpectedly.",
        )


def _extract_tool_calls(response: Dict[str, Any], index: int = 0) -> List[Dict[str, Any]]:
    """Extract tool calls from one choice of an OpenAI response"""
    tool_calls = []
    
    if "choices" not in response or len(response["choices"]) <= index:
        return tool_calls
    
    message = response["choices"][index].get("message", {})
    
    # New format: tool_calls
    if "tool_calls" in message and message["tool_calls"]:
        for tc in message["tool_calls"]:
            if tc.get("type") == "function":
                func = tc.get("function", {})
                tool_calls.append({
                    "id": tc.get("id"),
                    "type": "function",
                    "function": {"name": func.get("name"), "arguments": func.get("arguments")}
                })
    
    # Legacy format: function_call
    elif "function_call" in message and message["function_call"]:
        fc = message["function_call"]
        import uuid
        tool_calls.append({
            "id": f"call_{uuid.uuid4().hex[:8]}",
            "type": "function",
            "function": {"name": fc.get("name"), "arguments": fc.get("arguments")}
        })
    
    return tool_calls


async def _enforce_tool_args(
    tool_calls: List[Dict[str, Any]],
    compiled_guards: Any,
    request_id: str
) -> List[Dict[str, Any]]:
    """Enforce guards on tool arguments"""
    filtered = []
    
    for tc in tool_calls:
        if tc.get("type") != "function":
            filtered.append(tc)
            continue
        
        func = tc.get("function", {})
        func_name = func.get("name")
        func_args = func.get("arguments", "{}")
        
        try:
            args_dict = json.loads(func_args) if isinstance(func_args, str) else func_args
        except json.JSONDecodeError:
            args_dict = {}
        
        tool_args_guard = compiled_guards.get("tool_args")
        if tool_args_guard:
            result = await run_tool_args_guards(tool_args_guard, {
                "function_name": func_name,
                "arguments": args_dict
            })
            
            if is_left(result):
                violations = get_violations(result)
                logger.warning(f"Tool args blocked: {violations[0].get('rule_id')}")
                continue
            
            # Get potentially modified args
            # run_tool_args_guards nests the payload under ctx["tool_args"];
            # fall back to a top-level "arguments" for older guards.
            ctx = get_context(result)
            tool_ctx = ctx.get("tool_args")
            if isinstance(tool_ctx, dict) and "arguments" in tool_ctx:
                updated_args = tool_ctx["arguments"]
            else:
                updated_args = ctx.get("arguments", args_dict)
            tc["function"]["arguments"] = json.dumps(updated_args)
        
        filtered.append(tc)
    
    return filtered
