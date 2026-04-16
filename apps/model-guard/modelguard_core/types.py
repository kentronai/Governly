"""
Core types and enums for Model Guard.

This module defines the fundamental data structures used throughout
the Model Guard system for model scanning and security analysis.
"""

from enum import Enum
from typing import Any, Dict, List, Optional, Union
from uuid import UUID

from pydantic import BaseModel, Field


class ModelFormat(str, Enum):
    """Supported model formats for scanning."""
    
    ONNX = "onnx"
    PYTORCH = "pytorch"
    KERAS = "keras"
    SAFETENSORS = "safetensors"
    TENSORFLOW = "tensorflow"
    TFLITE = "tflite"
    GGUF = "gguf"
    UNKNOWN = "unknown"


class Severity(str, Enum):
    """Security finding severity levels."""
    
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class ScanStatus(str, Enum):
    """Scan execution status."""
    
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ApprovalStatus(str, Enum):
    """Model approval status based on scan results."""
    
    APPROVED = "approved"
    REJECTED = "rejected"
    PENDING_REVIEW = "pending_review"
    REQUIRES_ATTENTION = "requires_attention"


class ScanType(str, Enum):
    """Types of security scans to perform."""
    
    FORMAT_DETECTION = "format_detection"
    SBOM_GENERATION = "sbom_generation"
    PICKLE_DETECTION = "pickle_detection"
    CUSTOM_OPS_SCAN = "custom_ops_scan"
    BACKDOOR_SCAN = "backdoor_scan"
    METADATA_VALIDATION = "metadata_validation"
    EXTERNAL_SOURCES = "external_sources"


class SecurityFinding(BaseModel):
    """A security finding from model scanning."""
    
    id: str = Field(..., description="Unique identifier for the finding")
    type: str = Field(..., description="Type of security issue")
    severity: Severity = Field(..., description="Severity level")
    title: str = Field(..., description="Human-readable title")
    description: str = Field(..., description="Detailed description")
    recommendation: Optional[str] = Field(None, description="Remediation recommendation")
    evidence: Optional[Dict[str, Any]] = Field(None, description="Supporting evidence")
    scanner: str = Field(..., description="Scanner that found this issue")
    location: Optional[Dict[str, Any]] = Field(None, description="Location in model where issue was found")
    cwe_id: Optional[str] = Field(None, description="CWE identifier if applicable")
    created_at: str = Field(..., description="ISO timestamp when finding was created")


class SBOMComponent(BaseModel):
    """A component in the Software Bill of Materials."""
    
    name: str = Field(..., description="Component name")
    version: Optional[str] = Field(None, description="Component version")
    type: str = Field(..., description="Component type (library, framework, etc.)")
    purl: Optional[str] = Field(None, description="Package URL identifier")
    license: Optional[str] = Field(None, description="License information")
    supplier: Optional[str] = Field(None, description="Component supplier")
    description: Optional[str] = Field(None, description="Component description")
    hashes: Optional[Dict[str, str]] = Field(None, description="File hashes")
    external_refs: Optional[List[Dict[str, str]]] = Field(None, description="External references")


class SBOMDocument(BaseModel):
    """Standardized SBOM document structure."""
    
    bom_format: str = Field(default="ModelGuard-SBOM", description="SBOM format identifier")
    spec_version: str = Field(default="1.0", description="SBOM specification version")
    version: int = Field(default=1, description="SBOM document version")
    serial_number: str = Field(..., description="Unique SBOM identifier")
    metadata: Dict[str, Any] = Field(..., description="SBOM metadata")
    components: List[Dict[str, Any]] = Field(default_factory=list, description="SBOM components")
    model_info: Dict[str, Any] = Field(..., description="Model-specific information")
    
    class Config:
        """Pydantic configuration."""
        json_encoders = {
            # Custom encoders if needed
        }


class SBOMFeatures(BaseModel):
    """Extracted features from SBOM for scanner analysis."""
    
    # Model structure features
    format: str = Field(..., description="Model format")
    operator_count: int = Field(default=0, description="Total number of operators")
    custom_operator_count: int = Field(default=0, description="Number of custom operators")
    external_data_count: int = Field(default=0, description="Number of external data references")
    layer_count: Optional[int] = Field(None, description="Number of model layers")
    
    # Security-relevant features
    has_pickle: bool = Field(default=False, description="Model uses pickle serialization")
    has_lambda_layers: bool = Field(default=False, description="Model has lambda layers")
    has_custom_ops: bool = Field(default=False, description="Model has custom operators")
    has_external_data: bool = Field(default=False, description="Model references external data")
    has_network_ops: bool = Field(default=False, description="Model has network-related operators")
    has_file_ops: bool = Field(default=False, description="Model has file system operators")
    
    # Metadata features
    has_license: bool = Field(default=False, description="Model has license information")
    has_author: bool = Field(default=False, description="Model has author information")
    has_description: bool = Field(default=False, description="Model has description")
    has_version: bool = Field(default=False, description="Model has version information")
    
    # Complexity features
    model_complexity_score: float = Field(default=0.0, description="Calculated complexity score")
    suspicious_keywords: List[str] = Field(default_factory=list, description="Suspicious keywords found")
    trusted_domains: List[str] = Field(default_factory=list, description="Trusted operator domains")
    untrusted_domains: List[str] = Field(default_factory=list, description="Untrusted operator domains")
    
    # Runtime dependencies
    runtime_dependencies: List[str] = Field(default_factory=list, description="Required runtime dependencies")
    library_dependencies: List[str] = Field(default_factory=list, description="Required library dependencies")


