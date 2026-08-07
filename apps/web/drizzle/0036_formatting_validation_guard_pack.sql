-- Seeds the formatting.* and validation.* guard packs (16 keys total) as global,
-- selectable catalog entries. Not added to any policy's default composition:
-- several validation.* guards raise at construction time if their required
-- param (substring/regex/choices) is left empty, and formatting.* guards would
-- false-positive on ordinary non-structured chat text. Users select and
-- configure these explicitly per policy.
--
-- SQL INSERT Queries for Formatting Guard Pack
-- Contains 5 guards: JSON, XML, CSV, URL, and Email validation
--
-- To use:
--   1. Replace NULL in created_by with user ID
--   2. Replace NULL in updated_by with user ID
--   3. Execute the INSERT statements
--
-- For tenant-specific guard (not global):
--   Replace NULL in tenant_id with your tenant ID

-- ============================================================================
-- 1. formatting.json - JSON Format Validation
-- ============================================================================

INSERT INTO guardrails (
    tenant_id,
    "key",
    version,
    category,
    description,
    tier,
    performance_budget_ms,
    requires_onnx,
    onnx_model_id,
    default_params,
    metadata,
    is_enabled,
    pack_name,
    function_name,
    input_schema,
    output_schema,
    fallback_strategy,
    infrastructure,
    is_global,
    is_certified,
    created_by,
    updated_by,
    name
) VALUES (
    NULL,  -- tenant_id: NULL for global marketplace guard
    'formatting.json',
    'v1',
    'formatting',
    'Validates JSON format and structure. Checks for valid JSON syntax and enforces maximum nesting depth to prevent deeply nested structures.',
    'T0',
    3.0,
    false,
    NULL,
    '{
        "strict_mode": true,
        "validate_schema": true,
        "max_depth": 10,
        "severity": "low"
    }'::jsonb,
    '{
        "guard_type": "formatting",
        "validation_type": "structure",
        "operates_on": "string",
        "programmatic_fix": false,
        "applicable_phases": ["input", "output"],
        "supported_formats": ["json"],
        "max_depth_enforcement": true
    }'::jsonb,
    true,
    'formatting',
    'json_validate',
    '{
        "type": "object",
        "properties": {
            "strict_mode": {
                "type": "boolean",
                "description": "Enforce strict JSON parsing",
                "default": true
            },
            "validate_schema": {
                "type": "boolean",
                "description": "Validate against JSON schema if provided",
                "default": true
            },
            "max_depth": {
                "type": "integer",
                "description": "Maximum nesting depth",
                "default": 10,
                "minimum": 1,
                "maximum": 50
            },
            "severity": {
                "type": "string",
                "enum": ["low", "med", "high", "critical"],
                "description": "Severity level for violations",
                "default": "low"
            }
        }
    }'::jsonb,
    '{
        "type": "object",
        "properties": {
            "violation": {
                "type": "object",
                "properties": {
                    "rule_id": {"type": "string"},
                    "severity": {"type": "string"},
                    "message": {"type": "string"},
                    "score": {"type": "number"},
                    "evidence": {
                        "type": "object",
                        "properties": {
                            "error": {"type": "string"},
                            "line": {"type": "integer"},
                            "column": {"type": "integer"},
                            "max_depth": {"type": "integer"}
                        }
                    }
                }
            }
        }
    }'::jsonb,
    'skip',
    'rule',
    true,
    false,
    NULL,  -- TODO: Replace with created_by user ID
    NULL,  -- TODO: Replace with updated_by user ID
    'JSON Format Validation'
)
ON CONFLICT (tenant_id, key, version) DO UPDATE SET
    updated_at = NOW(),
    updated_by = EXCLUDED.updated_by,
    description = EXCLUDED.description,
    tier = EXCLUDED.tier,
    performance_budget_ms = EXCLUDED.performance_budget_ms,
    default_params = EXCLUDED.default_params,
    metadata = EXCLUDED.metadata,
    input_schema = EXCLUDED.input_schema,
    output_schema = EXCLUDED.output_schema;

-- ============================================================================
-- 2. formatting.xml - XML Format Validation
-- ============================================================================

INSERT INTO guardrails (
    tenant_id,
    "key",
    version,
    category,
    description,
    tier,
    performance_budget_ms,
    requires_onnx,
    onnx_model_id,
    default_params,
    metadata,
    is_enabled,
    pack_name,
    function_name,
    input_schema,
    output_schema,
    fallback_strategy,
    infrastructure,
    is_global,
    is_certified,
    created_by,
    updated_by,
    name
) VALUES (
    NULL,
    'formatting.xml',
    'v1',
    'formatting',
    'Validates XML format and structure. Checks for well-formed XML by ensuring matching opening and closing tags.',
    'T0',
    4.0,
    false,
    NULL,
    '{
        "validate_dtd": true,
        "check_encoding": true,
        "namespace_aware": true,
        "severity": "low"
    }'::jsonb,
    '{
        "guard_type": "formatting",
        "validation_type": "structure",
        "operates_on": "string",
        "programmatic_fix": false,
        "applicable_phases": ["input", "output"],
        "supported_formats": ["xml"],
        "tag_matching": true
    }'::jsonb,
    true,
    'formatting',
    'xml_validate',
    '{
        "type": "object",
        "properties": {
            "validate_dtd": {
                "type": "boolean",
                "description": "Validate against DTD",
                "default": true
            },
            "check_encoding": {
                "type": "boolean",
                "description": "Check encoding declaration",
                "default": true
            },
            "namespace_aware": {
                "type": "boolean",
                "description": "Enable namespace awareness",
                "default": true
            },
            "severity": {
                "type": "string",
                "enum": ["low", "med", "high", "critical"],
                "description": "Severity level for violations",
                "default": "low"
            }
        }
    }'::jsonb,
    '{
        "type": "object",
        "properties": {
            "violation": {
                "type": "object",
                "properties": {
                    "rule_id": {"type": "string"},
                    "severity": {"type": "string"},
                    "message": {"type": "string"},
                    "score": {"type": "number"},
                    "evidence": {
                        "type": "object",
                        "properties": {
                            "open_tags": {"type": "integer"},
                            "close_tags": {"type": "integer"}
                        }
                    }
                }
            }
        }
    }'::jsonb,
    'skip',
    'rule',
    true,
    false,
    NULL,
    NULL,
    'XML Format Validation'
)
ON CONFLICT (tenant_id, key, version) DO UPDATE SET
    updated_at = NOW(),
    updated_by = EXCLUDED.updated_by,
    description = EXCLUDED.description,
    tier = EXCLUDED.tier,
    performance_budget_ms = EXCLUDED.performance_budget_ms,
    default_params = EXCLUDED.default_params,
    metadata = EXCLUDED.metadata,
    input_schema = EXCLUDED.input_schema,
    output_schema = EXCLUDED.output_schema;

