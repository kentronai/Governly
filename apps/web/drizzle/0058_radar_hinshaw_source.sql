-- AI Radar: add Hinshaw "2026 AI Compliance: Upcoming Laws" alert to United States sources (idempotent).
UPDATE "radar_coverage" SET "primary_source_urls" = "primary_source_urls" || ARRAY(SELECT u FROM unnest(ARRAY[
  'https://www.hinshawlaw.com/en/insights/privacy-cyber-and-ai-decoded-alert/2026-ai-compliance-upcoming-laws-every-organization-needs-to-know'
]::text[]) AS u WHERE u <> ALL("primary_source_urls")) WHERE "jurisdiction_name" = 'United States';
