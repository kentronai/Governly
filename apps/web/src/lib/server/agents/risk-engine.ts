/**
 * Scores an agent's risk (0-100) by summing the weights of every matched
 * `agent_rules` row (engineType='risk') against its capability facts. No
 * random numbers, no hardcoded per-agent logic — every point is traceable
 * to a named rule, stored alongside the score for the "store explanations
 * for every score" requirement.
 */

import { evaluateRules } from "./rule-engine";
import type { CapabilityFacts } from "./capability-engine";

export interface RiskFactor {
  ruleKey: string;
  description: string;
  points: number;
}

export interface RiskResult {
  score: number;
  level: "Low" | "Medium" | "High" | "Critical";
  factors: RiskFactor[];
}

function levelForScore(score: number): RiskResult["level"] {
  if (score >= 75) return "Critical";
  if (score >= 50) return "High";
  if (score >= 25) return "Medium";
  return "Low";
}

export async function assessRisk(
  tenantId: string,
  facts: CapabilityFacts
): Promise<RiskResult> {
  const matched = await evaluateRules(tenantId, "risk", facts);

  const factors: RiskFactor[] = matched.map((rule) => ({
    ruleKey: rule.ruleKey,
    description: rule.description,
    points: rule.weight,
  }));

  const rawScore = factors.reduce((sum, f) => sum + f.points, 0);
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  return { score, level: levelForScore(score), factors };
}
