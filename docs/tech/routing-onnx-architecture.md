# Routing-Based Architecture and ONNX Model Integration

> Deep dive into how prompts flow through intelligent routing, tiered guard execution, and ONNX model loading

## Overview

The ControlNet Gateway uses a sophisticated routing architecture that:
1. **Routes requests** to relevant guard families using embedding similarity
2. **Loads ONNX models** dynamically from local filesystem or GCS
3. **Executes guards in tiers** (T0/T1/T2) for optimal performance
4. **Applies guardrails** on both input and output phases

This architecture enables **performance optimization**, **dynamic model loading**, and **context-aware guard selection**.

## Request Flow: From Prompt to Guardrail

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Client Request Arrives                                       │
│     POST /v1/chat/completions                                     │
│     Headers: X-Policy-ID, X-Tenant-ID, Authorization            │
└─────────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. Extract Context & Load Policy                                │
│     - Tenant ID from auth                                        │
│     - Policy ID from headers                                     │
│     - Load compiled guards from cache                            │
│                                                                   │
│   Location: gateway/routes/chat.py (lines 184-188)               │
└─────────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. INPUT PHASE - Run Input Guards                                │
│                                                                   │
│   Context: { phase: "input", ...request_body }                   │
│                                                                   │
│   Execution:                                                      │
│   ├─ T0: Regex-based guards (PII, keywords)                      │
│   ├─ T1: Lightweight semantic analysis                           │
│   └─ T2: ONNX model inference (if routed)                       │
│                                                                   │
│   If violations found → Return 400 with violations              │
│                                                                   │
│   Location: gateway/routes/chat.py (line 194)                    │
│             gateway/guards.py (lines 16-66)                      │
└─────────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. Forward to LLM Provider                                       │
│     - OpenRouter/OpenAI/Anthropic                                │
│     - User's API key (BYOK)                                      │
│     - Proxy request to upstream                                  │
└─────────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│  5. OUTPUT PHASE - Run Output Guards                              │
│                                                                   │
│   Context: { phase: "output", output: "..." }                    │
│                                                                   │
│   Execution (SmartGuardScheduler):                               │
│   ├─ T0: Fast pattern matching (< 10ms)                         │
│   │   └─ Early exit if major issues found                       │
│   ├─ T1: Medium semantic checks (< 50ms)                        │
│   │   └─ Gated: Only if T0 score < 0.8                        │
│   └─ T2: Heavy ONNX models (< 200ms)                          │
│       └─ Gated: Only if T1 score < 0.9                        │
│                                                                   │
│   Location: gateway/guards.py (lines 69-143)                      │
│             cga_core/tiered_runner.py (lines 77-162)              │
└─────────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│  6. Return Response                                               │
│     - If violations → 400 with details                           │
│     - If clean → Stream/generate response                        │
│                                                                   │
│   Response includes:                                             │
│   - Guard execution metadata                                     │
│   - Performance stats                                           │
│   - Violations (if any)                                          │
└─────────────────────────────────────────────────────────────────┘
```

## Step 1: Request Arrival and Policy Loading

**Location**: `apps/controlnet/gateway/routes/chat.py` (lines 123-188)

```python
# Extract model ID
model_id = extract_model_id(request, body)  # From X-Model-ID or body

# Get policy from cache
policy_cache = request.app.state.policy_cache
compiled_guards, policy_metadata = await policy_cache.get_policy(
    tenant_id=context.tenant_id,
    policy_id=policy_id  # From X-Policy-ID header
)
```

**What gets loaded**:
- Compiled guard graphs (dict with phase keys: `input`, `output`, `root`)
- Policy metadata including `guards_by_tier` mapping
- Guard factories registered with `@guard()` decorator

**Policy Cache Structure**:
```python
compiled_guards = {
    "input": Guard(...),      # Input-specific guard chain
    "output": Guard(...),     # Output-specific guard chain
    "root": Guard(...)         # Fallback guard chain
}

