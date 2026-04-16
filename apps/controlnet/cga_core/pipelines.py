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
    2. Resolve model to provider routing config
    3. Load policy and compiled guards (T0/T1/T2 structure)
    4. Apply prompt-based routing (filters T2 ONNX models by risk categories)
    5. Run ONNX detection (T2 models, filtered by routing) ✨ NEW STEP
    6. Execute input guards with SmartGuardScheduler:
       ├─ T0: Regex/fast checks (always, < 10ms, parallel execution)
       ├─ T1: Semantic checks (dual-trigger gating, < 30ms, parallel execution)
       └─ T2: Additional ML guards (dual-trigger gating, < 100ms, parallel execution)
    
    Key architectural change:
    - ONNX is now a SEPARATE pipeline step (step 5)
    - This makes the pipeline clearer and follows single responsibility
    - Guards (step 6) are purely guardrail checks, no ONNX mixing
    
    Each step returns Either:
    - Right(ctx) → continue to next step
    - Left(violations) → fail fast, stop pipeline
    
    Returns:
        Guard that runs entire pipeline sequentially
    """
    return seq(
        extract_request_params,
        resolve_model_target,
        resolve_policy,
        apply_prompt_routing,      # Filters T2 ONNX models by risk
        run_onnx_detection,        # ✨ NEW: Separate ONNX inference step
        execute_input_guards_tiered # Clean guard execution (no ONNX mixing)
    )

