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
                resolved_policy_id, policy_source = await resolve_application_policy(
                    tenant_id=tenant_context.tenant_id,
                    application_id=application_id,
                    explicit_policy_id=explicit_policy_id,
                )
                request.state.policy_id = resolved_policy_id
                request.state.policy_resolution_source = policy_source
            
            return _build_violation_response(result, initial_ctx, tenant_context)
        
        # Extract successful context
        ctx = get_context(result)
        
        # Store policy_id for observability
        if ctx.get("policy_id"):
            request.state.policy_id = ctx["policy_id"]
        request.state.application_id = ctx.get("application_id")
        request.state.agent_id = ctx.get("agent_id")
        request.state.policy_resolution_source = ctx.get("policy_resolution_source")
        
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
        streaming_window = deque(maxlen=window_size)
        
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
            output_guard_start = time.time()
            async for chunk in provider_client.stream_completions(body):
                # Extract and guard output tokens
                if chunk.get("choices") and chunk["choices"]:
                    choice = chunk["choices"][0]
                    if "delta" in choice and "content" in choice["delta"]:
                        token = choice["delta"]["content"]
                        if token:
                            streaming_window.append(token)
                            
                            # Run T0/T1 guards on window
                            window_text = "".join(streaming_window)
                            guard_start = time.time()
                            
                            output_result = await run_output_guards(
                                compiled_guards,
                                {"output": window_text},
                                tiers=["T0", "T1"],
                                policy_metadata=policy_metadata
                            )
                            
                            streaming_output_guard_time += (time.time() - guard_start) * 1000
                            
                            if is_left(output_result):
                                violations = get_violations(output_result)
                                streaming_violations = violations
                                
                                # Store for observability
                                request.state.violations = violations
                                request.state.violation_phase = "output"
                                
                                logger.warning(f"Streaming output blocked: {violations[0].get('rule_id')}")
                                
                                safe_chunk = {
                                    "choices": [{
                                        "delta": {"content": "[Content filtered by policy]"},
                                        "finish_reason": "content_filter"
                                    }]
                                }
                                yield f"data: {json.dumps(safe_chunk)}\n\n"
                                break
                
                yield f"data: {json.dumps(chunk)}\n\n"
            
            yield "data: [DONE]\n\n"
            
            # Final T2 guard check
            final_text = "".join(streaming_window)
            if final_text and not streaming_violations:
                t2_start = time.time()
                final_result = await run_output_guards(
                    compiled_guards,
                    {"output": final_text},
                    tiers=["T2"],
                    policy_metadata=policy_metadata
                )
                streaming_output_guard_time += (time.time() - t2_start) * 1000
                
                if is_left(final_result):
                    violations = get_violations(final_result)
                    streaming_violations = violations
                    request.state.violations = violations
                    request.state.violation_phase = "output"
        
        except Exception as e:
            error_chunk = {"error": {"type": "internal_error", "message": str(e), "trace_id": trace_id}}
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
        
        # Handle tool calls
        tool_calls = _extract_tool_calls(response)
        if tool_calls:
            filtered_calls = await _enforce_tool_args(tool_calls, compiled_guards, request_id)
            if "choices" in response and response["choices"]:
                choice = response["choices"][0]
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
        content = ""
        if "choices" in response and response["choices"]:
            content = response["choices"][0].get("message", {}).get("content", "")
        
        output_result = await run_output_guards(
            compiled_guards,
            {"output": content},
            policy_metadata=policy_metadata
        )
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
        logger.error(f"Completion error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def _extract_tool_calls(response: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract tool calls from OpenAI response"""
    tool_calls = []
    
    if "choices" not in response or not response["choices"]:
        return tool_calls
    
    message = response["choices"][0].get("message", {})
    
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
            ctx = get_context(result)
            updated_args = ctx.get("arguments", args_dict)
            tc["function"]["arguments"] = json.dumps(updated_args)
        
        filtered.append(tc)
    
    return filtered
