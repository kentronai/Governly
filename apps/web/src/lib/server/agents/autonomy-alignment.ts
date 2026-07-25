/**
 * Cross-platform autonomy alignment.
 *
 * The same logical agent is often deployed on several platforms (e.g. a chatbot
 * on AWS EC2, EKS, Databricks, and CrewAI). Each deployment is classified from
 * its own discovered evidence, so the levels can differ. Product decision: show
 * every deployment of one agent at a single, consistent autonomy — the highest
 * evidence-backed level found across the group.
 *
 * This only ever RAISES a deployment to match a stronger sibling; it never
 * lowers an agent below its own evidence, and it leaves agents that have no
 * same-identity siblings untouched.
 */

import { eq } from "drizzle-orm";
import { agents, db } from "@db";

const RANK: Record<string, number> = { L1: 1, L2: 2, L3: 3, L4: 4 };
const BY_RANK = ["", "L1", "L2", "L3", "L4"] as const;

/**
 * Collapses an agent name to a cross-platform identity key: lowercased, with
 * separators removed and a trailing "agent" token stripped, so
 * "streamlit-chatbot", "streamlit-chatbot-agent", and "streamlit-chatbotagent"
 * resolve to the same identity.
 */
export function agentIdentityKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/agent$/, "");
}

export async function alignAutonomyByIdentity(
  tenantId: string,
): Promise<number> {
  const rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      autonomyLevel: agents.autonomyLevel,
    })
    .from(agents)
    .where(eq(agents.tenantId, tenantId));

  // Highest autonomy rank observed per identity group.
  const groupMaxRank = new Map<string, number>();
  for (const row of rows) {
    if (!row.autonomyLevel) continue;
    const key = agentIdentityKey(row.name);
    const rank = RANK[row.autonomyLevel] ?? 0;
    groupMaxRank.set(key, Math.max(groupMaxRank.get(key) ?? 0, rank));
  }

  const now = new Date().toISOString();
  let updated = 0;
  for (const row of rows) {
    if (!row.autonomyLevel) continue;
    const targetRank = groupMaxRank.get(agentIdentityKey(row.name)) ?? 0;
    const currentRank = RANK[row.autonomyLevel] ?? 0;
    if (targetRank <= currentRank) continue; // already at/above the group level
    const target = BY_RANK[targetRank];
    await db
      .update(agents)
      .set({
        autonomyLevel: target as "L1" | "L2" | "L3" | "L4",
        autonomyReason: `Aligned to ${target}: shown at the highest evidence-backed level among deployments of this agent across platforms.`,
        updatedAt: now,
      })
      .where(eq(agents.id, row.id));
    updated += 1;
  }
  return updated;
}
