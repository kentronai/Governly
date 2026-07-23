# Autonomy Engine

`apps/web/src/lib/server/agents/autonomy-engine.ts` (evaluation logic lives in the shared
`rule-engine.ts` — the autonomy engine itself only interprets the result).

## Why autonomy exists

Two agents with identical risk exposure can require completely different governance: one that
only reads and summarizes data is a very different problem from one that deletes production
records with no human in the loop. Autonomy answers "how much can this agent do on its own,"
independently of "how risky is what it can do" (that's the Risk Engine).

## The four levels

| Level | Meaning | AWS-observable signal |
|---|---|---|
| **L1 — Observe** | Read-only, produces no output that reaches a user or system | No conversational agent, no execution-capable resource |
| **L2 — Advise** | Produces drafts/suggestions/responses (a Bedrock Agent's normal job), but cannot execute an action | Is a Bedrock Agent, but has no Lambda/Step Function/invoke-capable IAM permission |
| **L3 — Act with Approval** | Can execute actions (invoke a Lambda/Step Function), and a human approval gate was found | `hasExecuteCapableResource = true` and `hasApprovalWorkflow = true` |
| **L4 — Act Autonomously** | Can execute actions with nothing gating them | `hasExecuteCapableResource = true` and `hasApprovalWorkflow = false` |

## Which AWS metadata is used

All four levels are computed from the Capability Engine's facts (see CAPABILITY_ENGINE.md), which
in turn come from real discovery: Bedrock `ListAgents`/action groups, Lambda/Step Function
presence from correlation, and IAM policy documents for invoke permissions. **Nothing here is a
hardcoded agent name or a guess** — an agent is L4 only because its actual IAM role has an invoke
action and no `approval-required` tag was found on any of its resources.

## Which capabilities are inspected

`isConversationalAgent`, `hasExecuteCapableResource`, `hasApprovalWorkflow` — see
CAPABILITY_ENGINE.md for exactly how each is derived.

## How the final level is calculated

Every enabled `agent_rules` row with `engine_type = 'autonomy'` is evaluated against the facts
object. A rule's `condition` is a small JSON DSL (`{field, operator, value}`, or `{all: [...]}` /
`{any: [...]}` for compound logic). Every rule whose condition matches becomes **evidence**; the
rule engine picks the **highest** level (`L4 > L3 > L2 > L1`) among all matched rules as the final
classification, and reports **confidence** as `0.5 + (agreeing rules / matched rules) * 0.45`
(capped at 0.95 — never claims certainty). If no rule matches, the level defaults to `L1` with
confidence `0.5`.

The seeded default rules (`apps/web/scripts/seed-agent-rules.ts`) are a clean partition on
`(isConversationalAgent, hasExecuteCapableResource, hasApprovalWorkflow)`, so exactly one rule
matches per agent today:

| `rule_key` | Condition | Result |
|---|---|---|
| `observe_only_default` | not conversational AND cannot execute | `L1` |
| `can_recommend_no_execution` | conversational AND cannot execute | `L2` |
| `can_execute_with_approval` | can execute AND has approval workflow | `L3` |
| `can_execute_no_approval` | can execute AND no approval workflow | `L4` |

## How to add a new rule

Insert a row into `agent_rules` (globally with `tenant_id = null`, or scoped to one tenant via
`lib/actions/agent-rules.ts` → `updateAgentRule`, which creates a tenant-specific override rather
than mutating the shared default). No code change, no deploy. Example — treat an agent with
cross-account execute permissions as always L4 regardless of an approval tag:

```json
{
  "engineType": "autonomy",
  "ruleKey": "cross_account_execute_is_l4",
  "description": "Cross-account execute capability overrides any approval tag.",
  "condition": { "field": "hasCrossAccountPermissions", "operator": "eq", "value": true },
  "resultValue": "L4",
  "priority": 5
}
```

Since the engine takes the **max** matched level, adding this rule only ever escalates the result
— it can't silently downgrade an agent that another rule already classified higher.
