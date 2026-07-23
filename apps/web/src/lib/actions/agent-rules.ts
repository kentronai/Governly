/**
 * Server actions for managing the configurable Capability/Autonomy/Risk
 * rules (agent_rules). Editing a rule here changes engine behavior with no
 * code deploy — see docs/AUTONOMY_ENGINE.md and docs/RISK_ENGINE.md.
 */

"use server";

import { db, agentRules, tenants } from "@db";
import { eq, and, isNull, or } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { createAuditEvent } from "@/lib/server/audit";
import type { RuleCondition } from "@/lib/server/agents/rule-engine";

async function resolveTenantId(tenantSlugOrId: string): Promise<string> {
  let tenantRow = await db.select().from(tenants).where(eq(tenants.id, tenantSlugOrId)).limit(1);
  if (!tenantRow.length) {
    tenantRow = await db.select().from(tenants).where(eq(tenants.slug, tenantSlugOrId)).limit(1);
  }
  if (!tenantRow.length) throw new Error("Tenant not found");
  return tenantRow[0].id;
}

export const getAgentRules = async (
  tenantSlugOrId: string,
  engineType: "capability" | "autonomy" | "risk"
) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");

  const tenantId = await resolveTenantId(tenantSlugOrId);
  return db.query.agentRules.findMany({
    where: and(
      eq(agentRules.engineType, engineType),
      or(isNull(agentRules.tenantId), eq(agentRules.tenantId, tenantId))
    ),
    orderBy: (t, { asc }) => [asc(t.priority)],
  });
};

export interface UpdateAgentRuleInput {
  tenantSlug: string;
  ruleId: string;
  weight?: number;
  condition?: RuleCondition;
  isEnabled?: boolean;
}

// Updating a global (tenantId: null) rule creates a tenant-scoped override
// row instead of mutating the shared default, so one tenant's customization
// never affects another tenant.
export const updateAgentRule = async (input: UpdateAgentRuleInput) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");

  const tenantId = await resolveTenantId(input.tenantSlug);
  const rule = await db.query.agentRules.findFirst({ where: eq(agentRules.id, input.ruleId) });
  if (!rule) throw new Error("Rule not found");

  const patch = {
    weight: input.weight !== undefined ? String(input.weight) : undefined,
    condition: input.condition,
    isEnabled: input.isEnabled,
    updatedBy: userId,
  };

  let updated;
  if (rule.tenantId === tenantId) {
    [updated] = await db.update(agentRules).set(patch).where(eq(agentRules.id, rule.id)).returning();
  } else {
    [updated] = await db
      .insert(agentRules)
      .values({
        tenantId,
        engineType: rule.engineType,
        ruleKey: rule.ruleKey,
        description: rule.description,
        condition: input.condition ?? rule.condition,
        weight: input.weight !== undefined ? String(input.weight) : rule.weight,
        resultValue: rule.resultValue,
        severity: rule.severity,
        isEnabled: input.isEnabled ?? rule.isEnabled,
        priority: rule.priority,
        createdBy: userId,
      })
      .onConflictDoUpdate({
        target: [agentRules.tenantId, agentRules.ruleKey],
        set: patch,
      })
      .returning();
  }

  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "agent_rule.updated",
    targetType: "agent_rule",
    targetId: rule.id,
    metadata: { ruleKey: rule.ruleKey, engineType: rule.engineType, ...patch },
  });

  return updated;
};
