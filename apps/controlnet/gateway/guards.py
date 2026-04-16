"""
Guard execution for the Gateway

Handles running guards at different phases (input, output, tool args, tool results)
with proper tier management and performance optimization.

Fail-open architecture: If guards fail to execute (timeout, crash), allow requests through.
This ensures gateway availability even if guardrails have issues.

Observability: All fail-open events are tracked for monitoring and alerting.
"""

import asyncio
import time
import logging
from typing import Dict, Any, List, Optional, Literal

from cga_core import is_left, get_violations, get_context, Left_, Right_
from cga_core.scheduler import SmartGuardScheduler
from cga_core.observability import record_guard_timeout, record_guard_exception

logger = logging.getLogger(__name__)


def get_guard_timeout(settings: Any, phase: str) -> float:
    """
    Get timeout for guard execution based on phase
    
    Args:
        settings: Application settings
        phase: Guard phase (input, output, tool_args, tool_result)
        
    Returns:
        Timeout in seconds
    """
    if phase == "input":
        return getattr(settings, "input_guard_timeout", 2.0)
    elif phase == "output":
        return getattr(settings, "output_guard_timeout", 1.0)
    elif phase in ["tool_args", "tool_result"]:
        return getattr(settings, "tool_guard_timeout", 0.2)
    else:
        return getattr(settings, "guard_timeout", 1.0)


async def run_input_guards(compiled_guards: Any, request_body: Dict[str, Any], settings: Any = None, context_info: Optional[Dict] = None) -> Any:
    """
    Run input guards on the request body
    
    Fail-open: If guards timeout or crash, allow request through
    
    Args:
        compiled_guards: Compiled guard graphs (dict with phase keys)
        request_body: OpenAI API request body
        settings: Application settings for timeout configuration
        context_info: Optional context for observability (tenant_id, policy_id, request_id)
        
    Returns:
        Either result from guard execution
    """
    # Prepare context for input guards - preserve all original fields
    context = {
        "phase": "input",
        **request_body
    }
    
    logger.info(f"🛡️  Running input guards")
    
    # Use input-specific guard if available, otherwise fall back to root
    guard_to_run = compiled_guards.get("input", compiled_guards.get("root"))
    
    if guard_to_run is None:
        logger.warning("No input or root guard configured - allowing request through")
        return Right_(context)
    
    # Get timeout from settings
    timeout = get_guard_timeout(settings, "input") if settings else 2.0
    
    # Extract context info for observability
    ctx_info = context_info or {}
    tenant_id = ctx_info.get("tenant_id")
    policy_id = ctx_info.get("policy_id")
    request_id = ctx_info.get("request_id")
    
    # Run guards with timeout (fail-open on timeout/error)
    try:
        result = await asyncio.wait_for(guard_to_run(context), timeout=timeout)
        
        if result['_tag'] == 'Left':
            violations = result['left']
            logger.info(f"🚫 Guard violations detected: {[v.get('rule_id') for v in violations]}")
        
        return result
        
    except asyncio.TimeoutError:
        logger.error(f"⏰ Guard execution timed out after {timeout}s - allowing request through (fail-open)")
        # Record timeout for observability
        record_guard_timeout("input", timeout * 1000, tenant_id, policy_id, request_id)
        return Right_(context)
        
    except Exception as e:
        logger.error(f"💥 Guard execution failed: {e} - allowing request through (fail-open)")
        # Record exception for observability
        record_guard_exception("input", e, tenant_id, policy_id, request_id)
        return Right_(context)