-- ============================================================================
-- 3. formatting.csv - CSV Format Validation
-- ============================================================================

INSERT INTO guardrails (
    tenant_id,
    "key",
    version,
    category,
    description,
    tier,
    performance_budget_ms,
    requires_onnx,
    onnx_model_id,
    default_params,
    metadata,
    is_enabled,
    pack_name,
    function_name,
    input_schema,
    output_schema,
    fallback_strategy,
    infrastructure,
    is_global,
    is_certified,
    created_by,
    updated_by,
    name
) VALUES (
    NULL,
    'formatting.csv',
    'v1',
    'formatting',
    'Validates CSV format and data consistency. Checks for proper CSV structure, consistent column counts, and enforces maximum row limits.',
    'T0',
    5.0,
    false,
    NULL,
    '{
        "delimiter": ",",
        "quote_char": "\"",
        "check_headers": true,
        "max_rows": 10000,
        "severity": "low"
    }'::jsonb,
    '{
        "guard_type": "formatting",
        "validation_type": "structure",
        "operates_on": "string",
        "programmatic_fix": false,
        "applicable_phases": ["input", "output"],
        "supported_formats": ["csv"],
        "column_consistency_check": true,
        "row_limit_enforcement": true
    }'::jsonb,
    true,
    'formatting',
    'csv_validate',
    '{
        "type": "object",
        "properties": {
            "delimiter": {
                "type": "string",
                "description": "CSV delimiter character",
                "default": ",",
                "maxLength": 1
            },
            "quote_char": {
                "type": "string",
                "description": "Quote character for fields",
                "default": "\"",
                "maxLength": 1
            },
            "check_headers": {
                "type": "boolean",
                "description": "Validate header row",
                "default": true
            },
            "max_rows": {
                "type": "integer",
                "description": "Maximum number of rows",
                "default": 10000,
                "minimum": 1,
                "maximum": 1000000
            },
            "severity": {
                "type": "string",
                "enum": ["low", "med", "high", "critical"],
                "description": "Severity level for violations",
                "default": "low"
            }
        }
    }'::jsonb,
    '{
        "type": "object",
        "properties": {
            "violation": {
                "type": "object",
                "properties": {
                    "rule_id": {"type": "string"},
                    "severity": {"type": "string"},
                    "message": {"type": "string"},
                    "score": {"type": "number"},
                    "evidence": {
                        "type": "object",
                        "properties": {
                            "error": {"type": "string"},
                            "row_count": {"type": "integer"},
                            "max_rows": {"type": "integer"},
                            "row": {"type": "integer"},
                            "expected_cols": {"type": "integer"},
                            "actual_cols": {"type": "integer"}
                        }
                    }
                }
            }
        }
    }'::jsonb,
    'skip',
    'rule',
    true,
    false,
    NULL,
    NULL,
    'CSV Format Validation'
)
ON CONFLICT (tenant_id, key, version) DO UPDATE SET
    updated_at = NOW(),
    updated_by = EXCLUDED.updated_by,
    description = EXCLUDED.description,
    tier = EXCLUDED.tier,
    performance_budget_ms = EXCLUDED.performance_budget_ms,
    default_params = EXCLUDED.default_params,
    metadata = EXCLUDED.metadata,
    input_schema = EXCLUDED.input_schema,
    output_schema = EXCLUDED.output_schema;

-- ============================================================================
-- 4. formatting.url - URL Format Validation
-- ============================================================================

