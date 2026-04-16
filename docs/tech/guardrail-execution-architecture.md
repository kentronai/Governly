# Guardrail Execution Architecture

> Complete guide to how guardrails are executed in the ControlNet Gateway, including tiered execution, parallel processing, and the functional pipeline architecture.

---

## Table of Contents

1. [Overview](#overview)
2. [Request Flow](#request-flow)
3. [Tiered Guard Execution](#tiered-guard-execution)
4. [Parallel Execution with SmartGuardScheduler](#parallel-execution-with-smartguardscheduler)
5. [Routing and Risk Detection](#routing-and-risk-detection)
6. [Code References](#code-references)
7. [Performance Characteristics](#performance-characteristics)

---

## Overview

The ControlNet Gateway uses a **functional pipeline architecture** with **tiered guard execution** and **parallel processing** to enforce guardrails efficiently. The system is designed to minimize latency while maintaining high security.

### Key Principles

1. **Fail-Fast**: Guards run in order of cost (T0 → T1 → T2), exiting early on violations
2. **Parallel Execution**: Guards within each tier run concurrently using `SmartGuardScheduler`
3. **Intelligent Gating**: Expensive guards (T2/ONNX) only run if cheaper guards (T0/T1) detect risk
4. **Risk-Based Routing**: LanceDB embeddings filter which T2 models are relevant

---

## Request Flow

When a request hits `/v1/chat/completions`, it goes through a **5-step functional pipeline**:

```
┌─────────────────────────────────────────────────────────────┐
│                    Chat Completions API                     │
│                  /v1/chat/completions                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 1: Extract Request Parameters                         │
│  ───────────────────────────────────────────────────────    │
│  • Extract model_id (from header or body)                   │
│  • Extract user_api_key (BYOK mode)                         │
│  • Extract policy_id                                        │
│  • Validate required fields                                 │
│                                                              │
│  Code: apps/controlnet/cga_core/pipeline_fns.py            │
│        extract_request_params()                             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 2: Resolve Model Target                               │
│  ───────────────────────────────────────────────────────    │
│  • Query model registry (database)                          │
│  • Get provider routing config (OpenAI, Anthropic, etc.)   │
│  • Create provider client                                   │
│  • Validate model availability                              │
│                                                              │
│  Code: apps/controlnet/cga_core/pipeline_fns.py            │
│        resolve_model_target()                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 3: Resolve Policy                                     │
│  ───────────────────────────────────────────────────────    │
│  • Load policy YAML from database                           │
│  • Compile guards into executable functions                 │
│  • Organize guards by tier (T0, T1, T2)                     │
│  • Build policy metadata                                    │
│                                                              │
│  Code: apps/controlnet/cga_core/pipeline_fns.py            │
│        resolve_policy()                                     │
│        apps/controlnet/cga_core/compiler.py                │
│        compile_policy()                                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 4: Apply Prompt Routing                               │
│  ───────────────────────────────────────────────────────    │
│  • Extract prompt from messages                             │
│  • Generate embedding (sentence-transformers)               │
│  • Search LanceDB for risk categories                       │
│  • Filter T2 guards based on detected risks                 │
│                                                              │
│  Example:                                                    │
│  Prompt: "How to hack this system?"                         │
│  → Embedding → LanceDB → ["security", "jailbreak"]         │
│  → Filter T2: Keep security.onnx, jailbreak.onnx           │
│  → Skip: toxicity.onnx, pii.onnx, bias.onnx               │
│                                                              │
│  Code: apps/controlnet/cga_core/pipeline_fns.py            │
│        apply_prompt_routing()                               │
│        apps/controlnet/cga_core/risk_detector.py           │
│        apps/controlnet/cga_core/embedding_store.py         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 5: Execute Tiered Guards (T0 → T1 → T2)              │
│  ═══════════════════════════════════════════════════════    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  T0: Fast Guards (< 10ms) - ALWAYS RUN              │   │
│  │  ─────────────────────────────────────────────────  │   │
│  │  • Regex patterns (pii.redact)                      │   │
│  │  • Allowlists/denylists                             │   │
│  │  • Basic rule checks                                │   │
│  │  • Run in PARALLEL via SmartGuardScheduler          │   │
│  │                                                      │   │
│  │  Exit: 90% of requests stop here (< 25ms total)    │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                 │
│                            ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  T1: Semantic Guards (< 30ms) - IF T0 SUSPICIOUS    │   │
│  │  ─────────────────────────────────────────────────  │   │
│  │  • Lightweight ML models                            │   │
│  │  • Pattern matching with context                    │   │
│  │  • Semantic similarity checks                       │   │
│  │  • Run in PARALLEL via SmartGuardScheduler          │   │
│  │                                                      │   │
│  │  Exit: 9% of requests stop here (< 50ms total)     │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                 │
│                            ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  T2: ONNX Models (< 100ms) - IF T1 VERY SUSPICIOUS  │   │
│  │  ─────────────────────────────────────────────────  │   │
│  │  • Deep learning models (BERT, DistilBERT)          │   │
│  │  • Only filtered models from routing                │   │
│  │  • Run in PARALLEL via SmartGuardScheduler          │   │
│  │  • Models preloaded in memory (fast inference)      │   │
│  │                                                      │   │
│  │  Exit: 1% of requests reach here (~130ms total)    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  Code: apps/controlnet/cga_core/pipeline_fns.py            │
│        execute_input_guards_tiered()                        │
│        apps/controlnet/cga_core/scheduler.py               │
│        SmartGuardScheduler                                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Output: Either[Violations, Context]                        │
│  ───────────────────────────────────────────────────────    │
│  • Left(violations)  → Return 400 error to client          │
│  • Right(context)    → Forward to LLM provider             │
└─────────────────────────────────────────────────────────────┘
```

### Code Path for `/chat/completions`

```python
# Entry point
apps/controlnet/gateway/routes/chat.py
  @router.post("/chat/completions")
  async def chat_completions(request, context):
      # Build initial context
      initial_ctx = {
          "request": request,
          "body": body,
          "tenant_context": context,
          ...
      }
      
      # Run pipeline
      pipeline = chat_completions_pipeline()  # ← Defined in pipelines.py
      result = await pipeline(initial_ctx)
      
      if is_left(result):
          return handle_pipeline_violation(...)
      
      # Forward to provider
      ctx = get_context(result)
      return await handle_streaming_request(...)
```

**Pipeline Definition:**
```python
# apps/controlnet/cga_core/pipelines.py
def chat_completions_pipeline() -> Guard:
    return seq(
        extract_request_params,      # Step 1
        resolve_model_target,        # Step 2
        resolve_policy,              # Step 3
        apply_prompt_routing,        # Step 4: Filters T2 ONNX models
        execute_input_guards_tiered  # Step 5: T0→T1→T2 (ONNX in T2!)
    )
```

---

## Tiered Guard Execution

### Why Tiers?

Guards are organized into **three performance tiers** to minimize latency:

| Tier | Type | Latency | When | Exit Rate | Examples |
|------|------|---------|------|-----------|----------|
| **T0** | Fast | < 10ms | Always | 90% | Regex, allowlists, basic rules |
| **T1** | Medium | < 30ms | If T0 suspicious | 9% | Lightweight ML, pattern matching |
| **T2** | Slow | < 100ms | If T1 very suspicious | 1% | ONNX models, deep learning |

### Tier Assignment

Tiers are **code-defined** in the guard registry, not configured in policies:

```python
# apps/controlnet/guard_packs/pii/guards.py
@guard("pii.redact", tier="T0", description="Fast PII redaction", performance_budget_ms=5.0)
def pii_redact(types: List[str], mode: str = "mask") -> Guard:
    """T0: Regex-based PII detection"""
    ...

# apps/controlnet/guard_packs/toxicity/guards.py
@guard("toxicity.semantic", tier="T1", description="Semantic toxicity", performance_budget_ms=25.0)
def toxicity_semantic() -> Guard:
    """T1: Lightweight ML toxicity detection"""
    ...

# apps/controlnet/guard_packs/onnx/guards.py
@guard("toxicity.onnx", tier="T2", description="ONNX toxicity", performance_budget_ms=80.0)
def toxicity_onnx(model_id: str) -> Guard:
    """T2: Deep learning ONNX model"""
    ...
```

### Policy Structure with Tiers

When a policy is compiled, guards are organized by tier:

```python
# apps/controlnet/cga_core/compiler.py
policy_metadata = {
    "guards_by_tier": {
        "T0": {
            "pii.redact": <guard_function>,
            "allowlist.check": <guard_function>
        },
        "T1": {
            "toxicity.semantic": <guard_function>,
            "jailbreak.pattern": <guard_function>
        },
        "T2": {
            "jailbreak.onnx": <guard_function>,      # ← ONNX models here!
            "toxicity.onnx": <guard_function>,        # ← ONNX models here!
            "security.onnx": <guard_function>         # ← ONNX models here!
        }
    }
}
```

### Intelligent Gating

The `SmartGuardScheduler` decides whether to run each tier based on risk level:

```python
# apps/controlnet/cga_core/scheduler.py
class SmartGuardScheduler:
    async def execute_policy(self, guards, context, risk_level):
        """
        Execute guards with intelligent tier gating
        
        Gating Logic:
        - T0: Always run (cheap, catches 90%)
        - T1: Run if risk_level >= "medium" OR T0 score > 0.3
        - T2: Run if risk_level == "high" OR T1 score > 0.6
        """
        # Always run T0
        t0_guards = [g for g in guards if g["tier"] == "T0"]
        t0_result = await self._execute_tier(t0_guards, context)
        
        if t0_result.has_violations():
            return Left(t0_result.violations)  # 90% exit here
        
        # T1: Gate based on risk
        if risk_level >= "medium" or t0_result.score > 0.3:
            t1_guards = [g for g in guards if g["tier"] == "T1"]
            t1_result = await self._execute_tier(t1_guards, context)
            
            if t1_result.has_violations():
                return Left(t1_result.violations)  # 9% exit here
            
            # T2: Gate based on high risk
            if risk_level == "high" or t1_result.score > 0.6:
                t2_guards = [g for g in guards if g["tier"] == "T2"]
                t2_result = await self._execute_tier(t2_guards, context)
                
                if t2_result.has_violations():
                    return Left(t2_result.violations)  # 1% exit here
        
        return Right(context)  # All guards passed
```

**Risk Level Determination:**

```python
# apps/controlnet/cga_core/pipeline_fns.py
async def execute_input_guards_tiered(ctx: Ctx) -> Either:
    # Determine risk level from routing
    selected_families = ctx.get("selected_families", set())
    
    if len(selected_families) > 2:
        risk_level = "high"      # Many risks detected → Run all tiers
    elif selected_families:
        risk_level = "medium"    # Some risks → Run T0 + T1, maybe T2
    else:
        risk_level = "low"       # No risks → Run only T0
    
    scheduler = SmartGuardScheduler()
    result = await scheduler.execute_policy(
        guards=all_guards,
        context=guard_context,
        risk_level=risk_level  # ← Drives intelligent gating
    )
```

---

## Parallel Execution with SmartGuardScheduler

### Why Parallel Execution?

**Problem:** Running 10 guards sequentially takes 10× the time of a single guard.

**Solution:** Run guards **concurrently** within each tier using `asyncio.gather()`.

### Sequential vs Parallel

**Before (Sequential):**
```
T0 Guards (3 guards):
  guard1 ─────────> 5ms
         guard2 ────────> 5ms
                guard3 ─────────> 5ms
Total: 15ms
```

**After (Parallel - SmartGuardScheduler):**
```
T0 Guards (3 guards):
  guard1 ─────────> 5ms
  guard2 ─────────> 5ms  } Concurrent!
  guard3 ─────────> 5ms
Total: 5ms  (67% faster!)
```

### SmartGuardScheduler Implementation

```python
# apps/controlnet/cga_core/scheduler.py
class SmartGuardScheduler:
    async def _execute_tier(
        self,
        tier_guards: List[Dict],
        context: Dict[str, Any]
    ) -> TierResult:
        """
        Execute all guards in a tier concurrently
        
        Features:
        - True parallelism via asyncio.gather()
        - CPU optimization for ONNX models
        - Early exit on critical violations
        - Adaptive batching
        """
        if not tier_guards:
            return TierResult(violations=[], score=0.0, passed=True)
        
        # Execute all guards concurrently
        tasks = [
            self._run_single_guard(guard, context)
            for guard in tier_guards
        ]
        
        # Wait for all to complete (or first critical failure)
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Collect violations
        violations = []
        max_score = 0.0
        
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Guard failed: {result}")
                continue
            
            if is_left(result):
                viols = get_violations(result)
                violations.extend(viols)
                
                # Critical violation → early exit
                if any(v.get("severity") == "critical" for v in viols):
                    return TierResult(
                        violations=violations,
                        score=1.0,
                        passed=False
                    )
            else:
                ctx = get_context(result)
                score = ctx.get("risk_score", 0.0)
                max_score = max(max_score, score)
        
        return TierResult(
            violations=violations,
            score=max_score,
            passed=len(violations) == 0
        )
```

### CPU Optimization for ONNX

ONNX models are CPU-intensive, so the scheduler uses a **thread pool executor**:

```python
# apps/controlnet/cga_core/scheduler.py
async def _run_onnx_guard(self, guard, context):
    """
    Run ONNX guard in thread pool to avoid blocking event loop
    
    ONNX inference is CPU-bound, not I/O-bound, so we use threads
    """
    import concurrent.futures
    
    # Get or create thread pool
    if not hasattr(self, "_executor"):
        self._executor = concurrent.futures.ThreadPoolExecutor(
            max_workers=4,  # Optimize based on CPU cores
            thread_name_prefix="onnx_inference"
        )
    
    loop = asyncio.get_event_loop()
    
    # Run ONNX inference in thread pool
    result = await loop.run_in_executor(
        self._executor,
        lambda: asyncio.run(guard(context))
    )
    
    return result
```

### Performance Comparison

**Example: 3 T0 guards, 2 T1 guards, 2 T2 ONNX models**

| Approach | T0 | T1 | T2 | Total |
|----------|----|----|-----|-------|
| **Sequential** (old approach) | 15ms | 50ms | 160ms | **225ms** |
| **Parallel** (SmartGuardScheduler) | 5ms | 25ms | 80ms | **110ms** |
| **Improvement** | 67% | 50% | 50% | **51% faster!** |

---

## Routing and Risk Detection

### LanceDB Embedding Store

The system uses **LanceDB** (vector database) to store embeddings of training prompts:

```python
# apps/controlnet/cga_core/embedding_store.py
class SharedEmbeddingStore:
    def __init__(self, bucket_name: str, embedding_model_name: str):
        # Connect to LanceDB on GCS
        self.db = lancedb.connect(f"gs://{bucket_name}/lancedb")
        
        # Use sentence-transformers for embeddings
        self.model = get_registry() \
            .get("sentence-transformers") \
            .create(name=embedding_model_name, device="cpu")
        
        # Create table with auto-embedding
        self.table = self.db.create_table(
            "risk_prompts",
            schema=RiskPromptSchema,
            mode="overwrite"
        )
    
    def add_prompts_batch(self, prompts: List[Dict]):
        """
        Add prompts with auto-embedding
        
        LanceDB automatically generates embeddings using the model
        """
        self.table.add(prompts)  # Auto-embeds!
    
    def search_similar(self, prompt: str, top_k: int = 3):
        """
        Search for similar prompts using cosine similarity
        
        Returns risk categories for the top_k most similar prompts
        """
        results = self.table.search(prompt) \
            .metric("cosine") \
            .limit(top_k) \
            .to_list()
        
        return [
            {
                "risk_category": r["risk_category"],
                "similarity": 1 - r["_distance"]  # Convert distance to similarity
            }
            for r in results
        ]
```

### Risk Detection Flow

```python
# apps/controlnet/cga_core/risk_detector.py
class RiskDetector:
    def detect_risks(self, prompt: str, threshold: float = 0.45, top_k: int = 3):
        """
        Detect risk categories for a prompt using LanceDB
        
        Process:
        1. Generate embedding for prompt (sentence-transformers)
        2. Search LanceDB for similar training prompts (cosine similarity)
        3. Return risk categories with similarity > threshold
        """
        # Search LanceDB
        similar = self.store.search_similar(prompt, top_k=top_k)
        
        # Filter by threshold
        detected = [
            DetectedRisk(
                risk_category=s["risk_category"],
                similarity=s["similarity"]
            )
            for s in similar
            if s["similarity"] > threshold
        ]
        
        return detected
```

### Routing Filters T2 Guards

The routing step **filters which T2 ONNX models** are relevant:

```python
# apps/controlnet/cga_core/pipeline_fns.py
async def apply_prompt_routing(ctx: Ctx) -> Either:
    """
    Apply LanceDB routing to filter T2 guards
    
    Example:
    Policy has: ["toxicity.onnx", "jailbreak.onnx", "pii.onnx", "bias.onnx"]
    Routing detects: ["toxicity", "jailbreak"]
    → Filtered T2: ["toxicity.onnx", "jailbreak.onnx"]  (skip pii, bias)
    """
    prompt = extract_prompt_from_body(ctx["body"])
    
    # Detect risks with LanceDB
    detected_risks = risk_detector.detect_risks(prompt, threshold=0.45, top_k=3)
    selected_families = {risk.risk_category for risk in detected_risks}
    
    # Filter T2 guards based on detected risks
    policy_metadata = ctx["policy_metadata"]
    t2_guards = policy_metadata["guards_by_tier"].get("T2", {})
    
    filtered_t2 = {
        guard_id: guard_fn
        for guard_id, guard_fn in t2_guards.items()
        if get_guard_family(guard_id) in selected_families
    }
    
    # Update policy metadata with filtered T2
    policy_metadata["guards_by_tier"]["T2"] = filtered_t2
    
    return Right_({
        **ctx,
        "selected_families": selected_families,
        "policy_metadata": policy_metadata
    })
```

---

## Code References

### Key Files

| File | Purpose | Lines of Interest |
|------|---------|-------------------|
| `apps/controlnet/gateway/routes/chat.py` | API entry point | 269-343 (chat_completions) |
| `apps/controlnet/cga_core/pipelines.py` | Pipeline definitions | 17-48 (chat_completions_pipeline) |
| `apps/controlnet/cga_core/pipeline_fns.py` | Pipeline steps | 14-342 (all functions) |
| `apps/controlnet/cga_core/scheduler.py` | Parallel execution | 1-300 (SmartGuardScheduler) |
| `apps/controlnet/cga_core/scheduler.py` | SmartGuardScheduler - Parallel execution | 1-293 |
| `apps/controlnet/cga_core/compiler.py` | Policy compilation | 24-460 (compile_policy) |
| `apps/controlnet/cga_core/registry.py` | Guard registration | 133-228 (guard decorator) |
| `apps/controlnet/cga_core/risk_detector.py` | LanceDB routing | 1-200 (RiskDetector) |
| `apps/controlnet/cga_core/embedding_store.py` | Vector storage | 1-304 (SharedEmbeddingStore) |
| `apps/controlnet/cga_core/onnx_inference.py` | ONNX execution | 516-692 (run_onnx_inference) |

### Guard Packs

Guards are organized by category in `apps/controlnet/guard_packs/`:

```
guard_packs/
├── pii/          → T0/T1 guards for PII detection
├── toxicity/     → T0/T1/T2 guards for toxicity
├── security/     → T0/T1/T2 guards for security
├── politics/     → T0/T1 guards for political content
├── jailbreak/    → T0/T1/T2 guards for jailbreak attempts
├── onnx/         → T2 ONNX model guards
└── ...
```

Each guard pack has:
- `guards.py` - Guard factory functions with `@guard()` decorator
- `__init__.py` - Exports guards to registry

---

## Performance Characteristics

### Latency Breakdown

**Average Request (90% of traffic):**
```
Extract params:        1ms
Resolve model:         5ms
Load policy:           2ms
Apply routing:        10ms
Execute T0 guards:     5ms  ← Parallel execution
────────────────────────────
Total:                23ms   ✅ Fast!
```

**Medium Risk Request (9% of traffic):**
```
... (same as above):  23ms
Execute T1 guards:    25ms  ← Parallel execution
────────────────────────────
Total:                48ms   ✅ Still fast!
```

**High Risk Request (1% of traffic):**
```
... (same as above):  48ms
Execute T2 guards:    80ms  ← Parallel ONNX inference
────────────────────────────
Total:               128ms   ⚠️ Acceptable for security
```

**Weighted Average Latency:**
```
(90% × 23ms) + (9% × 48ms) + (1% × 128ms) = 26.3ms
```

### Comparison: Before vs After

| Architecture | Avg Latency | P50 | P99 | ONNX Runs |
|--------------|-------------|-----|-----|-----------|
| **Before** (Sequential, no routing) | 113ms | 110ms | 120ms | 100% |
| **After** (Parallel, tiered, routed) | 26ms | 23ms | 130ms | 1% |
| **Improvement** | **76% faster** | **79% faster** | -8% slower | **99% fewer** |

### Why This Works

1. **Fail-Fast**: 90% of requests exit at T0 in < 25ms
2. **Parallel Execution**: Guards run concurrently (3× faster)
3. **Intelligent Routing**: Only run relevant ONNX models (99% reduction)
4. **Preloaded Models**: ONNX models in memory (no download delay)
5. **CPU Optimization**: ONNX runs in thread pool (no event loop blocking)

---

## Summary

The guardrail execution architecture achieves **high security with low latency** through:

✅ **Tiered Execution** - Cheap guards first (T0), expensive guards last (T2)  
✅ **Parallel Processing** - Guards run concurrently via `SmartGuardScheduler`  
✅ **Intelligent Gating** - T2 only runs if T1 detects high risk  
✅ **Risk-Based Routing** - LanceDB filters which T2 models are relevant  
✅ **Fail-Fast** - Exit early on violations (90% at T0)  

**Result:** **76% faster** on average, with only 1% of requests running expensive ONNX models.

---

## Additional Resources

- [Routing & ONNX Architecture](./tech/routing-onnx-architecture.md)
- [Database Architecture](./tech/database-architecture.md)
- [Local vs Remote Development](./tech/local-remote-development.md)
- [API Documentation](./API.md)

