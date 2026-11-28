-- Shadow AI governance: one row per AI tool a tenant has seen (label, risk override, block),
-- a daily machine count per tool for trends, and append-only Shadow AI audit records.

CREATE TABLE IF NOT EXISTS "shadow_ai_tools" (
  "tenant_id" text NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "status" text DEFAULT 'unknown' NOT NULL,
  "status_reason" text,
  "risk_override" integer,
  "risk_reason" text,
  "alternative" text,
  "blocked_at" timestamp with time zone,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "shadow_ai_tools_pk" PRIMARY KEY ("tenant_id", "name"),
  CONSTRAINT "shadow_ai_tools_status_check"
    CHECK ("status" IN ('sanctioned', 'tolerated', 'unsanctioned', 'unknown')),
  CONSTRAINT "shadow_ai_tools_risk_check" CHECK ("risk_override" BETWEEN 0 AND 100)
);

CREATE TABLE IF NOT EXISTS "shadow_ai_daily" (
  "tenant_id" text NOT NULL,
  "day" date NOT NULL,
  "name" text NOT NULL,
  "machines" integer NOT NULL,
  CONSTRAINT "shadow_ai_daily_pk" PRIMARY KEY ("tenant_id", "day", "name")
);

-- Audit evidence: Shadow AI records in audit_events can be added, never changed or removed.
CREATE OR REPLACE FUNCTION shadow_ai_audit_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.action LIKE 'shadow_ai.%' THEN
    RAISE EXCEPTION 'Shadow AI audit records are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shadow_ai_audit_immutable ON "audit_events";
CREATE TRIGGER shadow_ai_audit_immutable BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION shadow_ai_audit_immutable();
