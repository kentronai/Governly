# Capability Engine

`apps/web/src/lib/server/agents/capability-engine.ts`

## Purpose

Every other engine (Autonomy, Risk) reasons about an agent purely in terms of a normalized **facts
object** — it never touches raw AWS API responses directly. The Capability Engine is the one place
that turns a correlated agent's real discovered resources into that facts object.

This separation is why "Autonomy" and "Risk" can be reconfigured (via `agent_rules`) without
touching AWS-specific code, and why AWS-specific code can change without touching scoring logic.

## Inputs

A `CorrelatedAgent` (name, platform, region, and its list of `agent_resources` from correlation)
plus the `ownerUserId` already resolved by the Ownership Engine.

## Facts produced

| Fact | Derived from |
|---|---|
| `hasOwner` | whether an owner was matched (Ownership Engine) |
| `hasAdminRole` | any attached IAM role has `metadata.hasAdminPolicy` (AdministratorAccess policy or a `"*"` action) |
| `hasWritePermissions` | any role has an action matching `/:(put\|create\|update)/` |
| `hasDeletePermissions` | any role has an action matching `/:delete/` |
| `hasInvokePermissions` | any role has an action matching `/:invoke/` |
| `hasCrossAccountPermissions` | any role's trust policy allows a principal in another AWS account |
| `hasGuardrails` | agent's resource group contains a `guardrail` resource |
| `hasApprovalWorkflow` | a resource tag `norix:approval-required` or `approval-required` = `"true"` — AWS has no native "approval workflow" concept, so this is explicitly tag-driven, never inferred |
| `isDormant` | no resource activity (`lastUsedDate`/`lastUpdatedAt`) within 60 days |
| `hasPublicEndpoint` | agent's resource group contains an `api_gateway_api` resource (only present if it routes to this agent's Lambda — see AWS_DISCOVERY.md) |
| `hasSensitiveDataAccess` | agent's resource group contains a `secrets_manager_secret` resource |
| `credentialAgeDays` | max of: secret's last-accessed/changed date age, IAM role creation date age |
| `hasUnusedPermissions` | a role has >15 granted actions but no `lastUsedDate` within 90 days |
| `hasExternalApiAccess` | a linked Lambda has an environment variable **key** matching `/API_KEY\|API_URL\|ENDPOINT\|WEBHOOK\|TOKEN/i` (values are never read) |
| `hasExecuteCapableResource` | `hasInvokePermissions` OR the agent has a Lambda or Step Function resource |
| `isConversationalAgent` | the agent's resource group contains a `bedrock_agent` resource |
| `resourceCount` | total resources correlated to this agent |

## Adding a new fact

1. Add the field to `CapabilityFacts` in `capability-engine.ts`.
2. Compute it from `agent.resources` (never from a live AWS call — discovery already ran).
3. Reference it by name in a rule's `condition.field` in `agent_rules` (see AUTONOMY_ENGINE.md /
   RISK_ENGINE.md) — no other code changes needed to start using it in scoring.
