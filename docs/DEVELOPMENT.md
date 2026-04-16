# Development Guide

## Setup

### Prerequisites

- Docker & Docker Compose
- Python 3.11+
- Node.js 18+
- PostgreSQL 15+
- Redis

### Initial Setup

**Environment Template**: `env.example` (lines 1-36)  
**Docker Compose**: `docker-compose.yml` (lines 1-130)  
**Start Script**: `start_local_dev.sh`

1. **Clone and Configure**

```bash
git clone <repo>
cd ai-governance

# Copy environment file
cp env.example .env

# Edit .env with your values
vim .env
```

2. **Start Services**

```bash
# Start all services (one command)
./start_local_dev.sh

# Or step by step
docker-compose up -d
# Reference: docker-compose.yml (all services defined)
```

3. **Verify**

- Web: http://localhost
- API Docs: http://localhost/docs (FastAPI Swagger)
- ControlNet: http://localhost/v1/

## Database Workflow

### Schema Changes

**Source of truth**: `apps/web/drizzle/schema.ts` (lines 1-1612)  
**Migration Generation**: `apps/web/package.json` (lines 6-10)

All schema changes happen in Drizzle, not SQLAlchemy.

1. **Edit Schema**

**Example locations in schema.ts**:
- Guardrails: Lines 34-104
- Policies: Lines 224-271
- Policy-Guardrails: Lines 273-323
- ONNX Models: Lines 690-731
- Router components: Lines 738-839

```typescript
// apps/web/drizzle/schema.ts
export const myTable = pgTable("my_table", {
  id: uuid().primaryKey(),
  name: text(),
  // ... add fields
});
```

2. **Generate Migration**

**Command**: `apps/web/package.json` (line 7)
```bash
cd apps/web
pnpm db:generate  # Generates SQL in apps/web/drizzle/XXXX_migration.sql
```

3. **Apply Migration**

**Command**: `apps/web/package.json` (line 8)
```bash
pnpm db:migrate
```

**Migration Files**: Stored in `apps/web/drizzle/` directory

### Sync to SQLAlchemy

**Script**: `apps/controlnet/scripts/sync_guard_packs_to_db.py`

After schema changes, sync SQLAlchemy models:

```bash
cd apps/controlnet
uv run scripts/sync_guard_packs_to_db.py
```

## Code Structure

### Functional Programming Rules

1. **Small Functions**

```python
# ✅ Good: Small, focused
def extract_email(ctx: Ctx) -> str:
    return ctx.get("email", "")

# ❌ Bad: Large function with mixed concerns
def process_everything(ctx: Ctx):
    # 50 lines of mixed logic
```

2. **Separate Control Flow**

```python
# ✅ Good: Control flow separate
async def handle_request(ctx: Ctx):
    email = extract_email(ctx)
    validated = validate_email(email)
    if not validated:
        return fail()
    return success()

# ❌ Bad: Control flow mixed in
async def handle_request(ctx: Ctx):
    email = ctx.get("email")
    if "@" not in email:  # Validation logic mixed in
        return fail()
    # ... more mixed logic
```

3. **Fail-Fast**

```python
# ✅ Good: Fail immediately
if not condition:
    raise HTTPException(status_code=400, detail="Bad request")

# ❌ Bad: Fallback/placeholder
if not condition:
    condition = "default"  # Silent failure is bad
```

### Guard Pack Structure

**Location**: `apps/controlnet/guard_packs/`

```
guard_packs/
  ├── pii/
  │   ├── __init__.py      # Exports
  │   └── guards.py        # Guard functions (lines 1-195)
  ├── toxicity/
  │   ├── __init__.py
  │   └── guards.py
  ├── safety/
  │   ├── __init__.py
  │   ├── guards.py
  │   └── models/          # ONNX models (detoxify, jailbreak, NER)
  ├── schema/
  │   └── guards.py         # JSON schema validation
  └── tools/
      └── guards.py         # Function call validation
```

Each guard pack:

1. Defines guards in `guards.py`
2. Exports guards in `__init__.py`
3. (Optional) Includes ONNX models

### Adding a Guard Pack

