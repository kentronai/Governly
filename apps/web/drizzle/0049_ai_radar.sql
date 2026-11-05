-- AI Radar: regulatory-intelligence agent (runs every 3 days, see /api/cron/ai-radar).
-- coverage_registry: one row per monitored jurisdiction. Absent = unmonitored.
CREATE TABLE IF NOT EXISTS "radar_coverage" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "jurisdiction_name" text NOT NULL,
  "tier" integer DEFAULT 2 NOT NULL,
  "instruments_tracked" text,
  "primary_source_urls" text[] DEFAULT '{}' NOT NULL,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "last_verified_date" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "radar_coverage_jurisdiction_unique" UNIQUE ("jurisdiction_name"),
  CONSTRAINT "radar_coverage_tier_check" CHECK ("tier" IN (1, 2, 3))
);
--> statement-breakpoint
-- Last-seen content hash per source page; a changed hash is what wakes the model.
CREATE TABLE IF NOT EXISTS "radar_source_snapshots" (
  "coverage_id" uuid NOT NULL,
  "url" text NOT NULL,
  "content_hash" text,
  "last_fetched_at" timestamp with time zone,
  "last_changed_at" timestamp with time zone,
  "last_status" text DEFAULT 'ok' NOT NULL,
  "last_error" text,
  CONSTRAINT "radar_source_snapshots_pkey" PRIMARY KEY ("coverage_id", "url"),
  CONSTRAINT "radar_source_snapshots_coverage_fk" FOREIGN KEY ("coverage_id") REFERENCES "radar_coverage"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "radar_runs" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "trigger" text NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "model" text,
  "triggered_by" text,
  "sources_checked" integer DEFAULT 0 NOT NULL,
  "sources_changed" integer DEFAULT 0 NOT NULL,
  "updates_applied" integer DEFAULT 0 NOT NULL,
  "updates_rejected" integer DEFAULT 0 NOT NULL,
  "health" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone
);
--> statement-breakpoint
-- Every change the agent applied. source_url + source_quote are mandatory:
-- no update exists without a primary-source citation.
CREATE TABLE IF NOT EXISTS "radar_updates" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "run_id" uuid,
  "coverage_id" uuid,
  "jurisdiction" text NOT NULL,
  "policy_id" uuid,
  "change_type" text NOT NULL,
  "title" text NOT NULL,
  "summary" text NOT NULL,
  "changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "effective_date" date,
  "source_url" text NOT NULL,
  "source_quote" text NOT NULL,
  "detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_radar_updates_detected" ON "radar_updates" ("detected_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_radar_runs_started" ON "radar_runs" ("started_at" DESC);
--> statement-breakpoint
-- Seed the registry from jurisdictions the Radar page already lists, using the
-- source URL those policies already cite. Operators refine tiers/sources in the UI.
INSERT INTO "radar_coverage" ("jurisdiction_name", "primary_source_urls")
SELECT "country", array_agg(DISTINCT "sources")
FROM "global_ai_policies"
WHERE "country" IS NOT NULL AND "country" <> ''
  AND "sources" ~* '^https?://\S+$'
GROUP BY "country"
ON CONFLICT ("jurisdiction_name") DO NOTHING;
