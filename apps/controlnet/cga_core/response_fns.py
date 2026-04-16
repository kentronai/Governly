"""
Pure functions for response handling
Each function is small, focused, and returns Either
No fallbacks, clean composition
"""

import json
import uuid
import logging
from typing import Dict, Any, List
from .types import Either, Left_, Right_, Ctx

logger = logging.getLogger(__name__)


# === TOOL CALL EXTRACTION ===

def has_tool_calls(body: Dict[str, Any]) -> bool:
    """Check if the request includes tool/function calls"""
    return bool(body.get("tools") or body.get("functions"))


def extract_tool_calls_from_response(response: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Extract tool calls from OpenAI response
    
    Pure function that extracts both new format (tool_calls) and legacy format (function_call)
    """
    tool_calls = []
    
    if "choices" not in response or not response["choices"]:
        return tool_calls
    
    choice = response["choices"][0]
    message = choice.get("message", {})
    
    # Extract tool_calls (new format)
    if "tool_calls" in message and message["tool_calls"]:
        for tool_call in message["tool_calls"]:
            if tool_call.get("type") == "function":
                func = tool_call.get("function", {})
                tool_calls.append({
                    "id": tool_call.get("id"),
                    "type": "function",
                    "function": {
                        "name": func.get("name"),
                        "arguments": func.get("arguments")
                    }
                })
    
    # Extract function_call (legacy format)
    elif "function_call" in message and message["function_call"]:
        func_call = message["function_call"]
        tool_calls.append({
            "id": f"call_{uuid.uuid4().hex[:8]}",
            "type": "function", 
            "function": {
                "name": func_call.get("name"),
                "arguments": func_call.get("arguments")
            }
        })
    
    return tool_calls


# === CONTENT EXTRACTION ===

def extract_content_from_response(response: Dict[str, Any]) -> str:
    """
    Extract text content from provider response
    
    Pure function that safely extracts content or returns empty string
    """
    if "choices" not in response or not response["choices"]:
        return ""
    
    choice = response["choices"][0]
    message = choice.get("message", {})
    return message.get("content", "")


# === RESPONSE MODIFICATION ===

def update_response_with_tool_calls(
    response: Dict[str, Any],
    filtered_tool_calls: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Update response with filtered tool calls
    
    Pure function that creates new response dict with updated tool calls
    """
    if "choices" not in response or not response["choices"]:
        return response
    
    # Create new response (immutable update)
    updated_response = response.copy()
    updated_response["choices"] = response["choices"].copy()
    
    choice = updated_response["choices"][0].copy()
    message = choice.get("message", {}).copy()
    
    if filtered_tool_calls:
        message["tool_calls"] = filtered_tool_calls
    else:
        # All tool calls were blocked
        message.pop("tool_calls", None)
        message.pop("function_call", None)
        message["content"] = "Tool calls were blocked by policy"
        choice["finish_reason"] = "content_filter"
    
    choice["message"] = message
    updated_response["choices"][0] = choice
    
    return updated_response


def add_guardrails_metadata_to_response(
    response: Dict[str, Any],
    input_guards: List[Dict],
    output_guards: List[Dict],
    input_time: float,
    output_time: float,
    policy_id: str,
    modified_messages: List[Dict]
) -> Dict[str, Any]:
    """
    Add guardrails metadata to successful response
    
    Pure function that enriches response with guardrail execution info
    """
    enriched_response = response.copy()
    
    if "choices" in enriched_response and enriched_response["choices"]:
        enriched_response["guardrails"] = {
            "input_guards": input_guards,
            "output_guards": output_guards,
            "execution_time_ms": {
                "input": input_time,
                "output": output_time
            },
            "policy_id": policy_id,
            "total_guards_executed": len(input_guards) + len(output_guards),
            "modified_messages": modified_messages
        }
    
    return enriched_response


# === SAFE RESPONSES ===

def create_safe_chunk() -> Dict[str, Any]:
    """Create a safe replacement chunk when content is blocked"""
    return {
        "choices": [{
            "delta": {
                "content": "I cannot provide that content due to policy restrictions."
            },
            "finish_reason": "content_filter"
        }],
        "usage": {
            "prompt_tokens": 0,
            "completion_tokens": 1,
            "total_tokens": 1
        }
    }


def create_policy_violation_response(
    violation: Dict[str, Any],
    input_guards: List[Dict],
    output_guards: List[Dict],
    input_time: float,
    output_time: float,
    policy_id: str,
    policy_hash: str,
    trace_id: str
) -> Dict[str, Any]:
    """
    Create policy violation error response
    
    Pure function that constructs standardized violation response
    """
    return {
        "error": {
            "type": "policy_violation",
            "message": f"Output policy violation: {violation['message']}",
            "policy_id": policy_id,
            "policy_hash": f"sha256:{policy_hash}",
            "rule_id": violation["rule_id"],
            "action": "refuse",
            "trace_id": trace_id
        },
        "guardrails": {
            "input_guards": input_guards,
            "output_guards": output_guards,
            "execution_time_ms": {
                "input": input_time,
                "output": output_time
            }
        }
    }


# === HEADERS ===

def create_policy_headers(
    policy_id: str,
    policy_hash: str,
    tenant_id: str,
    trace_id: str
) -> Dict[str, str]:
    """
    Create standard policy headers for responses
    
    Pure function that generates consistent headers
    """
    return {
        "x-policy-id": policy_id or "default",
        "x-policy-hash": f"sha256:{policy_hash}",
        "x-tenant-id": tenant_id,
        "x-trace-id": trace_id
    }


def create_streaming_headers(
    policy_id: str,
    policy_hash: str,
    tenant_id: str,
    trace_id: str
) -> Dict[str, str]:
    """
    Create headers for streaming responses
    
    Pure function that adds streaming-specific headers
    """
    headers = create_policy_headers(policy_id, policy_hash, tenant_id, trace_id)
    headers.update({
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",  # Disable nginx buffering
        "Connection": "keep-alive"
    })
    return headers

