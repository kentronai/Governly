"""
ModelGuard Core - ML Model Security Scanning.

This package provides core functionality for scanning machine learning models
for security vulnerabilities, generating SBOMs, and detecting threats.
"""

from .types import (
    ModelFormat,
    Severity,
    ScanStatus,
    ApprovalStatus,
    SecurityFinding,
    ModelMetadata,
    SBOMComponent,
)
from .sniff import detect_model_format, FormatDetector
from .sbom import build_sbom, SBOMBuilder

__version__ = "1.0.0"

__all__ = [
    # Types
    "ModelFormat",
    "Severity",
    "ScanStatus",
    "ApprovalStatus",
    "SecurityFinding",
    "ModelMetadata",
    "SBOMComponent",
    # Format Detection
    "detect_model_format",
    "FormatDetector",
    # SBOM
    "build_sbom",
    "SBOMBuilder",
]
