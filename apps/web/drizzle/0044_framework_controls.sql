-- Generalize per-tenant requirement tracking from the EU AI Act to every
-- framework in src/lib/frameworks. Existing rows keep working as 'eu-ai-act'.
ALTER TABLE IF EXISTS "eu_ai_act_controls" RENAME TO "framework_controls";
--> statement-breakpoint
ALTER TABLE "framework_controls" ADD COLUMN IF NOT EXISTS "framework" text DEFAULT 'eu-ai-act' NOT NULL;
--> statement-breakpoint
ALTER TABLE "framework_controls" DROP CONSTRAINT IF EXISTS "eu_ai_act_controls_pkey";
--> statement-breakpoint
ALTER TABLE "framework_controls" DROP CONSTRAINT IF EXISTS "framework_controls_pkey";
--> statement-breakpoint
ALTER TABLE "framework_controls" ADD CONSTRAINT "framework_controls_pkey" PRIMARY KEY ("tenant_id", "framework", "control_key");
--> statement-breakpoint
-- Library entries for frameworks that had no policy yet.
INSERT INTO "policy_center" (
  "id", "name", "description", "full_description", "category", "country", "state",
  "tags", "icon", "color", "type", "purpose", "scope", "requirements",
  "risk_categories", "industries_affected", "governing_authority", "effective_date",
  "version", "legal_status", "official_url", "references", "disable", "metadata", "isActive"
) VALUES
('10000000-0000-4000-8000-000000000019', 'Assessment List for Trustworthy AI',
 'European Commission self-assessment list that turns the seven requirements for trustworthy AI into practical checks.',
 'The Assessment List for Trustworthy AI (ALTAI) was published by the European Commission''s High-Level Expert Group on AI to help organizations self-assess AI systems against seven requirements: human agency and oversight; technical robustness and safety; privacy and data governance; transparency; diversity, non-discrimination and fairness; societal and environmental well-being; and accountability.',
 'Framework', 'European Union', NULL, ARRAY['ALTAI','trustworthy AI','self-assessment'], 'EU', 'bg-blue-700', 'Voluntary',
 'Help organizations assess whether AI systems meet the requirements for trustworthy AI.',
 'Organizations developing, deploying or procuring AI systems.',
 '["Ensure human agency and oversight","Assure technical robustness and safety","Protect privacy and govern data","Be transparent, fair and accountable, and consider societal and environmental impact"]'::jsonb,
 ARRAY['Trustworthy AI','Fairness','Transparency','Accountability'], ARRAY['All industries'], 'European Commission High-Level Expert Group on AI', '2020-07-17', 'ALTAI (2020)', 'Published guidance',
 'https://digital-strategy.ec.europa.eu/en/library/assessment-list-trustworthy-artificial-intelligence-altai-self-assessment', '[{"title":"European Commission ALTAI page","url":"https://digital-strategy.ec.europa.eu/en/library/assessment-list-trustworthy-artificial-intelligence-altai-self-assessment"}]'::jsonb, false,
 '{"libraryVersion":"2026.2","sourceType":"official","framework":"altai"}'::jsonb, false),

('10000000-0000-4000-8000-000000000020', 'FTC AI Guidance',
 'US Federal Trade Commission guidance and enforcement expectations for truthful, fair and accountable use of AI.',
 'The FTC applies Section 5 of the FTC Act (unfair or deceptive practices) and related laws such as FCRA and ECOA to AI. Its business guidance and enforcement actions set expectations for substantiated AI claims, fair outcomes, lawful data practices, transparency to consumers and accountability for AI tools.',
 'Guideline', 'United States', NULL, ARRAY['FTC','Section 5','consumer protection'], 'FTC', 'bg-indigo-700', 'Mandatory',
 'Prevent deceptive or unfair AI practices that harm consumers or competition.',
 'Businesses marketing, selling or using AI in US commerce.',
 '["Substantiate AI marketing and performance claims","Test for and prevent discriminatory or unfair outcomes","Honor privacy promises and use data lawfully","Disclose AI use and remain accountable for AI tools"]'::jsonb,
 ARRAY['Deception','Unfairness','Privacy','Discrimination'], ARRAY['All industries'], 'US Federal Trade Commission', NULL, 'FTC business guidance', 'Enforced under existing law',
 'https://www.ftc.gov/business-guidance/artificial-intelligence', '[{"title":"FTC business guidance on AI","url":"https://www.ftc.gov/business-guidance/artificial-intelligence"}]'::jsonb, false,
 '{"libraryVersion":"2026.2","sourceType":"official","framework":"ftc-ai"}'::jsonb, false),

