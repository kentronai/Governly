-- Laws that were listed as catalog "frameworks" (CCPA, DORA, UAE/Saudi/Qatar/Bahrain data
-- protection laws, Quebec Law 25) move to the Regulations library (policy_center).
-- Voluntary standards and guidance that were listed as regulations (ISO/IEC 23894, OECD,
-- UNESCO, EEOC, FTC, UK, Australia, AI Verify, ALTAI, PCI DSS Lite) move to the Frameworks
-- library (tenant_frameworks). Saved control answers are keyed by framework slug and are untouched.
INSERT INTO "policy_center" (
  "id", "name", "description", "full_description", "category", "country", "state",
  "tags", "icon", "color", "type", "purpose", "scope", "requirements",
  "risk_categories", "industries_affected", "governing_authority", "effective_date",
  "version", "legal_status", "official_url", "references", "disable", "metadata", "isActive"
) VALUES
('10000000-0000-4000-8000-000000000026', 'CCPA',
 'California law giving residents rights over their personal data, with rules on automated decision-making that affect AI use.',
 'The California Consumer Privacy Act (Cal. Civ. Code 1798.100 et seq., as amended by the CPRA) gives California residents the rights to know, delete, correct and opt out of the sale or sharing of their personal data. It applies to qualifying businesses and includes rules on automated decision-making technology and risk assessments that affect AI use.',
 'AI Regulation', 'United States', 'California', ARRAY['CCPA','CPRA','privacy','personal data'], 'CCPA', 'bg-amber-700', 'Mandatory',
 'Protect the personal data and privacy rights of California residents.',
 'For-profit businesses that meet the CCPA thresholds and handle personal data of California residents.',
 '["Tell consumers what personal data is collected and why","Honour rights to know, delete, correct and opt out of sale or sharing","Limit use of sensitive personal information","Assess risks and give notice for automated decision-making"]'::jsonb,
 ARRAY['Privacy','Data protection','Automated decision-making'], ARRAY['All industries'], 'California Privacy Protection Agency and California Attorney General', '2020-01-01', 'Cal. Civ. Code 1798.100 et seq. (as amended by CPRA)', 'In force',
 'https://oag.ca.gov/privacy/ccpa', '[{"title":"California Attorney General: CCPA","url":"https://oag.ca.gov/privacy/ccpa"}]'::jsonb, false,
 '{"libraryVersion":"2026.4","sourceType":"official"}'::jsonb, false),

('10000000-0000-4000-8000-000000000027', 'DORA',
 'EU regulation on digital operational resilience for financial entities and their critical ICT providers.',
 'The Digital Operational Resilience Act (Regulation (EU) 2022/2554) requires financial entities and their critical ICT providers to manage ICT risk, report incidents, test resilience and oversee third-party providers. It applies to AI systems that are part of a financial entity''s ICT estate.',
 'AI Regulation', 'European Union', NULL, ARRAY['DORA','ICT risk','financial services'], 'DORA', 'bg-sky-700', 'Mandatory',
 'Make the EU financial sector resilient to ICT disruption and cyber threats.',
 'Financial entities in the EU and the ICT third-party providers that serve them.',
 '["Maintain an ICT risk management framework","Report major ICT-related incidents","Test digital operational resilience","Manage ICT third-party risk"]'::jsonb,
 ARRAY['ICT risk','Operational resilience','Third-party risk'], ARRAY['Financial services','Insurance'], 'European Supervisory Authorities (EBA, EIOPA, ESMA) and national competent authorities', '2025-01-17', 'Regulation (EU) 2022/2554', 'In force',
 'https://eur-lex.europa.eu/eli/reg/2022/2554/oj', '[{"title":"Regulation (EU) 2022/2554 (EUR-Lex)","url":"https://eur-lex.europa.eu/eli/reg/2022/2554/oj"}]'::jsonb, false,
 '{"libraryVersion":"2026.4","sourceType":"official"}'::jsonb, false),

