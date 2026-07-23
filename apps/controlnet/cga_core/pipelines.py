"""
Pipeline definitions using functional composition
Separates WHAT (steps) from HOW (execution order)
"""

from .types import Guard
from .comb import seq
from .pipeline_fns import (
    extract_request_params,
    resolve_model_target,
    resolve_policy,
    apply_prompt_routing,
    run_onnx_detection,
    execute_input_guards_tiered
)


def chat_completions_pipeline() -> Guard:
    """
    Complete chat completions pipeline with tiered guard execution
    
    Execution order (sequential with fail-fast):
    1. Extract request parameters (model_id, API key, policy_id)
    2. Load policy and compiled guards (T0/T1/T2 structure)
    3. Apply prompt-based routing (used as detection evidence, never as a bypass)
    4. Run ONNX detection
    5. Execute every enabled input guard with SmartGuardScheduler:
       ├─ T0: Regex/fast checks (always, < 10ms, parallel execution)
       ├─ T1: Semantic checks (< 30ms, parallel execution)
       └─ T2: Additional ML guards (< 100ms, parallel execution)
    6. Only after every guard passes, resolve the provider client.
    
    Key architectural change:
    Provider resolution is deliberately last. A blocked request never reaches
    provider setup and can never make an OpenAI, Azure OpenAI, Gemini, Claude,
    or other registered-provider API call.
    
    Each step returns Either:
    - Right(ctx) → continue to next step
    - Left(violations) → fail fast, stop pipeline
    
    Returns:
        Guard that runs entire pipeline sequentially
    """
    return seq(
        extract_request_params,
        resolve_policy,
        apply_prompt_routing,
        run_onnx_detection,
        execute_input_guards_tiered,
        resolve_model_target,
    )
