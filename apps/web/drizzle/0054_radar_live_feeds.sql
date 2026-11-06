-- AI Radar reads dated official feeds/APIs (newest first) instead of diffing static pages.
ALTER TABLE "radar_updates" ADD COLUMN IF NOT EXISTS "instrument_type" text;
ALTER TABLE "radar_updates" ADD COLUMN IF NOT EXISTS "published_date" date;

-- Verified official, dated feeds (each returns the newest items with a publication date).
UPDATE "radar_coverage" SET "primary_source_urls" = ARRAY[
  'https://www.federalregister.gov/api/v1/documents.json?conditions[term]=%22artificial+intelligence%22&order=newest&per_page=40',
  'https://www.nist.gov/artificial-intelligence'
] WHERE "jurisdiction_name" = 'United States';

UPDATE "radar_coverage" SET "primary_source_urls" = ARRAY[
  'https://www.gov.uk/api/search.json?q=%22artificial+intelligence%22&filter_content_purpose_supergroup[]=policy_and_engagement&filter_content_purpose_supergroup[]=guidance_and_regulation&order=-public_timestamp&count=40&fields[]=title&fields[]=link&fields[]=public_timestamp&fields[]=description'
] WHERE "jurisdiction_name" = 'United Kingdom';

UPDATE "radar_coverage" SET "primary_source_urls" = ARRAY[
  'https://ec.europa.eu/commission/presscorner/api/rss?language=en&text=artificial%20intelligence',
  'https://digital-strategy.ec.europa.eu/en/rss.xml',
  'https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai'
] WHERE "jurisdiction_name" = 'European Union';

UPDATE "radar_coverage" SET "primary_source_urls" = ARRAY[
  'https://api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofindustry&sort=publishedDate&orderBy=desc&publishedDate%3E=2025-01-01&pick=50&format=atom&atomtitle=ISED'
] WHERE "jurisdiction_name" = 'Canada';

UPDATE "radar_coverage" SET "primary_source_urls" = ARRAY[
  'https://dadosabertos.camara.leg.br/api/v2/proposicoes?keywords=intelig%C3%AAncia%20artificial&ordem=DESC&ordenarPor=id&itens=30'
] WHERE "jurisdiction_name" = 'Brazil';

UPDATE "radar_coverage" SET "primary_source_urls" = ARRAY['https://www.cnil.fr/fr/rss.xml']
WHERE "jurisdiction_name" = 'France';
