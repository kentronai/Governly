# Risk Engine

`apps/web/src/lib/server/agents/risk-engine.ts` (evaluation logic lives in the shared
`rule-engine.ts`).

## Purpose

Turns an agent's capability facts into a 0-100 risk score with a Low/Medium/High/Critical bucket,
where **every point is traceable to a named rule** — no random numbers, no unexplained score.

## Formula

```
score = sum(weight of every agent_rules row with engine_type='risk' whose condition matches)
score = max(0, min(100, round(score)))

level = Critical  if score >= 75
        High      if score >= 50
        Medium    if score >= 25
        Low       otherwise
```

Each matched rule is stored as a `RiskFactor { ruleKey, description, points }` in
`agents.riskFactors` (jsonb) — this is exactly what renders in the Agent Inventory detail drawer
under "Risk", satisfying "store explanations for every score."

## Every default rule, its weight, and why

| `rule_key` | Points | Severity | Why it exists |
|---|---|---|---|
| `missing_owner` | 20 | High | An unowned agent has no accountable human — the single most common real-world governance gap |
| `admin_iam_role` | 20 | Critical | Administrator-equivalent IAM permissions mean a compromised or misbehaving agent can do anything in the account |
| `write_permissions` | 8 | Medium | Can create/modify state |
| `delete_permissions` | 10 | High | Can destroy state; higher weight than write since it's harder to reverse |
| `invoke_permissions` | 5 | Low | Can trigger other services — lower weight alone, but combines with other factors |
| `cross_account_permissions` | 15 | High | Blast radius extends beyond the account being reviewed |
| `no_guardrails` | 12 | Medium | No Bedrock guardrail bound — no content/behavior safety net |
| `no_approval_workflow` | 10 | Medium | No human checkpoint before actions execute |
| `dormant_agent` | 8 | Low | Unused agents are unmonitored attack surface and rarely get patched/reviewed |
| `public_endpoint` | 10 | Medium | A real API Gateway route was found pointing at this agent — reachable outside the AWS account |
| `sensitive_data_access` | 8 | Medium | Has access to a Secrets Manager secret |
| `credential_age` | 7 | Low | Credentials/role 90+ days old with no rotation evidence |
| `unused_permissions` | 5 | Low | Broad, unused permission set — classic least-privilege violation |
| `external_api_access` | 5 | Low | Environment suggests calls to a third-party API/webhook |

Maximum possible raw sum is 143, clamped to 100 — an agent doesn't need every factor to hit
`Critical`, but the clamp means "everything is wrong" and "most things are wrong" both correctly
read as the ceiling rather than an uninterpretable number above 100.

## Worked examples

**Why an agent becomes Critical (score ≥ 75):** an unowned (`+20`) Bedrock agent with an
administrator-equivalent role (`+20`), no guardrails (`+12`), no approval workflow (`+10`), and a
public API Gateway endpoint (`+10`) = 72 points from five independent factors, and one more small
factor (e.g. `invoke_permissions`, `+5`) crosses the 75 line. Every one of those five factors is a
real, separately-verifiable AWS finding — not a single catastrophic flag.

**Why an agent becomes High (50 ≤ score < 75):** missing owner (`+20`) + cross-account trust
(`+15`) + no approval workflow (`+10`) + write permissions (`+8`) = 53. Serious, but the agent has
no delete/admin access and isn't publicly reachable, so it stops short of Critical.

## How recommendations connect to this

The Recommendations Engine (see RECOMMENDATION_ENGINE.md) reads the same facts object and the
Autonomy result — it does not re-read the risk factor list — but the two are designed to line up:
`missing_owner` → "Assign owner"; `admin_iam_role` → "Restrict IAM role"; `no_guardrails` (when
autonomy is L3/L4) → "Enable guardrails"; etc.

## How organizations customize rules

Same mechanism as Autonomy — edit or add a row in `agent_rules` (globally, or per-tenant via
`lib/actions/agent-rules.ts`). To change "write access should add 25 points instead of 20," update
that rule's `weight`; nothing in `risk-engine.ts` needs to change. A tenant-specific override never
touches the global default row, so other tenants are unaffected.
