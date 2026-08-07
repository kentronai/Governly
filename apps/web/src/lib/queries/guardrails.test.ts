/**
 * Guards the guardrail-catalog lookup that the policy editor saves against.
 *
 * Regression context: the policy edit page resolved its saved composition
 * against a tenant-only guardrail query. Global catalog rows (`tenant_id IS
 * NULL`) never matched, so every guardrail on the default Launch policy failed
 * to resolve and was silently dropped on save, wiping the policy.
 */

// The module imports the Drizzle client; stub it so this stays a unit test.
jest.mock("@db", () => ({
  db: { query: { guardrails: { findMany: jest.fn() } } },
  guardrails: {},
}));

import { dedupeGuardrailsByKey } from "./guardrails";

type Row = { key: string; tenantId: string | null; id: string };

describe("dedupeGuardrailsByKey", () => {
  it("keeps global guardrails, which every default policy is built from", () => {
    const rows: Row[] = [
      { id: "g1", key: "pii.detect", tenantId: null },
      { id: "g2", key: "jailbreak.detect", tenantId: null },
    ];

    const result = dedupeGuardrailsByKey(rows);

    expect(result.map((r) => r.key).sort()).toEqual([
      "jailbreak.detect",
      "pii.detect",
    ]);
  });

  it("prefers the tenant-scoped row when a tenant installed its own copy", () => {
    // installMarketplaceGuardrail copies a global row into a tenant-owned row
    // under the same key, so both can legitimately exist.
    const rows: Row[] = [
      { id: "global", key: "pii.detect", tenantId: null },
      { id: "tenant", key: "pii.detect", tenantId: "org_1" },
    ];

    expect(dedupeGuardrailsByKey(rows)).toEqual([
      { id: "tenant", key: "pii.detect", tenantId: "org_1" },
    ]);
  });

  it("prefers the tenant-scoped row regardless of input ordering", () => {
    const rows: Row[] = [
      { id: "tenant", key: "pii.detect", tenantId: "org_1" },
      { id: "global", key: "pii.detect", tenantId: null },
    ];

    expect(dedupeGuardrailsByKey(rows)).toEqual([
      { id: "tenant", key: "pii.detect", tenantId: "org_1" },
    ]);
  });

  it("collapses duplicates so a key resolves to exactly one id", () => {
    const rows: Row[] = [
      { id: "global", key: "pii.detect", tenantId: null },
      { id: "tenant", key: "pii.detect", tenantId: "org_1" },
      { id: "g2", key: "toxicity.detect", tenantId: null },
    ];

    const result = dedupeGuardrailsByKey(rows);

    expect(result).toHaveLength(2);
    expect(new Set(result.map((r) => r.key)).size).toBe(2);
  });

  it("returns an empty list for no rows", () => {
    expect(dedupeGuardrailsByKey([])).toEqual([]);
  });

  it("resolves every guardrail of a default Launch composition", () => {
    // The five seeded Launch guards are all global rows. Each must resolve, or
    // handleSave drops it and the policy loses guardrails.
    const launchKeys = [
      "pii.detect",
      "jailbreak.detect",
      "profanity.detect",
      "toxicity.detect",
      "harmful_instructions.detect",
    ];
    const catalog: Row[] = launchKeys.map((key, i) => ({
      id: `g${i}`,
      key,
      tenantId: null,
    }));

    const available = dedupeGuardrailsByKey(catalog);
    const unresolved = launchKeys.filter(
      (key) => !available.some((g) => g.key === key),
    );

    expect(unresolved).toEqual([]);
  });
});