('10000000-0000-4000-8000-000000000028', 'UAE Personal Data Protection Law',
 'UAE federal law regulating the processing of personal data, including by AI systems.',
 'The UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021) regulates processing of personal data in the UAE. It sets consent, transparency, data-subject rights, security and cross-border transfer rules, and is complemented by national AI guidance.',
 'AI Regulation', 'United Arab Emirates', NULL, ARRAY['PDPL','UAE','privacy','personal data'], 'UAE', 'bg-red-700', 'Mandatory',
 'Protect the personal data and privacy rights of individuals in the UAE.',
 'Controllers and processors of personal data of people in the UAE, outside free zones with their own regimes.',
 '["Have a lawful basis such as consent for processing","Honour data-subject rights","Secure personal data and notify breaches","Follow cross-border transfer rules"]'::jsonb,
 ARRAY['Privacy','Data protection','Cross-border transfers'], ARRAY['All industries'], 'UAE Data Office', '2022-01-02', 'Federal Decree-Law No. 45 of 2021', 'In force',
 'https://uaelegislation.gov.ae', '[{"title":"UAE Legislation portal","url":"https://uaelegislation.gov.ae"}]'::jsonb, false,
 '{"libraryVersion":"2026.4","sourceType":"official"}'::jsonb, false),

('10000000-0000-4000-8000-000000000029', 'Saudi Arabia Personal Data Protection Law',
 'Saudi law governing the collection and processing of personal data, enforced by SDAIA.',
 'Saudi Arabia''s Personal Data Protection Law (Royal Decree M/19 of 2021), enforced by the Saudi Data & AI Authority (SDAIA), governs the collection and processing of personal data, including consent, individual rights and cross-border transfers. SDAIA also publishes AI ethics principles that apply to AI systems.',
 'AI Regulation', 'Saudi Arabia', NULL, ARRAY['PDPL','Saudi Arabia','SDAIA','privacy'], 'KSA', 'bg-green-700', 'Mandatory',
 'Protect the personal data and privacy rights of individuals in Saudi Arabia.',
 'Entities that process personal data of individuals in Saudi Arabia, including from outside the Kingdom.',
 '["Have a legal basis such as consent for processing","Honour individual rights","Secure personal data and report breaches","Follow cross-border transfer conditions"]'::jsonb,
 ARRAY['Privacy','Data protection','Cross-border transfers'], ARRAY['All industries'], 'Saudi Data & AI Authority (SDAIA)', '2023-09-14', 'Royal Decree M/19 of 2021', 'In force',
 'https://sdaia.gov.sa', '[{"title":"SDAIA","url":"https://sdaia.gov.sa"}]'::jsonb, false,
 '{"libraryVersion":"2026.4","sourceType":"official"}'::jsonb, false),

('10000000-0000-4000-8000-000000000030', 'Qatar Personal Data Privacy Law',
 'Qatar law on personal data privacy, operating alongside the national AI policy.',
 'Qatar Law No. 13 of 2016 regulates personal data privacy, setting rules for consent, purpose limitation, security and breach notification. It operates alongside Qatar''s national AI policy for responsible AI use.',
 'AI Regulation', 'Qatar', NULL, ARRAY['Qatar','privacy','personal data'], 'QA', 'bg-rose-800', 'Mandatory',
 'Protect the privacy of personal data in Qatar.',
 'Organizations that process personal data of individuals in Qatar.',
 '["Obtain consent and limit processing to stated purposes","Secure personal data","Notify affected individuals and the regulator of breaches","Respect individual rights over their data"]'::jsonb,
 ARRAY['Privacy','Data protection'], ARRAY['All industries'], 'National Cyber Governance and Assurance Affairs (NCGAA)', NULL, 'Law No. 13 of 2016', 'In force',
 'https://www.ncsa.gov.qa', '[{"title":"Qatar National Cyber Security Agency","url":"https://www.ncsa.gov.qa"}]'::jsonb, false,
 '{"libraryVersion":"2026.4","sourceType":"official"}'::jsonb, false),

('10000000-0000-4000-8000-000000000031', 'Bahrain Personal Data Protection Law',
 'Bahrain law on lawful processing, data-subject rights and transfers of personal data.',
 'Bahrain''s Personal Data Protection Law (Law No. 30 of 2018) sets rules for lawful processing, data-subject rights, security and international transfers of personal data, and is supported by regulator guidance relevant to AI.',
 'AI Regulation', 'Bahrain', NULL, ARRAY['PDPL','Bahrain','privacy','personal data'], 'BH', 'bg-red-800', 'Mandatory',
 'Protect the personal data and privacy rights of individuals in Bahrain.',
 'Organizations that process personal data of individuals in Bahrain.',
 '["Process personal data lawfully and fairly","Honour data-subject rights","Secure personal data and report breaches","Follow international transfer rules"]'::jsonb,
 ARRAY['Privacy','Data protection','Cross-border transfers'], ARRAY['All industries'], 'Personal Data Protection Authority (PDPA)', '2019-08-01', 'Law No. 30 of 2018', 'In force',
 'https://www.pdp.gov.bh', '[{"title":"Bahrain Personal Data Protection Authority","url":"https://www.pdp.gov.bh"}]'::jsonb, false,
 '{"libraryVersion":"2026.4","sourceType":"official"}'::jsonb, false),

