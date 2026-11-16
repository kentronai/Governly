-- Short catalog number per source (IBM 1..n, MIT 1..n) shown in the picker instead of the raw
-- source id. Assigned once in source-id order and never renumbered; risks added by a later
-- catalog refresh get the next free numbers. Idempotent.
ALTER TABLE "risk_list" ADD COLUMN IF NOT EXISTS "catalog_no" integer;
UPDATE "risk_list" r SET "catalog_no" = n.no
FROM (
  SELECT id,
    (SELECT coalesce(max(catalog_no), 0) FROM risk_list m WHERE m.source = t.source)
      + row_number() OVER (PARTITION BY source ORDER BY source_id) AS no
  FROM risk_list t
  WHERE source IS NOT NULL AND catalog_no IS NULL
) n
WHERE r.id = n.id;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_risk_list_catalog_no" ON "risk_list" ("source", "catalog_no");