**Example**: `apps/controlnet/guard_packs/pii/guards.py` (lines 1-195)
- **Detect guard**: Lines 132-194
- **Redact guard**: Lines 92-130

```python
# guard_packs/my_pack/__init__.py
from .guards import my_guard

__all__ = ["my_guard"]
```

```python
# guard_packs/my_pack/guards.py
from cga_core import Ctx, Either, Left_, Right_, Violation

@guard("my_pack.detect", tier="T0", performance_budget_ms=2.0)
async def my_guard(ctx: Ctx) -> Either:
    """My custom guard"""
    data = ctx.get("input", "")
    
    if not data:
        return Left_([Violation(
            rule_id="my_guard.error",
            severity="high",
            message="Input is required"
        )])
    
    return Right_(ctx)
```

**Real example**: See `apps/controlnet/guard_packs/pii/guards.py` for actual implementation

## Testing

### ControlNet Tests

**Test Configuration**: `apps/controlnet/pyproject.toml` (lines 184-228)  
**Test Files**: `apps/controlnet/tests/`

```bash
cd apps/controlnet

# Run all tests
pytest  # Runs tests/ directory

# Run specific test
pytest tests/unit/test_guards.py

# With coverage
pytest --cov=gateway --cov=cga_core
# Output: htmlcov/index.html
```

**Example Test Files**:
- `tests/test_composition.py` - Guard composition tests (lines 1-286)
- `tests/test_cga_types.py` - CGA type tests
- `tests/gateway/test_routes.py` - Gateway route tests
- `tests/integration/` - Integration tests

### Web Tests

**Test Configuration**: `apps/web/jest.config.ts`  
**Test Files**: `apps/web/__tests__/`

```bash
cd apps/web

# Run tests
pnpm test  # package.json line 18

# Watch mode
pnpm test:watch  # package.json line 19
```

### Writing Tests

**Reference**: `apps/controlnet/tests/test_composition.py` (lines 1-286)

```python
# tests/unit/test_my_guard.py
import pytest
from cga_core import is_left, get_violations
from guard_packs.my_pack import my_guard

@pytest.mark.asyncio
async def test_my_guard_success():
    ctx = {"input": "valid data"}
    result = await my_guard(ctx)
    
    assert not is_left(result)

@pytest.mark.asyncio
async def test_my_guard_failure():
    ctx = {"input": ""}
    result = await my_guard(ctx)
    
    assert is_left(result)
    violations = get_violations(result)
    assert len(violations) == 1
    assert violations[0]["rule_id"] == "my_guard.error"
```

**Real Example**: `apps/controlnet/tests/test_composition.py` (lines 17-35)

## Debugging

### ControlNet Logs

**Container**: `controlnet-gateway` (docker-compose.yml line 47)

```bash
# View logs
docker logs controlnet-gateway -f

# Or in Docker Compose
docker-compose logs -f controlnet
```

**Configuration**: `apps/controlnet/gateway/logging.py` - Custom logging setup

### Web Logs

**Container**: `controlnet-web` (docker-compose.yml line 106)

```bash
docker logs controlnet-web -f
```

### Database Access

**Database**: PostgreSQL container or Cloud SQL  
**Drizzle Studio**: `apps/web/package.json` (line 6)

```bash
# Connect to database
docker exec -it controlnet-postgres psql -U postgres -d app

# Or use Drizzle Studio (local development)
cd apps/web
pnpm db:studio  # Opens browser at http://localhost:4983
```

### Python Debugger

```python
import pdb; pdb.set_trace()

# Or ipdb (if installed)
import ipdb; ipdb.set_trace()
```

## Common Tasks

### Adding a New Guard

**Example**: `apps/controlnet/guard_packs/pii/guards.py` (lines 132-194)

1. Create guard function in appropriate pack
   - **Location**: `apps/controlnet/guard_packs/<pack_name>/guards.py`
   - **Pattern**: Use `@guard()` decorator with metadata
2. Export in `__init__.py`
   - **File**: `apps/controlnet/guard_packs/<pack_name>/__init__.py`
3. Add to guard registry in `gateway/guards.py`
4. Write tests in `tests/unit/test_<pack>.py`
5. Update policy YAML if needed in `apps/controlnet/policies/`

### Adding a New Endpoint

