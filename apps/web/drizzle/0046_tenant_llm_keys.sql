-- BYOK: per-tenant LLM provider + model + API key (AES-256-GCM encrypted, see lib/server/crypto).
CREATE TABLE IF NOT EXISTS "tenant_llm_keys" (
  "tenant_id" text NOT NULL,
  "provider" text NOT NULL,
  "model_id" text NOT NULL,
  "key_encrypted" text NOT NULL,
  "key_last4" text NOT NULL,
  "updated_by" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_llm_keys_pkey" PRIMARY KEY ("tenant_id", "provider", "model_id")
);
--> statement-breakpoint
-- Let provider_models register the new BYOK providers.
ALTER TYPE "provider" ADD VALUE IF NOT EXISTS 'openrouter';
--> statement-breakpoint
ALTER TYPE "provider" ADD VALUE IF NOT EXISTS 'mistral';
--> statement-breakpoint
ALTER TYPE "provider" ADD VALUE IF NOT EXISTS 'xai';
--> statement-breakpoint
ALTER TYPE "provider" ADD VALUE IF NOT EXISTS 'deepseek';
