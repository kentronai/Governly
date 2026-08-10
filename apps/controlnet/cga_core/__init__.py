"""
Composable Guard Algebra (CGA) Core

This module provides the foundational types and combinators for building
composable guard systems using functional programming principles.
"""

from .types import (
    Ctx,
    Violation,
    Either,
    Left,
    Right,
    Guard,
    Left_,
    Right_,
    is_left,
    is_right,
    get_violations,
    get_context,
)
from .comb import (
    seq,
    allOf,
    anyOf,
    kOf,
    unless,
    focus,
    lens,
)
from .registry import (
    REGISTRY,
    guard,
    register_guard,
    get_guard,
    get_guard_metadata,
    get_guards_by_tier,
    get_registry,
    clear_registry,
)
from .compiler import compile_policy
from .composition import (
    GuardOps,
    par,
    identity_guard,
    compose_with_timeout
)
from .scheduler import (
    SmartGuardScheduler,
    ExecutionResult
)
# Pipeline orchestration
from .pipelines import (
    chat_completions_pipeline,
    guard_check_pipeline,
)
from .pipeline_fns import (
    extract_request_params,
    resolve_model_target,
    resolve_policy,
    apply_prompt_routing,
    execute_input_guards_tiered
)

# Import all guard packs to populate REGISTRY
# These imports trigger @guard decorators which register guards
import guard_packs.default_guardrails  # Core production-ready guardrails (profanity, jailbreak, toxicity, PII, PII redaction)
import guard_packs.formatting  # Data formatting and validation (JSON, XML, CSV, URLs, email)
import guard_packs.validation  # String validation (contains, required patterns, etc.)
import guard_packs.business  # Competitor protection, brand tone
import guard_packs.tools  # Tool call allowlist/denylist

# Database-driven guards are generated at runtime in the gateway cache initialization

__version__ = "0.1.0"

__all__ = [
    # Types
    "Ctx",
    "Violation", 
    "Either",
    "Left",
    "Right",
    "Guard",
    "Left_",
    "Right_",
    "is_left",
    "is_right",
    "get_violations",
    "get_context",
    # Combinators
    "seq",
    "allOf",
    "anyOf", 
    "kOf",
    "unless",
    "focus",
    "lens",
    # Registry
    "REGISTRY",
    "guard",
    "register_guard",
    "get_guard",
    "get_guard_metadata",
    "get_guards_by_tier",
    "get_registry",
    "clear_registry",
    # Compiler
    "compile_policy",
    # Composition Engine
    "GuardOps",
    "par",
    "identity_guard",
    "compose_with_timeout",
    # Smart Scheduler (single standardized scheduler)
    "SmartGuardScheduler",
    "ExecutionResult",
    # Pipeline Orchestration
    "chat_completions_pipeline",
    "guard_check_pipeline",
    "extract_request_params",
    "resolve_model_target",
    "resolve_policy",
    "apply_prompt_routing",
    "execute_input_guards_tiered",
]
