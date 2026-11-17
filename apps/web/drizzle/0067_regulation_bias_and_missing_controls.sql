-- 1) Regulations added after 0016 (0044, 0053, 0055) were seeded with no control_mappings, so
--    the compliance grid always showed them as 0% / non-compliant with no gaps to act on.
--    Give each a machine-verifiable control list (only where still empty).
-- 2) Add the bias and discrimination assessment control to regulations that require one:
--    EU AI Act (Art. 10), Canada AIDA (biased output), Texas TRAIGA (discrimination ban) and
--    CCPA (automated-decision risk assessments).
-- Matches the library rows by id and every tenant copy by parent_policy_id. Idempotent.

-- Privacy and data-protection laws.
UPDATE "policy_center"
SET "control_mappings" = '[
  {"key":"application_scope_documented","title":"Processing scope documented","required":true},
  {"key":"use_case_documented","title":"Purpose of processing documented","required":true},
  {"key":"risk_register","title":"Privacy risks assessed and mitigation tracked","required":true},
  {"key":"responsible_owner","title":"Accountable data owner assigned","required":true},
  {"key":"data_governance","title":"Personal data governance documented","required":true},
  {"key":"transparency_notice","title":"Privacy notice to data subjects documented","required":true},
  {"key":"record_keeping","title":"Records of processing maintained","required":true}
]'::jsonb
WHERE "control_mappings" = '[]'::jsonb
  AND ("id"::text IN (
         '10000000-0000-4000-8000-000000000025', '10000000-0000-4000-8000-000000000026',
         '10000000-0000-4000-8000-000000000028', '10000000-0000-4000-8000-000000000029',
         '10000000-0000-4000-8000-000000000030', '10000000-0000-4000-8000-000000000031',
         '10000000-0000-4000-8000-000000000032')
    OR "parent_policy_id" IN (
         '10000000-0000-4000-8000-000000000025', '10000000-0000-4000-8000-000000000026',
         '10000000-0000-4000-8000-000000000028', '10000000-0000-4000-8000-000000000029',
         '10000000-0000-4000-8000-000000000030', '10000000-0000-4000-8000-000000000031',
         '10000000-0000-4000-8000-000000000032'));
--> statement-breakpoint
-- DORA: ICT risk management, incident logging and resilience testing.
UPDATE "policy_center"
SET "control_mappings" = '[
  {"key":"application_scope_documented","title":"ICT system scope documented","required":true},
  {"key":"risk_register","title":"ICT risks identified and mitigation tracked","required":true},
  {"key":"responsible_owner","title":"Accountable ICT risk owner assigned","required":true},
  {"key":"model_inventory","title":"ICT assets and third-party models inventoried","required":true},
  {"key":"runtime_monitoring","title":"Runtime activity monitored with audit evidence","required":true},
  {"key":"red_team_testing","title":"Digital operational resilience testing performed","required":true},
  {"key":"record_keeping","title":"Incident and governance records maintained","required":true}
]'::jsonb
WHERE "control_mappings" = '[]'::jsonb
  AND ("id"::text = '10000000-0000-4000-8000-000000000027'
    OR "parent_policy_id" = '10000000-0000-4000-8000-000000000027');
--> statement-breakpoint
-- HIPAA Security Rule: risk analysis, security official, safeguards and audit controls.
UPDATE "policy_center"
SET "control_mappings" = '[
  {"key":"application_scope_documented","title":"Systems handling ePHI documented","required":true},
  {"key":"risk_register","title":"Security risk analysis and mitigation tracked","required":true},
  {"key":"responsible_owner","title":"Security official assigned","required":true},
  {"key":"data_governance","title":"ePHI safeguards documented","required":true},
  {"key":"runtime_monitoring","title":"Audit controls record system activity","required":true},
  {"key":"record_keeping","title":"Security documentation retained","required":true}
]'::jsonb
WHERE "control_mappings" = '[]'::jsonb
  AND ("id"::text = '10000000-0000-4000-8000-000000000022'
    OR "parent_policy_id" = '10000000-0000-4000-8000-000000000022');
--> statement-breakpoint
-- Texas TRAIGA: an AI law, so it gets the standard AI controls plus disclosure.
UPDATE "policy_center"
SET "control_mappings" = '[
  {"key":"application_scope_documented","title":"Application scope documented","required":true},
  {"key":"use_case_documented","title":"Intended use and business impact documented","required":true},
  {"key":"risk_register","title":"Risks identified and mitigation tracked","required":true},
  {"key":"responsible_owner","title":"Responsible owner and stakeholders assigned","required":true},
  {"key":"model_inventory","title":"Models and technical details inventoried","required":true},
  {"key":"runtime_policy_configured","title":"Runtime guardrail policy configured","required":true},
  {"key":"runtime_monitoring","title":"Runtime requests monitored with audit evidence","required":true},
  {"key":"policy_execution_verified","title":"Configured guardrails verified in runtime evidence","required":true},
  {"key":"record_keeping","title":"Governance records maintained","required":true},
  {"key":"transparency_notice","title":"AI interaction disclosure documented","required":true}
]'::jsonb
WHERE "control_mappings" = '[]'::jsonb
  AND ("id"::text = '10000000-0000-4000-8000-000000000021'
    OR "parent_policy_id" = '10000000-0000-4000-8000-000000000021');
--> statement-breakpoint
-- Bias and discrimination assessment for regulations that require one.
UPDATE "policy_center"
SET "control_mappings" = "control_mappings" || '[
  {"key":"bias_assessment","title":"Bias and discrimination assessment completed","required":true}
]'::jsonb
WHERE NOT ("control_mappings" @> '[{"key":"bias_assessment"}]'::jsonb)
  AND ("id"::text IN (
         '10000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000008',
         '10000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000026')
    OR "parent_policy_id" IN (
         '10000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000008',
         '10000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000026'));
