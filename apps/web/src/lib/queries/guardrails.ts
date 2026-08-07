/**
 * Server-side queries for the Guardrail catalog
 * Used in Server Components (SSR)
 */

import { db, guardrails, policyGuardrails } from "@db";
import { eq, and, isNull, or, inArray } from "drizzle-orm";
import { BUILTIN_GUARDRAIL_KEYS } from "@/lib/builtin-guardrails";

/** Shape consumed by the policy create/edit clients. */
export interface AvailableGuardrail {
  id: string;
  key: string;
  name: string;
  tier: string;
  description: string;
  defaultParams: Record<string, unknown>;
}

type GuardrailRow = {
  id: string;
  key: string;
  tenantId: string | null;
  name: string | null;
  tier: string | null;
  description: string | null;
  defaultParams: unknown;
};

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

function toAvailableGuardrail(g: GuardrailRow): AvailableGuardrail {
  return {
    id: g.id,
    key: g.key,
    name: g.name || g.key,
    tier: g.tier ?? "",
    description: g.description || "",
    defaultParams: (g.defaultParams ?? {}) as Record<string, unknown>,
  };
}

const GUARDRAIL_COLUMNS = {
  id: guardrails.id,
  key: guardrails.key,
  tenantId: guardrails.tenantId,
  name: guardrails.name,
  tier: guardrails.tier,
  description: guardrails.description,
  defaultParams: guardrails.defaultParams,
};

/**
 * Guardrails a tenant may ADD to a policy.
 *
 * Install-gated on purpose: a marketplace guardrail has to be installed before it
 * can be composed into a policy. That means this returns only
 *   - the built-in guardrails NORIX ships (available to everyone, no install), and
 *   - rows the tenant owns — installed from the marketplace, or authored locally.
 *
 * Uninstalled marketplace guardrails are deliberately excluded. Note the built-in
 * set must be matched by key across BOTH global and tenant-owned rows, because a
 * tenant may also hold an installed copy of a built-in.
 */
export async function getAvailableGuardrails(
  tenantId: string,
): Promise<AvailableGuardrail[]> {
  const rows = await db
    .select(GUARDRAIL_COLUMNS)
    .from(guardrails)
    .where(
      and(
        or(
          // Rows this tenant owns: installed from the marketplace or custom-built.
          eq(guardrails.tenantId, tenantId),
          // Built-ins ship globally and need no install.
          and(
            isNull(guardrails.tenantId),
            inArray(guardrails.key, [...BUILTIN_GUARDRAIL_KEYS]),
          ),
        ),
        eq(guardrails.isEnabled, true),
        isNull(guardrails.deletedAt),
      ),
    )
    .orderBy(guardrails.tier, guardrails.name);

  return dedupeGuardrailsByKey(rows).map(toAvailableGuardrail);
}

/**
 * Guardrails that must resolve when SAVING a given policy.
 *
 * A superset of {@link getAvailableGuardrails} that also includes whatever the
 * policy already has bound, even if it is an uninstalled marketplace guardrail.
 * Without this, opening a policy that predates install-gating and pressing save
 * would fail to resolve those entries — and the save aborts rather than silently
 * dropping them, so the policy would become uneditable.
 *
 * The editor uses the narrower list for its "add" picker and this one to resolve
 * the composition it is about to persist.
 */
export async function getResolvableGuardrails(
  tenantId: string,
  policyId: string,
): Promise<AvailableGuardrail[]> {
  const [available, boundRows] = await Promise.all([
    getAvailableGuardrails(tenantId),
    db
      .select(GUARDRAIL_COLUMNS)
      .from(policyGuardrails)
      .innerJoin(guardrails, eq(policyGuardrails.guardrailId, guardrails.id))
      .where(
        and(
          eq(policyGuardrails.policyId, policyId),
          isNull(guardrails.deletedAt),
        ),
      ),
  ]);

  const byKey = new Map(available.map((g) => [g.key, g]));
  // Bound rows only fill gaps; an installed/built-in row of the same key wins.
  for (const row of dedupeGuardrailsByKey(boundRows)) {
    if (!byKey.has(row.key)) {
      byKey.set(row.key, toAvailableGuardrail(row));
    }
  }

  return Array.from(byKey.values());
}
