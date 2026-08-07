/**
 * The guardrails NORIX ships with.
 *
 * These are part of the product, not marketplace listings: every tenant has them
 * without installing anything, they back the default Launch policy, and they show
 * up under the tenant's own guardrails rather than as installable products.
 *
 * Identified by an explicit key list on purpose. The obvious alternative —
 * keying off `metadata.source = 'norix_default_catalog'`, which migration 0026
 * stamps on them — is not reliable: `scripts/seed-marketplace.ts` re-inserts
 * `pii.detect` and `toxicity.detect` without that marker, so on any environment
 * where it has run those two lose their built-in identity. Product identity
 * should not be something a seed script can erase.
 */
export const BUILTIN_GUARDRAIL_KEYS = [
  "pii.detect",
  "jailbreak.detect",
  "profanity.detect",
  "toxicity.detect",
  "harmful_instructions.detect",
] as const;

export type BuiltinGuardrailKey = (typeof BUILTIN_GUARDRAIL_KEYS)[number];

const BUILTIN_KEY_SET: ReadonlySet<string> = new Set(BUILTIN_GUARDRAIL_KEYS);

/** True when a guardrail key is one NORIX ships built in. */
export function isBuiltinGuardrail(key: string): boolean {
  return BUILTIN_KEY_SET.has(key);
}
