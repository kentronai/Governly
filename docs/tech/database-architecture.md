# Database Architecture Guide

**Comprehensive guide to database design, relations, logging patterns, and development practices**

## Table of Contents

- [Philosophy](#philosophy)
- [Schema Organization](#schema-organization)
- [Key Tables Explained](#key-tables-explained)
- [Relations and Patterns](#relations-and-patterns)
- [What to Log Where](#what-to-log-where)
- [Adding New Features](#adding-new-features)
- [Query Patterns](#query-patterns)
- [Development Workflow](#development-workflow)

---

## Philosophy

### Design Principles

**1. Tenant-First Isolation**
- Every business entity has `tenantId: text` for complete data isolation
- Multi-tenancy enforced at database level via foreign keys
- See: ```34:36:apps/web/drizzle/schema.ts``` for applications example

**2. Audit Trail Everything**
- `createdBy`, `updatedBy`, `createdAt`, `updatedAt` on all entities
- Soft deletes via `deletedAt` for compliance
- User actions tracked via `auditEvents` table

**3. Metadata-First**
- `metadata: jsonb` for flexible schema evolution
- Type-safe via TypeScript, flexible via PostgreSQL JSONB
- Avoid adding columns when JSON can suffice

**4. Category Theory Patterns**
- **Objects**: Tables with clear purpose
- **Morphisms**: Junction tables connecting entities
- **Pullbacks**: Tenant-based filtering consistently applied

**5. Fail-Fast Validation**
- Database constraints enforced (not application logic)
- Unique constraints prevent data duplication
- Foreign keys enforce referential integrity

---

## Schema Organization

### Core Tables (Bottom of Hierarchy)

```typescript
// Foundation entities
tenants        // Multi-tenancy root
users          // User accounts (Clerk managed)
categories     // Hierarchical taxonomies
```

**Reference**: ```487:515:apps/web/drizzle/schema.ts```

### Business Objects

```typescript
applications        // AI applications under management
useCases            // Functional capabilities
risks               // Risk assessments per use case
guardrails          // Security/quality guardrails
policies            // Policy configurations
```

**Reference**: ```1289:1324:apps/web/drizzle/schema.ts```

### Junction Tables (Morphisms)

```typescript
applicationPolicies      // App ↔ Policy
applicationGuardrails    // App ↔ Guardrail
policyGuardrails        // Policy ↔ Guardrail
guardrailCategories     // Guardrail ↔ Category
```

**Reference**: ```1513:1595:apps/web/drizzle/schema.ts```

### Observatory Tables

```typescript
observabilityLogs    // Runtime request logs from ControlNet Gateway
auditEvents          // User action audit trail
modelScans           // Model security scans
```

**Reference**: ```325:368:apps/web/drizzle/schema.ts```

---

## Key Tables Explained

### `applications` - Core Business Entity

**Purpose**: Every AI application managed through the platform

**Key Fields**:
```typescript
tenantId: text           // Tenant isolation
name: text               // Display name
slug: text               // URL-friendly identifier
status: applicationStatus  // Not Started | In Progress | Completed | Archived
goviqEnabled: boolean    // Governance module enabled
controlnetEnabled: boolean // Guardrail module enabled
metadata: jsonb         // Flexible extensibility
deletedAt: timestamp     // Soft delete
```

**When to Use**:
- Creating new applications
- Tracking lifecycle state
- Enabling/disabling modules

**Example Query**: ```31:112:apps/web/src/lib/queries/applications.ts```

### `guardrails` - Security Controls

**Purpose**: Reusable guardrails that can be attached to policies

**Key Fields**:
```typescript
key: text                    // Unique identifier (e.g., "pii.detect")
version: text                 // Version string (default "v1")
category: text               // Functional category
description: text            // Human-readable description
tier: guardTier              // T0 | T1 | T2 (performance tier)
family: text                 // Route family for embedding-based routing
performanceBudgetMs: numeric  // Max execution time
requiresOnnx: boolean        // Requires ONNX model?
defaultParams: jsonb         // Default configuration
metadata: jsonb              // Additional metadata
```

**Reference**: ```34:104:apps/web/drizzle/schema.ts```

**Philosophy**:
- Guardrails are **pure functions** (see `apps/controlnet/cga_core/types.py`)
- Composable via category theory operations
- Immutable once certified (`isCertified`)

### `policies` - Policy Configurations

**Purpose**: Collections of guardrails with composition strategy

**Key Fields**:
```typescript
tenantId: text
name: text
version: text
yaml: text                   // Policy YAML definition
compiled: jsonb              // Pre-compiled for performance
hash: text                   // Content hash for change detection
status: policyStatus         // draft | active | deprecated | archived
compositionStrategy: jsonb  // How guards compose
flowRules: jsonb            // Guard flow configuration
```

**Reference**: ```224:271:apps/web/drizzle/schema.ts```

**Philosophy**:
- Policies are **compiled once** and cached
- Hash-based change detection prevents redundant compilation
- Status transitions: draft → active → deprecated

### `observabilityLogs` - Runtime Tracking

**Purpose**: Log every request through ControlNet Gateway with guardrail results

**Key Fields**:
```typescript
tenantId: text
applicationId: uuid         // Which application made request
endpointId: uuid            // Which endpoint was hit
policyId: uuid              // Which policy was applied
requestId: text             // Unique request identifier
timestamp: timestamp
method: text                 // HTTP method
path: text                   // Request path
statusCode: integer
latencyMs: integer
requestPayload: jsonb       // Sanitized request body
responsePayload: jsonb     // Sanitized response
guardrailResults: jsonb    // Guard execution results
metadata: jsonb             // Additional context
```

**Reference**: ```325:368:apps/web/drizzle/schema.ts```

**Philosophy**:
- **Where**: ControlNet Gateway logs here
- **Why**: Audit trail, performance monitoring, guardrail debugging
- **What**: Sanitized payloads (max 50KB), guardrail decisions, latency metrics

### `risks` - Risk Assessments

**Purpose**: Risk tracking per use case with mitigation plans

**Key Fields**:
```typescript
tenantId: text
applicationId: uuid
useCaseId: uuid              // One risk per use case (optional)
riskName: text
severity: riskSeverity       // Minor | Moderate | Major | Catastrophic
likelihood: riskLikelihood  // Rare | Unlikely | Possible | Likely
riskLevel: riskLevel        // Calculated: Low | Medium | High | Critical
mitigationPlan: text
mitigationStatus: riskMitigationStatus
targetDate: timestamp
categories: text[]           // Risk categories
```

**Reference**: ```1417:1470:apps/web/drizzle/schema.ts```

**Philosophy**:
- **1:1 with use cases** (enforced by unique constraint)
- Risk level = severity × likelihood
- Mitigating guardrails tracked in `mitigatingGuardrails` array

---

## Relations and Patterns

### One-to-Many (Parent → Children)

```typescript
application → useCases
application → risks
application → stakeholders
application → endpoints
application → applicationModels
```

**Definition**: ```31:62:apps/web/drizzle/relations.ts```

**Usage**:
```typescript
// Query with relations
const app = await db.query.applications.findFirst({
  where: eq(applications.id, appId),
  with: {
    useCases: true,
    risks: { orderBy: [desc(risks.riskLevel)] },
    stakeholders: true,
  }
});
```

**Reference**: ```32:105:apps/web/src/lib/queries/applications.ts```

### Many-to-Many (Junction Tables)

**Pattern**: Two entities connected via junction table

```typescript
applications ↔ applicationPolicies ↔ policies
applications ↔ applicationGuardrails ↔ guardrails
policies ↔ policyGuardrails ↔ guardrails
```

**Definition**: ```229:249:apps/web/drizzle/relations.ts```

**Query Pattern**:
```typescript
// Get policies for an application
const policies = await db.query.applicationPolicies.findMany({
  where: eq(applicationPolicies.applicationId, appId),
  with: {
    policy: {
      with: {
        policyGuardrails: {
          with: { guardrail: true }
        }
      }
    }
  }
});
```

### Self-Referential (Hierarchical)

**Pattern**: Parent references same table

```typescript
guardrails ← guardrails.fallbackGuardrailId
categories ← categories.parentId
```

**Definition**: ```19:23:apps/web/drizzle/relations.ts```

**Use Case**: Guardrail fallback chain when primary guard fails

---

## What to Log Where

### Audit Trail (`auditEvents`)

**When**: User-initiated actions (Create, Update, Delete)

**What**:
```typescript
{
  action: "create" | "update" | "delete",
  targetType: "application" | "guardrail" | "policy",
  targetId: uuid,
  actorUserId: string,
  metadata: { /* action details */ }
}
```

**Where**: Server actions automatically via middleware

**Reference**: ```841:868:apps/web/drizzle/schema.ts```

**Example**: When user creates application → audit event logged

### Observability Logs (`observabilityLogs`)

**When**: Every API request through ControlNet Gateway

**What**: See table definition above

**Where**: ```213:268:apps/controlnet/gateway/services/observability_service.py```

**Logging Point**: After guardrail execution completes

**Reference**: ```722:748:apps/controlnet/gateway/routes/chat.py```

**Data Collected**:
```typescript
{
  requestId: "unique-request-id",
  method: "POST",
  path: "/v1/chat/completions",
  statusCode: 200,
  latencyMs: 150,
  requestPayload: { /* sanitized */ },
  responsePayload: { /* sanitized */ },
  guardrailResults: {
    input_guards: [ /* executed guards */ ],
    output_guards: [ /* executed guards */ ],
    policy_decision: "allow" | "block",
    total_execution_time_ms: 120
  }
}
```

### Model Scans (`modelScans`)

**When**: User uploads model artifact for security scanning

**What**:
```typescript
{
  artifactId: uuid,
  status: "queued" | "scanning" | "completed" | "failed",
  sbom: { /* Software Bill of Materials */ },
  reportJson: { /* Scan results */ },
  reportSarif: { /* SARIF format results */ }
}
```

**Reference**: ```180:222:apps/web/drizzle/schema.ts```

**Usage**: Track which models have been scanned, results stored in `scanFindings`

---

## Adding New Features

### Step 1: Add Table to Schema

**File**: `apps/web/drizzle/schema.ts`

**Pattern**:
```typescript
export const myNewTable = pgTable("my_new_table", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  tenantId: text("tenant_id").notNull(), // Always include!
  // ... other fields
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
  metadata: jsonb().default({}).notNull(),
}, (table) => [
  // Indexes for performance
  index("idx_my_new_table_tenant").using("btree", table.tenantId.asc().nullsLast().op("text_ops")),
  
  // Foreign keys for relations
  foreignKey({
    columns: [table.tenantId],
    foreignColumns: [tenants.id],
    name: "my_new_table_tenant_id_fkey"
  }).onDelete("cascade"),
  
  // Unique constraints where needed
  unique("uq_my_new_table").on(table.tenantId, table.someField),
]);
```

### Step 2: Add Relations

**File**: `apps/web/drizzle/relations.ts`

**Pattern**:
```typescript
export const myNewTableRelations = relations(myNewTable, ({one, many}) => ({
  tenant: one(tenants, {
    fields: [myNewTable.tenantId],
    references: [tenants.id]
  }),
  createdByUser: one(users, {
    fields: [myNewTable.createdBy],
    references: [users.id],
    relationName: "myNewTable_createdBy_users_id"
  }),
  // ... other relations
}));
```

**Reference**: See ```4:31:apps/web/drizzle/relations.ts``` for guardrails example

### Step 3: Create Query Functions

**File**: `apps/web/src/lib/queries/my-new-table.ts`

**Pattern**:
```typescript
import { db, myNewTable } from '@db';
import { eq, and, desc } from 'drizzle-orm';
import { cache } from 'react';

// Get all for tenant
export const getMyNewTables = cache(async (tenantId: string) => {
  return await db.query.myNewTable.findMany({
    where: eq(myNewTable.tenantId, tenantId),
    with: {
      tenant: true,
      createdByUser: {
        columns: { id: true, name: true, email: true }
      },
    },
    orderBy: [desc(myNewTable.createdAt)],
  });
});

// Get single with details
export const getMyNewTableWithDetails = cache(async (id: string) => {
  return await db.query.myNewTable.findFirst({
    where: eq(myNewTable.id, id),
    with: {
      // Load relations as needed
    },
  });
});
```

**Reference**: ```11:91:apps/web/src/lib/queries/risks.ts```

### Step 4: Create Server Actions

**File**: `apps/web/src/lib/actions/my-new-table.ts`

**Pattern**:
```typescript
'use server';

import { db, myNewTable } from '@db';
import { eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

export const createMyNewTable = async (input: CreateInput) => {
  const { userId } = await auth();
  
  if (!userId) {
    throw new Error('Authentication required');
  }

  const [record] = await db
    .insert(myNewTable)
    .values({
      ...input,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  revalidatePath('/my-route');
  
  return record;
};

export const updateMyNewTable = async (id: string, input: Partial<CreateInput>) => {
  const { userId } = await auth();
  
  if (!userId) {
    throw new Error('Authentication required');
  }

  const [record] = await db
    .update(myNewTable)
    .set({
      ...input,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(myNewTable.id, id))
    .returning();

  revalidatePath('/my-route');
  
  return record;
};
```

**Reference**: ```23:81:apps/web/src/lib/actions/stakeholders.ts```

### Step 5: Generate Migration

```bash
cd apps/web
npx drizzle-kit generate
```

This creates SQL migration in `apps/web/drizzle/migrations/`

### Step 6: Apply Migration

**Local**:
```bash
npx drizzle-kit push
```

**Production**: Migrations auto-applied via CI/CD

---

## Query Patterns

### Pattern 1: Simple Select with Relations

**Get applications with details**:
```typescript
const apps = await db.query.applications.findMany({
  where: eq(applications.tenantId, tenantId),
  with: {
    useCases: true,
    risks: { orderBy: [desc(risks.riskLevel)] },
    stakeholders: true,
  },
  orderBy: [desc(applications.createdAt)],
});
```

**Reference**: ```11:28:apps/web/src/lib/queries/applications.ts```

### Pattern 2: Aggregation Queries

**Get statistics**:
```typescript
const stats = await db
  .select({
    total_risks: sql<number>`count(distinct ${risks.id})`,
    critical_risks: sql<number>`count(distinct case when ${risks.riskLevel} = 'Critical' then ${risks.id} end)`,
  })
  .from(risks)
  .where(eq(risks.applicationId, applicationId))
  .groupBy(risks.applicationId);
```

**Reference**: ```94:120:apps/web/src/lib/queries/risks.ts```

### Pattern 3: Complex Joins

**Get applications with aggregated stats**:
```typescript
const appsWithStats = await db
  .select({
    id: applications.id,
    name: applications.name,
    use_cases: sql<number>`count(distinct ${useCases.id})`.as('use_cases'),
    risks: sql<number>`count(distinct ${risks.id})`.as('risks'),
  })
  .from(applications)
  .leftJoin(useCases, eq(useCases.applicationId, applications.id))
  .leftJoin(risks, eq(risks.applicationId, applications.id))
  .where(eq(applications.tenantId, tenantId))
  .groupBy(applications.id)
  .orderBy(desc(applications.createdAt));
```

**Reference**: ```149:194:apps/web/src/lib/queries/applications.ts```

### Pattern 4: Conditional Queries

**Filter with multiple conditions**:
```typescript
const apps = await db.query.applications.findMany({
  where: and(
    eq(applications.tenantId, tenantId),
    isNull(applications.deletedAt),
    sql`${applications.status} != 'Archived'`
  ),
});
```

**Reference**: ```13:16:apps/web/src/lib/queries/applications.ts```

### Pattern 5: Transaction Pattern

**Atomic operations**:
```typescript
const result = await db.transaction(async (tx) => {
  const [app] = await tx
    .insert(applications)
    .values({ ...input })
    .returning();

  const [stakeholder] = await tx
    .insert(stakeholders)
    .values({ 
      applicationId: app.id,
      ...stakeholderInput 
    })
    .returning();

  return { app, stakeholder };
});
```

**Reference**: ```57:96:apps/web/src/lib/actions/applications.ts```

---

## Development Workflow

### Local Development Setup

**1. Prerequisites**:
```bash
# Install dependencies
cd apps/web && npm install

# Start Docker services (includes PostgreSQL)
docker-compose -f docker-compose.dev.yml up -d
```

**2. Create Database**:
```bash
# Via Drizzle Studio
npx drizzle-kit studio
```

**3. Generate Migrations**:
```bash
# After schema changes
npx drizzle-kit generate

# Preview SQL
npx drizzle-kit push --dry-run
```

**4. Apply Migrations**:
```bash
# Apply to local database
npx drizzle-kit push
```

### Testing Database Changes

**1. Test Queries Locally**:
```typescript
// In apps/web/src/lib/queries/test.ts
import { db, applications } from '@db';
import { eq } from 'drizzle-orm';

const test = async () => {
  const apps = await db.query.applications.findMany({
    where: eq(applications.tenantId, 'test-tenant'),
  });
  console.log(apps);
};
```

**2. Test Relations**:
```typescript
const app = await db.query.applications.findFirst({
  where: eq(applications.id, 'app-id'),
  with: {
    useCases: true,
    risks: true,
  },
});
```

### Production Deployment

**1. Migration Automatically Applied**:
```yaml
# infra/cloudbuild.yaml
- name: 'gcr.io/cloud-builders/node'
  args: ['bash', '-c', 'cd apps/web && npx drizzle-kit push']
```

**2. Zero-Downtime Deployments**:
- Migrations run before new code deployed
- Backward compatibility enforced
- No destructive operations in production

---

## Best Practices

### 1. Always Include Tenant Isolation

```typescript
// ✅ Good
const records = await db.query.myTable.findMany({
  where: eq(myTable.tenantId, tenantId),
});

// ❌ Bad - data leak risk
const records = await db.query.myTable.findMany();
```

### 2. Use `cache()` for Queries

```typescript
// ✅ Good - React Server Components caching
export const getApplications = cache(async (tenantId: string) => {
  return await db.query.applications.findMany({
    where: eq(applications.tenantId, tenantId),
  });
});

// ❌ Bad - no caching
export const getApplications = async (tenantId: string) => {
  return await db.query.applications.findMany({
    where: eq(applications.tenantId, tenantId),
  });
};
```

**Reference**: ```11:29:apps/web/src/lib/queries/applications.ts```

### 3. Soft Deletes with Filtering

```typescript
// ✅ Good
const records = await db.query.applications.findMany({
  where: and(
    eq(applications.tenantId, tenantId),
    isNull(applications.deletedAt)
  ),
});
```

### 4. Sanitize Payloads Before Logging

```python
# In observability service
def sanitize_payload(payload: Dict[str, Any], max_size: int = 50000) -> Dict[str, Any]:
    """Sanitize and truncate payload to prevent huge logs"""
    # Implementation at apps/controlnet/gateway/services/observability_service.py:292
```

**Reference**: ```292:293:apps/controlnet/gateway/services/observability_service.py```

### 5. Use Transactions for Atomicity

```typescript
// ✅ Good - all or nothing
const result = await db.transaction(async (tx) => {
  const [app] = await tx.insert(applications).values({...}).returning();
  const [stakeholder] = await tx.insert(stakeholders).values({...}).returning();
  return { app, stakeholder };
});
```

---

## Summary

**Database Philosophy**:
- Tenant-first isolation everywhere
- Audit trail for compliance
- Metadata-first for flexibility
- Soft deletes for safety
- Relations via junction tables

**Development Process**:
1. Add table to `schema.ts`
2. Add relations to `relations.ts`
3. Create queries in `src/lib/queries/`
4. Create actions in `src/lib/actions/`
5. Generate and apply migration
6. Test locally
7. Deploy via CI/CD

**Logging Strategy**:
- `auditEvents`: User actions
- `observabilityLogs`: API request/response tracking
- `modelScans`: Security scanning results

**Query Patterns**:
- Use `cache()` for React Server Components
- Always include `tenantId` filtering
- Use `.with{}` for eager loading relations
- Use transactions for atomic operations