INSERT INTO guardrails (
    tenant_id,
    "key",
    version,
    category,
    description,
    tier,
    performance_budget_ms,
    requires_onnx,
    onnx_model_id,
    default_params,
    metadata,
    is_enabled,
    pack_name,
    function_name,
    input_schema,
    output_schema,
    fallback_strategy,
    infrastructure,
    is_global,
    is_certified,
    created_by,
    updated_by,
    name
) VALUES (
    NULL,
    'formatting.url',
    'v1',
    'formatting',
    'Validates URL format and syntax. Checks for valid URL structure, enforces allowed URL schemes (http, https), and validates maximum URL length.',
    'T0',
    2.0,
    false,
    NULL,
    '{
        "check_reachability": false,
        "allowed_schemes": ["http", "https"],
        "max_length": 2048,
        "severity": "low"
    }'::jsonb,
    '{
        "guard_type": "formatting",
        "validation_type": "format",
        "operates_on": "string",
        "programmatic_fix": false,
        "applicable_phases": ["input", "output"],
        "supported_formats": ["url"],
        "scheme_validation": true,
        "length_validation": true
    }'::jsonb,
    true,
    'formatting',
    'url_format_validate',
    '{
        "type": "object",
        "properties": {
            "check_reachability": {
                "type": "boolean",
                "description": "Check if URL is reachable (not implemented yet)",
                "default": false
            },
            "allowed_schemes": {
                "type": "array",
                "description": "Allowed URL schemes (http, https, etc.)",
                "items": {
                    "type": "string"
                },
                "default": ["http", "https"],
                "minItems": 1
            },
            "max_length": {
                "type": "integer",
                "description": "Maximum URL length",
                "default": 2048,
                "minimum": 1,
                "maximum": 8192
            },
            "severity": {
                "type": "string",
                "enum": ["low", "med", "high", "critical"],
                "description": "Severity level for violations",
                "default": "low"
            }
        }
    }'::jsonb,
    '{
        "type": "object",
        "properties": {
            "violation": {
                "type": "object",
                "properties": {
                    "rule_id": {"type": "string"},
                    "severity": {"type": "string"},
                    "message": {"type": "string"},
                    "score": {"type": "number"},
                    "evidence": {
                        "type": "object",
                        "properties": {
                            "url": {"type": "string"},
                            "length": {"type": "integer"},
                            "max_length": {"type": "integer"},
                            "scheme": {"type": "string"},
                            "allowed_schemes": {"type": "array"},
                            "error": {"type": "string"}
                        }
                    }
                }
            }
        }
    }'::jsonb,
    'skip',
    'rule',
    true,
    false,
    NULL,
    NULL,
    'URL Format Validation'
)
ON CONFLICT (tenant_id, key, version) DO UPDATE SET
    updated_at = NOW(),
    updated_by = EXCLUDED.updated_by,
    description = EXCLUDED.description,
    tier = EXCLUDED.tier,
    performance_budget_ms = EXCLUDED.performance_budget_ms,
    default_params = EXCLUDED.default_params,
    metadata = EXCLUDED.metadata,
    input_schema = EXCLUDED.input_schema,
    output_schema = EXCLUDED.output_schema;

-- ============================================================================
-- 5. formatting.email - Email Format Validation
-- ============================================================================

INSERT INTO guardrails (
    tenant_id,
    "key",
    version,
    category,
    description,
    tier,
    performance_budget_ms,
    requires_onnx,
    onnx_model_id,
    default_params,
    metadata,
    is_enabled,
    pack_name,
    function_name,
    input_schema,
    output_schema,
    fallback_strategy,
    infrastructure,
    is_global,
    is_certified,
    created_by,
    updated_by,
    name
) VALUES (
    NULL,
    'formatting.email',
    'v1',
    'formatting',
    'Validates email address format. Checks for RFC 5322 compliant email addresses and validates local part (max 64 chars) and domain part (max 253 chars) lengths.',
    'T0',
    1.0,
    false,
    NULL,
    '{
        "strict_rfc": true,
        "check_mx": false,
        "allow_smtputf8": true,
        "severity": "low"
    }'::jsonb,
    '{
        "guard_type": "formatting",
        "validation_type": "format",
        "operates_on": "string",
        "programmatic_fix": false,
        "applicable_phases": ["input", "output"],
        "supported_formats": ["email"],
        "rfc_compliance": "RFC 5322",
        "local_part_max_length": 64,
        "domain_part_max_length": 253
    }'::jsonb,
    true,
    'formatting',
    'email_validate',
    '{
        "type": "object",
        "properties": {
            "strict_rfc": {
                "type": "boolean",
                "description": "Enforce strict RFC compliance",
                "default": true
            },
            "check_mx": {
                "type": "boolean",
                "description": "Check MX records (not implemented yet)",
                "default": false
            },
            "allow_smtputf8": {
                "type": "boolean",
                "description": "Allow SMTPUTF8 characters",
                "default": true
            },
            "severity": {
                "type": "string",
                "enum": ["low", "med", "high", "critical"],
                "description": "Severity level for violations",
                "default": "low"
            }
        }
    }'::jsonb,
    '{
        "type": "object",
        "properties": {
            "violation": {
                "type": "object",
                "properties": {
                    "rule_id": {"type": "string"},
                    "severity": {"type": "string"},
                    "message": {"type": "string"},
                    "score": {"type": "number"},
                    "evidence": {
                        "type": "object",
                        "properties": {
                            "email": {"type": "string"},
                            "local_length": {"type": "integer"},
                            "domain_length": {"type": "integer"}
                        }
                    }
                }
            }
        }
    }'::jsonb,
    'skip',
    'rule',
    true,
    false,
    NULL,
    NULL,
    'Email Format Validation'
)
ON CONFLICT (tenant_id, key, version) DO UPDATE SET
    updated_at = NOW(),
    updated_by = EXCLUDED.updated_by,
    description = EXCLUDED.description,
    tier = EXCLUDED.tier,
    performance_budget_ms = EXCLUDED.performance_budget_ms,
    default_params = EXCLUDED.default_params,
    metadata = EXCLUDED.metadata,
    input_schema = EXCLUDED.input_schema,
    output_schema = EXCLUDED.output_schema;

-- ============================================================================
-- Example Usage in Policy YAML
-- ============================================================================
--
-- guards:
--   - id: formatting.json
--     target: output
--     with:
--       strict_mode: true
--       max_depth: 10
--       severity: "low"
--
--   - id: formatting.csv
--     target: output
--     with:
--       delimiter: ","
--       max_rows: 10000
--       severity: "med"
--
--   - id: formatting.url
--     target: output
--     with:
--       allowed_schemes: ["http", "https"]
--       max_length: 2048
--       severity: "low"
--
--   - id: formatting.email
--     target: output
--     with:
--       strict_rfc: true
--       severity: "low"
--
--   - id: formatting.xml
--     target: output
--     with:
--       validate_dtd: true
--       severity: "low"
--
-- compose:
--   output: allOf(formatting_json, formatting_csv, formatting_url, formatting_email, formatting_xml)

