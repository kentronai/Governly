-- Flip `enable_install` on for every global guardrail that has real,
-- working detection code behind it but was never marked installable in the
-- marketplace UI (apps/web/src/components/control-net/MarketplaceBrowser.tsx
-- shows "Coming Soon" whenever enable_install is false/null, regardless of
-- whether the guard actually works).
--
-- Two groups, both confirmed to have a matching @guard(...) factory in
-- apps/controlnet/guard_packs/ before this migration was written:
--
-- 1. The 16 formatting/validation guards seeded by migration 0036
--    (formatting.json/xml/csv/url/email, validation.contains_string/
--    not_contains_string/ends_with/lowercase/uppercase/one_line/
--    reading_time/regex_match/valid_choices/valid_length/valid_range).
--    That migration's INSERT never set enable_install at all, so every row
--    defaulted to false.
--
-- 2. Five guardrails seeded by apps/web/scripts/seed-marketplace.ts
--    (pii.redact, business.competitor_protection, business.brand_tone,
--    tools.allowlist, tools.denylist) that previously had catalog rows with
--    no backing Python implementation - they are implemented now
--    (guard_packs/default_guardrails/guards.py:pii_redact,
--    guard_packs/business/guards.py, guard_packs/tools/guards.py) and
--    registered in cga_core/__init__.py.
--
-- Idempotent: a plain UPDATE ... WHERE key IN (...) is a no-op if re-run.

UPDATE "guardrails"
SET
  "enable_install" = true,
  "updated_at" = NOW()
WHERE "tenant_id" IS NULL
  AND "is_global" = true
  AND "deleted_at" IS NULL
  AND "key" IN (
    'formatting.json',
    'formatting.xml',
    'formatting.csv',
    'formatting.url',
    'formatting.email',
    'validation.contains_string',
    'validation.not_contains_string',
    'validation.ends_with',
    'validation.lowercase',
    'validation.uppercase',
    'validation.one_line',
    'validation.reading_time',
    'validation.regex_match',
    'validation.valid_choices',
    'validation.valid_length',
    'validation.valid_range',
    'pii.redact',
    'business.competitor_protection',
    'business.brand_tone',
    'tools.allowlist',
    'tools.denylist'
  );

-- business.brand_tone changed from a pure-regex T0 guard to a T1 guard that
-- also runs a sentence-embedding model (guard_packs/business/guards.py).
-- Keep the catalog's tier/performance_budget_ms columns honest about that -
-- they are display metadata only (the compiler takes tier from the Python
-- @guard(...) decorator, not this row), but a stale T0/10ms label here would
-- misrepresent the guard's real cost to anyone reading the marketplace.
UPDATE "guardrails"
SET
  "tier" = 'T1'::guard_tier,
  "performance_budget_ms" = 100.000,
  "updated_at" = NOW()
WHERE "tenant_id" IS NULL
  AND "is_global" = true
  AND "deleted_at" IS NULL
  AND "key" = 'business.brand_tone';
