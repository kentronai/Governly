-- Self-hosted Nango handles auth/credentials for migrated providers. NORIX
-- stores only a pointer to the Nango connection; the secret lives in the
-- Nango vault. Nullable so existing direct-path rows (e.g. AWS) are unaffected.
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "nango_connection_id" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "nango_provider_config_key" text;
