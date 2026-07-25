/**
 * Ownership fallback.
 *
 * The ownership engine only assigns an owner when a resource tag (Owner /
 * Email / Team) maps to a registered NORIX user — it never guesses. When a
 * provider exposes no such tag, agents are left "Unowned", which is accurate
 * but unhelpful.
 *
 * This fills that gap with a real, defensible default: the NORIX user who
 * connected the provider integration the agent was discovered through, matched
 * by the agent's platform. It is recorded with a distinct source
 * ("integration_creator") and low confidence so it is never confused with
 * tag-verified ownership, and it never overwrites an owner the engine already
 * resolved from real tag evidence.
 */

import { and, eq, inArray, isNull } from "drizzle-orm";
import { agents, db, integrations, users } from "@db";

/** Maps an agent platform to the integration catalog name that discovered it. */
function integrationNameForPlatform(platform: string): string | null {
  if (platform.startsWith("aws_") || platform === "amazon_q") return "AWS";
  if (platform.startsWith("azure_")) return "Azure";
  if (platform.startsWith("gcp_")) return "Google Cloud";
  if (platform.startsWith("databricks_")) return "Databricks Unity Catalog";
  if (platform === "kubernetes") return "Kubernetes Cluster";
  if (platform === "crewai") return "CrewAI";
  return null;
}

export async function assignFallbackOwnership(
  tenantId: string,
): Promise<number> {
  const unowned = await db
    .select({ id: agents.id, platform: agents.platform })
    .from(agents)
    .where(and(eq(agents.tenantId, tenantId), isNull(agents.ownerUserId)));
  if (unowned.length === 0) return 0;

  // integration name -> creator user id, for this tenant.
  const integrationRows = await db
    .select({ name: integrations.name, createdBy: integrations.createdBy })
    .from(integrations)
    .where(eq(integrations.tenantId, tenantId));
  const creatorByName = new Map(
    integrationRows.map((i) => [i.name, i.createdBy]),
  );

  // Keep only creators that map to a real local user row (createdBy is a Clerk
  // id that may not have a corresponding user record).
  const candidateUserIds = [
    ...new Set([...creatorByName.values()].filter(Boolean)),
  ] as string[];
  if (candidateUserIds.length === 0) return 0;
  const validUserIds = new Set(
    (
      await db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.id, candidateUserIds))
    ).map((u) => u.id),
  );

  const now = new Date().toISOString();
  let updated = 0;
  for (const agent of unowned) {
    const integrationName = integrationNameForPlatform(agent.platform);
    if (!integrationName) continue;
    const ownerUserId = creatorByName.get(integrationName);
    if (!ownerUserId || !validUserIds.has(ownerUserId)) continue;
    await db
      .update(agents)
      .set({
        ownerUserId,
        ownerSource: "integration_creator",
        ownerConfidence: "0.40",
        updatedAt: now,
      })
      .where(eq(agents.id, agent.id));
    updated += 1;
  }
  return updated;
}
