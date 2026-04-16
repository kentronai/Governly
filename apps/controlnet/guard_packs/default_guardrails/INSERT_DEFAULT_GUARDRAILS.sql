-- =============================================================================
-- Insert Default Guardrails (Fresh Installation)
-- Follows proper naming convention: category.action
-- Note: Uses COALESCE to handle existing records
-- =============================================================================

-- Check and create UUID extension if not exists
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. PII Detection (pii.detect)
INSERT INTO guardrails (
    id, tenant_id, key, version, category, description, 
    tier, performance_budget_ms, requires_onnx, onnx_model_id,
    default_params, metadata, is_enabled, created_at, updated_at,
    pack_name, function_name, input_schema, output_schema,
    fallback_strategy, infrastructure, is_global, is_certified,
    name, enable_install
) VALUES (
    gen_random_uuid(),
    NULL, -- System-wide guardrail
    'pii.detect',
    'v1',
    'privacy',
    'Detects Personal Identifiable Information (PII) and provides anonymized version. Supports detection of emails, phones, credit cards, SSN, and more. Following OpenAI guardrails-js patterns.',
    'T0',
    5.000,
    false,
    NULL,
    '{"types": null, "severity": "high", "threshold": 1.0, "anonymize_mode": "mask"}'::jsonb,
    '{
        "reference": "https://openai.github.io/openai-guardrails-js/ref/checks/pii/",
        "guard_type": "pii",
        "operates_on": "string",
        "performance": "ultra_fast",
        "anonymize_modes": ["mask", "remove"],
        "validation_type": "pattern_matching",
        "programmatic_fix": true,
        "applicable_phases": ["input", "output"],
        "supported_pii_types": ["EMAIL", "PHONE", "CREDIT_CARD", "BANK_ACCOUNT", "SSN", "PASSPORT", "DRIVERS_LICENSE", "IP_ADDRESS", "API_KEY", "JWT"]
    }'::jsonb,
    true,
    NOW(),
    NOW(),
    'pii',
    'pii_detect',
    '{
        "type": "object",
        "properties": {
            "types": {
                "type": "array",
                "items": {
                    "enum": ["EMAIL", "PHONE", "CREDIT_CARD", "BANK_ACCOUNT", "SSN", "PASSPORT", "DRIVERS_LICENSE", "IP_ADDRESS", "API_KEY", "JWT"],
                    "type": "string"
                },
                "default": null,
                "description": "List of PII types to detect (null for all types)"
            },
            "severity": {
                "enum": ["low", "med", "high", "critical"],
                "type": "string",
                "default": "high",
                "description": "Severity level for violations"
            },
            "threshold": {
                "type": "number",
                "default": 1.0,
                "minimum": 1.0,
                "description": "Minimum number of PII instances to trigger violation"
            },
            "anonymize_mode": {
                "enum": ["mask", "remove"],
                "type": "string",
                "default": "mask",
                "description": "How to anonymize PII - ''mask'' replaces with [TYPE], ''remove'' removes entirely"
            }
        }
    }'::jsonb,
    '{
        "type": "object",
        "properties": {
            "violation": {
                "type": "object",
                "properties": {
                    "span": {
                        "type": "object",
                        "properties": {
                            "matches": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "end": {"type": "integer"},
                                        "text": {"type": "string"},
                                        "type": {"type": "string"},
                                        "start": {"type": "integer"}
                                    }
                                }
                            }
                        }
                    },
                    "score": {"type": "number"},
                    "message": {"type": "string"},
                    "rule_id": {"type": "string"},
                    "evidence": {
                        "type": "object",
                        "properties": {
                            "threshold": {"type": "number"},
                            "entity_info": {"type": "object"},
                            "total_matches": {"type": "integer"},
                            "anonymize_mode": {"type": "string"},
                            "detected_types": {"type": "array"},
                            "anonymized_text": {"type": "string"},
                            "original_text_length": {"type": "integer"},
                            "anonymized_text_length": {"type": "integer"}
                        }
                    },
                    "severity": {"type": "string"}
                }
            }
        }
    }'::jsonb,
    'skip',
    'rule',
    true,
    false,
    'PII Detection',
    true
) ON CONFLICT (tenant_id, key, version) DO UPDATE SET
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    pack_name = EXCLUDED.pack_name,
    function_name = EXCLUDED.function_name,
    metadata = EXCLUDED.metadata,
    default_params = EXCLUDED.default_params,
    input_schema = EXCLUDED.input_schema,
    output_schema = EXCLUDED.output_schema,
    tier = EXCLUDED.tier,
    performance_budget_ms = EXCLUDED.performance_budget_ms,
    name = EXCLUDED.name,
    enable_install = EXCLUDED.enable_install,
    is_enabled = EXCLUDED.is_enabled,
    updated_at = NOW();

