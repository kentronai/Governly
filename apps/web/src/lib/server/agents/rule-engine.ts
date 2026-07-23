/**
 * Generic rule evaluator shared by the Capability, Autonomy, and Risk
 * engines. Rules live as data in the `agent_rules` table (condition +
 * weight/resultValue) — this is the ONLY place condition-matching logic
 * exists, so changing "write access should add 25 points instead of 20" is
 * a row edit, never a code change.
 */

import { db, agentRules } from "@db";
import { and, eq, isNull, or } from "drizzle-orm";
import { cache } from "react";

export type Facts = Record<string, string | number | boolean | null | undefined>;

export type ConditionOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "exists"
  | "not_exists";

// A leaf condition tests one fact. `all`/`any` groups compose leaf
// conditions for compound logic — still plain JSON data, no code change
// required to express "hasAdminRole AND hasCrossAccountPermissions".
export type RuleCondition =
  | { field: string; operator: ConditionOperator; value?: string | number | boolean | (string | number)[] }
  | { all: RuleCondition[] }
  | { any: RuleCondition[] };

export interface EvaluatedRule {
  ruleKey: string;
  description: string;
  weight: number;
  resultValue: string | null;
  severity: string | null;
}

// Global rules (tenantId null) plus any tenant-specific overrides/additions,
// for a given engine. A tenant row with the same ruleKey as a global row
// takes precedence (enforced by the `uq_agent_rules_tenant_key` unique
// constraint keeping them distinct rows we can prefer by tenant match).
export const getRulesForEngine = cache(
  async (tenantId: string, engineType: "capability" | "autonomy" | "risk") => {
    const rows = await db.query.agentRules.findMany({
      where: and(
        eq(agentRules.engineType, engineType),
        eq(agentRules.isEnabled, true),
        or(isNull(agentRules.tenantId), eq(agentRules.tenantId, tenantId))
      ),
      orderBy: (t, { asc }) => [asc(t.priority)],
    });

    const byKey = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const existing = byKey.get(row.ruleKey);
      // Prefer the tenant-specific row over the global default with the same key.
      if (!existing || (row.tenantId && !existing.tenantId)) {
        byKey.set(row.ruleKey, row);
      }
    }
    return Array.from(byKey.values());
  }
);

function matches(condition: RuleCondition, facts: Facts): boolean {
  if ("all" in condition) return condition.all.every((c) => matches(c, facts));
  if ("any" in condition) return condition.any.some((c) => matches(c, facts));

  const actual = facts[condition.field];

  switch (condition.operator) {
    case "exists":
      return actual !== undefined && actual !== null;
    case "not_exists":
      return actual === undefined || actual === null;
    case "eq":
      return actual === condition.value;
    case "neq":
      return actual !== condition.value;
    case "gt":
      return typeof actual === "number" && typeof condition.value === "number" && actual > condition.value;
    case "gte":
      return typeof actual === "number" && typeof condition.value === "number" && actual >= condition.value;
    case "lt":
      return typeof actual === "number" && typeof condition.value === "number" && actual < condition.value;
    case "lte":
      return typeof actual === "number" && typeof condition.value === "number" && actual <= condition.value;
    case "in":
      return Array.isArray(condition.value) && (condition.value as (string | number)[]).some((v) => v === actual);
    default:
      return false;
  }
}

export async function evaluateRules(
  tenantId: string,
  engineType: "capability" | "autonomy" | "risk",
  facts: Facts
): Promise<EvaluatedRule[]> {
  const rules = await getRulesForEngine(tenantId, engineType);
  const matched: EvaluatedRule[] = [];

  for (const rule of rules) {
    const condition = rule.condition as RuleCondition;
    if (matches(condition, facts)) {
      matched.push({
        ruleKey: rule.ruleKey,
        description: rule.description,
        weight: Number(rule.weight),
        resultValue: rule.resultValue,
        severity: rule.severity,
      });
    }
  }

  return matched;
}
