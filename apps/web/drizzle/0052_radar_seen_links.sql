-- AI Radar reports only what is new since its baseline: remember which links each source already showed.
ALTER TABLE "radar_source_snapshots" ADD COLUMN IF NOT EXISTS "seen_keys" text[] DEFAULT '{}' NOT NULL;
