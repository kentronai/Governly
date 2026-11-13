import "server-only";

import { and, eq, isNotNull, notInArray, or, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { agents, db, integrations } from "@db";

/**
 * Deletes a tenant's discovered agents whose source integration is no longer
 * connected (removed, disabled or without credentials). Agents with no source
 * (ingested through NORIX) are never touched. Runs on every disconnect and when
 * the inventory loads, so removing a provider always removes its agents.
 */
export async function pruneOrphanAgents(tenantId: string) {
  const live = await db
    .select({ id: integrations.id, name: integrations.name, configuration: integrations.configuration })
    .from(integrations)
    .where(
      and(
        eq(integrations.tenantId, tenantId),
        eq(integrations.isEnabled, true),
        eq(integrations.isCredentialsAdded, true),
      ),
    );
  const configId = (name: string, key: string) =>
    live
      .filter((i) => i.name === name)
      .map((i) => (i.configuration as Record<string, unknown> | null)?.[key])
      .filter((v): v is string => typeof v === "string" && !!v);

  // "not in <connected ids>", or simply "has a source" when nothing is connected.
  const orphan = (col: PgColumn, ids: string[]): SQL =>
    ids.length ? and(isNotNull(col), notInArray(col, ids))! : isNotNull(col);

  await db
    .delete(agents)
    .where(
      and(
        eq(agents.tenantId, tenantId),
        or(
          orphan(agents.integrationId, live.map((i) => i.id)),
          orphan(agents.connectionId, configId("AWS", "awsConnectionId")),
          orphan(agents.azureConnectionId, configId("Azure", "azureConnectionId")),
        ),
      ),
    );
}