-- ============================================================================
-- COMPLETE SQL INSERT QUERIES FOR ALL VALIDATION GUARDS
-- ============================================================================
-- This file contains INSERT statements for all 11 validation guards:
-- 1. validation.contains_string
-- 2. validation.not_contains_string
-- 3. validation.ends_with
-- 4. validation.lowercase
-- 5. validation.uppercase
-- 6. validation.one_line
-- 7. validation.reading_time
-- 8. validation.regex_match
-- 9. validation.valid_choices
-- 10. validation.valid_length
-- 11. validation.valid_range
--
-- To use:
--   1. Replace NULL in created_by fields with user ID
--   2. Replace NULL in updated_by fields with user ID
--   3. Execute the entire file:
--      psql $DATABASE_URL < INSERT_ALL_VALIDATION_GUARDS.sql
--
-- All INSERT statements use ON CONFLICT handling for idempotent execution
-- ============================================================================

-- ============================================================================
-- 1. validation.contains_string
-- ============================================================================
INSERT INTO guardrails (
    tenant_id,
    "key",
    version,
    category,
    description,
    tier,
    performance_budget_ms,
    requires_onnx,
    onnx_model_id,
    default_params,
    metadata,
    is_enabled,
    pack_name,
    function_name,
    input_schema,
    output_schema,
    fallback_strategy,
    infrastructure,
    is_global,
    is_certified,
    created_by,
    updated_by,
    name
) VALUES (
    NULL,  -- tenant_id: NULL for global marketplace guard
    'validation.contains_string',
    'v1',
    'validation',
    'Validates that a string contains a specified substring. Useful for ensuring required content is present in responses.',
    'T0',
    1.0,
    false,
    NULL,
    '{"substring": "", "case_sensitive": true}'::jsonb,
    '{
        "guard_type": "validation",
        "validation_type": "contains",
        "operates_on": "string",
        "programmatic_fix": false,
        "applicable_phases": ["input", "output"]
    }'::jsonb,
    true,
    'validation',
    'contains_string',
    '{
        "type": "object",
        "properties": {
            "substring": {
                "type": "string",
                "description": "The substring to search for",
                "minLength": 1
            },
            "case_sensitive": {
                "type": "boolean",
                "description": "Whether the search should be case-sensitive",
                "default": true
            },
            "severity": {
                "type": "string",
                "enum": ["low", "med", "high", "critical"],
                "description": "Severity level for violations",
                "default": "med"
            }
        },
        "required": ["substring"]
    }'::jsonb,
    '{
        "type": "object",
        "properties": {
            "violation": {
                "type": "object",
                "properties": {
                    "rule_id": {"type": "string"},
                    "severity": {"type": "string"},
                    "message": {"type": "string"},
                    "score": {"type": "number"}
                }
            }
        }
    }'::jsonb,
    'skip',
    'rule',
    true,
    false,
    NULL,  -- TODO: Replace with created_by user ID
    NULL,  -- TODO: Replace with updated_by user ID
    'Contains String'
)
ON CONFLICT (tenant_id, key, version) DO UPDATE SET
    updated_at = NOW(),
    updated_by = EXCLUDED.updated_by,
    description = EXCLUDED.description,
    tier = EXCLUDED.tier,
    performance_budget_ms = EXCLUDED.performance_budget_ms,
    default_params = EXCLUDED.default_params,
    metadata = EXCLUDED.metadata,
    input_schema = EXCLUDED.input_schema,
    output_schema = EXCLUDED.output_schema;

-- ============================================================================
-- 2. validation.not_contains_string
-- ============================================================================
INSERT INTO guardrails (
    tenant_id,
    "key",
    version,
    category,
    description,
    tier,
    performance_budget_ms,
    requires_onnx,
    onnx_model_id,
    default_params,
    metadata,
    is_enabled,
    pack_name,
    function_name,
    input_schema,
    output_schema,
    fallback_strategy,
    infrastructure,
    is_global,
    is_certified,
    created_by,
    updated_by,
    name
) VALUES (
    NULL,
    'validation.not_contains_string',
    'v1',
    'validation',
    'Validates that a string does NOT contain a specified substring. Useful for blocking forbidden words or phrases.',
    'T0',
    1.0,
    false,
    NULL,
    '{"substring": "", "case_sensitive": true}'::jsonb,
    '{
        "guard_type": "validation",
        "validation_type": "not_contains",
        "operates_on": "string",
        "programmatic_fix": false,
        "applicable_phases": ["input", "output"]
    }'::jsonb,
    true,
    'validation',
    'not_contains_string',
    '{
        "type": "object",
        "properties": {
            "substring": {
                "type": "string",
                "description": "The substring that should NOT be present",
                "minLength": 1
            },
            "case_sensitive": {
                "type": "boolean",
                "description": "Whether the search should be case-sensitive",
                "default": true
            },
            "severity": {
                "type": "string",
                "enum": ["low", "med", "high", "critical"],
                "description": "Severity level for violations",
                "default": "med"
            }
        },
        "required": ["substring"]
    }'::jsonb,
    '{
        "type": "object",
        "properties": {
            "violation": {
                "type": "object",
                "properties": {
                    "rule_id": {"type": "string"},
                    "severity": {"type": "string"},
                    "message": {"type": "string"},
                    "score": {"type": "number"}
                }
            }
        }
    }'::jsonb,
    'skip',
    'rule',
    true,
    false,
    NULL,  -- TODO: Replace with created_by user ID
    NULL,  -- TODO: Replace with updated_by user ID
    'Not Contains String'
)
ON CONFLICT (tenant_id, key, version) DO UPDATE SET
    updated_at = NOW(),
    updated_by = EXCLUDED.updated_by,
    description = EXCLUDED.description,
    tier = EXCLUDED.tier,
    performance_budget_ms = EXCLUDED.performance_budget_ms,
    default_params = EXCLUDED.default_params,
    metadata = EXCLUDED.metadata,
    input_schema = EXCLUDED.input_schema,
    output_schema = EXCLUDED.output_schema;