-- 2. Toxicity Detection (toxicity.detect)
INSERT INTO guardrails (
    id, tenant_id, key, version, category, description, 
    tier, performance_budget_ms, requires_onnx, onnx_model_id,
    default_params, metadata, is_enabled, created_at, updated_at,
    pack_name, function_name, input_schema, output_schema,
    fallback_strategy, infrastructure, is_global, is_certified,
    name, enable_install
) VALUES (
    gen_random_uuid(),
    NULL,
    'toxicity.detect',
    'v1',
    'content_safety',
    'Detects toxic, harmful, and abusive content. Identifies harassment, hate speech, threats, and abuse with category-specific weighting.',
    'T1',
    10.000,
    false,
    NULL,
    '{"severity": "high", "threshold": 0.5, "categories": null}'::jsonb,
    '{
        "guard_type": "toxicity",
        "operates_on": "string",
        "performance": "fast",
        "validation_type": "pattern_matching",
        "category_weights": {
            "abuse": 0.85,
            "threats": 0.95,
            "harassment": 0.6,
            "hate_speech": 0.9
        },
        "applicable_phases": ["input", "output"],
        "supported_categories": ["harassment", "hate_speech", "threats", "abuse"]
    }'::jsonb,
    true,
    NOW(),
    NOW(),
    'toxicity',
    'toxicity_detect',
    '{
        "type": "object",
        "properties": {
            "severity": {
                "enum": ["low", "med", "high", "critical"],
                "type": "string",
                "default": "high",
                "description": "Severity level for violations"
            },
            "threshold": {
                "type": "number",
                "default": 0.5,
                "maximum": 1.0,
                "minimum": 0.0,
                "description": "Score threshold for violations (0.0-1.0)"
            },
            "categories": {
                "type": "array",
                "items": {
                    "enum": ["harassment", "hate_speech", "threats", "abuse"],
                    "type": "string"
                },
                "default": null,
                "description": "List of toxicity categories to check (null for all)"
            }
        }
    }'::jsonb,
    '{
        "type": "object",
        "properties": {
            "violation": {
                "type": "object",
                "properties": {
                    "score": {"type": "number"},
                    "message": {"type": "string"},
                    "rule_id": {"type": "string"},
                    "evidence": {
                        "type": "object",
                        "properties": {
                            "threshold": {"type": "number"},
                            "total_score": {"type": "number"},
                            "num_categories": {"type": "integer"},
                            "detected_categories": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "score": {"type": "number"},
                                        "weight": {"type": "number"},
                                        "matches": {"type": "integer"},
                                        "category": {"type": "string"}
                                    }
                                }
                            }
                        }
                    },
                    "severity": {"type": "string"}
                }
            }
        }
    }'::jsonb,
    'skip',
    'rule',
    true,
    false,
    'Toxicity Detection',
    false
) ON CONFLICT (tenant_id, key, version) DO UPDATE SET
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    pack_name = EXCLUDED.pack_name,
    function_name = EXCLUDED.function_name,
    metadata = EXCLUDED.metadata,
    default_params = EXCLUDED.default_params,
    input_schema = EXCLUDED.input_schema,
    output_schema = EXCLUDED.output_schema,
    tier = EXCLUDED.tier,
    performance_budget_ms = EXCLUDED.performance_budget_ms,
    name = EXCLUDED.name,
    enable_install = EXCLUDED.enable_install,
    is_enabled = EXCLUDED.is_enabled,
    updated_at = NOW();

-- 3. Jailbreak Detection (jailbreak.detect)
INSERT INTO guardrails (
    id, tenant_id, key, version, category, description, 
    tier, performance_budget_ms, requires_onnx, onnx_model_id,
    default_params, metadata, is_enabled, created_at, updated_at,
    pack_name, function_name, input_schema, output_schema,
    fallback_strategy, infrastructure, is_global, is_certified,
    name, enable_install
) VALUES (
    gen_random_uuid(),
    NULL,
    'jailbreak.detect',
    'v1',
    'security',
    'Detects prompt injection and jailbreak attempts. Identifies attempts to circumvent AI safety measures through instruction override, role-playing attacks, and system manipulation.',
    'T1',
    20.000,
    false,
    NULL,
    '{"severity": "critical", "threshold": 0.6}'::jsonb,
    '{
        "compliance": [{"name": "EU AI Act"}, {"name": "ISO 42001"}],
        "guard_type": "jailbreak",
        "operates_on": "string",
        "performance": "fast",
        "attack_types": ["instruction_override", "role_playing", "system_manipulation", "context_manipulation"],
        "validation_type": "pattern_matching",
        "detection_method": "regex_patterns",
        "applicable_phases": ["input"]
    }'::jsonb,
    true,
    NOW(),
    NOW(),
    'jailbreak',
    'jailbreak_detect',
    '{
        "type": "object",
        "properties": {
            "severity": {
                "enum": ["low", "med", "high", "critical"],
                "type": "string",
                "default": "critical",
                "description": "Severity level for violations"
            },
            "threshold": {
                "type": "number",
                "default": 0.6,
                "maximum": 1.0,
                "minimum": 0.0,
                "description": "Detection threshold (0.0-1.0). Lower values are more sensitive."
            }
        }
    }'::jsonb,
    '{
        "type": "object",
        "properties": {
            "violation": {
                "type": "object",
                "properties": {
                    "score": {"type": "number"},
                    "message": {"type": "string"},
                    "rule_id": {"type": "string"},
                    "evidence": {
                        "type": "object",
                        "properties": {
                            "threshold": {"type": "number"},
                            "text_preview": {"type": "string"},
                            "pattern_matches": {"type": "integer"}
                        }
                    },
                    "severity": {"type": "string"}
                }
            }
        }
    }'::jsonb,
    'skip',
    'rule',
    true,
    false,
    'Jailbreak Detection',
    true
) ON CONFLICT (tenant_id, key, version) DO UPDATE SET
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    pack_name = EXCLUDED.pack_name,
    function_name = EXCLUDED.function_name,
    metadata = EXCLUDED.metadata,
    default_params = EXCLUDED.default_params,
    input_schema = EXCLUDED.input_schema,
    output_schema = EXCLUDED.output_schema,
    tier = EXCLUDED.tier,
    performance_budget_ms = EXCLUDED.performance_budget_ms,
    name = EXCLUDED.name,
    enable_install = EXCLUDED.enable_install,
    is_enabled = EXCLUDED.is_enabled,
    updated_at = NOW();

