-- Backfill canonical provider endpoint URLs for rows currently missing one.
-- IMPORTANT: the provider strings below are the VALID values of the Drizzle
-- `provider` pg enum (schema.ts): {openai, anthropic, bedrock, groq, vertex,
-- ollama, azure_openai, huggingface, custom}. Only providers with a known
-- public endpoint are mapped here. 'vertex' is Kentron's enum value for Google
-- (the seed's gemini-pro row uses provider='vertex'); it is pointed at the
-- Gemini generativelanguage API to match the gateway's intent.
-- Providers with no canonical single endpoint (bedrock/ollama/huggingface/custom)
-- are intentionally NOT mapped: if an `available` row with one of those exists
-- and has a NULL model_url, the CHECK constraint below will fail the migration
-- LOUDLY rather than route it to a wrong endpoint. Run the pre-check query first
-- (see plan Task 4a) to confirm every NULL-url available row is in this CASE.
UPDATE "provider_models" SET "model_url" = CASE "provider"::text
  WHEN 'openai'       THEN 'https://api.openai.com/v1'
  WHEN 'anthropic'    THEN 'https://api.anthropic.com'
  WHEN 'groq'         THEN 'https://api.groq.com/openai/v1'
  WHEN 'azure_openai' THEN 'https://api.openai.azure.com'
  WHEN 'vertex'       THEN 'https://generativelanguage.googleapis.com/v1beta'
END
WHERE "model_url" IS NULL OR "model_url" = '';
--> statement-breakpoint
ALTER TABLE "provider_models" ADD CONSTRAINT "chk_provider_models_url_when_available" CHECK ("availability_status" <> 'available' OR "model_url" IS NOT NULL);