-- ============================================================================
-- 3. validation.ends_with
-- ============================================================================
INSERT INTO guardrails (
    tenant_id,
    "key",
    version,
    category,
    description,
    tier,
    performance_budget_ms,
    requires_onnx,
    onnx_model_id,
    default_params,
    metadata,
    is_enabled,
    pack_name,
    function_name,
    input_schema,
    output_schema,
    fallback_strategy,
    infrastructure,
    is_global,
    is_certified,
    created_by,
    updated_by,
    name
) VALUES (
    NULL,
    'validation.ends_with',
    'v1',
    'validation',
    'Validates that a string or list ends with a specified value. Useful for ensuring responses end with required disclaimers or formatting.',
    'T0',
    1.0,
    false,
    NULL,
    '{"end": ""}'::jsonb,
    '{
        "guard_type": "validation",
        "validation_type": "ends_with",
        "operates_on": ["string", "list"],
        "programmatic_fix": false,
        "applicable_phases": ["input", "output"]
    }'::jsonb,
    true,
    'validation',
    'ends_with',
    '{
        "type": "object",
        "properties": {
            "end": {
                "type": ["string", "array"],
                "description": "The required last element (string for string validation, list element for list validation)"
            },
            "severity": {
                "type": "string",
                "enum": ["low", "med", "high", "critical"],
                "description": "Severity level for violations",
                "default": "med"
            }
        },
        "required": ["end"]
    }'::jsonb,
    '{
        "type": "object",
        "properties": {
            "violation": {
                "type": "object",
                "properties": {
                    "rule_id": {"type": "string"},
                    "severity": {"type": "string"},
                    "message": {"type": "string"},
                    "score": {"type": "number"}
                }
            }
        }
    }'::jsonb,
    'skip',
    'rule',
    true,
    false,
    NULL,  -- TODO: Replace with created_by user ID
    NULL,  -- TODO: Replace with updated_by user ID
    'Ends With'
)
ON CONFLICT (tenant_id, key, version) DO UPDATE SET
    updated_at = NOW(),
    updated_by = EXCLUDED.updated_by,
    description = EXCLUDED.description,
    tier = EXCLUDED.tier,
    performance_budget_ms = EXCLUDED.performance_budget_ms,
    default_params = EXCLUDED.default_params,
    metadata = EXCLUDED.metadata,
    input_schema = EXCLUDED.input_schema,
    output_schema = EXCLUDED.output_schema;

-- ============================================================================
-- 4. validation.lowercase
-- ============================================================================
INSERT INTO guardrails (
    tenant_id,
    "key",
    version,
    category,
    description,
    tier,
    performance_budget_ms,
    requires_onnx,
    onnx_model_id,
    default_params,
    metadata,
    is_enabled,
    pack_name,
    function_name,
    input_schema,
    output_schema,
    fallback_strategy,
    infrastructure,
    is_global,
    is_certified,
    created_by,
    updated_by,
    name
) VALUES (
    NULL,
    'validation.lowercase',
    'v1',
    'validation',
    'Validates that a string is lowercase. Useful for enforcing consistent formatting requirements.',
    'T0',
    1.0,
    false,
    NULL,
    '{}'::jsonb,
    '{
        "guard_type": "validation",
        "validation_type": "format",
        "operates_on": "string",
        "programmatic_fix": false,
        "applicable_phases": ["input", "output"]
    }'::jsonb,
    true,
    'validation',
    'lowercase',
    '{
        "type": "object",
        "properties": {
            "severity": {
                "type": "string",
                "enum": ["low", "med", "high", "critical"],
                "description": "Severity level for violations",
                "default": "med"
            }
        }
    }'::jsonb,
    '{
        "type": "object",
        "properties": {
            "violation": {
                "type": "object",
                "properties": {
                    "rule_id": {"type": "string"},
                    "severity": {"type": "string"},
                    "message": {"type": "string"},
                    "score": {"type": "number"}
                }
            }
        }
    }'::jsonb,
    'skip',
    'rule',
    true,
    false,
    NULL,  -- TODO: Replace with created_by user ID
    NULL,  -- TODO: Replace with updated_by user ID
    'Lowercase'
)
ON CONFLICT (tenant_id, key, version) DO UPDATE SET
    updated_at = NOW(),
    updated_by = EXCLUDED.updated_by,
    description = EXCLUDED.description,
    tier = EXCLUDED.tier,
    performance_budget_ms = EXCLUDED.performance_budget_ms,
    default_params = EXCLUDED.default_params,
    metadata = EXCLUDED.metadata,
    input_schema = EXCLUDED.input_schema,
    output_schema = EXCLUDED.output_schema;

