/**
 * Derives recommended actions from the already-computed capability facts,
 * autonomy result, and ownership result — every recommendation traces back
 * to a real detected condition, never a hardcoded per-agent suggestion.
 */

import type { CapabilityFacts } from "./capability-engine";
import type { AutonomyResult } from "./autonomy-engine";
import type { OwnershipResult } from "./ownership-engine";

export interface Recommendation {
  recommendationType: string;
  reason: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  suggestedFix: string;
}

export function generateRecommendations(
  facts: CapabilityFacts,
  autonomy: AutonomyResult,
  ownership: OwnershipResult
): Recommendation[] {
  const recs: Recommendation[] = [];
  const highAutonomy = autonomy.level === "L3" || autonomy.level === "L4";

  if (!ownership.ownerUserId) {
    recs.push({
      recommendationType: "assign_owner",
      reason: "No owner could be identified from cloud resource tags or email match.",
      severity: highAutonomy ? "High" : "Medium",
      suggestedFix:
        "Tag the agent's cloud resources with an Owner/Email tag, or assign an owner manually in the Agent Inventory.",
    });
  }

  if (facts.isDormant) {
    recs.push({
      recommendationType: "archive_dormant_agent",
      reason: "No activity detected on this agent's resources within the dormancy window.",
      severity: "Low",
      suggestedFix: "Confirm the agent is still required; disable or archive it if not.",
    });
  }

  if (facts.hasAdminRole) {
    recs.push({
      recommendationType: "restrict_iam_role",
      reason: "The agent's execution role has administrator-equivalent permissions.",
      severity: "Critical",
      suggestedFix: "Replace the role's policy with least-privilege permissions scoped to the agent's actual actions.",
    });
  }

  if (typeof facts.credentialAgeDays === "number" && facts.credentialAgeDays > 90) {
    recs.push({
      recommendationType: "rotate_credentials",
      reason: `Credentials associated with this agent are ${facts.credentialAgeDays} days old.`,
      severity: "Medium",
      suggestedFix: "Rotate the associated secret or access key.",
    });
  }

  if (!facts.hasGuardrails && highAutonomy) {
    recs.push({
      recommendationType: "enable_guardrails",
      reason: `Agent is classified ${autonomy.level} but has no cloud or ControlNet guardrail bound.`,
      severity: "High",
      suggestedFix: "Bind a provider-native or ControlNet guardrail before this agent continues to run at this autonomy level.",
    });
  }

  if (!facts.hasApprovalWorkflow && highAutonomy) {
    recs.push({
      recommendationType: "enable_approval_workflow",
      reason: `Agent is classified ${autonomy.level} but no approval-workflow tag/gate was found.`,
      severity: autonomy.level === "L4" ? "Critical" : "High",
      suggestedFix: "Require human approval before this agent's actions execute, or reduce its autonomy level.",
    });
  }

  if (facts.hasPublicEndpoint) {
    recs.push({
      recommendationType: "review_public_endpoint",
      reason: "A public cloud API endpoint routes to this agent's resources.",
      severity: "Medium",
      suggestedFix: "Confirm the endpoint requires authentication/authorization and is intentionally public.",
    });
  }

  if (facts.hasCrossAccountPermissions) {
    recs.push({
      recommendationType: "review_cross_account_trust",
      reason: "The agent's execution identity trusts a principal in another cloud account or tenant.",
      severity: "High",
      suggestedFix: "Verify the trusted account is expected and scope the trust policy as tightly as possible.",
    });
  }

  return recs;
}
