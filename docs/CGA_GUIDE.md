# Composable Guard Algebra (CGA) Guide

## Overview

CGA provides a mathematical foundation for composing guards using category theory principles. Guards are pure functions that transform context and return `Either` results.

## Core Concepts

### Types

**Location**: `apps/controlnet/cga_core/types.py` (lines 1-84)

```python
from cga_core.types import Ctx, Either, Guard, Violation

# Context is a dictionary
Ctx = Dict[str, Any]  # Line 15

# Result is Either Left (failure) or Right (success)
Either = Union[Left, Right]  # Line 44

# Guard is an async function
Guard = Callable[[Ctx], Awaitable[Either]]  # Line 47
```

### Either Type

**Location**: `apps/controlnet/cga_core/types.py` (lines 40-44)

```python
# Left = Failure with violations (Line 42)
Left = Dict[str, Any]  # {"_tag": "Left", "left": [Violation, ...]}

# Right = Success with context (Line 43)
Right = Dict[str, Any]  # {"_tag": "Right", "right": Ctx}
```

### Helper Functions

**Location**: `apps/controlnet/cga_core/types.py` (lines 49-81)

```python
from cga_core import is_left, is_right, get_violations, get_context

# Create Left result (Line 49)
def Left_(violations: List[Violation]) -> Left:
    return {"_tag": "Left", "left": [v.to_dict() for v in violations]}

# Create Right result (Line 56)
def Right_(ctx: Ctx) -> Right:
    return {"_tag": "Right", "right": ctx}

# Check result type (Lines 63-81)
if is_left(result):  # Line 63
    violations = get_violations(result)  # Line 71
else:
    ctx = get_context(result)  # Line 77
```

## Writing Guards

### Basic Guard

**Reference**: Actual PII detection guard - `apps/controlnet/guard_packs/pii/guards.py` (lines 132-194)

```python
async def simple_guard(ctx: Ctx) -> Either:
    """Check if prompt contains specific word"""
    prompt = ctx.get("prompt", "")
    
    if "forbidden" in prompt.lower():
        return Left_([Violation(
            rule_id="forbidden_word",
            severity="med",
            message="Prompt contains forbidden word"
        )])
    
    return Right_(ctx)
```

### Guard with Parameters

**Reference**: PII detection with parameters - `apps/controlnet/guard_packs/pii/guards.py` (lines 132-194)

```python
@guard("pii.detect", tier="T0", performance_budget_ms=2.0)
def pii_detect(types: List[str], threshold: float = 1.0) -> Guard:
    """Detect PII in text without redacting"""
    async def run(ctx: Ctx) -> Either:
        violations = []
        # ... detection logic
        return Left_(violations) if violations else Right_(ctx)
    return run
```

### Context Modification

**Reference**: PII redaction guard - `apps/controlnet/guard_packs/pii/guards.py` (lines 92-130)

```python
@guard("pii.redact", tier="T0", performance_budget_ms=3.0)
def pii_redact(types: List[str], mode: Literal["mask", "remove"] = "mask") -> Guard:
    """Redact PII from text"""
    async def run(ctx: Ctx) -> Either:
        # Redaction logic
        return Right_({**ctx, "output": redacted_text})
    return run
```

## Guard Composition

**Location**: `apps/controlnet/cga_core/composition.py` (lines 1-211)

### Sequential Composition

**Implementation**: `apps/controlnet/cga_core/composition.py` (lines 30-41)  
**Test Example**: `apps/controlnet/tests/test_composition.py` (lines 18-35)

```python
from cga_core.composition import GuardOps

# Run guards in sequence (monadic bind)
guard = (
    GuardOps(simple_guard)
    .then(redact_email)
    .build()
)
```

### Parallel Composition

**Implementation**: `apps/controlnet/cga_core/composition.py` (lines 112-149)  
**Test Example**: `apps/controlnet/tests/test_composition.py` (lines 62-78)

```python
from cga_core.composition import par

# Run guards in parallel
composed = par(pii_guard, toxicity_guard, politics_guard)
```

### Conditional Composition

**Implementation**: `apps/controlnet/cga_core/composition.py` (lines 71-85)  
**Test Example**: `apps/controlnet/tests/test_composition.py` (lines 80-100)

```python
from cga_core.composition import GuardOps

# Run guard conditionally
def is_customer_data(ctx: Ctx) -> bool:
    return ctx.get("data_type") == "customer"

guard = (
    GuardOps(pii_guard)
    .when(is_customer_data, enhanced_pii_guard)
    .build()
)
```

### Timeout Composition

**Implementation**: `apps/controlnet/cga_core/composition.py` (lines 87-105)  
**Standalone**: `apps/controlnet/cga_core/composition.py` (lines 163-188)

```python
from cga_core.composition import GuardOps

# Add timeout to guard
guard = (
    GuardOps(slow_onnx_guard)
    .timeout(ms=500)
    .build()
)
```

## Advanced Patterns

### Accumulating Violations

```python
from cga_core.composition import par

# Run multiple guards, collect all violations
async def check_all(ctx: Ctx) -> Either:
    result = await par(
        pii_guard,
        toxicity_guard,
        safety_guard
    )(ctx)
    
    # Returns either all violations or success
    return result
```

