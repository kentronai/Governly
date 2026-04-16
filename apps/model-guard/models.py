"""
SQLAlchemy models for ModelGuard.

These models integrate with the existing shared PostgreSQL database
and follow the same patterns as the web app (drizzle schema).
"""

from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import declarative_base, relationship

# Base class for all models
Base = declarative_base()


class ModelArtifact(Base):
    """
    Model artifacts submitted for scanning.
    
    Stores information about ML model files that have been submitted
    for security scanning. Each artifact is identified by its SHA-256 hash
    and can be scanned multiple times.
    """
    
    __tablename__ = "model_artifacts"
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()"))
    
    # Multi-tenancy (Foreign key to shared tenants table)
    tenant_id = Column(
        Text,
        # ForeignKey('tenants.id', ondelete='CASCADE'),  # Disabled - tables exist from Drizzle
        nullable=False,
        index=True
    )
    
    # Source information
    source = Column(Text, nullable=False)  # 'hf', 's3', 'https', 'file'
    uri = Column(Text, nullable=False)
    filename = Column(Text)
    
    # File metadata
    size_bytes = Column(Integer)
    sha256 = Column(Text, nullable=False, index=True)
    content_type = Column(Text)
    detected_format = Column(Text, index=True)  # 'onnx', 'pytorch', 'keras', etc.
    
    # Approval status
    approval_status = Column(
        Text, 
        nullable=False, 
        default='pending',
        index=True
    )  # 'pending', 'approved', 'rejected', 'requires_review'
    blocked_reason = Column(Text)  # NULL if approved
    
    # Additional metadata
    artifact_metadata = Column(JSONB, nullable=False, default={}, server_default=text("'{}'::jsonb"))
    
    # Audit fields (Foreign keys to shared users table)
    created_by = Column(
        Text,
        # ForeignKey('users.id', ondelete='RESTRICT'),  # Disabled - tables exist from Drizzle
        nullable=False,
        index=True
    )
    updated_by = Column(
        Text,
        # ForeignKey('users.id', ondelete='SET NULL'),  # Disabled - tables exist from Drizzle
        nullable=True
    )
    
    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        server_default=text("now()")
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=text("now()")
    )
    deleted_at = Column(DateTime(timezone=True))
    
    # Relationships - disabled since foreign keys are disabled
    # scans = relationship("ModelScan", back_populates="artifact", cascade="all, delete-orphan")
    
    # Table args for indexes and constraints
    __table_args__ = (
        Index('idx_model_artifacts_tenant', 'tenant_id'),
        Index('idx_model_artifacts_sha256', 'sha256'),
        Index('idx_model_artifacts_format', 'detected_format'),
        Index('idx_model_artifacts_approval', 'approval_status'),
        Index('idx_model_artifacts_created_by', 'created_by'),
        Index('idx_model_artifacts_metadata_gin', 'artifact_metadata', postgresql_using='gin'),
        # Same model can be scanned by different tenants
        Index('uq_model_artifacts_tenant_sha256', 'tenant_id', 'sha256', unique=True),
    )


# Bias Detection - Uses existing ModelGuard tables
# BiasAnalysisArtifact = ModelArtifact (with scan_type: 'bias' in artifact_metadata)
# BiasAnalysisResult = ModelScan (with bias results in report_json)
# BiasFinding = ScanFinding (with bias-specific rule_id prefixes like 'BIAS.GENDER.DISPARITY')

