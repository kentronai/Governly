CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO "risk_categories" (
  "name", "slug", "description", "severity", "tier_recommendation", "metadata"
)
VALUES
  ('PII', 'pii', 'Personal and sensitive information exposure', 'high', 'T0', '{"source":"norix_default_catalog"}'::jsonb),
  ('Jailbreak', 'jailbreak', 'Prompt injection and safety bypass attempts', 'critical', 'T1', '{"source":"norix_default_catalog"}'::jsonb),
  ('Profanity', 'profanity', 'Profane and offensive language', 'high', 'T0', '{"source":"norix_default_catalog"}'::jsonb),
  ('Toxicity', 'toxicity', 'Toxic, abusive, threatening, or hateful content', 'high', 'T1', '{"source":"norix_default_catalog"}'::jsonb),
  ('Harmful Instructions', 'harmful_instructions', 'Requests for actionable criminal or harmful instructions', 'critical', 'T0', '{"source":"norix_default_catalog"}'::jsonb)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "severity" = EXCLUDED."severity",
  "tier_recommendation" = EXCLUDED."tier_recommendation",
  "updated_at" = NOW();

WITH seed(
  "key", "category", "name", "description", "tier",
  "performance_budget_ms", "default_params", "function_name"
) AS (
  VALUES
    (
      'pii.detect',
      'pii',
      'PII Detection',
      'Detects and masks personal and sensitive information.',
      'T0',
      5.000,
      '{"types":null,"severity":"high","threshold":1.0,"anonymize_mode":"mask"}'::jsonb,
      'pii_detect'
    ),
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
      'toxicity.detect',
      'toxicity',
      'Toxicity Detection',
      'Detects toxic, abusive, threatening, and hateful content.',
      'T1',
      10.000,
      '{"severity":"high","threshold":0.5,"categories":null}'::jsonb,
      'toxicity_detect'
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

UPDATE "policies"
SET
  "yaml" = replace(
    replace(
      "yaml",
      E'\ncompose:',
      E'\n  - id: harmful_instructions.detect\n    target: messages[*].content\n    with:\n      threshold: 0.75\n      severity: "high"\n\ncompose:'
    ),
    'allOf(pii_detect, jailbreak_detect, profanity_detect, toxicity_detect)',
    'allOf(pii_detect, jailbreak_detect, profanity_detect, toxicity_detect, harmful_instructions_detect)'
  ),
  "updated_at" = NOW()
WHERE "metadata"->>'defaultProfile' = 'standard'
  AND "yaml" NOT LIKE '%harmful_instructions.detect%';

UPDATE "policies"
SET
  "yaml" = replace(
    replace(
      replace(
        "yaml",
        E'      severity: "high"\n      categories: ["moderate","severe"]',
        E'      severity: "critical"\n      categories: ["mild","moderate","severe"]'
      ),
      E'\ncompose:',
      E'\n  - id: harmful_instructions.detect\n    target: messages[*].content\n    with:\n      threshold: 0.45\n      severity: "critical"\n\ncompose:'
    ),
    'allOf(pii_detect, jailbreak_detect, profanity_detect, toxicity_detect)',
    'allOf(pii_detect, jailbreak_detect, profanity_detect, toxicity_detect, harmful_instructions_detect)'
  ),
  "updated_at" = NOW()
WHERE "metadata"->>'defaultProfile' = 'strict'
  AND "yaml" NOT LIKE '%harmful_instructions.detect%';

WITH policy_guard_config("profile", "guard_key", "order_index", "params") AS (
  VALUES
    ('standard', 'pii.detect', 0, '{}'::jsonb),
    ('standard', 'jailbreak.detect', 1, '{}'::jsonb),
    ('standard', 'profanity.detect', 2, '{}'::jsonb),
    ('standard', 'toxicity.detect', 3, '{}'::jsonb),
    ('standard', 'harmful_instructions.detect', 4, '{"threshold":0.75,"severity":"high"}'::jsonb),
    ('strict', 'pii.detect', 0, '{"threshold":1,"anonymize_mode":"mask","severity":"critical"}'::jsonb),
    ('strict', 'jailbreak.detect', 1, '{"threshold":0.25,"severity":"critical"}'::jsonb),
    ('strict', 'profanity.detect', 2, '{"threshold":1,"severity":"critical","categories":["mild","moderate","severe"]}'::jsonb),
    ('strict', 'toxicity.detect', 3, '{"threshold":0.3,"severity":"critical"}'::jsonb),
    ('strict', 'harmful_instructions.detect', 4, '{"threshold":0.45,"severity":"critical"}'::jsonb),
    ('development', 'jailbreak.detect', 0, '{"threshold":0.75,"severity":"high"}'::jsonb)
),
catalog AS (
  SELECT DISTINCT ON ("key") "id", "key"
  FROM "guardrails"
  WHERE "tenant_id" IS NULL
    AND "is_enabled" = true
    AND "deleted_at" IS NULL
  ORDER BY "key", "created_at"
)
INSERT INTO "policy_guardrails" (
  "tenant_id", "policy_id", "guardrail_id", "phase", "params",
  "order_index", "enabled", "created_by", "updated_by"
)
SELECT
  policy."tenant_id",
  policy."id",
  catalog."id",
  'input',
  config."params",
  config."order_index",
  true,
  policy."created_by",
  policy."updated_by"
FROM "policies" policy
JOIN policy_guard_config config
  ON config."profile" = policy."metadata"->>'defaultProfile'
JOIN catalog
  ON catalog."key" = config."guard_key"
WHERE policy."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "policy_guardrails" existing
    WHERE existing."policy_id" = policy."id"
      AND existing."guardrail_id" = catalog."id"
      AND existing."phase" = 'input'
  );