-- ============================================================================
-- 5. validation.uppercase
-- ============================================================================
INSERT INTO guardrails (
    tenant_id,
    "key",
    version,
    category,
    description,
    tier,
    performance_budget_ms,
    requires_onnx,
    onnx_model_id,
    default_params,
    metadata,
    is_enabled,
    pack_name,
    function_name,
    input_schema,
    output_schema,
    fallback_strategy,
    infrastructure,
    is_global,
    is_certified,
    created_by,
    updated_by,
    name
) VALUES (
    NULL,
    'validation.uppercase',
    'v1',
    'validation',
    'Validates that a string is uppercase. Useful for enforcing consistent formatting requirements.',
    'T0',
    1.0,
    false,
    NULL,
    '{}'::jsonb,
    '{
        "guard_type": "validation",
        "validation_type": "format",
        "operates_on": "string",
        "programmatic_fix": false,
        "applicable_phases": ["input", "output"]
    }'::jsonb,
    true,
    'validation',
    'uppercase',
    '{
        "type": "object",
        "properties": {
            "severity": {
                "type": "string",
                "enum": ["low", "med", "high", "critical"],
                "description": "Severity level for violations",
                "default": "med"
            }
        }
    }'::jsonb,
    '{
        "type": "object",
        "properties": {
            "violation": {
                "type": "object",
                "properties": {
                    "rule_id": {"type": "string"},
                    "severity": {"type": "string"},
                    "message": {"type": "string"},
                    "score": {"type": "number"}
                }
            }
        }
    }'::jsonb,
    'skip',
    'rule',
    true,
    false,
    NULL,  -- TODO: Replace with created_by user ID
    NULL,  -- TODO: Replace with updated_by user ID
    'Uppercase'
)
ON CONFLICT (tenant_id, key, version) DO UPDATE SET
    updated_at = NOW(),
    updated_by = EXCLUDED.updated_by,
    description = EXCLUDED.description,
    tier = EXCLUDED.tier,
    performance_budget_ms = EXCLUDED.performance_budget_ms,
    default_params = EXCLUDED.default_params,
    metadata = EXCLUDED.metadata,
    input_schema = EXCLUDED.input_schema,
    output_schema = EXCLUDED.output_schema;

-- ============================================================================
-- 6. validation.one_line
-- ============================================================================
INSERT INTO guardrails (
    tenant_id,
    "key",
    version,
    category,
    description,
    tier,
    performance_budget_ms,
    requires_onnx,
    onnx_model_id,
    default_params,
    metadata,
    is_enabled,
    pack_name,
    function_name,
    input_schema,
    output_schema,
    fallback_strategy,
    infrastructure,
    is_global,
    is_certified,
    created_by,
    updated_by,
    name
) VALUES (
    NULL,
    'validation.one_line',
    'v1',
    'validation',
    'Validates that a string is a single line (contains no newline characters). Useful for ensuring single-line responses or preventing multi-line outputs.',
    'T0',
    1.0,
    false,
    NULL,
    '{}'::jsonb,
    '{
        "guard_type": "validation",
        "validation_type": "format",
        "operates_on": "string",
        "programmatic_fix": false,
        "applicable_phases": ["input", "output"]
    }'::jsonb,
    true,
    'validation',
    'one_line',
    '{
        "type": "object",
        "properties": {
            "severity": {
                "type": "string",
                "enum": ["low", "med", "high", "critical"],
                "description": "Severity level for violations",
                "default": "med"
            }
        }
    }'::jsonb,
    '{
        "type": "object",
        "properties": {
            "violation": {
                "type": "object",
                "properties": {
                    "rule_id": {"type": "string"},
                    "severity": {"type": "string"},
                    "message": {"type": "string"},
                    "score": {"type": "number"}
                }
            }
        }
    }'::jsonb,
    'skip',
    'rule',
    true,
    false,
    NULL,  -- TODO: Replace with created_by user ID
    NULL,  -- TODO: Replace with updated_by user ID
    'One Line'
)
ON CONFLICT (tenant_id, key, version) DO UPDATE SET
    updated_at = NOW(),
    updated_by = EXCLUDED.updated_by,
    description = EXCLUDED.description,
    tier = EXCLUDED.tier,
    performance_budget_ms = EXCLUDED.performance_budget_ms,
    default_params = EXCLUDED.default_params,
    metadata = EXCLUDED.metadata,
    input_schema = EXCLUDED.input_schema,
    output_schema = EXCLUDED.output_schema;

-- ============================================================================
-- 7. validation.reading_time
-- ============================================================================
INSERT INTO guardrails (
    tenant_id,
    "key",
    version,
    category,
    description,
    tier,
    performance_budget_ms,
    requires_onnx,
    onnx_model_id,
    default_params,
    metadata,
    is_enabled,
    pack_name,
    function_name,
    input_schema,
    output_schema,
    fallback_strategy,
    infrastructure,
    is_global,
    is_certified,
    created_by,
    updated_by,
    name
) VALUES (
    NULL,
    'validation.reading_time',
    'v1',
    'validation',
    'Validates that text can be read within a specified time limit. Uses average human reading speed (200 words/minute) to estimate reading time.',
    'T0',
    2.0,
    false,
    NULL,
    '{"reading_time": 5.0, "words_per_minute": 200}'::jsonb,
    '{
        "guard_type": "validation",
        "validation_type": "reading_time",
        "operates_on": "string",
        "programmatic_fix": false,
        "applicable_phases": ["input", "output"],
        "reading_speed_wpm": 200
    }'::jsonb,
    true,
    'validation',
    'reading_time',
    '{
        "type": "object",
        "properties": {
            "reading_time": {
                "type": "number",
                "description": "Maximum reading time in minutes",
                "minimum": 0.01
            },
            "words_per_minute": {
                "type": "integer",
                "description": "Average reading speed (default: 200 words/min)",
                "default": 200,
                "minimum": 1
            },
            "severity": {
                "type": "string",
                "enum": ["low", "med", "high", "critical"],
                "description": "Severity level for violations",
                "default": "med"
            }
        },
        "required": ["reading_time"]
    }'::jsonb,
    '{
        "type": "object",
        "properties": {
            "violation": {
                "type": "object",
                "properties": {
                    "rule_id": {"type": "string"},
                    "severity": {"type": "string"},
                    "message": {"type": "string"},
                    "score": {"type": "number"}
                }
            }
        }
    }'::jsonb,
    'skip',
    'rule',
    true,
    false,
    NULL,  -- TODO: Replace with created_by user ID
    NULL,  -- TODO: Replace with updated_by user ID
    'Reading Time'
)
ON CONFLICT (tenant_id, key, version) DO UPDATE SET
    updated_at = NOW(),
    updated_by = EXCLUDED.updated_by,
    description = EXCLUDED.description,
    tier = EXCLUDED.tier,
    performance_budget_ms = EXCLUDED.performance_budget_ms,
    default_params = EXCLUDED.default_params,
    metadata = EXCLUDED.metadata,
    input_schema = EXCLUDED.input_schema,
    output_schema = EXCLUDED.output_schema;