policy_metadata = {
    "hash": "...",
    "guards_by_tier": {
        "T0": {"pii.detect": Guard(...), ...},
        "T1": {"sentiment.check": Guard(...), ...},
        "T2": {"onnx.toxicity": Guard(...), ...}
    }
}
```

## Step 2: Router Configuration and Family Selection

**Location**: `apps/controlnet/cga_core/router.py` (lines 38-126)

The router uses **embedding similarity** to select relevant guard families:

```python
class FamilyRouter:
    def route(
        self,
        prompt: str,
        allowed_families: Set[str],
        context: Optional[Dict] = None
    ) -> Set[str]:
        # 1. Check adversarial triggers (lexical, fast)
        triggered = self._check_adversarial_triggers(prompt, allowed_families)
        
        # 2. Embed prompt (384-dim vector)
        prompt_vec = self.embedding_service.encode(prompt, normalize=True)
        
        # 3. Calculate similarities to family centroids
        for family in allowed_families:
            centroid = self.config.centroids[family]
            similarity = self._cosine_similarity(prompt_vec, centroid)
        
        # 4. Select families (Top-K + threshold)
        top_k_families = {fam for fam, _ in similarities[:self.config.top_k]}
        threshold_families = {
            fam for fam, sim in similarities
            if sim >= self.config.thresholds.get(fam, 1.0)
        }
        
        return triggered | top_k_families | threshold_families
```

**Router Config** (lines 15-36):
```python
@dataclass
class RouterConfig:
    centroids: Dict[str, np.ndarray]      # Family → 384-dim vector
    thresholds: Dict[str, float]          # Family-specific thresholds
    top_k: int = 2                        # Select top 2 families
    always_on_guards: Set[str]            # Bypass routing
    adversarial_triggers: Dict[str, List[str]]  # Force-include
    default_families: List[str]          # Fail-safe defaults
```

**Example**:
```
Prompt: "Give me financial advice on investing $100k"
Embedding: [0.12, -0.45, 0.89, ...] (384 dims)
Similarities:
  - financial: 0.87
  - toxicity: 0.23
  - legal: 0.31
Selected: {financial} (above threshold, top-1)
```

## Step 3: ONNX Model Loading

**Location**: `apps/controlnet/cga_core/onnx_loader.py` (lines 45-270)

ONNX models are loaded **on-demand** with intelligent caching:

### Model Sources

**Development** (`docker-compose.dev.yml` line 51):
```yaml
volumes:
  - ./apps/controlnet:/app        # Source code
  - /app/.venv                   # Python virtual env
