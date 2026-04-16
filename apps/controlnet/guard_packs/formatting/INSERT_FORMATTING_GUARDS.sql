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

