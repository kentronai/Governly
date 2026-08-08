-- Seed the provider model catalog that powers every "pick a model" dropdown.
--
-- `provider_model_metadata` is read by `getModelsByProvider()`
-- (apps/web/src/lib/actions/model-register.ts), which backs two selects:
--   * Model Registry -> "Add Model" -> Model Name
--   * Applications -> GoviQ -> Models Info -> Technical Detail -> Model
--
-- The table was created in migration 0000 and given a `model_id` column in
-- 0004, but nothing has ever inserted a row into it. Production and every dev
-- database therefore had 0 rows, so selecting OpenAI / Anthropic / Google
-- always rendered "No models available" and a user could never register a
-- model for those providers at all.
--
-- This seeds the catalog for the providers the UI actually offers. It is
-- reference metadata only: no tenant data, no runtime behaviour, and nothing
-- is selected or enforced as a result of running it.
--
-- Idempotent: a NOT EXISTS guard on (provider, model_id) makes a re-run a
-- no-op, and rows an operator has edited or removed are left alone.
--
-- Costs are USD per 1M tokens. `gemini` is the provider NORIX can actually
-- execute in Playground (see apps/web/src/lib/server/model-registry/providers.ts);
-- `vertex` is registered for governance only.

WITH seed ("provider", "model_id", "display_name", "context_window", "input_cost", "output_cost") AS (
  VALUES
    -- OpenAI -------------------------------------------------------------
    ('openai',    'gpt-5',                'GPT-5',                     '400000',  '1.25',  '10.00'),
    ('openai',    'gpt-5-mini',           'GPT-5 mini',                '400000',  '0.25',  '2.00'),
    ('openai',    'gpt-4.1',              'GPT-4.1',                   '1047576', '2.00',  '8.00'),
    ('openai',    'gpt-4.1-mini',         'GPT-4.1 mini',              '1047576', '0.40',  '1.60'),
    ('openai',    'gpt-4o',               'GPT-4o',                    '128000',  '2.50',  '10.00'),
    ('openai',    'gpt-4o-mini',          'GPT-4o mini',               '128000',  '0.15',  '0.60'),
    ('openai',    'o3',                   'o3',                        '200000',  '2.00',  '8.00'),
    ('openai',    'o4-mini',              'o4-mini',                   '200000',  '1.10',  '4.40'),

    -- Anthropic ----------------------------------------------------------
    ('anthropic', 'claude-opus-5',        'Claude Opus 5',             '1000000', '5.00',  '25.00'),
    ('anthropic', 'claude-opus-4-8',      'Claude Opus 4.8',           '1000000', '5.00',  '25.00'),
    ('anthropic', 'claude-opus-4-7',      'Claude Opus 4.7',           '1000000', '5.00',  '25.00'),
    ('anthropic', 'claude-sonnet-5',      'Claude Sonnet 5',           '1000000', '3.00',  '15.00'),
    ('anthropic', 'claude-sonnet-4-6',    'Claude Sonnet 4.6',         '1000000', '3.00',  '15.00'),
    ('anthropic', 'claude-haiku-4-5',     'Claude Haiku 4.5',          '200000',  '1.00',  '5.00'),

    -- Google Gemini (OpenAI-compatible endpoint — executable in Playground)
    ('gemini',    'gemini-3.6-flash',     'Gemini 3.6 Flash',          '1000000', '0.30',  '2.50'),
    ('gemini',    'gemini-3.6-pro',       'Gemini 3.6 Pro',            '1000000', '1.25',  '10.00'),
    ('gemini',    'gemini-2.5-flash',     'Gemini 2.5 Flash',          '1048576', '0.30',  '2.50'),
    ('gemini',    'gemini-2.5-pro',       'Gemini 2.5 Pro',            '1048576', '1.25',  '10.00'),

    -- Google Vertex AI (governance only) ---------------------------------
    ('vertex',    'gemini-2.5-pro',       'Gemini 2.5 Pro (Vertex)',   '1048576', '1.25',  '10.00'),
    ('vertex',    'gemini-2.5-flash',     'Gemini 2.5 Flash (Vertex)', '1048576', '0.30',  '2.50'),
    ('vertex',    'gemini-2.0-flash',     'Gemini 2.0 Flash (Vertex)', '1048576', '0.10',  '0.40')
)
INSERT INTO "provider_model_metadata"
  ("provider", "model_id", "display_name", "context_window", "input_cost", "output_cost")
SELECT
  seed."provider"::"provider",
  seed."model_id",
  seed."display_name",
  seed."context_window",
  seed."input_cost",
  seed."output_cost"
FROM seed
WHERE NOT EXISTS (
  SELECT 1
  FROM "provider_model_metadata" existing
  WHERE existing."provider" = seed."provider"::"provider"
    AND existing."model_id" = seed."model_id"
);
