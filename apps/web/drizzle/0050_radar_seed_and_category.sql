-- AI Radar follow-up. (0049 is already applied in production, so these changes are a new migration.)
-- Topic of each policy (AI ethics, data protection, ...), set by the agent; powers the Category filter.
ALTER TABLE "global_ai_policies" ADD COLUMN IF NOT EXISTS "category" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_global_ai_policies_category" ON "global_ai_policies" ("category");
--> statement-breakpoint
-- Where policies the agent creates are filed (Region / Country / State filters).
ALTER TABLE "radar_coverage" ADD COLUMN IF NOT EXISTS "region" text;
--> statement-breakpoint
ALTER TABLE "radar_coverage" ADD COLUMN IF NOT EXISTS "country" text;
--> statement-breakpoint
ALTER TABLE "radar_coverage" ADD COLUMN IF NOT EXISTS "state" text;
--> statement-breakpoint
-- Starter coverage registry. Every URL was fetched live and returned real page text
-- before inclusion; each is an official government / intergovernmental page.
-- Operators extend this in Admin Center -> AI Radar -> Coverage. Never overwrites edits.
INSERT INTO "radar_coverage" ("jurisdiction_name", "tier", "region", "country", "state", "instruments_tracked", "primary_source_urls")
VALUES
  ('European Union', 1, 'Europe', 'European Union', NULL, 'AI Act (Reg. 2024/1689), implementing acts, guidelines, AI Office guidance', ARRAY['https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai', 'https://digital-strategy.ec.europa.eu/en/policies/european-approach-artificial-intelligence']),
  ('United States', 1, 'North America', 'United States', NULL, 'Federal AI executive orders, agency rules and guidance (Federal Register), NIST, FTC', ARRAY['https://www.federalregister.gov/api/v1/documents.json?conditions[term]=%22artificial+intelligence%22&order=newest&per_page=20', 'https://www.nist.gov/artificial-intelligence', 'https://www.ftc.gov/industry/technology/artificial-intelligence']),
  ('United Kingdom', 1, 'Europe', 'United Kingdom', NULL, 'AI regulation policy, AI bills, regulator guidance (gov.uk)', ARRAY['https://www.gov.uk/api/search.json?q=artificial+intelligence&order=-public_timestamp&count=20', 'https://www.gov.uk/government/publications/ai-regulation-a-pro-innovation-approach']),
  ('China', 1, 'Asia-Pacific', 'China', NULL, 'Generative AI measures, algorithm and deep-synthesis rules, CAC regulations', ARRAY['http://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm']),
  ('Canada', 1, 'North America', 'Canada', NULL, 'AIDA / Bill C-27 and federal AI guidance', ARRAY['https://ised-isde.canada.ca/site/innovation-better-canada/en/artificial-intelligence-and-data-act', 'https://www.parl.ca/legisinfo/en/bill/44-1/c-27']),
  ('Brazil', 2, 'Latin America', 'Brazil', NULL, 'PL 2338/2023 AI framework bill and MCTI AI strategy', ARRAY['https://www.gov.br/mcti/pt-br/acompanhe-o-mcti/transformacaodigital/inteligencia-artificial', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/157233']),
  ('Saudi Arabia', 2, 'Middle East', 'Saudi Arabia', NULL, 'SDAIA AI ethics principles and regulations', ARRAY['https://sdaia.gov.sa/en/SDAIA/about/Pages/AboutAI.aspx']),
  ('OECD', 2, 'Global', 'OECD', NULL, 'OECD AI Principles', ARRAY['https://oecd.ai/en/ai-principles']),
  ('UNESCO', 2, 'Global', 'UNESCO', NULL, 'Recommendation on the Ethics of AI', ARRAY['https://www.unesco.org/en/artificial-intelligence/recommendation-ethics']),
  ('International Standards', 2, 'Global', 'International', NULL, 'NIST AI RMF and related standards', ARRAY['https://www.nist.gov/itl/ai-risk-management-framework']),
  ('United States — Colorado', 1, 'North America', 'United States', 'Colorado', 'SB24-205 Colorado AI Act', ARRAY['https://leg.colorado.gov/bills/sb24-205']),
  ('United States — Texas', 2, 'North America', 'United States', 'Texas', 'HB 149 Texas Responsible AI Governance Act', ARRAY['https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=HB149']),
  ('United States — New York City', 2, 'North America', 'United States', 'New York', 'Local Law 144 automated employment decision tools', ARRAY['https://www.nyc.gov/site/dca/about/automated-employment-decision-tools.page'])
ON CONFLICT ("jurisdiction_name") DO NOTHING;
