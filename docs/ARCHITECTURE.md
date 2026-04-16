# System Architecture

## Overview

The AI Governance Platform is built using category theory principles and functional programming patterns. The system is composed of three main applications:

1. **ControlNet Gateway** - Policy enforcement engine
2. **Web Dashboard** - User interface and management
3. **Model Guard** - Model security scanning

## Core Principles

- **Fail-Fast**: No fallbacks or placeholder code
- **Pure Functions**: Side-effect free where possible
- **Composition**: Small functions orchestrated together
- **Type Safety**: Strict typing throughout

## ControlNet Gateway Architecture

### Composable Guard Algebra (CGA)

The guard system is built on category theory:

```python
Guard = Callable[[Ctx], Awaitable[Either]]
```

Where:
- `Ctx` - Context (dictionary of data)
- `Either` - Functional result type:
  - `Left` = Failure (with violations)
  - `Right` = Success (with context)

### Guard Composition

```python
# Sequential composition (monadic bind)
guard1.then(guard2)

# Parallel composition (tensor product)
guard1.parallel(guard2)

# Conditional
guard1.when(predicate, guard2)

# Timeout
guard1.timeout(ms=100)
```

### Tiered Execution

Guards execute in three tiers:

- **T0**: Fast regex/pattern matching (< 10ms)
- **T1**: Moderate complexity (< 100ms)
- **T2**: ML models, complex checks (< 1000ms)

Execution is tiered to optimize latency.

### Policy Structure

```yaml
policy:
  input:
    - guard: pii.detect
      params:
        types: [email, phone]
    - guard: toxicity.check
  output:
    - guard: safety.onnx_detect
      params:
        model: detoxify_tiny
```

## Database Schema

### Source of Truth

**Drizzle ORM** (`apps/web/drizzle/schema.ts`) is the source of truth for all database schema. Changes flow:

```
apps/web/drizzle/schema.ts 
  → Generate migration 
  → Apply to database
  → Sync to SQLAlchemy models (ControlNet reads)
```

### Key Tables

#### `guardrails`
Stores guard definitions with metadata:
- Tier (T0/T1/T2)
- Family (routing group)
- Performance metrics
- Parameters

#### `policies`
Stores policy YAML and compiled guards:
- YAML source
- Compiled JSON
- Hash (for integrity)
- Status (draft/active/deprecated)

#### `policy_guardrails`
Junction table linking policies to guards:
- Policy ID
- Guardrail ID
- Phase (input/output)
- Parameters
- Order index

#### `onnx_models`
ONNX model registry:
- Model ID
- Family (routing)
- Performance metrics (p50, p95)
- Model metadata

## Web Dashboard Architecture

### Authentication Flow

```typescript
Clerk Auth → JWT → Tenant Context → RLS
```

1. User authenticates with Clerk
2. JWT contains tenant ID
3. Tenant context extracted
4. Database queries use RLS for isolation

### State Management

#### Server State
- **TanStack React Query**: Server state with automatic caching
  - Provider setup: `apps/web/src/app/providers.tsx` (lines 1-20)
  - Usage example: `apps/web/src/contexts/AIRisksContext.tsx` (lines 3-102)
  - 13 files use `useQuery`, `useMutation`, `useQueryClient`

#### Client State
- **React Context API**: Client-side state management
  - Tenant context: `apps/web/src/contexts/TenantContext.tsx` (lines 1-64)
  - AI Risks context: `apps/web/src/contexts/AIRisksContext.tsx` (lines 1-161)
  - Local state with `useState` and `useEffect`

#### Custom Hooks
- **Custom React hooks**: Reusable stateful logic
  - Applications: `apps/web/src/hooks/useApplications.ts` (lines 1-341)
  - Risk management: `apps/web/src/hooks/useRiskManagement.ts` (lines 1-230)
  - Debounce: `apps/web/src/hooks/useDebounce.ts`

#### Data Tables
- **TanStack Table**: Limited usage in compliance policy page
  - Reference: `apps/web/src/app/[tenant]/admin/settings/compliance-policy/page.tsx` (line 17)

### Database Access

```typescript
// Query with RLS (automatic tenant filtering)
// Reference: Used throughout apps/web/src/lib/queries/
const policies = await db.query.policies.findMany({
  where: eq(policies.tenantId, tenantId)
});
```

## Request Flow

### Chat Completion Request

```
1. Client → ControlNet with API key + policy
2. Extract model ID → Model registry lookup
3. Get policy → Compile guards
4. Run input guards → Check violations
5. If passed → Forward to provider
6. Get response → Run output guards
7. Return to client with guard metadata
```

### BYOK Mode

- **X-API-KEY**: ControlNet API key (tenant auth)
- **Authorization**: User's provider key (OpenAI, etc.)
- **X-Policy-ID**: Policy to apply
- **X-Model-ID**: (Optional) Override model

## Guard Packs

### Structure

Each guard pack provides:
- `guards.py` - Guard functions
- `__init__.py` - Exports
- (Optional) `onnx_models.py` - ONNX model wrappers

### Available Packs

- **pii** - PII detection
- **toxicity** - Toxicity detection
- **safety** - ONNX safety models
- **politics** - Political content
- **schema** - JSON validation
- **tools** - Function call validation
- **business** - Business logic
- **privacy** - Privacy checks
- **security** - Security checks

## Deployment Architecture

### Docker Compose

```
nginx (port 80)
  ├── web (Next.js on 8080)
  ├── controlnet (FastAPI on 8000)
  ├── model-guard (FastAPI on 8001)
  └── redis (port 6379)
```

### GCP Production

- **Cloud Run**: Containers
- **Cloud SQL**: PostgreSQL
- **Cloud Memorystore**: Redis
- **Terraform**: Infrastructure as code

## Performance Optimization

### Caching

- **Policy Cache**: Redis with TTL
- **Model Cache**: In-memory for ONNX
- **Embedding Cache**: Query/response pairs

### Guard Execution

- T0 guards: Always run
- T1 guards: Parallel execution
- T2 guards: Optional based on policy

### Streaming

- Window-based output guards
- Zero-copy with `deque`
- T2 guards on completion

## Security

### Authentication

- **Clerk**: User auth (JWT)
- **API Keys**: Tenant auth (hashed)
- **JWT Validation**: PyJWT with public keys

### Multi-Tenancy

- Row-level security (RLS)
- Tenant ID in all queries
- Isolated policy execution

### Data Protection

- API key hashing (bcrypt)
- JWT signing
- Encryption at rest (GCS)

## Observability

### Logging

- Request/response logging
- Guard execution timing
- Violation tracking

### Metrics

- Guard latency (p50, p95)
- Violation rates
- Policy effectiveness

### Storage

All observability data stored in `observability_logs` table with:
- Tenant ID (filtering)
- Policy ID (correlation)
- Request/response payloads
- Guard execution results

