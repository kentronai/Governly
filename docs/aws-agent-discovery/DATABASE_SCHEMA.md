# Database Schema — AI Agent Discovery

All tables defined in `apps/web/drizzle/schema.ts`, relations in `apps/web/drizzle/relations.ts`,
migration `apps/web/drizzle/0012_dark_sleepwalker.sql`. Every table is tenant-scoped (`tenant_id`
FK to `tenants`, cascade delete) following this codebase's existing convention.

## `aws_discovery_connections`

One row per configured AWS connection (Admin → Integrations → AWS AI Agent Discovery).

| Column | Type | Notes |
|---|---|---|
| `auth_method` | enum `aws_auth_method` | `iam_role` \| `access_key` \| `cross_account` |
| `region`, `role_arn`, `external_id`, `cross_account_role_arn` | text | connection config; `external_id` is encrypted |
| `encrypted_access_key_id`, `encrypted_secret_access_key` | text | AES-256-GCM ciphertext, never plaintext (see `lib/server/crypto.ts`) |
| `last_validated_at`, `last_validation_error` | timestamp / text | set by "Test Connection" |

## `discovery_scans`

One row per scan run, FK → `aws_discovery_connections`.

| Column | Notes |
|---|---|
| `status` | enum `discovery_scan_status`: `queued` \| `running` \| `completed` \| `failed` |
| `started_at`, `finished_at` | duration = the difference |
| `next_scan_at` | reserved for future scheduled/continuous sync — unused in this phase |
| `agents_discovered` | count of logical agents from this scan |
| `resources_scanned` | jsonb, per-AWS-service raw resource counts |
| `triggered_by` | nullable FK → `users`; null means system-triggered (future scheduler) |

## `agent_rules`

The configurable rule store behind the Autonomy and Risk engines (see AUTONOMY_ENGINE.md /
RISK_ENGINE.md). `tenant_id` is **nullable** — null rows are global defaults; a non-null row with
the same `rule_key` is a tenant-specific override, enforced by `uq_agent_rules_tenant_key` unique
on `(tenant_id, rule_key)`.

| Column | Notes |
|---|---|
| `engine_type` | enum `rule_engine_type`: `capability` \| `autonomy` \| `risk` |
| `condition` | jsonb — `{field, operator, value}` or `{all:[...]}`/`{any:[...]}`, see `rule-engine.ts` |
| `weight` | numeric — risk points, or unused (0) for autonomy rules |
| `result_value` | text — for autonomy rules, the level (`L1`-`L4`) this rule votes for |
| `priority` | evaluation order |

## `agents`

The core entity. **Deliberately distinct from `applications`** — `application_id` is a nullable
FK, never required, and this table is never populated from `applications` data.

| Column | Notes |
|---|---|
| `external_agent_id` | the AWS resource ID (e.g. Bedrock agent ID) |
| `connection_id` | FK → `aws_discovery_connections` |
| `application_id` | nullable FK → `applications` — optional link only |
| `platform` | enum `agent_platform`: `aws_bedrock` \| `aws_lambda` \| `aws_step_functions` \| `amazon_q` \| `other` |
| `owner_user_id`, `owner_source`, `owner_confidence` | from the Ownership Engine |
| `capabilities` | jsonb snapshot of the Capability Engine's fact object |
| `autonomy_level`, `autonomy_reason`, `autonomy_evidence`, `autonomy_confidence` | from the Autonomy Engine |
| `risk_score`, `risk_level`, `risk_factors` | from the Risk Engine — `risk_factors` is the full per-rule point breakdown |
| `discovery_source` | which `agent_resource_type` anchored this agent (usually `bedrock_agent`) |
| `first_seen_at`, `last_seen_at` | set on first insert / every re-scan |
| `sync_status` | reuses the existing `sync_status` enum (`success`/`failed`/`pending`) |

Unique constraint `uq_agents_connection_external_id` on `(connection_id, external_agent_id)` makes
scans idempotent — a re-scan updates, never duplicates.

## `agent_resources`

Every raw AWS resource correlated into an agent (the "one logical agent contains a Bedrock Agent +
IAM role + Lambda + ..." relationship from the spec). FK → `agents`, cascade delete. `resource_type`
is the `agent_resource_type` enum (12 values, one per discoverable AWS resource kind). `raw_data`
jsonb holds the discovery-time metadata for that specific resource (e.g. an IAM role's
`hasAdminPolicy`/`hasWrite`/`hasDelete` facts).

## `agent_recommendations`

FK → `agents`, cascade delete. `severity` reuses the `risk_level` enum. `status`
(`agent_recommendation_status`: `open` \| `resolved` \| `dismissed`) lets a user triage a
recommendation; only `open` rows are replaced on re-scan (see RECOMMENDATION_ENGINE.md).

## Relationships at a glance

```
tenants 1---* aws_discovery_connections 1---* discovery_scans
                                          1---* agents *---1 applications (nullable)
                                                agents *---1 users (owner, nullable)
                                                agents 1---* agent_resources
                                                agents 1---* agent_recommendations
tenants 1---* agent_rules  (tenant_id nullable = global default)
```
