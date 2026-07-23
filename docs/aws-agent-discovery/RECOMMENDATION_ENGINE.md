# Recommendation Engine

`apps/web/src/lib/server/agents/recommendations-engine.ts`

## Purpose

Turns the already-computed Capability facts, Autonomy result, and Ownership result into a list of
concrete, actionable recommendations — every one traces back to a real detected condition on that
specific agent, never a generic or hardcoded per-agent suggestion.

Unlike the Autonomy/Risk engines, recommendations are **not** driven by `agent_rules` — the logic
is a fixed set of straightforward "if this condition is true, suggest this fix" checks in code,
because each recommendation also needs a specific, human-readable fix instruction rather than a
numeric weight. (If per-tenant customization of recommendation text/thresholds becomes a
requirement, this can move to the same `agent_rules` table with a `capability` engine type — the
plumbing already supports it.)

## Every recommendation

| Trigger | `recommendationType` | Severity | Suggested fix |
|---|---|---|---|
| No owner identified | `assign_owner` | High if autonomy is L3/L4, else Medium | Tag the agent's AWS resources with an Owner/Email tag, or assign an owner manually |
| `isDormant` | `archive_dormant_agent` | Low | Confirm the agent is still required; disable or archive it |
| `hasAdminRole` | `restrict_iam_role` | Critical | Replace the role's policy with least-privilege permissions |
| `credentialAgeDays > 90` | `rotate_credentials` | Medium | Rotate the associated secret or access key |
| No guardrails AND autonomy is L3/L4 | `enable_guardrails` | High | Bind a ControlNet/Bedrock guardrail before continuing at this autonomy level |
| No approval workflow AND autonomy is L3/L4 | `enable_approval_workflow` | Critical if L4, High if L3 | Require human approval, or reduce autonomy level |
| `hasPublicEndpoint` | `review_public_endpoint` | Medium | Confirm the endpoint requires authentication and is intentionally public |
| `hasCrossAccountPermissions` | `review_cross_account_trust` | High | Verify the trusted account is expected and scope the trust policy tightly |

## Storage and lifecycle

Recommendations are written to `agent_recommendations` on every scan. Before inserting the fresh
list, the orchestrator deletes any existing rows for that agent with `status = 'open'` — so a
recommendation that no longer applies (e.g. an owner was assigned) disappears on the next scan
rather than lingering. Rows a user has explicitly marked `resolved` or `dismissed` are left alone
by the scan (only `open` rows are cleared), so manual triage state survives a re-scan.

## Adding a new recommendation

Add a check in `generateRecommendations()` referencing a fact already produced by the Capability
Engine (see CAPABILITY_ENGINE.md) — or add a new fact first if the signal doesn't exist yet, then
reference it here. Push a `Recommendation { recommendationType, reason, severity, suggestedFix }`
object; the orchestrator persists whatever the function returns with no further wiring needed.