-- 4. Profanity Detection (profanity.detect)
INSERT INTO guardrails (
    id, tenant_id, key, version, category, description, 
    tier, performance_budget_ms, requires_onnx, onnx_model_id,
    default_params, metadata, is_enabled, created_at, updated_at,
    pack_name, function_name, input_schema, output_schema,
    fallback_strategy, infrastructure, is_global, is_certified,
    name, enable_install
) VALUES (
    gen_random_uuid(),
    NULL,
    'profanity.detect',
    'v1',
    'content_safety',
    'Detects profane and offensive language using regex patterns. Categorizes profanity into mild, moderate, and severe levels.',
    'T0',
    3.000,
    false,
    NULL,
    '{"severity": "high", "threshold": 1.0, "categories": null}'::jsonb,
    '{
        "guard_type": "profanity",
        "operates_on": "string",
        "performance": "ultra_fast",
        "validation_type": "pattern_matching",
        "applicable_phases": ["input", "output"],
        "false_positive_rate": "low",
        "supported_categories": ["mild", "moderate", "severe"]
    }'::jsonb,
    true,
    NOW(),
    NOW(),
    'profanity',
    'profanity_detect',
    '{
        "type": "object",
        "properties": {
            "severity": {
                "enum": ["low", "med", "high", "critical"],
                "type": "string",
                "default": "high",
                "description": "Severity level for violations"
            },
            "threshold": {
                "type": "number",
                "default": 1.0,
                "minimum": 1.0,
                "description": "Minimum number of profane words to trigger violation"
            },
            "categories": {
                "type": "array",
                "items": {
                    "enum": ["mild", "moderate", "severe"],
                    "type": "string"
                },
                "default": null,
                "description": "List of profanity categories to check (null for all)"
            }
        }
    }'::jsonb,
    '{
        "type": "object",
        "properties": {
            "violation": {
                "type": "object",
                "properties": {
                    "score": {"type": "number"},
                    "message": {"type": "string"},
                    "rule_id": {"type": "string"},
                    "evidence": {
                        "type": "object",
                        "properties": {
                            "threshold": {"type": "number"},
                            "text_length": {"type": "integer"},
                            "total_matches": {"type": "integer"},
                            "detected_by_category": {"type": "object"}
                        }
                    },
                    "severity": {"type": "string"}
                }
            }
        }
    }'::jsonb,
    'skip',
    'rule',
    true,
    false,
    'Profanity Detection',
    true
) ON CONFLICT (tenant_id, key, version) DO UPDATE SET
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    pack_name = EXCLUDED.pack_name,
    function_name = EXCLUDED.function_name,
    metadata = EXCLUDED.metadata,
    default_params = EXCLUDED.default_params,
    input_schema = EXCLUDED.input_schema,
    output_schema = EXCLUDED.output_schema,
    tier = EXCLUDED.tier,
    performance_budget_ms = EXCLUDED.performance_budget_ms,
    name = EXCLUDED.name,
    enable_install = EXCLUDED.enable_install,
    is_enabled = EXCLUDED.is_enabled,
    updated_at = NOW();

-- =============================================================================
-- Verify insertions
-- =============================================================================

SELECT 'Inserted/Updated guardrails:' as message;

SELECT key, name, category, tier, pack_name, function_name 
FROM guardrails 
WHERE key IN ('pii.detect', 'toxicity.detect', 'jailbreak.detect', 'profanity.detect')
ORDER BY key;
