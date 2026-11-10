-- AI Radar: Turkey — kvkk.gov.tr times out from outside Turkey (connection never opens), so that
-- source always failed. Replace it with TÜBİTAK BİLGEM's official AI listing (HTTP 200, AI articles). Idempotent.
UPDATE "radar_coverage" SET "primary_source_urls" = array_remove("primary_source_urls",
  'https://www.kvkk.gov.tr/Icerik/8547/uretken-yapay-zeka-ve-kisisel-verilerin-korunmasi-rehberi-15-soruda')
WHERE "jurisdiction_name" = 'Turkey';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://en.bilgem.tubitak.gov.tr/en/?s=artificial+intelligence'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'Turkey';
--> statement-breakpoint
-- Botswana: www.parliament.gov.bw returns HTTP 503 permanently. Replace it with BOCRA's (official
-- communications regulator) AI search, which returns HTTP 200 from the production server.
UPDATE "radar_coverage" SET "primary_source_urls" = array_remove("primary_source_urls", 'https://www.parliament.gov.bw')
WHERE "jurisdiction_name" = 'Botswana';
--> statement-breakpoint
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://www.bocra.org.bw/search/node?keys=artificial+intelligence'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'Botswana';
