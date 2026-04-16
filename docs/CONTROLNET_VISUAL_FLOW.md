# ControlNet Visual Flow Diagram

## Complete System Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLIENT REQUEST                                   │
│  POST /v1/chat/completions                                               │
│  Headers: X-API-KEY, X-Policy-ID, X-Model-ID                           │
│  Body: {messages: [...], model: "gpt-4"}                                │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION LAYER                                 │
│  • Extract X-API-KEY                                                     │
│  • Query api_keys table (bcrypt validation)                            │
│  • Create ApiKeyContext: {tenant_id, user_id, permissions}              │
│  • Update last_used_at                                                  │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    POLICY RESOLUTION                                    │
│  • Extract X-Policy-ID header                                          │
│  • PolicyCache.get_policy(tenant_id, policy_id):                        │
│    ├─ Check Redis: {tenant_id}:{policy_id}                             │
│    ├─ If MISS → Query policies table                                   │
│    ├─ Load YAML → compile_policy(yaml_bytes)                            │
│    └─ Cache compiled guards (Redis + LRU)                              │
│  • Return: (compiled_guards, policy_metadata)                           │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  GUARD COMPILATION DETAIL                              │
│                                                                         │
│  YAML Policy:                                                          │
│  ┌────────────────────────────────────────────┐                      │
│  │ guards:                                    │                      │
│  │   - id: pii.redact                         │                      │
│  │     target: messages[*].content            │                      │
│  │     with: {types: ["EMAIL"]}               │                      │
│  │ compose:                                   │                      │
│  │   input: allOf(pii_redact)                 │                      │
│  └────────────────────────────────────────────┘                      │
│                             │                                          │
│                             ▼                                          │
│  ┌────────────────────────────────────────────┐                      │
│  │ 1. Lookup guard_id in REGISTRY             │                      │
│  │ 2. Get factory function                     │                      │
│  │ 3. Call factory(**params) → guard instance │                      │
│  │ 4. Build lens for target JSONPath           │                      │
│  │ 5. Wrap: focus(lens, guard)                 │                      │
│  │ 6. Organize by tier (T0/T1/T2)              │                      │
│  │ 7. Evaluate compose expression              │                      │
│  └────────────────────────────────────────────┘                      │
│                             │                                          │
│                             ▼                                          │
│  Compiled Guard Graph:                                                 │
│  ┌────────────────────────────────────────────┐                      │
│  │ {                                           │                      │
│  │   "input": Guard(...),                     │                      │
│  │   "output": Guard(...),                    │                      │
│  │   "root": Guard(...)                       │                      │
│  │ }                                           │                      │
│  └────────────────────────────────────────────┘                      │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    INPUT GUARD EXECUTION                               │
│                                                                         │
│  Context: {phase: "input", messages: [...]}                          │
│                                                                         │
│  ┌─────────────────────────────────────────────┐                      │
│  │ SmartGuardScheduler.execute_policy()        │                      │
│  │                                             │                      │
│  │ 1. T0 Guards (parallel):                    │                      │
│  │    • pii.redact                            │                      │
│  │    • security.secrets                      │                      │
│  │    • Result: violations or updated ctx     │                      │
│  │                                             │                      │
│  │ 2. If T0 score < threshold → T1 Guards:    │                      │
│  │    • toxicity.detect                      │                      │
│  │    • Result: violations or updated ctx     │                      │
│  │                                             │                      │
│  │ 3. If T1 score < threshold → T2 Guards:    │                      │
│  │    • security.jailbreak (ONNX)             │                      │
│  │    • Result: violations or updated ctx     │                      │
│  │                                             │                      │
│  │ Early exit on violations                   │                      │
│  └─────────────────────────────────────────────┘                      │
│                             │                                          │
│                    ┌────────┴────────┐                                 │
│                    │                 │                                 │
│              Violations?         No Violations                          │
│                    │                 │                                 │
│                    ▼                 ▼                                 │
│         Return 400 Error      Continue to Provider                      │
└─────────────────────────────────────────────────────────────────────────┘
                             │
                             ▼ (if input passes)
