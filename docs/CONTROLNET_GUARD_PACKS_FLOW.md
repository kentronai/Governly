# ControlNet Guard Packs & Policies - Complete Flow Documentation

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Guard Packs Structure](#guard-packs-structure)
3. [Policy System](#policy-system)
4. [Complete Request Flow](#complete-request-flow)
5. [Creating New Guards](#creating-new-guards)

---

## Architecture Overview

ControlNet is built on **Composable Guard Algebra (CGA)**, a functional programming approach to guard composition using:
- **Either Monad**: `Left` (violations) or `Right` (success)
- **Guard Functions**: Async functions that take `Ctx` (context) and return `Either`
- **Combinators**: Functional operators (`allOf`, `seq`, `anyOf`, etc.) to compose guards
- **Tiered Execution**: T0 (fast) → T1 (medium) → T2 (slow) with early exits

### Key Components

```
┌─────────────────────────────────────────────────────────────┐
│                     ControlNet Gateway                      │
├─────────────────────────────────────────────────────────────┤
│  Authentication → Policy Resolution → Guard Execution       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Guard Packs (14 packs)                   │
│  pii, security, toxicity, tools, schema, politics,        │
│  business, compliance, quality, formatting, communication,   │
│  privacy, safety, onnx                                      │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Guard Registry (@guard decorator)              │
│  Registers all guard factories with metadata:                │
│  - tier (T0/T1/T2), performance_budget_ms,                 │
│  - description, onnx_model_id, requires_onnx                │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Policy Compiler (YAML → Guard Graph)           │
│  Compiles YAML policies using combinators:                  │
│  - allOf, seq, anyOf, kOf, unless                           │
│  - Organizes guards by tier for optimized execution         │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│          Tiered Guard Runner (T0 → T1 → T2)                 │
│  Executes guards with:                                       │
│  - Parallel execution within tiers                           │
│  - Early exit on violations                                 │
│  - Intelligent gating (T1 gates on T0, T2 gates on T1)      │
└─────────────────────────────────────────────────────────────┘
```

---

## Guard Packs Structure

### Directory Layout

```
guard_packs/
├── __init__.py           # Imports all packs (triggers registration)
├── pii/
│   ├── __init__.py
│   └── guards.py         # @guard("pii.redact"), @guard("pii.detect")
├── security/
│   ├── __init__.py
│   └── guards.py         # @guard("security.jailbreak"), etc.
├── toxicity/
│   ├── __init__.py
│   └── guards.py         # @guard("toxicity.detect"), etc.
└── [11 more packs...]
```

### Guard Registration Pattern

**Every guard follows this pattern:**

```python
from cga_core import guard, Violation, Ctx, Either, Right_, Left_, Guard

@guard(
    guard_id="pack.category.action",  # Unique identifier
    tier="T0",                        # T0 (fast), T1 (medium), T2 (slow)
    description="Human-readable description",
    performance_budget_ms=3.0,        # Expected execution time
    requires_onnx=False,             # For T2 guards with ONNX models
    onnx_model_id=None               # If requires_onnx=True
)
def guard_function(
    param1: Type,
    param2: Type = default_value,
    severity: Literal["low", "med", "high", "critical"] = "med"
) -> Guard:
    """
    Guard factory function - returns the actual guard function.
    
    Args:
        param1: Description
        param2: Description with default
        
    Returns:
        Guard function that processes context
    """
    async def run(ctx: Ctx) -> Either:
        # Extract data from context
        text = ctx.get("output", "")
        
        # Guard logic here
        violations = []
        
        # Check conditions...
        if violation_found:
            violations.append(Violation(
                rule_id="pack.category.action",
                severity=severity,
                message="Description of violation",
                score=0.9,  # Optional: 0.0-1.0
                evidence={"detail": "value"}  # Optional metadata
            ))
            return Left_(violations)
        
        # Success: return updated context
        return Right_(ctx)
    
    return run  # Return the guard function
```

### Guard Execution Context

Guards receive a `Ctx` (dictionary) with:
- `"output"`: The content being processed (string)
- `"messages"`: For input guards, the full message array
- `"phase"`: "input" or "output"
- Other context fields as needed

Guards return:
- `Left_([Violation, ...])`: Blocking violations
- `Right_(ctx)`: Success with potentially modified context

### Tier Classifications

**T0 (Ultra-fast, < 10ms):**
- Regex pattern matching
- Allowlist/denylist checks
- Basic structure validation
- Examples: `pii.redact`, `tools.allowlist`, `security.secrets`

**T1 (Fast, < 30ms):**
- Lightweight ML models
- Pattern-based semantic checks
- Simple validation logic
- Examples: `toxicity.detect`, `tools.args.validator`

**T2 (Slow, < 100ms):**
- ONNX model inference
- Heavy ML processing
- External API calls (if needed)
- Examples: `security.jailbreak` (with ONNX), `business.onnx.*`

---

## Policy System

### Policy YAML Structure

```yaml
policy: enterprise_default_v1
description: Policy description

guards:
  # Each guard definition
  - id: pii.redact              # Guard ID from registry
    target: messages[*].content  # JSONPath to apply guard to
    with:                        # Parameters for guard factory
      types: ["EMAIL", "PHONE"]
      mode: "mask"
  
  - id: toxicity.block
    target: messages[*].content
    with:
      categories: ["profanity", "harassment"]
      threshold: 0.1

compose:
  # Composition expressions using combinators
  input: allOf(pii_redact, toxicity_block)  # Run all guards, collect violations
  output: null                               # No output guards
  root: allOf(pii_redact, toxicity_block)   # Fallback if phase not specified
```

### Target Paths (JSONPath)

Common targets:
- `messages[*].content`: All message contents (input)
- `output`: Output text (output)
- `output.text`: Specific output field
- `tool_args[*].argument`: Tool arguments
- `tool_result.content`: Tool result content

### Composition Combinators

**`allOf(guard1, guard2, ...)`**: Parallel composition
- Runs all guards, collects ALL violations
- If any guard fails, returns combined violations
- Use for: Multiple independent checks

**`seq(guard1, guard2, ...)`**: Sequential composition
- Runs guards in order, stops on first failure
- Each guard receives updated context from previous
- Use for: Chained transformations (e.g., redact then validate)

**`anyOf(guard1, guard2, ...)`**: Alternative composition
- Succeeds if ANY guard succeeds
- Returns first success
- Use for: Fallback scenarios

**`kOf(k, guard1, guard2, ...)`**: K-of-N composition
- Succeeds if at least K guards succeed
- Use for: Voting/majority consensus

**`unless(condition, guard)`**: Conditional composition
- Runs guard only if condition passes
- Use for: Conditional checks

### Policy Compilation Flow

```
1. Load YAML → Parse to dict
2. Validate structure (guards, compose sections)
3. For each guard definition:
   a. Lookup guard_id in REGISTRY
   b. Get guard factory function
   c. Extract parameters from "with" section
   d. Call factory(**params) → get guard instance
   e. Build lens for "target" JSONPath
   f. Wrap guard with focus(lens, guard)
   g. Organize by tier (T0/T1/T2)
4. Parse compose expressions:
   a. Replace guard IDs (dots → underscores) in context
   b. Evaluate expression using combinators
   c. Build executable guard graph
5. Return (compiled_guards_dict, policy_metadata)
```

### Policy Metadata

After compilation, `policy_metadata` contains:
- `guards_by_tier`: `{"T0": {...}, "T1": {...}, "T2": {...}}`
- `tier_counts`: Count of guards per tier
- Original policy data
- Guard execution order

---

## Complete Request Flow

### 1. Request Arrives at Gateway

```
POST /v1/chat/completions
Headers:
  X-API-KEY: sk_live_...
  X-Policy-ID: enterprise_default_v1
  X-Model-ID: gpt-4
Body:
  {
    "messages": [{"role": "user", "content": "..."}],
    "model": "gpt-4",
    "stream": false
  }
```

### 2. Authentication & Policy Resolution

```python
# gateway/main.py → routes/guardrails.py

1. Extract X-API-KEY → lookup in api_keys table
2. Validate API key (bcrypt) → get tenant_id, user_id
3. Extract X-Policy-ID header
4. PolicyCache.get_policy(tenant_id, policy_id):
   - Check Redis cache: {tenant_id}:{policy_id}
   - If MISS → Query policies table
   - Load YAML → compile_policy(yaml_bytes)
   - Cache compiled guards in Redis (1hr TTL)
   - Store in LRU in-memory cache (1000 items)
5. Return: (compiled_guards, policy_metadata)
```

### 3. Input Guard Execution

```python
# gateway/guards.py → run_input_guards()

1. Prepare context:
   ctx = {
     "phase": "input",
     "messages": request_body["messages"],
     ... (all request fields)
   }

2. Get guard to run:
   guard = compiled_guards.get("input") or compiled_guards.get("root")

3. Run guard (or SmartGuardScheduler):
   result = await guard(ctx)
   
   if is_left(result):
       violations = get_violations(result)
       return 400 error with violations
   
   ctx = get_context(result)  # May have redacted/modified messages

4. Continue to provider call...
```

### 4. Provider Call (BYOK - Bring Your Own Key)

```python
# gateway/providers.py

1. Resolve model routing:
   - Query provider_models table
   - Get provider, base_url, auth_header_name
   
2. Extract user's provider API key (from request or user config)
3. Forward request to provider (OpenAI, Anthropic, etc.)
4. Handle streaming vs non-streaming response
```

### 5. Output Guard Execution

```python
# gateway/guards.py → run_output_guards()

1. Prepare context:
   ctx = {
     "phase": "output",
     "output": response_content
   }

2. Use SmartGuardScheduler if available:
   - Extract guards_by_tier from policy_metadata
   - Run T0 guards first (parallel)
   - If T0 score < threshold → run T1 guards
   - If T1 score < threshold → run T2 guards
   - Early exit on violations

3. If violations:
   return 400 error with violation details
   
4. If success:
   return 200 with response + guardrail metadata
```

### 6. Observability Logging

```python
# gateway/logging.py → log_observability()

Insert into observability_logs:
{
  "tenant_id": ...,
  "request_id": ...,
  "status_code": 200 or 400,
  "latency_ms": ...,
  "guardrail_results": {
    "input_guards": [...],
    "output_guards": [...],
    "policy_decision": "allow" or "block",
    "violated_guard": {...}  # if blocked
  },
  "metadata": {
    "trace_id": ...,
    "policy_hash": ...,
    "model": ...
  }
}
```

---

## Creating New Guards

### Step-by-Step Guide

#### 1. Choose Guard Pack Category

Determine which existing pack fits, or create a new one:
- Existing: `pii`, `security`, `toxicity`, `tools`, `schema`, etc.
- New: Create new directory in `guard_packs/`

#### 2. Create Guard Function

```python
# guard_packs/your_pack/guards.py

from cga_core import guard, Violation, Ctx, Either, Right_, Left_, Guard
from typing import List, Literal

@guard(
    "your_pack.action_name",
    tier="T0",  # or T1 or T2
    description="What this guard does",
    performance_budget_ms=5.0
)
def your_guard_function(
    param1: str,
    param2: List[str] = None,
    severity: Literal["low", "med", "high", "critical"] = "high"
) -> Guard:
    """
    Guard factory - creates the actual guard function.
    
    Args:
        param1: Description
        param2: Optional list parameter
        
    Returns:
        Guard function
    """
    async def run(ctx: Ctx) -> Either:
        # 1. Extract data from context
        text = ctx.get("output", "")
        
        if not isinstance(text, str):
            return Right_(ctx)  # Skip non-string content
        
        # 2. Perform guard logic
        violations = []
        
        # Example: Check for forbidden words
        forbidden_words = param2 or []
        for word in forbidden_words:
            if word.lower() in text.lower():
                violations.append(Violation(
                    rule_id="your_pack.action_name",
                    severity=severity,
                    message=f"Forbidden word '{word}' detected",
                    score=1.0,
                    evidence={"word": word, "position": text.lower().find(word.lower())}
                ))
        
        # 3. Return result
        if violations:
            return Left_(violations)
        
        # Success - return context (may modify it)
        return Right_(ctx)
    
    return run
```

#### 3. Register Guard in Pack

```python
# guard_packs).py or guard_packs/your_pack/__init__.py

from .guards import your_guard_function

__all__ = ["your_guard_function"]
```

#### 4. Ensure Pack is Imported

```python
# guard_packs/__init__.py

from . import your_pack  # Add this line
```

```python
# cga_core/__init__.py

import guard_packs.your_pack  # Add this line
```

#### 5. Test Your Guard

```python
# tests/test_your_guard.py

import pytest
from guard_packs.your_pack.guards import your_guard_function

@pytest.mark.asyncio
async def test_your_guard():
    guard = your_guard_function(
        param1="value",
        param2=["badword1", "badword2"]
    )
    
    # Test violation
    ctx = {"output": "This contains badword1"}
    result = await guard(ctx)
    assert is_left(result)
    
    # Test success
    ctx = {"output": "Clean text"}
    result = await guard(ctx)
    assert is_right(result)
```

#### 6. Use in Policy

```yaml
# policies/test_policy.yaml

guards:
  - id: your_pack.action_name
    target: messages[*].content
    with:
      param1: "value"
      param2: ["badword1", "badword2"]
      severity: "high"

compose:
  input: allOf(your_pack_action_name)
  root: allOf(your_pack_action_name)
```

### Guard Best Practices

1. **Tier Selection**:
   - T0: Regex, simple checks (< 10ms)
   - T1: Lightweight logic (< 30ms)
   - T2: ONNX models, heavy processing (< 100ms)

2. **Context Handling**:
   - Always check if `ctx.get("output")` is the expected type
   - Handle arrays gracefully (from `messages[*].content`)
   - Return modified context in `Right_()` if guard transforms data

3. **Violation Details**:
   - Provide clear `message` describing the violation
   - Include `evidence` with useful debugging info
   - Set appropriate `severity` level
   - Use `score` (0.0-1.0) for probabilistic violations

4. **Performance**:
   - Compile regex patterns outside the `run` function
   - Cache expensive computations when possible
   - Respect `performance_budget_ms` - keep execution fast

5. **Error Handling**:
   - Return `Right_(ctx)` for non-applicable cases (wrong type, empty, etc.)
   - Don't raise exceptions - return violations instead
   - Log errors but don't break the pipeline

### ONNX Guards (T2)

For guards using ONNX models:

```python
@guard(
    "your_pack.onnx_classifier",
    tier="T2",
    requires_onnx=True,
    onnx_model_id="your_model.onnx",
    onnx_category="your_category",
    performance_budget_ms=80.0
)
def onnx_guard(threshold: float = 0.7) -> Guard:
    async def run(ctx: Ctx) -> Either:
        from cga_core.onnx_inference_pipeline import run_onnx_inference
        
        text = ctx.get("output", "")
        if not text:
            return Right_(ctx)
        
        # Run ONNX inference
        result = await run_onnx_inference(
            model_id="your_model.onnx",
            text=text
        )
        
        if result.score >= threshold:
            return Left_([Violation(
                rule_id="your_pack.onnx_classifier",
                severity="high",
                message=f"Violation detected (score: {result.score:.2f})",
                score=result.score,
                evidence={"model_output": result.output}
            )])
        
        return Right_(ctx)
    
    return run
```

---

## Summary

**Key Takeaways:**

1. **Guard Packs** are organized by category, each containing `@guard`-decorated factory functions
2. **Policies** are YAML files that reference guards and compose them using combinators
3. **Compilation** transforms YAML into executable guard graphs organized by tier
4. **Execution** uses tiered runner (T0→T1→T2) with early exits and intelligent gating
5. **Creating Guards** follows a simple pattern: decorator → factory → async guard function

**Next Steps:**
- Review existing guards in `guard_packs/` for examples
- Create your guard following the pattern above
- Test with `pytest`
- Add to a policy YAML
- Verify end-to-end flow through the gateway

---

## Example: Complete Guard Implementation

See `guard_packs/schema/guards.py` for a complete, well-structured example:
- Multiple guards in one pack
- Proper error handling
- Context transformation
- Clear violations with evidence

