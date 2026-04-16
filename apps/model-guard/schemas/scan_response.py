"""
Scan response schemas.

This module defines response schemas for model scanning operations.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ScanResponseSummary(BaseModel):
    """Summary of scan results."""
    
    scan_id: str = Field(..., description="Unique scan identifier")
    artifact_id: str = Field(..., description="Artifact identifier")
    status: str = Field(..., description="Scan status")
    format: str = Field(..., description="Detected model format")
    findings_count: int = Field(..., description="Total number of findings")
    critical_count: int = Field(0, description="Number of critical findings")
    high_count: int = Field(0, description="Number of high severity findings")
    medium_count: int = Field(0, description="Number of medium severity findings")
    low_count: int = Field(0, description="Number of low severity findings")
    info_count: int = Field(0, description="Number of informational findings")
    approval_status: str = Field(..., description="Model approval status")
    scan_duration_ms: int = Field(..., description="Scan duration in milliseconds")
    created_at: str = Field(..., description="Scan creation timestamp")
    completed_at: Optional[str] = Field(None, description="Scan completion timestamp")


class FindingDetail(BaseModel):
    """Detailed finding information."""
    
    id: str = Field(..., description="Finding identifier")
    type: str = Field(..., description="Finding type")
    severity: str = Field(..., description="Severity level")
    title: str = Field(..., description="Finding title")
    description: str = Field(..., description="Finding description")
    recommendation: Optional[str] = Field(None, description="Remediation recommendation")
    evidence: Optional[Dict[str, Any]] = Field(None, description="Supporting evidence")
    scanner: str = Field(..., description="Scanner that generated this finding")
    location: Optional[Dict[str, Any]] = Field(None, description="Location in model")
    cwe_id: Optional[str] = Field(None, description="CWE identifier")
    created_at: str = Field(..., description="Finding creation timestamp")


class ScanResponseDetailed(BaseModel):
    """Detailed scan response with all findings."""
    
    scan_id: str = Field(..., description="Unique scan identifier")
    artifact_id: str = Field(..., description="Artifact identifier")
    status: str = Field(..., description="Scan status")
    format: str = Field(..., description="Detected model format")
    
    metadata: Dict[str, Any] = Field(..., description="Model metadata")
    
    findings: List[FindingDetail] = Field(
        default_factory=list,
        description="List of security findings"
    )
    
    sbom: Optional[Dict[str, Any]] = Field(None, description="Software Bill of Materials")
    
    approval_status: str = Field(..., description="Model approval status")
    blocked_reason: Optional[str] = Field(None, description="Reason if model is blocked")
    
    scan_duration_ms: int = Field(..., description="Scan duration in milliseconds")
    created_at: str = Field(..., description="Scan creation timestamp")
    completed_at: Optional[str] = Field(None, description="Scan completion timestamp")
    
    recommendations: List[str] = Field(
        default_factory=list,
        description="Actionable recommendations"
    )


class ScanErrorResponse(BaseModel):
    """Error response for scan operations."""
    
    error: str = Field(..., description="Error type")
    message: str = Field(..., description="Error message")
    details: Optional[Dict[str, Any]] = Field(None, description="Additional error details")
    scan_id: Optional[str] = Field(None, description="Scan ID if available")


class ScanListResponse(BaseModel):
    """Response for listing scans."""
    
    scans: List[ScanResponseSummary] = Field(..., description="List of scans")
    total: int = Field(..., description="Total number of scans")
    page: int = Field(1, description="Current page number")
    page_size: int = Field(20, description="Page size")
    has_more: bool = Field(False, description="Whether more results exist")


class ArtifactInfoResponse(BaseModel):
    """Response with artifact information."""
    
    artifact_id: str = Field(..., description="Artifact identifier")
    uri: str = Field(..., description="Original URI")
    filename: str = Field(..., description="Filename")
    format: str = Field(..., description="Detected format")
    size_bytes: int = Field(..., description="File size in bytes")
    sha256: str = Field(..., description="SHA-256 hash")
    approval_status: str = Field(..., description="Approval status")
    scan_count: int = Field(0, description="Number of times scanned")
    last_scanned_at: Optional[str] = Field(None, description="Last scan timestamp")
    created_at: str = Field(..., description="Creation timestamp")


class ReportExportResponse(BaseModel):
    """Response for report export."""
    
    report_id: str = Field(..., description="Report identifier")
    format: str = Field(..., description="Report format")
    content: Dict[str, Any] = Field(..., description="Report content")
    generated_at: str = Field(..., description="Generation timestamp")