class ModelScan(Base):
    """
    Scan execution records.
    
    Each scan represents one security scan execution of a model artifact.
    A single artifact can have multiple scans (rescans over time).
    """
    
    __tablename__ = "model_scans"
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()"))
    
    # Multi-tenancy (Foreign key to shared tenants table)
    tenant_id = Column(
        Text,
        # ForeignKey('tenants.id', ondelete='CASCADE'),  # Disabled - tables exist from Drizzle
        nullable=False,
        index=True
    )
    
    # Foreign key to artifact
    artifact_id = Column(
        UUID(as_uuid=True),
        # ForeignKey('model_artifacts.id', ondelete='CASCADE'),  # Disabled - tables exist from Drizzle
        nullable=False,
        index=True
    )
    
    # Scan status
    status = Column(
        Text,
        nullable=False,
        default='queued',
        index=True
    )  # 'queued', 'running', 'success', 'failed'
    
    # Scan details
    engine_version = Column(Text)  # ModelGuard version used
    sbom = Column(JSONB, default={}, server_default=text("'{}'::jsonb"))  # Software Bill of Materials
    report_json = Column(JSONB)  # Full JSON report
    report_sarif = Column(JSONB)  # SARIF 2.1.0 format
    error = Column(Text)  # Error message if failed
    
    # Audit fields (Foreign keys to shared users table)
    created_by = Column(
        Text,
        # ForeignKey('users.id', ondelete='RESTRICT'),  # Disabled - tables exist from Drizzle
        nullable=False,
        index=True
    )
    updated_by = Column(
        Text,
        # ForeignKey('users.id', ondelete='SET NULL'),  # Disabled - tables exist from Drizzle
        nullable=True
    )
    
    # Timing
    started_at = Column(DateTime(timezone=True))
    finished_at = Column(DateTime(timezone=True))
    
    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        server_default=text("now()")
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=text("now()")
    )
    
    # Relationships - disabled since foreign keys are disabled
    # artifact = relationship("ModelArtifact", back_populates="scans")
    # findings = relationship("ScanFinding", back_populates="scan", cascade="all, delete-orphan")
    
    # Table args for indexes
    __table_args__ = (
        Index('idx_model_scans_tenant', 'tenant_id'),
        Index('idx_model_scans_artifact', 'artifact_id'),
        Index('idx_model_scans_status', 'status'),
        Index('idx_model_scans_created_by', 'created_by'),
        Index('idx_model_scans_sbom_gin', 'sbom', postgresql_using='gin'),
    )


class ScanFinding(Base):
    """
    Security findings from scans.
    
    Each finding represents a security issue or concern discovered
    during a model scan.
    """
    
    __tablename__ = "scan_findings"
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()"))
    
    # Multi-tenancy (Foreign key to shared tenants table)
    tenant_id = Column(
        Text,
        # ForeignKey('tenants.id', ondelete='CASCADE'),  # Disabled - tables exist from Drizzle
        nullable=False,
        index=True
    )
    
    # Foreign key to scan
    scan_id = Column(
        UUID(as_uuid=True),
        # ForeignKey('model_scans.id', ondelete='CASCADE'),  # Disabled - tables exist from Drizzle
        nullable=False,
        index=True
    )
    
    # Finding details
    rule_id = Column(Text, nullable=False, index=True)  # e.g., 'MODEL.PICKLE.UNSAFE'
    severity = Column(Text, nullable=False, index=True)  # 'Critical', 'High', 'Medium', 'Low', 'Info'
    title = Column(Text, nullable=False)
    description = Column(Text)
    
    # Evidence and remediation
    evidence = Column(JSONB, default={}, server_default=text("'{}'::jsonb"))
    remediation = Column(JSONB)
    
    # CVE/vulnerability tracking
    cve_id = Column(Text, index=True)  # Optional CVE identifier
    
    # User actions
    suppressed = Column(Boolean, default=False, nullable=False)  # User can suppress false positives
    
    # Timestamp
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        server_default=text("now()")
    )
    
    # Relationships - disabled since foreign keys are disabled
    # scan = relationship("ModelScan", back_populates="findings")
    
    # Table args for indexes
    __table_args__ = (
        Index('idx_scan_findings_tenant', 'tenant_id'),
        Index('idx_scan_findings_scan', 'scan_id'),
        Index('idx_scan_findings_rule', 'rule_id'),
        Index('idx_scan_findings_severity', 'severity'),
        Index('idx_scan_findings_cve', 'cve_id'),
    )


# Export all models for easy import
__all__ = [
    'Base',
    'ModelArtifact',
    'ModelScan',
    'ScanFinding',
]