class ModelMetadata(BaseModel):
    """Extracted model metadata."""
    
    format: ModelFormat = Field(..., description="Detected model format")
    version: Optional[str] = Field(None, description="Model format version")
    producer: Optional[str] = Field(None, description="Model producer/tool")
    description: Optional[str] = Field(None, description="Model description")
    author: Optional[str] = Field(None, description="Model author")
    license: Optional[str] = Field(None, description="Model license")
    tags: List[str] = Field(default_factory=list, description="Model tags")
    input_shapes: List[Dict[str, Any]] = Field(default_factory=list, description="Input tensor shapes")
    output_shapes: List[Dict[str, Any]] = Field(default_factory=list, description="Output tensor shapes")
    operators: List[str] = Field(default_factory=list, description="Used operators")
    custom_operators: List[str] = Field(default_factory=list, description="Custom operators")
    external_data: List[str] = Field(default_factory=list, description="External data references")
    file_size: Optional[int] = Field(None, description="Model file size in bytes")
    created_at: Optional[str] = Field(None, description="Model creation timestamp")
    
    # Hugging Face specific metadata
    hf_model_id: Optional[str] = Field(None, description="Hugging Face model ID")
    hf_author: Optional[str] = Field(None, description="Hugging Face model author/creator")
    hf_downloads: Optional[int] = Field(None, description="Number of downloads from HF Hub")
    hf_likes: Optional[int] = Field(None, description="Number of likes on HF Hub")
    hf_pipeline_tag: Optional[str] = Field(None, description="HF pipeline tag (e.g., text-classification)")
    hf_library_name: Optional[str] = Field(None, description="HF library name (e.g., transformers)")
    hf_created_at: Optional[str] = Field(None, description="HF model creation date")
    hf_last_modified: Optional[str] = Field(None, description="HF model last modified date")
    hf_private: Optional[bool] = Field(None, description="Whether HF model is private")
    hf_gated: Optional[bool] = Field(None, description="Whether HF model is gated")
    hf_model_card: Optional[str] = Field(None, description="HF model card content")


class ScanResult(BaseModel):
    """Complete scan result for a model."""
    
    scan_id: UUID = Field(..., description="Unique scan identifier")
    model_uri: str = Field(..., description="Original model URI")
    status: ScanStatus = Field(..., description="Scan execution status")
    format: ModelFormat = Field(..., description="Detected model format")
    metadata: ModelMetadata = Field(..., description="Extracted model metadata")
    findings: List[SecurityFinding] = Field(default_factory=list, description="Security findings")
    sbom: List[SBOMComponent] = Field(default_factory=list, description="Software Bill of Materials")
    approval_status: ApprovalStatus = Field(..., description="Model approval status")
    scan_duration_ms: int = Field(..., description="Scan duration in milliseconds")
    created_at: str = Field(..., description="Scan creation timestamp")
    completed_at: Optional[str] = Field(None, description="Scan completion timestamp")
    error_message: Optional[str] = Field(None, description="Error message if scan failed")
    tenant_id: str = Field(..., description="Tenant identifier for multi-tenancy")


class ScanRequest(BaseModel):
    """Request to scan a model."""
    
    uri: str = Field(..., description="Model URI (file://, http://, s3://, hf://)")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")
    scan_types: List[ScanType] = Field(
        default_factory=lambda: list(ScanType),
        description="Types of scans to perform"
    )
    tenant_id: str = Field(..., description="Tenant identifier")


class ScanResponse(BaseModel):
    """Response from model scan."""
    
    scan_id: UUID = Field(..., description="Unique scan identifier")
    status: ScanStatus = Field(..., description="Current scan status")
    format: ModelFormat = Field(..., description="Detected model format")
    findings_count: int = Field(..., description="Total number of findings")
    critical_count: int = Field(..., description="Number of critical findings")
    high_count: int = Field(..., description="Number of high severity findings")
    medium_count: int = Field(..., description="Number of medium severity findings")
    low_count: int = Field(..., description="Number of low severity findings")
    approval_status: ApprovalStatus = Field(..., description="Model approval status")
    scan_duration_ms: int = Field(..., description="Scan duration in milliseconds")
    created_at: str = Field(..., description="Scan creation timestamp")
    completed_at: Optional[str] = Field(None, description="Scan completion timestamp")
    error_message: Optional[str] = Field(None, description="Error message if scan failed")


class ExternalSource(BaseModel):
    """External data source reference."""
    
    uri: str = Field(..., description="External source URI")
    type: str = Field(..., description="Source type (file, http, etc.)")
    size: Optional[int] = Field(None, description="Source size in bytes")
    accessible: bool = Field(..., description="Whether source is accessible")
    error: Optional[str] = Field(None, description="Error message if not accessible")


class ModelInfo(BaseModel):
    """Basic model information."""
    
    uri: str = Field(..., description="Model URI")
    format: ModelFormat = Field(..., description="Model format")
    size: Optional[int] = Field(None, description="Model size in bytes")
    accessible: bool = Field(..., description="Whether model is accessible")
    error: Optional[str] = Field(None, description="Error message if not accessible")