('10000000-0000-4000-8000-000000000032', 'Quebec Law 25',
 'Quebec''s modernized private-sector privacy law, including rules on automated decisions.',
 'Quebec''s Law 25 modernizes its private-sector privacy law. It requires privacy impact assessments, consent, breach reporting, and transparency when decisions are made solely by automated processing, which directly affects AI systems using personal information.',
 'AI Regulation', 'Canada', 'Quebec', ARRAY['Law 25','Quebec','privacy','automated decisions'], 'QC', 'bg-blue-600', 'Mandatory',
 'Protect personal information held by private-sector organizations in Quebec.',
 'Private-sector enterprises that collect, hold or use personal information of people in Quebec.',
 '["Run privacy impact assessments for new systems","Obtain clear consent and be transparent","Report confidentiality incidents","Inform people when decisions are based solely on automated processing"]'::jsonb,
 ARRAY['Privacy','Data protection','Automated decision-making'], ARRAY['All industries'], 'Commission d''accès à l''information du Québec', '2022-09-22', 'Law 25 (2021, c. 25)', 'In force',
 'https://www.cai.gouv.qc.ca', '[{"title":"Commission d''accès à l''information du Québec","url":"https://www.cai.gouv.qc.ca"}]'::jsonb, false,
 '{"libraryVersion":"2026.4","sourceType":"official"}'::jsonb, false)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
-- Tenants that had one of these laws enabled as a framework keep it, now as a regulation.
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
JOIN (VALUES
  ('ccpa', '10000000-0000-4000-8000-000000000026'),
  ('dora', '10000000-0000-4000-8000-000000000027'),
  ('uae-pdpl', '10000000-0000-4000-8000-000000000028'),
  ('saudi-pdpl', '10000000-0000-4000-8000-000000000029'),
  ('qatar-pdpl', '10000000-0000-4000-8000-000000000030'),
  ('bahrain-pdpl', '10000000-0000-4000-8000-000000000031'),
  ('quebec-law-25', '10000000-0000-4000-8000-000000000032')
) AS m(slug, pid) ON m.slug = tf."slug"
JOIN "policy_center" p ON p."id"::text = m.pid
WHERE NOT EXISTS (
  SELECT 1 FROM "policy_center" t WHERE t."tenant_id" = tf."tenant_id" AND t."parent_policy_id" = p."id"::text
);
--> statement-breakpoint
DELETE FROM "tenant_frameworks"
WHERE "slug" IN ('ccpa', 'dora', 'uae-pdpl', 'saudi-pdpl', 'qatar-pdpl', 'bahrain-pdpl', 'quebec-law-25');
--> statement-breakpoint
-- Tenants that had one of these as a policy keep it, now as a framework (same slug as its tracker).
INSERT INTO "tenant_frameworks" ("tenant_id", "slug", "enabled_by")
SELECT DISTINCT t."tenant_id", m.slug, 'migration'
FROM "policy_center" t
JOIN (VALUES
  ('10000000-0000-4000-8000-000000000003', 'iso-23894'),
  ('10000000-0000-4000-8000-000000000005', 'oecd-ai-principles'),
  ('10000000-0000-4000-8000-000000000006', 'unesco-ai-ethics'),
  ('10000000-0000-4000-8000-000000000012', 'eeoc-ada-ai'),
  ('10000000-0000-4000-8000-000000000015', 'uk-ai-white-paper'),
  ('10000000-0000-4000-8000-000000000016', 'australia-ai-ethics-principles'),
  ('10000000-0000-4000-8000-000000000017', 'ai-verify'),
  ('10000000-0000-4000-8000-000000000019', 'altai'),
  ('10000000-0000-4000-8000-000000000020', 'ftc-ai'),
  ('10000000-0000-4000-8000-000000000023', 'pci-dss-lite')
) AS m(pid, slug) ON t."parent_policy_id" = m.pid
WHERE t."tenant_id" IS NOT NULL AND t."isActive" = true
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "policy_center" SET "isActive" = false
WHERE "tenant_id" IS NOT NULL AND "parent_policy_id" IN (
  '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000012',
  '10000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000016',
  '10000000-0000-4000-8000-000000000017', '10000000-0000-4000-8000-000000000019',
  '10000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000023'
);
