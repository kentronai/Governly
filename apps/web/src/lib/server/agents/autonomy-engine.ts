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
const LEVELS = ["L1", "L2", "L3", "L4"] as const;

export interface AutonomyResult {
  level: "L1" | "L2" | "L3" | "L4";
  reason: string;
  evidence: string[];
  confidence: number;
}

export async function classifyAutonomy(
  tenantId: string,
  facts: CapabilityFacts,
): Promise<AutonomyResult> {
  const matched = await evaluateRules(tenantId, "autonomy", facts);

  if (matched.length === 0) {
    return {
      level: "L1",
      reason:
        "No autonomy rule matched detected capabilities; defaulting to the most conservative level (Observe).",
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
    const rank = level ? (LEVEL_RANK[level] ?? 0) : 0;
    if (rank > winningRank) {
      winningRank = rank;
      winningLevel = level ?? "L1";
    }
  }

  const evidenceCap = maxEvidenceBackedLevel(facts);
  if (LEVEL_RANK[winningLevel] > LEVEL_RANK[evidenceCap]) {
    evidence.push(
      `Autonomy capped at ${evidenceCap}: no discovered provider evidence supports ${winningLevel}.`,
    );
    winningLevel = evidenceCap;
  }

  // Confidence scales with how many rules agreed on a level relative to
  // total rules matched, capped at 0.95 (never claim certainty).
  const agreeingRules = matched.filter(
    (r) => r.resultValue === winningLevel,
  ).length;
  const confidence = Math.min(
    0.95,
    0.5 + (agreeingRules / matched.length) * 0.45,
  );

  const winningDescriptions = matched
    .filter((r) => r.resultValue === winningLevel)
    .map((r) => r.description);
  const reasonEvidence =
    winningDescriptions.length > 0
      ? winningDescriptions.join("; ")
      : evidence[evidence.length - 1] || "No stronger autonomy evidence found.";

  return {
    level: winningLevel,
    reason: `Classified ${winningLevel} because: ${reasonEvidence}`,
    evidence,
    confidence: Number(confidence.toFixed(2)),
  };
}

/**
 * The ceiling that discovered provider evidence can justify. Exported so the
 * backfill script corrects historic rows with this exact rule instead of
 * reimplementing it — a second copy is how the inventory cards and table
 * drifted apart in the first place.
 */
export function maxEvidenceBackedLevel(
  facts: CapabilityFacts,
): AutonomyResult["level"] {
  const privilegedControl =
    facts.hasAdminRole ||
    facts.hasDeletePermissions ||
    facts.hasCrossAccountPermissions;
  if (privilegedControl && facts.hasExecuteCapableResource) return "L4";

  const toolOrDataControl =
    facts.hasWritePermissions ||
    facts.hasExternalApiAccess ||
    facts.hasSensitiveDataAccess;
  if (toolOrDataControl && facts.hasExecuteCapableResource) return "L3";

  if (facts.hasExecuteCapableResource && !facts.isConversationalAgent)
    return "L2";
  return "L1";
}

export const autonomyEngineTesting = {
  maxEvidenceBackedLevel,
  LEVELS,
};