-- ============================================================================
-- 8. validation.regex_match
-- ============================================================================
INSERT INTO guardrails (
    tenant_id,
    "key",
    version,
    category,
    description,
    tier,
    performance_budget_ms,
    requires_onnx,
    onnx_model_id,
    default_params,
    metadata,
    is_enabled,
    pack_name,
    function_name,
    input_schema,
    output_schema,
    fallback_strategy,
    infrastructure,
    is_global,
    is_certified,
    created_by,
    updated_by,
    name
) VALUES (
    NULL,
    'validation.regex_match',
    'v1',
    'validation',
    'Validates that a string matches a regular expression pattern. Supports both fullmatch (entire string) and search (pattern found anywhere) modes.',
    'T0',
    3.0,
    false,
    NULL,
    '{"regex": "", "match_type": "fullmatch"}'::jsonb,
    '{
        "guard_type": "validation",
        "validation_type": "regex",
        "operates_on": "string",
        "programmatic_fix": false,
        "applicable_phases": ["input", "output"],
        "match_types": ["fullmatch", "search"]
    }'::jsonb,
    true,
    'validation',
    'regex_match',
    '{
        "type": "object",
        "properties": {
            "regex": {
                "type": "string",
                "description": "Regular expression pattern to match",
                "minLength": 1
            },
            "match_type": {
                "type": "string",
                "enum": ["fullmatch", "search"],
                "description": "fullmatch requires entire string to match, search requires pattern to be found anywhere",
                "default": "fullmatch"
            },
            "severity": {
                "type": "string",
                "enum": ["low", "med", "high", "critical"],
                "description": "Severity level for violations",
                "default": "med"
            }
        },
        "required": ["regex"]
    }'::jsonb,
    '{
        "type": "object",
        "properties": {
            "violation": {
                "type": "object",
                "properties": {
                    "rule_id": {"type": "string"},
                    "severity": {"type": "string"},
                    "message": {"type": "string"},
                    "score": {"type": "number"}
                }
            }
        }
    }'::jsonb,
    'skip',
    'rule',
    true,
    false,
    NULL,  -- TODO: Replace with created_by user ID
    NULL,  -- TODO: Replace with updated_by user ID
    'Regex Match'
)
ON CONFLICT (tenant_id, key, version) DO UPDATE SET
    updated_at = NOW(),
    updated_by = EXCLUDED.updated_by,
    description = EXCLUDED.description,
    tier = EXCLUDED.tier,
    performance_budget_ms = EXCLUDED.performance_budget_ms,
    default_params = EXCLUDED.default_params,
    metadata = EXCLUDED.metadata,
    input_schema = EXCLUDED.input_schema,
    output_schema = EXCLUDED.output_schema;

-- ============================================================================
-- 9. validation.valid_choices
-- ============================================================================
INSERT INTO guardrails (
    tenant_id,
    "key",
    version,
    category,
    description,
    tier,
    performance_budget_ms,
    requires_onnx,
    onnx_model_id,
    default_params,
    metadata,
    is_enabled,
    pack_name,
    function_name,
    input_schema,
    output_schema,
    fallback_strategy,
    infrastructure,
    is_global,
    is_certified,
    created_by,
    updated_by,
    name
) VALUES (
    NULL,
    'validation.valid_choices',
    'v1',
    'validation',
    'Validates that a value belongs to a subset of acceptable choices. Useful for enforcing LLM outputs to match predefined options.',
    'T0',
    1.0,
    false,
    NULL,
    '{"choices": []}'::jsonb,
    '{
        "guard_type": "validation",
        "validation_type": "enum",
        "operates_on": "all",
        "programmatic_fix": false,
        "applicable_phases": ["input", "output"]
    }'::jsonb,
    true,
    'validation',
    'valid_choices',
    '{
        "type": "object",
        "properties": {
            "choices": {
                "type": "array",
                "description": "List of valid choices (can be strings, numbers, etc.)",
                "minItems": 1,
                "items": {}
            },
            "severity": {
                "type": "string",
                "enum": ["low", "med", "high", "critical"],
                "description": "Severity level for violations",
                "default": "med"
            }
        },
        "required": ["choices"]
    }'::jsonb,
    '{
        "type": "object",
        "properties": {
            "violation": {
                "type": "object",
                "properties": {
                    "rule_id": {"type": "string"},
                    "severity": {"type": "string"},
                    "message": {"type": "string"},
                    "score": {"type": "number"}
                }
            }
        }
    }'::jsonb,
    'skip',
    'rule',
    true,
    false,
    NULL,  -- TODO: Replace with created_by user ID
    NULL,  -- TODO: Replace with updated_by user ID
    'Valid Choices'
)
ON CONFLICT (tenant_id, key, version) DO UPDATE SET
    updated_at = NOW(),
    updated_by = EXCLUDED.updated_by,
    description = EXCLUDED.description,
    tier = EXCLUDED.tier,
    performance_budget_ms = EXCLUDED.performance_budget_ms,
    default_params = EXCLUDED.default_params,
    metadata = EXCLUDED.metadata,
    input_schema = EXCLUDED.input_schema,
    output_schema = EXCLUDED.output_schema;

