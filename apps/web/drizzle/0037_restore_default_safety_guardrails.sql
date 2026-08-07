-- Restore the default safety guardrails that were removed from the catalog.
--
-- `apps/web/scripts/seed-marketplace.ts` used to DELETE every global guardrail
-- before inserting its own marketplace set. Production was left with only the
-- two keys the two sets have in common (pii.detect, toxicity.detect), so
-- jailbreak.detect, profanity.detect and harmful_instructions.detect no longer
-- existed. Policies could then only bind the guardrails that were present, which
-- is why Launch policies came up with 2 of their 5 guards.
--
-- Migration 0026 seeded these rows originally, but it has already been applied,
-- so it will never run again. This re-seeds the missing keys with the exact same
-- definitions. Idempotent: a `WHERE NOT EXISTS` guard makes it a no-op wherever
-- the catalog is already intact.
--
-- This restores the CATALOG only. It deliberately does not re-link guardrails to
-- existing policies: that would change runtime enforcement for live
-- applications, so it is left to an explicit operator action in the UI.

WITH seed (
  "key", "category", "name", "description", "tier",
  "performance_budget_ms", "default_params", "function_name"
) AS (
  VALUES
    (
      'jailbreak.detect',
      'jailbreak',
      'Jailbreak Detection',
      'Detects prompt injection, instruction override, and jailbreak attempts.',
      'T1',
      20.000,
      '{"severity":"critical","threshold":0.6}'::jsonb,
      'jailbreak_detect'
    ),
    (
      'profanity.detect',
      'profanity',
      'Profanity Detection',
      'Detects profane and offensive language.',
      'T0',
      3.000,
      '{"severity":"high","threshold":1.0,"categories":null}'::jsonb,
      'profanity_detect'
    ),
    (
      'harmful_instructions.detect',
      'harmful_instructions',
      'Harmful Instructions Detection',
      'Blocks requests for actionable criminal or harmful instructions.',
      'T0',
      5.000,
      '{"severity":"high","threshold":0.75,"categories":null}'::jsonb,
      'harmful_instructions_detect'
    )
)
INSERT INTO "guardrails" (
  "id", "tenant_id", "key", "version", "category", "description",
  "tier", "performance_budget_ms", "requires_onnx", "default_params",
  "metadata", "is_enabled", "pack_name", "function_name",
  "fallback_strategy", "infrastructure", "is_global", "is_certified",
  "name", "enable_install"
)
SELECT
  gen_random_uuid(),
  NULL,
  seed."key",
  'v1',
  seed."category",
  seed."description",
  seed."tier"::guard_tier,
  seed."performance_budget_ms",
  false,
  seed."default_params",
  jsonb_build_object(
    'source', 'norix_default_catalog',
    'applicable_phases', jsonb_build_array('input')
  ),
  true,
  'default_guardrails',
  seed."function_name",
  'block',
  'rule',
  true,
  true,
  seed."name",
  true
FROM seed
WHERE NOT EXISTS (
  SELECT 1
  FROM "guardrails" existing
  WHERE existing."tenant_id" IS NULL
    AND existing."key" = seed."key"
    AND existing."version" = 'v1'
    AND existing."deleted_at" IS NULL
);

-- Un-retire any of the five defaults that were soft-deleted or disabled rather
-- than hard-deleted, so the whole baseline set is selectable again.
UPDATE "guardrails"
SET
  "is_enabled" = true,
  "is_global" = true,
  "enable_install" = true,
  "deleted_at" = NULL,
  "updated_at" = NOW()
WHERE "tenant_id" IS NULL
  AND "key" IN (
    'pii.detect',
    'jailbreak.detect',
    'profanity.detect',
    'toxicity.detect',
    'harmful_instructions.detect'
  );