**Example**: `apps/controlnet/gateway/routes/chat.py` (lines 1-926)

```python
# gateway/routes/my_route.py
from fastapi import APIRouter, Depends, Request
from gateway.auth import require_tenant_auth, TenantContext

router = APIRouter()

@router.post("/my-endpoint")
async def my_endpoint(
    request: Request,
    context: TenantContext = Depends(require_tenant_auth)
):
    # Implementation
    pass
```

Then register in `gateway/main.py` (lines 144-152):

```python
from .routes import my_route
app.include_router(my_route.router, prefix="/v1")
```

**Existing routes**:
- `chat.py` - Chat completions (lines 123-926)
- `policies.py` - Policy management
- `guardrails.py` - Guardrail management
- `router_config.py` - Router configuration

### Database Query

**Database setup**: `apps/controlnet/gateway/db.py`  
**Get DB function**: `apps/controlnet/gateway/db.py` (lines 1-50)

```python
from gateway.db import get_db
from sqlalchemy import select

async for db in get_db():
    result = await db.execute(
        select(Policy).where(Policy.tenant_id == tenant_id)
    )
    policies = result.scalars().all()
    break
```

**Example usage**: `apps/controlnet/gateway/routes/chat.py` (lines 155-162)

## Hot Reload

**Docker Compose**: Uses `--reload` flag for FastAPI  
**Uvicorn config**: `apps/controlnet/gateway/main.py` (line 164)

Development mode supports hot reload:

```python
# Edit any file
vim gateway/routes/chat.py

# Save → Auto-reloads!
```

Check logs to confirm reload. Look for "file reloaded" messages.

**Hot Reload Configuration**: `apps/controlnet/gateway/main.py` (line 164)
```python
uvicorn.run(
    "gateway.main:app",
    reload=os.getenv("ENVIRONMENT") == "development",
    # ...
)
```

## Performance

### Profiling

```python
import cProfile
import pstats

profiler = cProfile.Profile()
profiler.enable()

# Your code
await guard(ctx)

profiler.disable()
stats = pstats.Stats(profiler)
stats.sort_stats('cumulative')
stats.print_stats()
```

### Optimizing Guards

1. Use T0 guards (regex) when possible
2. Parallelize independent guards
3. Cache ONNX models in memory
4. Use streaming for large outputs

## Troubleshooting

### Import Errors

```python
# If imports fail, check Python path
import sys
print(sys.path)

# Add path if needed
sys.path.insert(0, '/path/to/module')
```

### Database Connection Issues

```bash
# Check database is running
docker-compose ps

# Check connection
psql $DATABASE_URL
```

### Redis Connection Issues

```bash
# Check Redis
redis-cli -h localhost ping

# Check logs
docker logs controlnet-redis
```

## Code Style

### Python

**Configuration**: `apps/controlnet/pyproject.toml`

- **Black**: Code formatting (lines 124-140)
- **Ruff**: Linting (lines 142-182)
- **MyPy**: Type checking (lines 163-182)
- **Pytest**: Testing (lines 184-228)

```bash
# Format code
black .

# Lint code
ruff check .

# Type check
mypy .
```

**Pre-commit hooks**: Configure in `.pre-commit-config.yaml` (if exists)

### TypeScript

**Configuration**: `apps/web/package.json` (lines 16-17)  
**ESLint**: `apps/web/.eslintrc.json`  
**Prettier**: `apps/web/.prettierrc`

```bash
cd apps/web
pnpm lint      # ESLint
pnpm format    # Prettier (via ESLint)
```

**Next.js config**: `apps/web/next.config.js` (lines 1-77)

## Git Workflow

**Branching**: Use feature branches  
**Commits**: Follow conventional commits

1. Create feature branch
2. Make changes
3. Write tests
4. Run tests
5. Commit changes
6. Push and create PR

```bash
# Create branch
git checkout -b feature/my-feature

# Make changes
# ... edit files ...

# Commit
git add .
git commit -m "Add my feature"

# Push
git push origin feature/my-feature
```

**Git ignores**: See `.gitignore` for excluded files  
**Remote dev workflow**: See `REMOTE_DEV_WORKFLOW.md` (in docs-backup)