┌─────────────────────────────────────────────────────────────────────────┐
│                    MODEL ROUTING                                       │
│  • Query provider_models table                                        │
│  • Resolve: {provider, base_url, auth_header}                          │
│  • Extract user's provider API key (BYOK)                              │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    PROVIDER CALL                                        │
│  • Forward request to OpenAI/Anthropic/etc                              │
│  • Handle streaming vs non-streaming                                    │
│  • Receive response                                                      │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    OUTPUT GUARD EXECUTION                               │
│                                                                         │
│  Context: {phase: "output", output: response_text}                     │
│                                                                         │
│  ┌─────────────────────────────────────────────┐                      │
│  │ SmartGuardScheduler.execute_policy()        │                      │
│  │                                             │                      │
│  │ For Streaming:                              │                      │
│  │  • T0/T1 on chunks                          │                      │
│  │  • T2 on final assembled content            │                      │
│  │                                             │                      │
│  │ For Non-Streaming:                          │                      │
│  │  • All tiers run on full content            │                      │
│  └─────────────────────────────────────────────┘                      │
│                             │                                          │
│                    ┌────────┴────────┐                                 │
│                    │                 │                                 │
│              Violations?         No Violations                          │
│                    │                 │                                 │
│                    ▼                 ▼                                 │
│         Return 400 Error      Return 200 Success                       │
└─────────────────────────────────────────────────────────────────────────┘
                             │
                             ▼ (always log)
┌─────────────────────────────────────────────────────────────────────────┐
│                    OBSERVABILITY LOGGING                               │
│                                                                         │
│  INSERT INTO observability_logs:                                        │
│  {                                                                      │
│    tenant_id, request_id, timestamp,                                   │
│    method, path, status_code, latency_ms,                              │
│    request_payload (sanitized),                                        │
│    response_payload (sanitized),                                       │
│    guardrail_results: {                                                │
│      input_guards: [{id, name, tier, status, time_ms}...],          │
│      output_guards: [{...}...],                                       │
│      policy_decision: "allow" | "block",                               │
│      violated_guard: {...}  # if blocked                              │
│    },                                                                   │
│    metadata: {trace_id, policy_hash, model}                           │
│  }                                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

