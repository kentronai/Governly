-- AI Radar: add verified official sources that are dedicated to AI (AI pages, AI news feeds, AI laws and frameworks).
-- General news and law listings are left out on purpose. Every URL returned HTTP 200 with readable content when fetched.
-- URLs are appended to a jurisdiction's existing sources without removing or reordering them; re-running adds nothing twice.

INSERT INTO "radar_coverage" ("jurisdiction_name","tier","region","country","state","instruments_tracked") VALUES ('African Union',3,'Africa','African Union',NULL,'Continental AI strategy and AU policy') ON CONFLICT ("jurisdiction_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "radar_coverage" ("jurisdiction_name","tier","region","country","state","instruments_tracked") VALUES ('ITU',3,'Global','ITU',NULL,'ITU AI standards and AI for Good') ON CONFLICT ("jurisdiction_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "radar_coverage" ("jurisdiction_name","tier","region","country","state","instruments_tracked") VALUES ('United Nations',3,'Global','United Nations',NULL,'UN AI governance') ON CONFLICT ("jurisdiction_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "radar_coverage" ("jurisdiction_name","tier","region","country","state","instruments_tracked") VALUES ('WHO',3,'Global','WHO',NULL,'WHO guidance on AI for health') ON CONFLICT ("jurisdiction_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "radar_coverage" ("jurisdiction_name","tier","region","country","state","instruments_tracked") VALUES ('WIPO',3,'Global','WIPO',NULL,'WIPO AI and intellectual property') ON CONFLICT ("jurisdiction_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "radar_coverage" ("jurisdiction_name","tier","region","country","state","instruments_tracked") VALUES ('United States — Delaware',3,'North America','United States','Delaware','State AI governance, policy and executive actions') ON CONFLICT ("jurisdiction_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "radar_coverage" ("jurisdiction_name","tier","region","country","state","instruments_tracked") VALUES ('United States — Georgia',3,'North America','United States','Georgia','State AI governance, policy and executive actions') ON CONFLICT ("jurisdiction_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "radar_coverage" ("jurisdiction_name","tier","region","country","state","instruments_tracked") VALUES ('United States — Maryland',3,'North America','United States','Maryland','State AI governance, policy and executive actions') ON CONFLICT ("jurisdiction_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "radar_coverage" ("jurisdiction_name","tier","region","country","state","instruments_tracked") VALUES ('United States — New Jersey',3,'North America','United States','New Jersey','State AI governance, policy and executive actions') ON CONFLICT ("jurisdiction_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "radar_coverage" ("jurisdiction_name","tier","region","country","state","instruments_tracked") VALUES ('United States — North Carolina',3,'North America','United States','North Carolina','State AI governance, policy and executive actions') ON CONFLICT ("jurisdiction_name") DO NOTHING;
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://au.int/en/documents/20240809/continental-artificial-intelligence-strategy'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'African Union';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://hightech.gov.am/en/artificial-intelligence-virtual-institute'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'Armenia';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://www.rtr.at/rtr/service/ki-servicestelle/ki-servicestelle.de.html',
  'https://www.dsb.gv.at/kuenstlichebrintelligenz/kuenstliche-intelligenz-datenschutz'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'Austria';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://www.gegevensbeschermingsautoriteit.be/burger/thema-s/artificiele-intelligentie'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'Belgium';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://www.mpo.cz/cz/rozcestnik.rss'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'Czech Republic';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://www.datatilsynet.dk/regler-og-vejledning/kunstig-intelligens',
  'https://digst.dk/nyheder/'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'Denmark';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://digital-strategy.ec.europa.eu/en/policies/ai-office',
  'https://digital-strategy.ec.europa.eu/en/policies/ai-pact',
  'https://digital-strategy.ec.europa.eu/en/policies/guidelines-gpai-providers',
  'https://digital-strategy.ec.europa.eu/en/policies/european-approach-artificial-intelligence',
  'https://digital-strategy.ec.europa.eu/en/policies/apply-ai',
  'https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content',
  'https://digital-strategy.ec.europa.eu/en/policies/ai-factories',
  'https://ai-act-service-desk.ec.europa.eu/en',
  'https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'European Union';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://www.traficom.fi/en/ai-regulation',
  'https://www.traficom.fi/en/ai-regulation/about-eu-artificial-intelligence-act'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'Finland';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://aiforgood.itu.int/',
  'https://www.itu.int/en/ITU-T/focusgroups/ai4h/Pages/default.aspx',
  'https://www.itu.int/en/ITU-T/AI/Pages/default.aspx'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'ITU';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://indiaai.gov.in/news'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'India';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://www.nist.gov/itl/ai-risk-management-framework/nist-ai-rmf-playbook',
  'https://standards.ieee.org/initiatives/autonomous-intelligence-systems/'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'International Standards';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://enterprise.gov.ie/en/what-we-do/innovation-research-development/artificial-intelligence/'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'Ireland';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://www.dvi.gov.lv/lv/maksliga-intelekta-akta-uzraudziba'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'Latvia';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://www.rrt.lt/veiklos-sritys/skaitmenine-erdve/di-informacija'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'Lithuania';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://ai.gov.my/governance/'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'Malaysia';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://idpc.org.mt/artificial-intelligence/'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'Malta';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://www.autoriteitpersoonsgegevens.nl/feed/article/rss.xml'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'Netherlands';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://ndpc.gov.ng/feed/',
  'https://nitda.gov.ng/feed/'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'Nigeria';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://www.nkom.no/ki',
  'https://www.datatilsynet.no/personvern-pa-ulike-omrader/kunstig-intelligens-og-personvern/'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'Norway';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://oecd.ai/en/',
  'https://oecd.ai/en/wonk',
  'https://oecd.ai/en/incidents'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'OECD';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://ai.gov.rs/rss/?change_lang=cr',
  'https://ai.gov.rs/'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'Serbia';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://aesia.digital.gob.es/es/noticias'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'Spain';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://moda.gov.tw/en/major-policies/ai/1781'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'Taiwan';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://www.etda.or.th/th/Our-Service/AIGC/index.aspx'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'Thailand';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://www.kvkk.gov.tr/Icerik/8547/uretken-yapay-zeka-ve-kisisel-verilerin-korunmasi-rehberi-15-soruda'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'Turkey';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://www.unesco.org/en/artificial-intelligence',
  'https://www.unesco.org/ethics-ai/en'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'UNESCO';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://thedigital.gov.ua/news/shtuchnyy-intelekt'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'Ukraine';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://u.ae/en/about-the-uae/digital-uae/digital-technology/artificial-intelligence/artificial-intelligence-in-government-policies'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'United Arab Emirates';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://www.gov.uk/government/organisations/ai-security-institute',
  'https://www.gov.uk/government/organisations/ai-security-institute.atom',
  'https://www.aisi.gov.uk/',
  'https://www.gov.uk/government/publications/international-scientific-report-on-the-safety-of-advanced-ai',
  'https://www.gov.uk/ai-assurance-techniques'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'United Kingdom';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://www.un.org/en/ai-advisory-body',
  'https://www.un.org/en/ai-advisory-body/about'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'United Nations';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://www.ai.gov/',
  'https://airc.nist.gov/',
  'https://www.nist.gov/caisi',
  'https://www.nist.gov/artificial-intelligence/ai-research',
  'https://www.cisa.gov/ai',
  'https://www.copyright.gov/ai/',
  'https://www.uspto.gov/initiatives/artificial-intelligence',
  'https://www.nsf.gov/focus-areas/artificial-intelligence',
  'https://www.energy.gov/ai',
  'https://www.energy.gov/topics/artificial-intelligence',
  'https://www.gsa.gov/technology/government-it-initiatives/artificial-intelligence',
  'https://www.dhs.gov/ai',
  'https://www.justice.gov/ai',
  'https://digital.gov/topics/artificial-intelligence/'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'United States';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://www.genai.ca.gov/'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'United States — California';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://ai.delaware.gov/'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'United States — Delaware';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://ai.georgia.gov/news',
  'https://ai.georgia.gov/'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'United States — Georgia';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://ai.maryland.gov/news',
  'https://ai.maryland.gov/'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'United States — Maryland';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://ai.nj.gov/'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'United States — New Jersey';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://its.ny.gov/artificial-intelligence'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'United States — New York';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://it.nc.gov/ai'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'United States — North Carolina';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://www.vita.virginia.gov/policy--governance/governance/artificial-intelligence/'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'United States — Virginia';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://www.atg.wa.gov/aitaskforce'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'United States — Washington';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://www.gub.uy/agencia-gobierno-electronico-sociedad-informacion-conocimiento/inteligencia-artificial'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'Uruguay';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://digital.uz/en/activity_page/sun-iy-intellekt'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'Uzbekistan';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://www.who.int/publications/i/item/9789240084759',
  'https://www.who.int/publications/i/item/9789240029200'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'WHO';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://www.wipo.int/about-ip/en/artificial_intelligence/'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'WIPO';