```

Models are loaded from:
1. **Local filesystem**: `apps/controlnet/models/*.onnx`
2. **GCS bucket**: `gs://bucket/models/*.onnx` (if `GCS_MODEL_BUCKET` set)
3. **Tenant-specific**: `gs://bucket/{tenant_id}/models/*.onnx`

### Loading Process

**Location**: `apps/controlnet/cga_core/onnx_loader.py` (lines 118-186)

```python
class ONNXModelLoader:
    def __init__(self, models_dir: str = "models", gcs_bucket: Optional[str] = None):
        self._sessions: Dict[str, ort.InferenceSession] = {}  # In-memory cache
        self._loading_errors: Dict[str, Exception] = {}
        self._lock = asyncio.Lock()
    
    async def load_model(self, model_id: str) -> "ort.InferenceSession":
        """Load ONNX model with fail-fast behavior"""
        if model_id in self._sessions:
            return self._sessions[model_id]
        
        # Get model info from registry
        registry = get_onnx_registry()
        model_info = registry.get_model(model_id)
        
        # Load from local filesystem or GCS
        session = load_onnx_session(
            model_info.model_path,
            self.gcs_bucket,
            tenant_id=tenant_id
        )
        
        self._sessions[model_id] = session  # Cache in memory
        return session
```

**Model Registry** (`apps/controlnet/cga_core/onnx_registry.py` lines 59-676):

```python
@dataclass
class ONNXModelInfo:
    id: str                           # e.g., "toxicity_detoxify"
    name: str                         # Human-readable name
    category: str                      # financial, legal, toxicity, etc.
    model_path: str                   # Path in GCS or local
    tokenizer_config: Dict[str, Any]  # Tokenizer params
    labels: List[str]                  # Output labels
    default_threshold: float           # Decision threshold
    performance_budget_ms: float        # Expected runtime
    accuracy: Optional[float]          # Model accuracy
    model_size_mb: Optional[float]    # Model size
    supported_languages: List[str]     # Language support
```

### Loading from GCS

**Location**: `apps/controlnet/cga_core/model_loader.py` (lines 68-120)

```python
def download_model_from_gcs(
    bucket_name: str,
    model_path: str,
    tenant_id: Optional[str] = None,
    local_cache_dir: str = "/tmp/onnx_models"
) -> Path:
    """Download model from GCS with tenant isolation"""
    client = get_gcs_client()
    
    # Try tenant-specific path first
    if tenant_id:
        tenant_path = f"{tenant_id}/{model_path}"
        blob = client.bucket(bucket_name).blob(tenant_path)
        if blob.exists():
            cache_path = local_cache_dir / tenant_id / Path(model_path).name
            blob.download_to_filename(cache_path)
            return cache_path
    
    # Fallback to global path
    blob = client.bucket(bucket_name).blob(model_path)
    cache_path = local_cache_dir / Path(model_path).name
    blob.download_to_filename(cache_path)
    return cache_path
```

**Tenant Isolation**:
```
Global:    gs://bucket/models/toxicity.onnx
Tenant A:  gs://bucket/org_abc123/models/toxicity.onnx (custom)
Tenant B:  gs://bucket/org_def456/models/toxicity.onnx (custom)
```

## Step 4: Input Guard Execution

**Location**: `apps/controlnet/gateway/guards.py` (lines 16-66)

### Context Preparation

```python
async def run_input_guards(compiled_guards: Any, request_body: Dict[str, Any]) -> Any:
    # Prepare context with all request fields
    context = {
        "phase": "input",
        **request_body  # Preserve all OpenAI API fields
    }
    
    # Select guard (input-specific or root)
    guard_to_run = compiled_guards.get("input", compiled_guards.get("root"))
    
    # Execute with timeout
    result = await asyncio.wait_for(
        guard_to_run(context),
        timeout=2.0
    )
    
    return result
```

### Guard Registration with Tiers

**Location**: `apps/controlnet/cga_core/registry.py` (lines 133-190)

Guards are registered with `@guard()` decorator:

```python
@guard(
    guard_id="pii.detect",
    tier="T0",                    # Performance tier
    performance_budget_ms=2.0,   # Expected runtime
    description="PII detection using regex"
)
async def pii_detect_guard(ctx: Ctx) -> Either:
    """Detect PII in input"""
    text = ctx.get("messages", [{}])[-1].get("content", "")
    
    # Run regex patterns
    violations = []
    for pattern_name, pattern in PATTERNS.items():
        if pattern.search(text):
            violations.append(Violation(
                rule_id=f"pii.{pattern_name.lower()}",
                severity="high",
                message=f"{pattern_name} detected"
            ))
    
    return Left_(violations) if violations else Right_(ctx)
```

**Tier Classification**:
- **T0** (Ultra-fast): Regex, allowlists (< 10ms) - Pattern matching
- **T1** (Fast): Lightweight semantic analysis (< 50ms) - Embedding-based
- **T2** (Heavy): ONNX models, APIs (< 200ms) - ML inference

**Current Reality**: Most guards are stuck at T0 (pattern matching) because ONNX models aren't enabled. This misses the tiered architecture's full power.

### Example: PII Guard

**Location**: `apps/controlnet/guard_packs/pii/guards.py` (lines 132-194)

```python
@guard("pii.detect", tier="T0", performance_budget_ms=2.0)
async def detect_pii(ctx: Ctx, types: List[str] = None) -> Either:
    """Detect PII patterns in text"""
    text = _extract_text_from_context(ctx)
    
    if not text:
        return Right_(ctx)
    
    detected = []
    checked_types = types if types else ["EMAIL", "PHONE", "SSN"]
    
    for pii_type in checked_types:
        pattern = PATTERNS.get(pii_type)
        if pattern and pattern.search(text):
            detected.append(pii_type)
    
    if detected:
        return Left_([Violation(
            rule_id="pii.detect.violation",
            severity="high",
            message=f"PII detected: {', '.join(detected)}"
        )])
    
    return Right_(ctx)
```

### Violation Handling

If violations found (lines 197-290 in `chat.py`):

```python
if is_left(input_result):
    violations = get_violations(input_result)
    
    await guard_logger.log_guard_execution(
        request_id=request_id,
        guard_name="input_guards",
        result="violation",
        violations=violations
    )
    
    # Return 400 with violations
    return JSONResponse(
        status_code=400,
        content={
            "error": "Guard violations detected",
            "violations": violations
        }
    )
```

## Step 5: Output Guard Execution (Tiered)

**Location**: `apps/controlnet/gateway/guards.py` (lines 69-143)

Output guards use **tiered execution with gating**:

```python
async def run_output_guards(
    compiled_guards: Any,
    output_context: Dict[str, Any],
    tiers: Optional[List[Literal["T0", "T1", "T2"]]] = None,
    policy_metadata: Optional[Dict[str, Any]] = None
) -> Any:
    
    context = {
        "phase": "output",
        "output": output_context.get("output", ""),
    }
    
    # Use SmartGuardScheduler for optimal performance
    runner = SmartGuardScheduler()
    
    # Extract guards for requested tiers
    guards_to_run = {}
    for tier in tiers:
        tier_guards = policy_metadata["guards_by_tier"].get(tier, {})
        guards_to_run.update(tier_guards)
    
    # Run with intelligent gating
    result: ExecutionResult = await runner.run_tiered_guards(
        guards=guards_to_run,
        context=context,
        enabled_tiers=tiers
    )
    
    # Convert to Either
    if result.violations:
        return Left_(result.violations)
    else:
        return Right_(result.context)
```

### Tiered Execution Logic

**Location**: `apps/controlnet/cga_core/tiered_runner.py` (lines 77-162)

```python
async def run_tiered_guards(
    self,
    guards: Dict[str, Guard],
    context: Ctx,
    enabled_tiers: Optional[List[Literal["T0", "T1", "T2"]]] = None
) -> ExecutionResult:
    
    tier_scores = {"t0_score": 0.0, "t1_score": 0.0, "t2_score": 0.0}
    all_violations = []
    
    for tier in ["T0", "T1", "T2"]:
        # Check gate condition
        if tier_config.gate_condition:
            if not self._evaluate_gate_condition(gate_condition, tier_scores):
                gated_tiers.append(tier)  # Skip expensive tier
                continue
        
        # Run tier guards
        tier_result = await self._run_tier(tier, guards, context, tier_config)
        
        if tier_result["violations"]:
            all_violations.extend(tier_result["violations"])
            
            # Update tier score
            max_score = max(v["score"] for v in tier_result["violations"])
            tier_scores[f"{tier.lower()}_score"] = max_score
            
            # Early exit if configured
            if tier_config.early_exit_on_violation:
                early_exit = True
                break
    
    return ExecutionResult(
        violations=all_violations,
        tier_stats=tier_stats,
        early_exit=early_exit,
        gated_tiers=gated_tiers
    )
```

**Gating Logic** (lines 260-298):

```python
def _evaluate_gate_condition(
    self,
    condition: str,
    tier_scores: Dict[str, float]
) -> bool:
    """Evaluate gate condition like 't0_score < 0.8'"""
    if "<" in condition:
        var, threshold = condition.split("<")
        return tier_scores.get(var.strip(), 0.0) < float(threshold.strip())
    elif ">":
        var, threshold = condition.split(">")
        return tier_scores.get(var.strip(), 0.0) > float(threshold.strip())
    
    return True
```

**Example Gating**:
- T0 always runs (< 10ms) - Regex pattern matching
- T1 runs only if `t0_score < 0.8` (< 50ms) - Lightweight semantic analysis  
- T2 runs only if `t1_score < 0.9` (< 200ms) - ONNX model inference

**Current Issue**: Many guards are pattern-only (T0) and aren't progressing to ONNX models (T2), missing the tiered architecture's benefits.

**This optimizes latency** by skipping expensive guards when cheaper ones already found issues.

## ONNX Model Integration

### Guard with ONNX Model

**Location**: `apps/controlnet/cga_core/registry.py` (lines 163-190)

```python
@guard(
    guard_id="onnx.toxicity",
    tier="T2",
    performance_budget_ms=80.0,
    requires_onnx=True,
    onnx_model_id="toxicity_detoxify",
    onnx_category="toxicity"
)
async def toxicity_onnx_guard(ctx: Ctx) -> Either:
    """Toxicity detection using ONNX model"""
    text = ctx.get("output", "")
    
    # Load ONNX model
    loader = get_onnx_loader()
    session = await loader.load_model("toxicity_detoxify")
    
    # Get tokenizer
    from .tokenizer import get_tokenizer
    tokenizer = get_tokenizer("toxicity_detoxify")
    
    # Tokenize
    inputs = tokenizer(text, return_tensors="np")
    
    # Run inference
    outputs = session.run(None, inputs)
    predictions = outputs[0][0]  # Get first output
    
    # Check thresholds
    labels = ["toxic", "severe_toxic", "obscene", "threat", "insult", "identity_hate"]
    violations = []
    
    for i, score in enumerate(predictions):
        if score > 0.5:
            violations.append(Violation(
                rule_id=f"toxicity.{labels[i]}",
                severity="high" if score > 0.8 else "medium",
                message=f"{labels[i]}: {score:.2f}",
                metadata={"score": float(score)}
            ))
    
    return Left_(violations) if violations else Right_(ctx)
```

### Model Loading During Guard Execution

**Location**: `apps/controlnet/cga_core/onnx_loader.py` (lines 118-186)

When a guard calls `await loader.load_model(model_id)`:

1. **Check cache** - If already loaded, return cached session
2. **Get model info** - From registry (metadata, path, config)
3. **Resolve path** - Local filesystem or GCS
4. **Download** (if GCS) - To `/tmp/onnx_models/{tenant_id}/`
5. **Load ONNX session** - Using `onnxruntime.InferenceSession`
6. **Cache** - Store in `self._sessions` dict
7. **Fail fast** - Raise exception if model unavailable

## Performance Characteristics

### Expected Latencies

| Tier | Guard Type | Latency | Example |
|------|-----------|---------|---------|
| T0   | Regex     | < 10ms  | PII detection |
| T1   | Semantic  | < 50ms  | Sentiment analysis |
| T2   | ONNX      | < 200ms | Toxicity model |

### Optimizations

1. **Early Exit**: Stop on first violation (T1, T2)
2. **Gating**: Skip expensive tiers based on cheap tier scores
3. **Caching**: ONNX sessions cached in memory
4. **Parallel Execution**: Run independent guards in parallel

## Real Example: Chat Completion Request

```bash
curl -X POST http://localhost/v1/chat/completions \
  -H "Authorization: Bearer sk-..." \
  -H "X-Policy-ID: policy-123" \
  -H "X-Tenant-ID: org-abc" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Give investment advice"}]
  }'
```

**Flow**:

1. **Extract**: `model_id=gpt-4`, `policy_id=policy-123`, `tenant_id=org-abc`
2. **Load Policy**: Get compiled guards + metadata
3. **Route** (if enabled): Prompt embedding → Select `financial` family
4. **Input Guards**:
   - T0: Regex PII check (< 5ms) ✅
   - T1: Semantic check (< 20ms) ✅
   - T2: Financial advice ONNX model (< 80ms) ⚠️ → Violation
5. **Return 400**:
```json
{
  "error": "Guard violations detected",
  "violations": [{
    "rule_id": "financial.advice",
    "severity": "high",
    "message": "Financial advice detected"
  }]
}
```

If clean, forward to OpenAI and run output guards.

## Code References

- **Chat Endpoint**: `apps/controlnet/gateway/routes/chat.py` (lines 123-926)
- **Guard Execution**: `apps/controlnet/gateway/guards.py` (lines 16-201)
- **Tiered Runner**: `apps/controlnet/cga_core/tiered_runner.py` (lines 1-322)
- **Router**: `apps/controlnet/cga_core/router.py` (lines 1-157)
- **ONNX Loader**: `apps/controlnet/cga_core/onnx_loader.py` (lines 45-270)
- **Model Loader**: `apps/controlnet/cga_core/model_loader.py` (lines 68-300)
- **ONNX Registry**: `apps/controlnet/cga_core/onnx_registry.py` (lines 1-769)
- **Guard Registry**: `apps/controlnet/cga_core/registry.py` (lines 133-190)
- **PII Guards**: `apps/controlnet/guard_packs/pii/guards.py` (lines 1-195)

## Summary

The architecture provides:

✅ **Intelligent Routing** - Embedding-based family selection  
✅ **Dynamic ONNX Loading** - From GCS or local with caching  
✅ **Tiered Execution** - T0/T1/T2 with gating and early exit  
✅ **Fail-Fast** - Explicit errors, no silent degradation  
✅ **Performance Optimized** - Skip expensive guards when not needed  
✅ **Tenant Isolation** - Per-tenant models from GCS  

This design balances **latency**, **accuracy**, and **maintainability** for AI governance at scale.