### Conditional Short-Circuit

```python
async def tiered_check(ctx: Ctx) -> Either:
    """Run T0, then T1 if T0 passes, then T2 if T1 passes"""
    
    # T0 check
    t0_result = await t0_guard(ctx)
    if is_left(t0_result):
        return t0_result
    
    # T1 check
    t1_result = await t1_guard(get_context(t0_result))
    if is_left(t1_result):
        return t1_result
    
    # T2 check
    return await t2_guard(get_context(t1_result))
```

### Context Transformation

```python
async def transform_and_check(ctx: Ctx) -> Either:
    """Transform context before checking"""
    
    # Extract relevant data
    prompt = ctx.get("prompt", "")
    
    # Create new context with transformed data
    transformed = {
        "text": prompt.lower(),
        "words": prompt.split(),
        "length": len(prompt)
    }
    
    # Merge back
    ctx.update(transformed)
    
    return Right_(ctx)
```

## Integration with Policy System

### Policy YAML

**Location**: `apps/controlnet/policies/enterprise_default_v1.yaml`

Example policy structure:
```yaml
policy:
  name: enterprise_v1
  input:
    - guard: pii.detect
      params:
        types: [email, phone, ssn]
    - guard: pii.redact
      params:
        replace_with: "[REDACTED]"
  output:
    - guard: toxicity.check
      params:
        threshold: 0.8
```

### Loading Guards in Code

**Location**: `apps/controlnet/gateway/routes/chat.py` (lines 1-926)

Actual usage in the chat endpoint:

```python
# Get policy (Line 185)
policy_cache = request.app.state.policy_cache
compiled_guards, policy_metadata = await policy_cache.get_policy(
    tenant_id=context.tenant_id,
    policy_id=policy_id
)

# Run input guards (Line 194)
input_result = await run_input_guards(compiled_guards, body)

# Check result (Lines 197-290)
if is_left(input_result):
    violations = get_violations(input_result)
    # Handle violations...
else:
    ctx = get_context(input_result)
    # Continue with request...
```

## Best Practices

### 1. Small, Focused Guards

```python
# ✅ Good: Single responsibility
async def check_email(ctx: Ctx) -> Either:
    # Only checks for email
    
# ❌ Bad: Multiple responsibilities
async def check_everything(ctx: Ctx) -> Either:
    # Checks email, phone, SSN, toxicity, etc.
```

### 2. Pure Functions

```python
# ✅ Good: No side effects
async def pure_guard(ctx: Ctx) -> Either:
    return check_context(ctx)

# ❌ Bad: Side effects
async def impure_guard(ctx: Ctx) -> Either:
    save_to_db(ctx)  # Don't do this!
    return check_context(ctx)
```

### 3. Fail-Fast

```python
# ✅ Good: Fail immediately
if not condition:
    return Left_([Violation(...)])

# ❌ Bad: Fallback/placeholder
if not condition:
    return Right_(ctx)  # Silent failure is bad
```

### 4. Type Hints

```python
# ✅ Good: Explicit types
async def typed_guard(ctx: Ctx) -> Either:
    ...

# ❌ Bad: No types
async def untyped_guard(ctx):
    ...
```

### 5. Context Modification

```python
# ✅ Good: Return new context
ctx_copy = ctx.copy()
ctx_copy["modified"] = True
return Right_(ctx_copy)

# ❌ Bad: Mutate original
ctx["modified"] = True  # Don't mutate!
```

## Real-World Examples

### PII Detection Guard

**Location**: `apps/controlnet/guard_packs/pii/guards.py` (lines 92-195)

Actual implementation of PII detection:

```python
@guard("pii.detect", tier="T0", description="Fast PII detection using regex patterns", performance_budget_ms=2.0)
def pii_detect(
    types: List[str],
    threshold: float = 1.0,
    severity: Literal["low", "med", "high", "critical"] = "high"
) -> Guard:
    """Detect PII in text without redacting"""
    async def run(ctx: Ctx) -> Either:
        text = ctx.get("output", "")
        # ... detection logic
        return Left_(violations) if violations else Right_(ctx)
    return run
```

### SDK Integration

**Location**: `apps/controlnet/examples/sdk_quickstart.py` (lines 1-214)

Examples showing:
- In-process LLM wrapping (lines 12-59)
- Gateway integration (lines 62-105)
- Tool guarding (lines 107-149)
- Streaming with per-token checks (lines 152-186)

### Available Examples

- `sdk_quickstart.py` - Full SDK usage (`apps/controlnet/examples/sdk_quickstart.py`)
- `real_world_guard_demo.py` - Real guard implementations
- `tiered_pipeline_demo.py` - Tiered execution
- `custom_guards.py` - Writing custom guards
- `tool_enforcement_demo.py` - Tool validation

### Test Examples

**Location**: `apps/controlnet/tests/test_composition.py`

Comprehensive tests showing:
- Sequential composition (lines 18-35)
- Early exit on failure (lines 37-60)
- Parallel composition (lines 62-78)
- Conditional composition (lines 80-100)

