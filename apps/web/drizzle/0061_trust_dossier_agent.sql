-- Trust Dossier agent: weekly sub-processor research. Idempotent.
CREATE TABLE IF NOT EXISTS "trust_dossier_runs" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "trigger" text NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "model" text,
  "triggered_by" text,
  "vendors_checked" integer DEFAULT 0 NOT NULL,
  "vendors_updated" integer DEFAULT 0 NOT NULL,
  "health" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone
);

-- Latest verified sub-processor list per vendor; overrides the static catalog.
CREATE TABLE IF NOT EXISTS "trust_dossier_subprocessors" (
  "vendor_slug" text PRIMARY KEY NOT NULL,
  "subprocessors" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "source_url" text NOT NULL,
  "source_hash" text,
  "list_updated_on" date,
  "last_checked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_error" text
);
