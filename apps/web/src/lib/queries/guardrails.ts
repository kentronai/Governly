/**
 * Server-side queries for the Guardrail catalog
 * Used in Server Components (SSR)
 */

import { db, guardrails } from "@db";
import { eq, and, isNull, or } from "drizzle-orm";

/** Shape consumed by the policy create/edit clients. */
export interface AvailableGuardrail {
  id: string;
  key: string;
  name: string;
  tier: string;
  description: string;
  defaultParams: Record<string, unknown>;
}

/**
 * Collapse a guardrail list to one row per stable `key`.
 *
 * A tenant can hold both a global catalog row (`tenant_id IS NULL`) and its own
 * installed copy of the same key — `installMarketplaceGuardrail` creates exactly
 * that. Prefer the tenant-scoped row so per-tenant customisations win, and so
 * the key resolves to a single unambiguous id.
 */
export function dedupeGuardrailsByKey<
  T extends { key: string; tenantId: string | null },
>(rows: readonly T[]): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const previous = byKey.get(row.key);
    if (!previous || (previous.tenantId === null && row.tenantId !== null)) {
      byKey.set(row.key, row);
    }
  }
  return Array.from(byKey.values());
}

/**
 * Every guardrail a tenant may compose into a policy.
 *
 * Must include global rows (`tenant_id IS NULL`): the seeded catalog — and so
 * every guardrail on the default Launch policy — lives there. Filtering on
 * `tenant_id = :id` alone returns nothing for those, which previously caused
 * the policy editor to silently drop every guardrail on save.
 */
export async function getAvailableGuardrails(
  tenantId: string,
): Promise<AvailableGuardrail[]> {
  const rows = await db.query.guardrails.findMany({
    where: and(
      or(eq(guardrails.tenantId, tenantId), isNull(guardrails.tenantId)),
      eq(guardrails.isEnabled, true),
      isNull(guardrails.deletedAt),
    ),
    orderBy: (guardrails, { asc }) => [
      asc(guardrails.tier),
      asc(guardrails.name),
    ],
  });

  return dedupeGuardrailsByKey(rows).map((g) => ({
    id: g.id,
    key: g.key,
    name: g.name || g.key,
    tier: g.tier ?? "",
    description: g.description || "",
    defaultParams: (g.defaultParams ?? {}) as Record<string, unknown>,
  }));
}
