/**
 * Seeds the global (tenantId: null) default rules for the Capability,
 * Autonomy, and Risk engines behind AI Agent Discovery.
 *
 * These are DATA, not code — see docs/AUTONOMY_ENGINE.md and
 * docs/RISK_ENGINE.md for what each rule means and how to add/adjust one
 * (including per-tenant overrides) without touching the engine code in
 * apps/web/src/lib/server/agents/.
 */

import { db, agentRules } from "../src/db";

const AUTONOMY_RULES = [
  {
    ruleKey: "observe_only_default",
    description:
      "No conversational agent and no execution-capable resource detected — read-only observation only.",
    condition: {
      all: [
        { field: "isConversationalAgent", operator: "eq", value: false },
        { field: "hasExecuteCapableResource", operator: "eq", value: false },
      ],
    },
    weight: 0,
    resultValue: "L1",
    priority: 10,
  },
  {
    ruleKey: "can_recommend_no_execution",
    description:
      "Bedrock agent produces responses/drafts but has no Lambda, Step Function, or invoke permission to execute actions.",
    condition: {
      all: [
        { field: "isConversationalAgent", operator: "eq", value: true },
        { field: "hasExecuteCapableResource", operator: "eq", value: false },
      ],
    },
    weight: 0,
    resultValue: "L2",
    priority: 20,
  },
  {
    ruleKey: "can_execute_with_approval",
    description:
      "Agent can execute actions (Lambda/Step Function/invoke permission) and an approval-workflow gate was detected.",
    condition: {
      all: [
        { field: "hasExecuteCapableResource", operator: "eq", value: true },
        { field: "hasApprovalWorkflow", operator: "eq", value: true },
      ],
    },
    weight: 0,
    resultValue: "L3",
    priority: 30,
  },
  {
    ruleKey: "can_execute_no_approval",
    description:
      "Agent can execute actions with no approval-workflow gate detected — fully autonomous execution.",
    condition: {
      all: [
        { field: "hasExecuteCapableResource", operator: "eq", value: true },
        { field: "hasApprovalWorkflow", operator: "eq", value: false },
      ],
    },
    weight: 0,
    resultValue: "L4",
    priority: 40,
  },
] as const;

const RISK_RULES = [
  {
    ruleKey: "missing_owner",
    description: "No owner identified for this agent.",
    condition: { field: "hasOwner", operator: "eq", value: false },
    weight: 20,
    severity: "High",
    priority: 10,
  },
  {
    ruleKey: "admin_iam_role",
    description: "Execution role has administrator-equivalent permissions.",
    condition: { field: "hasAdminRole", operator: "eq", value: true },
    weight: 20,
    severity: "Critical",
    priority: 20,
  },
  {
    ruleKey: "write_permissions",
    description: "Execution role has write (put/create/update) permissions.",
    condition: { field: "hasWritePermissions", operator: "eq", value: true },
    weight: 8,
    severity: "Medium",
    priority: 30,
  },
  {
    ruleKey: "delete_permissions",
    description: "Execution role has delete permissions.",
    condition: { field: "hasDeletePermissions", operator: "eq", value: true },
    weight: 10,
    severity: "High",
    priority: 40,
  },
  {
    ruleKey: "invoke_permissions",
    description: "Execution role can invoke other services or functions.",
    condition: { field: "hasInvokePermissions", operator: "eq", value: true },
    weight: 5,
    severity: "Low",
    priority: 50,
  },
  {
    ruleKey: "cross_account_permissions",
    description: "Execution role trusts a principal in another AWS account.",
    condition: { field: "hasCrossAccountPermissions", operator: "eq", value: true },
    weight: 15,
    severity: "High",
    priority: 60,
  },
  {
    ruleKey: "no_guardrails",
    description: "No Bedrock guardrail is bound to this agent.",
    condition: { field: "hasGuardrails", operator: "eq", value: false },
    weight: 12,
    severity: "Medium",
    priority: 70,
  },
  {
    ruleKey: "no_approval_workflow",
    description: "No approval-workflow gate detected for this agent's actions.",
    condition: { field: "hasApprovalWorkflow", operator: "eq", value: false },
    weight: 10,
    severity: "Medium",
    priority: 80,
  },
  {
    ruleKey: "dormant_agent",
    description: "No recent activity detected on this agent's resources.",
    condition: { field: "isDormant", operator: "eq", value: true },
    weight: 8,
    severity: "Low",
    priority: 90,
  },
  {
    ruleKey: "public_endpoint",
    description: "A public API Gateway endpoint routes to this agent.",
    condition: { field: "hasPublicEndpoint", operator: "eq", value: true },
    weight: 10,
    severity: "Medium",
    priority: 100,
  },
  {
    ruleKey: "sensitive_data_access",
    description: "Agent has access to a Secrets Manager secret.",
    condition: { field: "hasSensitiveDataAccess", operator: "eq", value: true },
    weight: 8,
    severity: "Medium",
    priority: 110,
  },
  {
    ruleKey: "credential_age",
    description: "Associated credentials or role are 90+ days old without rotation evidence.",
    condition: { field: "credentialAgeDays", operator: "gte", value: 90 },
    weight: 7,
    severity: "Low",
    priority: 120,
  },
  {
    ruleKey: "unused_permissions",
    description: "Execution role has a large permission set with no recent usage evidence.",
    condition: { field: "hasUnusedPermissions", operator: "eq", value: true },
    weight: 5,
    severity: "Low",
    priority: 130,
  },
  {
    ruleKey: "external_api_access",
    description: "Agent's Lambda environment references an external API, webhook, or token.",
    condition: { field: "hasExternalApiAccess", operator: "eq", value: true },
    weight: 5,
    severity: "Low",
    priority: 140,
  },
] as const;

async function seed() {
  console.log("Seeding autonomy rules...");
  for (const rule of AUTONOMY_RULES) {
    await db
      .insert(agentRules)
      .values({
        tenantId: null,
        engineType: "autonomy",
        ruleKey: rule.ruleKey,
        description: rule.description,
        condition: rule.condition,
        weight: String(rule.weight),
        resultValue: rule.resultValue,
        priority: rule.priority,
      })
      .onConflictDoNothing();
  }

  console.log("Seeding risk rules...");
  for (const rule of RISK_RULES) {
    await db
      .insert(agentRules)
      .values({
        tenantId: null,
        engineType: "risk",
        ruleKey: rule.ruleKey,
        description: rule.description,
        condition: rule.condition,
        weight: String(rule.weight),
        severity: rule.severity,
        priority: rule.priority,
      })
      .onConflictDoNothing();
  }

  console.log(`Done. ${AUTONOMY_RULES.length} autonomy rules, ${RISK_RULES.length} risk rules.`);
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to seed agent rules:", error);
    process.exit(1);
  });
