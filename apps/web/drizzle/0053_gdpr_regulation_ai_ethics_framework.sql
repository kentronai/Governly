-- GDPR is a regulation: add it to the Regulations library (it was a catalog "framework").
-- AI Ethics & Governance is a framework: it is now enabled from the Frameworks library
-- (tenant_frameworks) instead of the Regulations library (policy_center).
INSERT INTO "policy_center" (
  "id", "name", "description", "full_description", "category", "country", "state",
  "tags", "icon", "color", "type", "purpose", "scope", "requirements",
  "risk_categories", "industries_affected", "governing_authority", "effective_date",
  "version", "legal_status", "official_url", "references", "disable", "metadata", "isActive"
) VALUES
('10000000-0000-4000-8000-000000000025', 'GDPR',
 'EU General Data Protection Regulation governing the processing of personal data, including by AI systems.',
 'The General Data Protection Regulation (Regulation (EU) 2016/679) is the EU law governing how personal data of people in the EU is collected, used and protected. It requires a lawful basis, data-subject rights, security, breach notification and accountability, and applies to AI systems that process personal data. Fines reach up to 4% of global annual turnover.',
 'AI Regulation', 'European Union', NULL, ARRAY['GDPR','privacy','personal data'], 'GDPR', 'bg-blue-800', 'Mandatory',
 'Protect the personal data and privacy rights of individuals in the EU.',
 'Organizations that process personal data of people in the EU, wherever they are established.',
 '["Have a lawful basis for processing personal data","Honour data-subject rights (access, erasure, objection, automated decisions)","Secure personal data and notify breaches","Carry out data protection impact assessments for high-risk processing"]'::jsonb,
 ARRAY['Privacy','Data protection','Automated decision-making'], ARRAY['All industries'], 'European Data Protection Board and national authorities', '2018-05-25', 'Regulation (EU) 2016/679', 'In force',
 'https://eur-lex.europa.eu/eli/reg/2016/679/oj', '[{"title":"Regulation (EU) 2016/679 (EUR-Lex)","url":"https://eur-lex.europa.eu/eli/reg/2016/679/oj"}]'::jsonb, false,
 '{"libraryVersion":"2026.3","sourceType":"official"}'::jsonb, false)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
-- Tenants that had GDPR enabled as a framework keep it, now as a regulation.
INSERT INTO "policy_center" (
  "name", "description", "category", "country", "state", "projects_compliant", "total_projects",
  "tags", "icon", "color", "type", "full_description", "purpose", "scope", "requirements",
  "risk_categories", "industries_affected", "governing_authority", "effective_date", "version",
  "legal_status", "official_url", "references", "control_mappings", "applicability_rules",
  "disable", "metadata", "parent_policy_id", "tenant_id", "isActive"
)
SELECT p."name", p."description", p."category", p."country", p."state", p."projects_compliant", p."total_projects",
  p."tags", p."icon", p."color", p."type", p."full_description", p."purpose", p."scope", p."requirements",
  p."risk_categories", p."industries_affected", p."governing_authority", p."effective_date", p."version",
  p."legal_status", p."official_url", p."references", p."control_mappings", p."applicability_rules",
  p."disable", p."metadata", p."id"::text, tf."tenant_id", true
FROM "tenant_frameworks" tf
JOIN "policy_center" p ON p."id" = '10000000-0000-4000-8000-000000000025'
WHERE tf."slug" = 'gdpr'
  AND NOT EXISTS (
    SELECT 1 FROM "policy_center" t WHERE t."tenant_id" = tf."tenant_id" AND t."parent_policy_id" = p."id"::text
  );
--> statement-breakpoint
DELETE FROM "tenant_frameworks" WHERE "slug" = 'gdpr';
--> statement-breakpoint
-- Tenants that had AI Ethics & Governance enabled as a policy keep it, now as a framework.
INSERT INTO "tenant_frameworks" ("tenant_id", "slug", "enabled_by")
SELECT DISTINCT t."tenant_id", 'ai-ethics-governance', 'migration'
FROM "policy_center" t
WHERE t."parent_policy_id" = '10000000-0000-4000-8000-000000000024'
  AND t."tenant_id" IS NOT NULL AND t."isActive" = true
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "policy_center" SET "isActive" = false
WHERE "parent_policy_id" = '10000000-0000-4000-8000-000000000024' AND "tenant_id" IS NOT NULL;
