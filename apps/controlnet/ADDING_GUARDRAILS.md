# Adding New Guardrails to ControlNet

This guide explains how to add new guardrails to the ControlNet system, with or without ONNX model support.

---

## Table of Contents

1. [Overview](#overview)
2. [Adding a Rule-Based Guardrail (No ONNX)](#adding-a-rule-based-guardrail-no-onnx)
3. [Adding a Guardrail with ONNX Support](#adding-a-guardrail-with-onnx-support)
4. [Using Guardrails in Policies](#using-guardrails-in-policies)
5. [Testing Your Guardrail](#testing-your-guardrail)

---

## Overview

ControlNet supports two types of guardrails:

1. **Rule-Based Guardrails**: Pure Python functions using pattern matching, APIs, or business logic
2. **ONNX-Enhanced Guardrails**: Rule-based guardrails linked to ONNX models for ML-powered detection

**Key Concepts:**
- **Guardrails**: Python functions registered in the code using the `@guard` decorator
- **Risk Categories**: Database entities that link guardrails to ONNX models (e.g., `toxicity`, `pii`, `jailbreak`)
- **Policies**: YAML configurations that compose guardrails into enforcement pipelines
- **ONNX Models**: ML models that run automatically when guardrails are linked to risk categories

---

## Adding a Rule-Based Guardrail (No ONNX)

### Step 1: Create the Guardrail Code

Create or edit a file in `apps/controlnet/guard_packs/<category>/guards.py`:

```python
from cga_core import guard, Violation, Ctx, Either, Right_, Left_, Guard
from typing import List, Literal

@guard(
    "custom.my_guardrail",           # Unique guardrail ID (format: category.name)
    tier="T1",                         # T0 (fast), T1 (medium), T2 (slow)
    description="Description of what this guardrail does",
    performance_budget_ms=10.0         # Expected execution time in milliseconds
)
def my_custom_guardrail(
    # Define parameters that can be configured in policies
    threshold: float = 0.5,
    severity: Literal["low", "med", "high", "critical"] = "high"
) -> Guard:
    """
    Detailed docstring explaining the guardrail's purpose, parameters, and behavior.
    
    Args:
        threshold: Detection threshold (0.0 to 1.0)
        severity: Violation severity level
        
    Returns:
        Guard function that processes context
    """
    
    async def run(ctx: Ctx) -> Either:
        # Extract the text to check from the context
        text = ctx.get("output", "")
        
        if not isinstance(text, str):
            return Right_(ctx)  # Pass through if not text
        
        # YOUR DETECTION LOGIC HERE
        detected = False
        score = 0.0
        
        # Example: Check for specific patterns
        if "forbidden_word" in text.lower():
            detected = True
            score = 1.0
        
        # If violation detected, return Left_ with violation details
        if detected and score >= threshold:
            violation = Violation(
                rule_id="custom.my_guardrail",
                severity=severity,
                message=f"Violation detected (score: {score:.2f})",
                score=score,
                evidence={
                    "matched_text": text[:100],  # Include evidence
                    "threshold": threshold
                }
            )
            return Left_([violation])
        
        # Otherwise, pass through
        return Right_(ctx)
    
    return run
```

### Step 2: Register in Database

Insert the guardrail into the `guardrails` table:

```sql
INSERT INTO guardrails (id, key, name, description, category, tier, is_enabled, tenant_id)
VALUES (
    gen_random_uuid(),
    'custom.my_guardrail',                    -- Must match @guard decorator
    'My Custom Guardrail',
    'Detects and blocks custom violations',
    'custom',                                 -- Category for grouping
    'T1',                                     -- Matches code tier
    true,
    NULL                                      -- NULL = system-wide, or set tenant_id
);
```

### Step 3: Use in Policy

Create a policy YAML that uses your guardrail:

```yaml
policy: my-test-policy
description: Test policy with custom guardrail

guards:
  - id: custom.my_guardrail
    target: messages[-1].content           # Check last user message
    with:
      threshold: 0.5
      severity: "high"

compose:
  input: custom_my_guardrail              # Guard ID with dots replaced by underscores
  root: input
```

---

## Adding a Guardrail with ONNX Support

ONNX support allows your guardrail to automatically trigger ML model inference when the embedding router detects relevant risk categories.

### Step 1: Create the Guardrail Code

Same as above - the code doesn't need to know about ONNX:

```python
@guard(
    "custom.advanced_check",
    tier="T1",
    description="Advanced check with optional ONNX enhancement",
    performance_budget_ms=10.0
)
def advanced_check_guardrail(
    threshold: float = 0.5,
    severity: Literal["low", "med", "high", "critical"] = "critical"
) -> Guard:
    """
    Rule-based guardrail that can be enhanced with ONNX models.
    
    This guardrail runs independently, but when linked to a risk category,
    ONNX models will also run automatically before this guardrail executes.
    """
    async def run(ctx: Ctx) -> Either:
        text = ctx.get("output", "")
        
        # Your detection logic
        detected = check_my_rules(text)
        
        if detected:
            return Left_([{
                "rule_id": "custom.advanced_check",
                "severity": severity,
                "message": "Advanced check violation detected"
            }])
        
        return Right_(ctx)
    
    return run
```

### Step 2: Create/Link Risk Category

#### Option A: Create New Risk Category

```sql
-- 1. Create the risk category
INSERT INTO risk_categories (id, slug, name, description, color)
VALUES (
    gen_random_uuid(),
    'my_risk',                              -- URL-safe slug
    'My Risk Category',
    'Description of this risk type',
    '#ff6b6b'                               -- Hex color for UI
);

-- 2. Register the guardrail
INSERT INTO guardrails (id, key, name, description, category, tier, is_enabled, tenant_id)
VALUES (
    gen_random_uuid(),
    'custom.advanced_check',
    'Advanced Check',
    'Advanced detection with ONNX support',
    'custom',
    'T1',
    true,
    NULL
);

-- 3. Link guardrail to risk category
INSERT INTO risk_category_links (id, category_id, entity_type, entity_id)
SELECT 
    gen_random_uuid(),
    rc.id,
    'guardrail',
    g.id
FROM risk_categories rc, guardrails g
WHERE rc.slug = 'my_risk' 
  AND g.key = 'custom.advanced_check';
```

#### Option B: Link to Existing Risk Category (e.g., toxicity)

```sql
-- 1. Register the guardrail
INSERT INTO guardrails (id, key, name, description, category, tier, is_enabled, tenant_id)
VALUES (
    gen_random_uuid(),
    'custom.advanced_check',
    'Advanced Check',
    'Advanced toxicity detection',
    'custom',
    'T1',
    true,
    NULL
);

-- 2. Link to existing toxicity risk category
INSERT INTO risk_category_links (id, category_id, entity_type, entity_id)
SELECT 
    gen_random_uuid(),
    rc.id,
    'guardrail',
    g.id
FROM risk_categories rc, guardrails g
WHERE rc.slug = 'toxicity'                 -- Use existing category
  AND g.key = 'custom.advanced_check';
```

### Step 3: Link ONNX Model (Optional)

If you want ONNX models to run, link an ONNX model to the same risk category:

```sql
-- Check existing ONNX models
SELECT om.id, om.model_id, om.name, rc.slug as risk_category
FROM onnx_models om
LEFT JOIN risk_category_links rcl ON rcl.entity_id = om.id AND rcl.entity_type = 'onnx_model'
LEFT JOIN risk_categories rc ON rc.id = rcl.category_id;

-- Link existing ONNX model to your risk category
INSERT INTO risk_category_links (id, category_id, entity_type, entity_id)
SELECT 
    gen_random_uuid(),
    rc.id,
    'onnx_model',
    om.id
FROM risk_categories rc, onnx_models om
WHERE rc.slug = 'my_risk'                  -- Your risk category
  AND om.model_id = 'toxic-bert'           -- ONNX model to use
ON CONFLICT (entity_type, entity_id, category_id) DO NOTHING;
```

### Step 4: Use in Policy

```yaml
policy: my-advanced-policy
description: Policy with ONNX-enhanced guardrail

guards:
  - id: custom.advanced_check
    target: messages[-1].content
    with:
      threshold: 0.5
      severity: "critical"

compose:
  input: custom_advanced_check
  root: input
```

### How ONNX Triggering Works

When a request comes in with this policy:

1. **Embedding Router** analyzes the prompt → Detects risk categories (e.g., `['my_risk', 'toxicity']`)
2. **Policy Loader** queries database → Finds guardrails linked to risk categories (e.g., `['my_risk']`)
3. **Intersection** → `policy_risk_categories ∩ router_detected = ['my_risk']`
4. **ONNX Inference** → Automatically loads and runs ONNX models linked to `my_risk`
5. **ONNX Violations** → If ONNX detects issues, request is blocked immediately (fail-fast)
6. **Guardrail Execution** → If ONNX passes, your `custom.advanced_check` guardrail runs

**Result:** You get both ML-powered detection (ONNX) AND rule-based validation (your guardrail)!

---

## Using Guardrails in Policies

### Single Guardrail

```yaml
guards:
  - id: custom.my_guardrail
    target: messages[-1].content
    with:
      threshold: 0.5

compose:
  input: custom_my_guardrail
  root: input
```

### Multiple Guardrails (All Must Pass)

```yaml
guards:
  - id: pii.detect_pii
    target: messages[-1].content
    with:
      types: "EMAIL,PHONE"
  
  - id: custom.my_guardrail
    target: messages[-1].content
    with:
      threshold: 0.5

compose:
  input: allOf(pii_detect_pii, custom_my_guardrail)
  root: input
```

### Multiple Guardrails (Any Can Pass)

```yaml
guards:
  - id: guardrail.one
    target: messages[-1].content
  
  - id: guardrail.two
    target: messages[-1].content

compose:
  input: anyOf(guardrail_one, guardrail_two)
  root: input
```

### Target Options

- `messages[-1].content` - Only check the last user message (recommended)
- `messages[*].content` - Check all messages in conversation history
- `response` - Check the model's output (for output guards)

---

## Testing Your Guardrail

### 1. Unit Test (Python)

Create tests in `apps/controlnet/tests/`:

```python
import pytest
from guard_packs.custom.guards import my_custom_guardrail

@pytest.mark.asyncio
async def test_my_guardrail_blocks_violation():
    guard = my_custom_guardrail(threshold=0.5)
    
    ctx = {"output": "text with forbidden_word"}
    result = await guard(ctx)
    
    assert result.is_left()  # Violation detected
    violations = result.left_value
    assert violations[0]["rule_id"] == "custom.my_guardrail"

@pytest.mark.asyncio
async def test_my_guardrail_allows_safe_content():
    guard = my_custom_guardrail(threshold=0.5)
    
    ctx = {"output": "safe text"}
    result = await guard(ctx)
    
    assert result.is_right()  # No violation
```

### 2. Integration Test (API)

Use the playground or curl:

```bash
curl http://localhost/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Policy-ID: your-policy-id" \
  -H "X-Tenant-ID: your-tenant-id" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [
      {"role": "user", "content": "test message with forbidden_word"}
    ]
  }'
```

Expected response (blocked):
```json
{
  "error": {
    "type": "policy_violation",
    "message": "Violation detected (score: 1.00)",
    "rule_id": "custom.my_guardrail",
    "severity": "high",
    "phase": "input"
  }
}
```

### 3. Test ONNX Integration

Send a prompt that triggers your risk category:

```bash
curl http://localhost/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Policy-ID: your-policy-id" \
  -H "X-Tenant-ID: your-tenant-id" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [
      {"role": "user", "content": "toxic content here"}
    ]
  }'
```

Check logs to verify ONNX ran:

```bash
docker logs controlnet-gateway 2>&1 | grep -E "(ONNX inference|policy_risk_categories|Filtered categories)"
```

You should see:
```
📋 Policy categories: {'my_risk'}
🔍 Detected risk categories: {'my_risk', 'toxicity'}
✅ Filtered categories (will run ONNX): {'my_risk'}
✅ ONNX inference complete: 1 categories
```

---

## Quick Reference

### Database Schema

```sql
-- Guardrails table
CREATE TABLE guardrails (
    id UUID PRIMARY KEY,
    key VARCHAR UNIQUE NOT NULL,          -- e.g., 'custom.my_guardrail'
    name VARCHAR NOT NULL,
    description TEXT,
    category VARCHAR,
    tier VARCHAR,
    is_enabled BOOLEAN DEFAULT true,
    tenant_id VARCHAR                     -- NULL for system-wide
);

-- Risk categories table
CREATE TABLE risk_categories (
    id UUID PRIMARY KEY,
    slug VARCHAR UNIQUE NOT NULL,         -- e.g., 'toxicity'
    name VARCHAR NOT NULL,
    description TEXT,
    color VARCHAR
);

-- Links table (joins guardrails/ONNX models to risk categories)
CREATE TABLE risk_category_links (
    id UUID PRIMARY KEY,
    category_id UUID REFERENCES risk_categories(id),
    entity_type VARCHAR NOT NULL,         -- 'guardrail' or 'onnx_model'
    entity_id UUID NOT NULL,              -- ID from guardrails or onnx_models table
    UNIQUE(entity_type, entity_id, category_id)
);
```

### Guardrail Decorator Parameters

```python
@guard(
    guard_id: str,              # Unique ID (e.g., "custom.my_guard")
    tier: str,                  # "T0" (fast), "T1" (medium), "T2" (slow)
    description: str,           # Human-readable description
    performance_budget_ms: float  # Expected execution time
)
```

### Common Tiers

- **T0**: < 5ms - Simple checks, regex patterns
- **T1**: 5-50ms - API calls, moderate computation
- **T2**: 50-500ms - Heavy computation, external ML models

### Policy Composition Functions

- `allOf(guard1, guard2, ...)` - All must pass
- `anyOf(guard1, guard2, ...)` - At least one must pass
- `seq(guard1, guard2, ...)` - Sequential execution
- `unless(condition, guard)` - Conditional execution
- `par(guard1, guard2, ...)` - Parallel execution

---

## Best Practices

1. **Target Scope**: Use `messages[-1].content` to avoid false positives from conversation history
2. **Tier Selection**: Choose appropriate tier based on actual performance testing
3. **Error Handling**: Guardrails should fail gracefully and return `Right_(ctx)` on errors
4. **Evidence**: Include detailed evidence in violation objects for debugging
5. **Risk Categories**: Reuse existing risk categories when possible (toxicity, pii, jailbreak, etc.)
6. **Testing**: Always test both the guardrail and ONNX integration separately
7. **Performance**: Monitor execution time and adjust tier if needed
8. **Tenant Isolation**: Use `tenant_id = NULL` for system-wide guardrails, specific tenant IDs for custom ones

---

## Troubleshooting

### Guardrail Not Found

```
"Guard 'custom.my_guardrail' not found in registry"
```

**Fix:** Make sure the guardrail is imported in `__init__.py` and the `@guard` decorator is correct.

### ONNX Not Running

Check logs for:
```
✅ Filtered categories (will run ONNX): set()
```

**Fix:** Verify:
1. Guardrail is linked to risk category in `risk_category_links`
2. ONNX model is linked to same risk category
3. Embedding router detects the risk category
4. Include both tenant-specific AND system-wide (NULL tenant_id) guardrails in query

### UI Not Showing Block Message

**Fix:** Ensure error response has:
- `"type": "policy_violation"` (not `"pipeline_violation"`)
- `"phase": "input"` or `"output"`
- HTTP status code 400

---

## Example: Adding Profanity Guardrail with ONNX

Complete example from start to finish:

```sql
-- 1. Create/verify risk category exists
INSERT INTO risk_categories (id, slug, name, description, color)
VALUES (gen_random_uuid(), 'profanity', 'Profanity Detection', 'Detects profane language', '#dc2626')
ON CONFLICT (slug) DO NOTHING;

-- 2. Register guardrail
INSERT INTO guardrails (id, key, name, description, category, tier, is_enabled, tenant_id)
VALUES (
    gen_random_uuid(),
    'language.profanity',
    'Profanity Filter',
    'Blocks profane and offensive language',
    'language',
    'T1',
    true,
    NULL
);

-- 3. Link guardrail to risk category
INSERT INTO risk_category_links (id, category_id, entity_type, entity_id)
SELECT gen_random_uuid(), rc.id, 'guardrail', g.id
FROM risk_categories rc, guardrails g
WHERE rc.slug = 'profanity' AND g.key = 'language.profanity';

-- 4. Link ONNX model (reuse toxicity model)
INSERT INTO risk_category_links (id, category_id, entity_type, entity_id)
SELECT gen_random_uuid(), rc.id, 'onnx_model', om.id
FROM risk_categories rc, onnx_models om
WHERE rc.slug = 'profanity' AND om.model_id = 'model'
ON CONFLICT (entity_type, entity_id, category_id) DO NOTHING;
```

Now create policy:

```yaml
policy: profanity-filter
description: Blocks profanity with ML enhancement

guards:
  - id: language.profanity
    target: messages[-1].content
    with:
      threshold: 0.3
      severity: "critical"

compose:
  input: language_profanity
  root: input
```

**Result:** 
- ONNX toxicity model runs automatically when profanity is detected
- Rule-based profanity guardrail runs as backup/validation
- Both violations reported if detected

---

## Summary

**Without ONNX:**
1. Write guardrail code with `@guard` decorator
2. Register in `guardrails` database table
3. Use in policy YAML

**With ONNX:**
1. Write guardrail code with `@guard` decorator
2. Register in `guardrails` database table
3. Create/link to risk category in `risk_categories`
4. Link guardrail to risk category in `risk_category_links`
5. Link ONNX model to risk category in `risk_category_links`
6. Use in policy YAML
7. ONNX runs automatically when embedding router detects the risk category!

🎉 **No code changes needed** - everything is database-driven!