## Guard Pack Registration Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│               GUARD PACK MODULE LOADING                                │
│                                                                         │
│  guard_packs/your_pack/guards.py:                                      │
│  ┌────────────────────────────────────────────┐                        │
│  │ @guard("your_pack.action", tier="T0")      │                        │
│  │ def your_guard(...) -> Guard:              │                        │
│  │     async def run(ctx: Ctx) -> Either:     │                        │
│  │         ...                                 │                        │
│  │     return run                              │                        │
│  └────────────────────────────────────────────┘                        │
│                      │                                                  │
│                      ▼                                                  │
│  ┌────────────────────────────────────────────┐                        │
│  │ @guard decorator executes:                  │                        │
│  │ REGISTRY["your_pack.action"] =              │                        │
│  │   GuardMetadata(                            │                        │
│  │     factory=your_guard,                     │                        │
│  │     tier="T0",                              │                        │
│  │     performance_budget_ms=5.0               │                        │
│  │   )                                         │                        │
│  └────────────────────────────────────────────┘                        │
│                      │                                                  │
│                      ▼                                                  │
│  When guard_packs/__init__.py imports your_pack:                       │
│  ┌────────────────────────────────────────────┐                        │
│  │ from . import your_pack  # Triggers @guard   │                        │
│  └────────────────────────────────────────────┘                        │
│                      │                                                  │
│                      ▼                                                  │
│  When cga_core/__init__.py imports guard_packs:                        │
│  ┌────────────────────────────────────────────┐                        │
│  │ import guard_packs.your_pack  # All guards  │                        │
│  │ registered in REGISTRY                      │                        │
│  └────────────────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────┘
```

## Tiered Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    TIERED GUARD RUNNER                                  │
│                                                                         │
│  SmartGuardScheduler.execute_policy(guards, context):                 │
│                                                                         │
│  ┌─────────────────────────────────────────────────────┐              │
│  │ TIER T0 (Ultra-fast, < 10ms)                        │              │
│  │ ├─ pii.redact                                       │              │
│  │ ├─ security.secrets                                 │              │
│  │ ├─ tools.allowlist                                  │              │
│  │ └─ All run in PARALLEL                              │              │
│  │                                                      │              │
│  │ Result: violations OR updated context                │              │
│  │ Score: max(violation.score)                          │              │
│  └─────────────────────────────────────────────────────┘              │
│                      │                                                  │
│         ┌───────────┴───────────┐                                      │
│         │                        │                                      │
│    Violations?              No Violations                                │
│         │                        │                                      │
│         ▼                        ▼                                      │
│    Early Exit?          Check Gate Condition                             │
│         │              (t0_score < 0.8?)                                │
│         │                        │                                      │
│         │                  ┌─────┴─────┐                                │
│         │                  │           │                                │
│         │              Pass Gate    Fail Gate                           │
│         │                  │           │                                │
│         │                  ▼           ▼                                │
│         │          ┌───────────────────────┐                            │
│         │          │ TIER T1 (Fast, < 30ms) │                            │
│         │          │ ├─ toxicity.detect     │                            │
│         │          │ ├─ tools.args.validator│                            │
│         │          │ └─ All run in PARALLEL  │                            │
│         │          │                        │                            │
│         │          │ Result: violations OR   │                            │
│         │          │ Score: max(score)      │                            │
│         │          └───────────────────────┘                            │
│         │                  │                                            │
│         │         ┌─────────┴─────────┐                                 │
│         │         │                   │                                 │
│         │    Violations?          No Violations                          │
│         │         │                   │                                 │
│         │         ▼                   ▼                                 │
│         │    Early Exit      Check Gate Condition                       │
│         │         │           (t1_score < 0.9?)                          │
│         │         │                   │                                 │
│         │         │             ┌──────┴──────┐                         │
│         │         │             │              │                         │
│         │         │         Pass Gate      Fail Gate                     │
│         │         │             │              │                         │
│         │         │             ▼              ▼                         │
│         │         │     ┌───────────────────────────┐                   │
│         │         │     │ TIER T2 (Slow, < 100ms)   │                   │
│         │         │     │ ├─ security.jailbreak     │                   │
│         │         │     │ │   (ONNX model)          │                   │
│         │         │     │ └─ Run SEQUENTIALLY       │                   │
│         │         │     │                           │                   │
│         │         │     │ Result: violations OR     │                   │
│         │         │     └───────────────────────────┘                   │
│         │         │             │                                        │
│         │         │             ▼                                        │
│         │         │    Final Result                                     │
│         │         │    (violations + context)                            │
│         │         │                                                      │
│         └─────────┴──────────────────────────────────────────────────┘
│                                                                         │
│  Returns: ExecutionResult                                              │
│  {                                                                      │
│    violations: [...],                                                  │
│    context: {...},                                                      │
│    tier_stats: {T0: {...}, T1: {...}, T2: {...}},                      │
│    total_time_ms: 15.2,                                                 │
│    early_exit: false,                                                   │
│    gated_tiers: []                                                      │
│  }                                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Through Guard Execution

```
Context Structure:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  INPUT PHASE:                                                           │
│  {                                                                      │
│    "phase": "input",                                                   │
│    "messages": [                                                        │
│      {"role": "user", "content": "..."},                              │
│      {"role": "assistant", "content": "..."}                           │
│    ],                                                                   │
│    "model": "gpt-4",                                                    │
│    "stream": false                                                      │
│  }                                                                      │
│                                                                         │
│  Guard Target: messages[*].content                                     │
│  Lens extracts: ["user message", "assistant message"]                  │
│                                                                         │
│  Guard processes each:                                                 │
│    ┌─────────────────────┐                                            │
│    │ user message        │ ──► Guard Function ──► Violation or Pass    │
│    └─────────────────────┘                                            │
│    ┌─────────────────────┐                                            │
│    │ assistant message   │ ──► Guard Function ──► Violation or Pass    │
│    └─────────────────────┘                                            │
│                                                                         │
│  If violation: return Left_([Violation(...)])                          │
│  If pass: return Right_({...context with redacted/modified messages}) │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  OUTPUT PHASE:                                                          │
│  {                                                                      │
│    "phase": "output",                                                  │
│    "output": "The assistant's response text..."                        │
│  }                                                                      │
│                                                                         │
│  Guard Target: output                                                   │
│  Lens extracts: "The assistant's response text..."                      │
│                                                                         │
│  Guard processes:                                                       │
│    ┌─────────────────────────────────┐                                │
│    │ response text                  │ ──► Guard Function              │
│    └─────────────────────────────────┘                                │
│                      │                                                  │
│            ┌─────────┴─────────┐                                       │
│            │                    │                                       │
│      Violation?            Pass                                          │
│            │                    │                                       │
│            ▼                    ▼                                       │
│    Left_([Violation])    Right_({...context})                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Combinator Composition Examples

```
Sequential (seq):
    Guard1 ──► Guard2 ──► Guard3
    Stop on first failure

Parallel (allOf):
    Guard1 ──► collect violations
    Guard2 ──► collect violations ──► Combine all violations
    Guard3 ──► collect violations

Alternative (anyOf):
    Guard1 ──► success?
    Guard2 ──► success? ──► Return first success
    Guard3 ──► success?

K-of-N (kOf(2, ...)):
    Guard1 ──► pass
    Guard2 ──► pass ──► Require at least 2 passes
    Guard3 ──► fail

Conditional (unless):
    Condition ──► passes? ──► Run Guard ──► Result
                 fails? ──► Skip, return success
```

