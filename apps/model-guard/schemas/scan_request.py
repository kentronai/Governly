"""
Scan request schemas.

This module defines request schemas for model scanning operations.
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, HttpUrl, field_validator


class ScanModelRequest(BaseModel):
    """Request to scan a model from URI."""
    
    uri: str = Field(
        ...,
        description="Model URI (hf://, s3://, https://, file://)",
        examples=[
            "hf://unitary/toxic-bert/model.onnx",
            "s3://bucket/models/model.pth",
            "https://example.com/model.safetensors"
        ]
    )
    
    metadata: Optional[Dict[str, Any]] = Field(
        None,
        description="Additional metadata about the model"
    )
    
    scan_options: Optional[Dict[str, Any]] = Field(
        None,
        description="Optional scan configuration"
    )
    
    @field_validator('uri')
    @classmethod
    def validate_uri(cls, v: str) -> str:
        """Validate model URI format."""
        if not v:
            raise ValueError("URI cannot be empty")
        
        # Check supported schemes
        supported_schemes = ['hf://', 's3://', 'https://', 'http://', 'file://']
        if not any(v.startswith(scheme) for scheme in supported_schemes):
            raise ValueError(
                f"URI must start with one of: {', '.join(supported_schemes)}"
            )
        
        return v


class ScanUploadRequest(BaseModel):
    """Request to scan an uploaded model file."""
    
    filename: str = Field(..., description="Original filename")
    content_type: Optional[str] = Field(None, description="File content type")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")


class RescanRequest(BaseModel):
    """Request to rescan an existing artifact."""
    
    artifact_id: str = Field(..., description="Artifact ID to rescan")
    force: bool = Field(False, description="Force rescan even if recently scanned")


class ExportReportRequest(BaseModel):
    """Request to export scan report in specific format."""
    
    scan_id: str = Field(..., description="Scan ID to export")
    format: str = Field(
        "json",
        description="Report format",
        pattern="^(json|sarif|cef)$"
    )
    
    @field_validator('format')
    @classmethod
    def validate_format(cls, v: str) -> str:
        """Validate report format."""
        if v not in ['json', 'sarif', 'cef']:
            raise ValueError("Format must be one of: json, sarif, cef")
        return v