async def run_output_guards(
    compiled_guards: Any,
    output_context: Dict[str, Any],
    tiers: Optional[List[Literal["T0", "T1", "T2"]]] = None,
    policy_metadata: Optional[Dict[str, Any]] = None
) -> Any:
    """
    Run output guards on the response using SmartGuardScheduler
    
    Args:
        compiled_guards: Compiled guard graphs (dict with phase keys)
        output_context: Context containing output data
        tiers: List of tiers to run (T0, T1, T2)
        policy_metadata: Policy metadata containing guards_by_tier
        
    Returns:
        Either result from guard execution
    """
    if tiers is None:
        tiers = ["T0", "T1", "T2"]
    
    # Prepare context for output guards
    context = {
        "phase": "output",
        "output": output_context.get("output", ""),
    }
    
    # Use SmartGuardScheduler for output guards (same as input guards)
    if policy_metadata and "guards_by_tier" in policy_metadata:
        try:
            scheduler = SmartGuardScheduler()
            
            # Extract guards for requested tiers in list format
            all_guards = []
            for tier in tiers:
                tier_guards = policy_metadata["guards_by_tier"].get(tier, {})
                for guard_id, guard_fn in tier_guards.items():
                    all_guards.append({
                        "id": guard_id,
                        "guard": guard_fn,
                        "tier": tier
                    })
            
            # Run with SmartGuardScheduler (no similarity for output guards)
            result = await scheduler.execute_policy(
                guards=all_guards,
                context=context,
                risk_level="medium",
                max_similarity=None  # Output guards don't have similarity scores
            )
            
            return result
                
        except Exception as e:
            # FAIL-FAST: If scheduler can't execute guards, we can't continue
            raise RuntimeError(
                f"SmartGuardScheduler failed to execute output guards: {e}"
            ) from e
    
    # FAIL-FAST: No fallback to traditional approach
    # If tiered execution is not available, fail
    raise RuntimeError(
        "Tiered guard execution not available. Policy must contain guards with tier information."
    )


async def run_tool_args_guards(
    compiled_guard: Any, 
    tool_args: Dict[str, Any],
    settings: Any = None,
    context_info: Optional[Dict] = None
) -> Any:
    """
    Run guards on tool arguments
    
    Fail-open: If guards timeout or crash, allow tool call through
    
    Args:
        compiled_guard: Compiled guard graph
        tool_args: Tool arguments to validate
        settings: Application settings for timeout configuration
        context_info: Optional context for observability
        
    Returns:
        Either result from guard execution
    """
    context = {
        "phase": "tool_args",
        "tool_args": tool_args,
    }
    
    timeout = get_guard_timeout(settings, "tool_args") if settings else 0.2
    
    # Extract context info for observability
    ctx_info = context_info or {}
    tenant_id = ctx_info.get("tenant_id")
    policy_id = ctx_info.get("policy_id")
    request_id = ctx_info.get("request_id")
    
    try:
        result = await asyncio.wait_for(compiled_guard(context), timeout=timeout)
        return result
    except asyncio.TimeoutError:
        logger.error(f"⏰ Tool args guard timed out after {timeout}s - allowing through (fail-open)")
        record_guard_timeout("tool_args", timeout * 1000, tenant_id, policy_id, request_id)
        return Right_(context)
    except Exception as e:
        logger.error(f"💥 Tool args guard failed: {e} - allowing through (fail-open)")
        record_guard_exception("tool_args", e, tenant_id, policy_id, request_id)
        return Right_(context)


async def run_tool_result_guards(
    compiled_guard: Any, 
    tool_result: Dict[str, Any],
    settings: Any = None,
    context_info: Optional[Dict] = None
) -> Any:
    """
    Run guards on tool results
    
    Fail-open: If guards timeout or crash, allow tool result through
    
    Args:
        compiled_guard: Compiled guard graph
        tool_result: Tool result to validate
        settings: Application settings for timeout configuration
        context_info: Optional context for observability
        
    Returns:
        Either result from guard execution
    """
    context = {
        "phase": "tool_result",
        "tool_result": tool_result,
    }
    
    timeout = get_guard_timeout(settings, "tool_result") if settings else 0.2
    
    # Extract context info for observability
    ctx_info = context_info or {}
    tenant_id = ctx_info.get("tenant_id")
    policy_id = ctx_info.get("policy_id")
    request_id = ctx_info.get("request_id")
    
    try:
        result = await asyncio.wait_for(compiled_guard(context), timeout=timeout)
        return result
    except asyncio.TimeoutError:
        logger.error(f"⏰ Tool result guard timed out after {timeout}s - allowing through (fail-open)")
        record_guard_timeout("tool_result", timeout * 1000, tenant_id, policy_id, request_id)
        return Right_(context)
    except Exception as e:
        logger.error(f"💥 Tool result guard failed: {e} - allowing through (fail-open)")
        record_guard_exception("tool_result", e, tenant_id, policy_id, request_id)
        return Right_(context)
