/**
 * Classifies an agent's autonomy level (L1-L4) by evaluating the
 * configurable `agent_rules` (engineType='autonomy') against its
 * capability facts. Every matching rule becomes evidence; the highest
 * level justified by any matched rule wins. Confidence reflects how many
 * independent signals agreed vs. how much had to be inferred.
 */

import { evaluateRules } from "./rule-engine";
import type { CapabilityFacts } from "./capability-engine";

const LEVEL_RANK: Record<string, number> = { L1: 1, L2: 2, L3: 3, L4: 4 };

export interface AutonomyResult {
  level: "L1" | "L2" | "L3" | "L4";
  reason: string;
  evidence: string[];
  confidence: number;
}

export async function classifyAutonomy(
  tenantId: string,
  facts: CapabilityFacts
): Promise<AutonomyResult> {
  const matched = await evaluateRules(tenantId, "autonomy", facts);

  if (matched.length === 0) {
    return {
      level: "L1",
      reason: "No autonomy rule matched detected capabilities; defaulting to the most conservative level (Observe).",
      evidence: [],
      confidence: 0.5,
    };
  }

  let winningLevel: AutonomyResult["level"] = "L1";
  let winningRank = 0;
  const evidence: string[] = [];

  for (const rule of matched) {
    evidence.push(rule.description);
    const level = rule.resultValue as AutonomyResult["level"] | null;
    const rank = level ? LEVEL_RANK[level] ?? 0 : 0;
    if (rank > winningRank) {
      winningRank = rank;
      winningLevel = level ?? "L1";
    }
  }

  // Confidence scales with how many rules agreed on a level relative to
  // total rules matched, capped at 0.95 (never claim certainty).
  const agreeingRules = matched.filter((r) => r.resultValue === winningLevel).length;
  const confidence = Math.min(0.95, 0.5 + (agreeingRules / matched.length) * 0.45);

  return {
    level: winningLevel,
    reason: `Classified ${winningLevel} because: ${matched
      .filter((r) => r.resultValue === winningLevel)
      .map((r) => r.description)
      .join("; ")}`,
    evidence,
    confidence: Number(confidence.toFixed(2)),
  };
}