-- ============================================================================
-- 10. validation.valid_length
-- ============================================================================
INSERT INTO guardrails (
    tenant_id,
    "key",
    version,
    category,
    description,
    tier,
    performance_budget_ms,
    requires_onnx,
    onnx_model_id,
    default_params,
    metadata,
    is_enabled,
    pack_name,
    function_name,
    input_schema,
    output_schema,
    fallback_strategy,
    infrastructure,
    is_global,
    is_certified,
    created_by,
    updated_by,
    name
) VALUES (
    NULL,
    'validation.valid_length',
    'v1',
    'validation',
    'Validates that the length of a string or list is within expected range. Useful for ensuring generated strings or JSON arrays meet length requirements.',
    'T0',
    1.0,
    false,
    NULL,
    '{}'::jsonb,
    '{
        "guard_type": "validation",
        "validation_type": "length",
        "operates_on": ["string", "list"],
        "programmatic_fix": false,
        "applicable_phases": ["input", "output"]
    }'::jsonb,
    true,
    'validation',
    'valid_length',
    '{
        "type": "object",
        "properties": {
            "min": {
                "type": "integer",
                "description": "The inclusive minimum length (null for no minimum)",
                "minimum": 0
            },
            "max": {
                "type": "integer",
                "description": "The inclusive maximum length (null for no maximum)",
                "minimum": 0
            },
            "severity": {
                "type": "string",
                "enum": ["low", "med", "high", "critical"],
                "description": "Severity level for violations",
                "default": "med"
            }
        }
    }'::jsonb,
    '{
        "type": "object",
        "properties": {
            "violation": {
                "type": "object",
                "properties": {
                    "rule_id": {"type": "string"},
                    "severity": {"type": "string"},
                    "message": {"type": "string"},
                    "score": {"type": "number"}
                }
            }
        }
    }'::jsonb,
    'skip',
    'rule',
    true,
    false,
    NULL,  -- TODO: Replace with created_by user ID
    NULL,  -- TODO: Replace with updated_by user ID
    'Valid Length'
)
ON CONFLICT (tenant_id, key, version) DO UPDATE SET
    updated_at = NOW(),
    updated_by = EXCLUDED.updated_by,
    description = EXCLUDED.description,
    tier = EXCLUDED.tier,
    performance_budget_ms = EXCLUDED.performance_budget_ms,
    default_params = EXCLUDED.default_params,
    metadata = EXCLUDED.metadata,
    input_schema = EXCLUDED.input_schema,
    output_schema = EXCLUDED.output_schema;

-- ============================================================================
-- 11. validation.valid_range
-- ============================================================================
INSERT INTO guardrails (
    tenant_id,
    "key",
    version,
    category,
    description,
    tier,
    performance_budget_ms,
    requires_onnx,
    onnx_model_id,
    default_params,
    metadata,
    is_enabled,
    pack_name,
    function_name,
    input_schema,
    output_schema,
    fallback_strategy,
    infrastructure,
    is_global,
    is_certified,
    created_by,
    updated_by,
    name
) VALUES (
    NULL,
    'validation.valid_range',
    'v1',
    'validation',
    'Validates that a numerical value is within an expected range. Useful for ensuring numeric outputs (integers or floats) meet range constraints.',
    'T0',
    1.0,
    false,
    NULL,
    '{}'::jsonb,
    '{
        "guard_type": "validation",
        "validation_type": "range",
        "operates_on": ["integer", "float"],
        "programmatic_fix": false,
        "applicable_phases": ["input", "output"]
    }'::jsonb,
    true,
    'validation',
    'valid_range',
    '{
        "type": "object",
        "properties": {
            "min": {
                "type": "number",
                "description": "The inclusive minimum value (null for no minimum)"
            },
            "max": {
                "type": "number",
                "description": "The inclusive maximum value (null for no maximum)"
            },
            "severity": {
                "type": "string",
                "enum": ["low", "med", "high", "critical"],
                "description": "Severity level for violations",
                "default": "med"
            }
        }
    }'::jsonb,
    '{
        "type": "object",
        "properties": {
            "violation": {
                "type": "object",
                "properties": {
                    "rule_id": {"type": "string"},
                    "severity": {"type": "string"},
                    "message": {"type": "string"},
                    "score": {"type": "number"}
                }
            }
        }
    }'::jsonb,
    'skip',
    'rule',
    true,
    false,
    NULL,  -- TODO: Replace with created_by user ID
    NULL,  -- TODO: Replace with updated_by user ID
    'Valid Range'
)
ON CONFLICT (tenant_id, key, version) DO UPDATE SET
    updated_at = NOW(),
    updated_by = EXCLUDED.updated_by,
    description = EXCLUDED.description,
    tier = EXCLUDED.tier,
    performance_budget_ms = EXCLUDED.performance_budget_ms,
    default_params = EXCLUDED.default_params,
    metadata = EXCLUDED.metadata,
    input_schema = EXCLUDED.input_schema,
    output_schema = EXCLUDED.output_schema;

-- ============================================================================
-- END OF VALIDATION GUARDS INSERT
-- ============================================================================
-- Total: 11 guards inserted
-- All guards are set as global marketplace guards (tenant_id = NULL)
-- All guards use T0 tier for maximum performance
-- All guards have proper JSON schemas and metadata
-- ============================================================================

