-- ============================================
-- ModelGuard Tables (extends existing schema)
-- ============================================
-- This migration adds tables for model security scanning
-- Integrates with existing tenants, users, and audit_events tables

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Table 1: MODEL_ARTIFACTS (models submitted for scanning)
CREATE TABLE IF NOT EXISTS model_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Source information
  source text NOT NULL,  -- 'hf', 's3', 'https', 'file'
  uri text NOT NULL,
  filename text,
  
  -- File metadata
  size_bytes integer,
  sha256 text NOT NULL,
  content_type text,
  detected_format text,  -- 'onnx', 'pytorch-pickle', 'keras', 'safetensors', etc.
  
  -- Approval workflow
  approval_status text NOT NULL DEFAULT 'pending',  -- 'pending', 'approved', 'rejected', 'requires_review'
  blocked_reason text,  -- NULL if approved, otherwise reason for rejection
  
  -- Additional metadata
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  
  -- Audit fields (references users table)
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by text REFERENCES users(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz,
  
  -- Same model can be scanned by different tenants
  CONSTRAINT uq_model_artifacts_tenant_sha256 UNIQUE (tenant_id, sha256)
);

-- Indexes for model_artifacts
CREATE INDEX IF NOT EXISTS idx_model_artifacts_tenant ON model_artifacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_model_artifacts_sha256 ON model_artifacts(sha256);
CREATE INDEX IF NOT EXISTS idx_model_artifacts_format ON model_artifacts(detected_format);
CREATE INDEX IF NOT EXISTS idx_model_artifacts_approval ON model_artifacts(approval_status);
CREATE INDEX IF NOT EXISTS idx_model_artifacts_created_by ON model_artifacts(created_by);
CREATE INDEX IF NOT EXISTS idx_model_artifacts_metadata_gin ON model_artifacts USING gin(metadata);

-- Table 2: MODEL_SCANS (scan execution records)
CREATE TABLE IF NOT EXISTS model_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES model_artifacts(id) ON DELETE CASCADE,
  
  -- Scan status
  status text NOT NULL DEFAULT 'queued',  -- 'queued', 'running', 'success', 'failed'
  engine_version text,  -- ModelGuard version
  
  -- Scan results
  sbom jsonb DEFAULT '{}'::jsonb,  -- Software Bill of Materials
  report_json jsonb,  -- Full JSON report
  report_sarif jsonb,  -- SARIF 2.1.0 format for CI/CD
  error text,  -- Error message if failed
  
  -- Audit fields
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by text REFERENCES users(id) ON DELETE SET NULL,
  
  -- Timing
  started_at timestamptz,
  finished_at timestamptz,
  
  -- Timestamps
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes for model_scans
CREATE INDEX IF NOT EXISTS idx_model_scans_tenant ON model_scans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_model_scans_artifact ON model_scans(artifact_id);
CREATE INDEX IF NOT EXISTS idx_model_scans_status ON model_scans(status);
CREATE INDEX IF NOT EXISTS idx_model_scans_created_by ON model_scans(created_by);
CREATE INDEX IF NOT EXISTS idx_model_scans_sbom_gin ON model_scans USING gin(sbom);

-- Table 3: SCAN_FINDINGS (security findings)
CREATE TABLE IF NOT EXISTS scan_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scan_id uuid NOT NULL REFERENCES model_scans(id) ON DELETE CASCADE,
  
  -- Finding details
  rule_id text NOT NULL,  -- 'MODEL.PICKLE.UNSAFE', 'ONNX.CUSTOM.DOMAIN', etc.
  severity text NOT NULL,  -- 'Critical', 'High', 'Medium', 'Low', 'Info'
  title text NOT NULL,
  description text,
  
  -- Evidence and remediation
  evidence jsonb DEFAULT '{}'::jsonb,
  remediation jsonb,
  
  -- CVE/vulnerability tracking
  cve_id text,  -- Optional CVE identifier
  
  -- User actions
  suppressed boolean DEFAULT false NOT NULL,  -- Allows users to acknowledge false positives
  
  -- Timestamp
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes for scan_findings
CREATE INDEX IF NOT EXISTS idx_scan_findings_tenant ON scan_findings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scan_findings_scan ON scan_findings(scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_findings_rule ON scan_findings(rule_id);
CREATE INDEX IF NOT EXISTS idx_scan_findings_severity ON scan_findings(severity);
CREATE INDEX IF NOT EXISTS idx_scan_findings_cve ON scan_findings(cve_id) WHERE cve_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON TABLE model_artifacts IS 'ML model files submitted for security scanning';
COMMENT ON TABLE model_scans IS 'Security scan execution records for model artifacts';
COMMENT ON TABLE scan_findings IS 'Security vulnerabilities and issues found during scans';

COMMENT ON COLUMN model_artifacts.source IS 'Source type: hf (HuggingFace), s3 (AWS S3), https (HTTP/HTTPS), file (local)';
COMMENT ON COLUMN model_artifacts.approval_status IS 'Workflow status: pending, approved, rejected, requires_review';
COMMENT ON COLUMN model_artifacts.detected_format IS 'Model format: onnx, pytorch, keras, safetensors, tensorflow, tflite, gguf';

COMMENT ON COLUMN model_scans.status IS 'Scan status: queued, running, success, failed';
COMMENT ON COLUMN model_scans.sbom IS 'Software Bill of Materials - extracted model metadata';
COMMENT ON COLUMN model_scans.report_sarif IS 'SARIF 2.1.0 format for GitHub Security integration';

COMMENT ON COLUMN scan_findings.severity IS 'Severity level: Critical, High, Medium, Low, Info';
COMMENT ON COLUMN scan_findings.suppressed IS 'True if user has acknowledged and suppressed this finding';

-- Grant permissions (assuming existing role patterns)
-- These should match your existing database permissions
-- Example:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON model_artifacts TO app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON model_scans TO app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON scan_findings TO app_user;

