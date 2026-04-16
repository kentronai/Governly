# Audit System

Simple async audit logging for CGA Core - **zero blocking, fire-and-forget**.

## Key Features

✅ **Non-blocking** - Uses `asyncio.create_task()` for fire-and-forget  
✅ **Zero latency** - Audit runs in background, never blocks critical path  
✅ **Optional** - Works with or without audit_service  
✅ **Simple** - Just decorators, no queues or complexity  

## Performance

- **Overhead**: ~1-2 microseconds (task creation only)
- **Blocking**: 0ms (fire-and-forget)
- **Impact**: None on critical path

## Usage

### Option 1: Decorator at Call Site

```python
from cga_core.router import FamilyRouter
from cga_core.audit import with_router_audit

router = FamilyRouter(embedding_service, config)

@with_router_audit
async def route_with_audit(prompt, families, **audit_kwargs):
    return router.route(prompt, families)

# Call with audit params (optional)
families = await route_with_audit(
    prompt=prompt,
    families=allowed_families,
    audit_service=service,      # Optional
    db_session=session,          # Optional
    tenant_id="org_123",        # Optional
    actor_user_id="user_456"    # Optional
)

# Or without audit (still works)
families = await route_with_audit(prompt, allowed_families)
```

### Option 2: Inline Wrapper

```python
from cga_core.audit import with_router_audit

# Wrap at call site
result = await with_router_audit(
    lambda: router.route(prompt, families)
)(
    prompt=prompt,
    audit_service=service,
    db_session=session,
    tenant_id="org_123"
)
```

### Option 3: In Route Handlers

```python
from cga_core.audit import with_router_audit

@router.post("/chat/completions")
async def chat_handler(request, context):
    # ... existing code ...
    
    @with_router_audit
    async def route_families():
        return router.route(prompt, allowed_families)
    
    # Audit is fire-and-forget
    families = await route_families(
        prompt=prompt,
        audit_service=get_audit_service(),
        db_session=db_session,
        tenant_id=context.tenant_id,
        actor_user_id=context.user_id
    )
    
    # ... rest of handler ...
```

## Architecture

```
┌─────────────────────────────────────────────┐
│ Critical Path (Your Code)                  │
│ ─────────────────────────────               │
│                                             │
│  1. Execute function         (fast)         │
│  2. Return result            (fast)         │
│                                             │
└─────────────────────────────────────────────┘
                    │
                    ├─── asyncio.create_task()
                    │
                    ▼
┌─────────────────────────────────────────────┐
│ Background (Audit)                          │
│ ─────────────────────                       │
│                                             │
│  3. Log to database         (background)    │
│  4. Never blocks main flow  (async)         │
│                                             │
└─────────────────────────────────────────────┘
```

## Examples

### Router Audit

```python
from cga_core.audit import with_router_audit

@with_router_audit
async def smart_route(prompt, families, **audit_kwargs):
    return router.route(prompt, families)

families = await smart_route(
    prompt="Tell me about PII",
    families={"privacy", "security"},
    audit_service=service,
    db_session=session,
    tenant_id="org_123"
)
```

### ONNX Model Audit

```python
from cga_core.audit import with_model_audit

@with_model_audit("register")
async def register_model(registry, model_info, **audit_kwargs):
    return registry.register_model(model_info)

await register_model(
    registry,
    model_info,
    audit_service=service,
    db_session=session,
    tenant_id="org_123"
)
```

### Policy Compilation Audit

```python
from cga_core.audit import with_compilation_audit
from cga_core.compiler import compile_policy

@with_compilation_audit
async def compile_with_logging(yaml_bytes, **audit_kwargs):
    return compile_policy(yaml_bytes)

guard, metadata = await compile_with_logging(
    yaml_bytes,
    policy_id="policy_123",
    audit_service=service,
    db_session=session,
    tenant_id="org_123"
)
```

## What Gets Logged

All audit logs include:
- ✅ Action (e.g., "router.selection.success")
- ✅ Duration in milliseconds
- ✅ Tenant ID
- ✅ User ID (actor)
- ✅ Metadata (custom per operation)

## Error Handling

Audit failures **never break your app**:
- ✅ Silent failures (logged to debug)
- ✅ No exceptions propagated
- ✅ Critical path continues regardless

## Migration

### Before (No Audit)
```python
families = router.route(prompt, allowed_families)
```

### After (With Audit)
```python
from cga_core.audit import with_router_audit

@with_router_audit
async def route_families():
    return router.route(prompt, allowed_families)

families = await route_families(
    audit_service=service,
    db_session=session,
    tenant_id="org_123"
)
```

## Files

- `__init__.py` - Exports
- `decorators.py` - Generic decorators
- `router_audit.py` - Router-specific
- `onnx_audit.py` - ONNX-specific
- `compiler_audit.py` - Compiler-specific

## No Changes to Existing Code

✅ All existing files remain unchanged  
✅ Import audit only where needed  
✅ Backward compatible 100%  