('10000000-0000-4000-8000-000000000021', 'Texas Responsible AI Governance Act',
 'Texas law (HB 149) restricting certain AI uses and setting disclosure duties, enforced by the Texas Attorney General.',
 'The Texas Responsible Artificial Intelligence Governance Act (HB 149, 89th Legislature) prohibits developing or deploying AI for specified harmful purposes, requires governmental entities to disclose AI interactions to consumers, creates an AI regulatory sandbox and gives the Attorney General enforcement authority with a cure period.',
 'AI Regulation', 'United States', 'Texas', ARRAY['TRAIGA','HB 149','Texas'], 'TX', 'bg-red-700', 'Mandatory',
 'Prevent harmful AI uses while supporting responsible AI innovation in Texas.',
 'Persons developing or deploying AI systems in Texas, with additional duties for governmental entities.',
 '["Avoid prohibited AI uses","Disclose AI interactions where required","Maintain documentation for Attorney General inquiries","Align with recognized AI risk frameworks"]'::jsonb,
 ARRAY['Prohibited uses','Discrimination','Transparency'], ARRAY['All industries','Public sector'], 'Texas Attorney General', '2026-01-01', 'HB 149 (89th Legislature)', 'Enacted',
 'https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=HB149', '[{"title":"Texas Legislature HB 149","url":"https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=HB149"}]'::jsonb, false,
 '{"libraryVersion":"2026.2","sourceType":"official","framework":"texas-traiga"}'::jsonb, false),

('10000000-0000-4000-8000-000000000022', 'HIPAA Security Rule',
 'US federal rule requiring administrative, physical and technical safeguards for electronic protected health information.',
 'The HIPAA Security Rule (45 CFR Part 164, Subpart C) requires covered entities and business associates to protect the confidentiality, integrity and availability of electronic protected health information through risk analysis and management, administrative, physical and technical safeguards, organizational requirements and documentation.',
 'AI Regulation', 'United States', NULL, ARRAY['HIPAA','ePHI','healthcare'], 'HHS', 'bg-teal-700', 'Mandatory',
 'Protect electronic protected health information, including data processed by AI systems.',
 'Covered entities and business associates that create, receive, maintain or transmit ePHI.',
 '["Perform risk analysis and risk management","Implement administrative safeguards","Implement physical safeguards","Implement technical safeguards and keep documentation"]'::jsonb,
 ARRAY['Privacy','Security','Healthcare data'], ARRAY['Healthcare','Insurance'], 'US Department of Health and Human Services (OCR)', '2005-04-20', '45 CFR Part 164 Subpart C', 'In force',
 'https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C', '[{"title":"45 CFR Part 164 Subpart C (eCFR)","url":"https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C"}]'::jsonb, false,
 '{"libraryVersion":"2026.2","sourceType":"official","framework":"hipaa-security"}'::jsonb, false),

('10000000-0000-4000-8000-000000000023', 'PCI DSS Lite',
 'Condensed view of the PCI Data Security Standard goals and requirement areas for systems that handle payment card data.',
 'The Payment Card Industry Data Security Standard is maintained by the PCI Security Standards Council. This lite view tracks its six goals and twelve principal requirement areas at a high level, including how AI systems that touch cardholder data should be protected. Refer to the official standard for full requirements.',
 'Standard', 'International', NULL, ARRAY['PCI DSS','payment data','cardholder data'], 'PCI', 'bg-emerald-700', 'Mandatory',
 'Protect payment account data wherever it is stored, processed or transmitted.',
 'Organizations that store, process or transmit payment card data, and their service providers.',
 '["Build and maintain secure networks and systems","Protect account data","Manage vulnerabilities and enforce access control","Monitor, test and maintain security policies"]'::jsonb,
 ARRAY['Payment security','Access control','Cryptography'], ARRAY['Retail','Finance','E-commerce'], 'PCI Security Standards Council', NULL, 'PCI DSS v4.x (lite view)', 'Industry standard',
 'https://www.pcisecuritystandards.org/document_library/', '[{"title":"PCI SSC document library","url":"https://www.pcisecuritystandards.org/document_library/"}]'::jsonb, false,
 '{"libraryVersion":"2026.2","sourceType":"official","framework":"pci-dss-lite"}'::jsonb, false),

('10000000-0000-4000-8000-000000000024', 'AI Ethics & Governance Framework',
 'NORIX baseline for ethical, accountable AI aligned with the NIST AI RMF and ISO/IEC 42001.',
 'A general-purpose AI ethics and governance baseline maintained by NORIX. It covers fairness, transparency, accountability, human oversight, privacy and security, robustness and monitoring, third-party AI and lifecycle and incident management, mapped to the NIST AI Risk Management Framework functions.',
 'Framework', 'International', NULL, ARRAY['AI ethics','governance','NIST AI RMF'], 'AIEG', 'bg-violet-700', 'Voluntary',
 'Give organizations a practical baseline for ethical and well-governed AI.',
 'Any organization developing or using AI systems.',
 '["Define AI governance roles, policy and inventory","Assess fairness, transparency and human oversight","Secure AI systems and protect privacy","Monitor AI in production and manage incidents"]'::jsonb,
 ARRAY['Governance','Fairness','Transparency','Security'], ARRAY['All industries'], 'NORIX', NULL, '1.0', 'Internal baseline',
 'https://www.nist.gov/itl/ai-risk-management-framework', '[{"title":"NIST AI Risk Management Framework","url":"https://www.nist.gov/itl/ai-risk-management-framework"}]'::jsonb, false,
 '{"libraryVersion":"2026.2","sourceType":"norix","framework":"ai-ethics-governance"}'::jsonb, false)
ON CONFLICT ("id") DO NOTHING;
