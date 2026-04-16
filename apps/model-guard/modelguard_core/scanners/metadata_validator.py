"""
Metadata validation scanner.

This module validates model metadata for completeness, correctness,
and potential security issues.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from ..types import SecurityFinding, Severity, ModelMetadata, ModelFormat, SBOMFeatures


class MetadataValidator:
    """Validates model metadata for security and compliance."""
    
    def __init__(self, sbom_features: Optional[SBOMFeatures], model_format: ModelFormat):
        """
        Initialize metadata validator.
        
        Args:
            sbom_features: Extracted SBOM features
            model_format: Detected model format
        """
        self.sbom_features = sbom_features
        self.model_format = model_format
        self.findings: List[SecurityFinding] = []
    
    def scan(self) -> List[SecurityFinding]:
        """
        Validate model metadata.
        
        Returns:
            List of security findings
        """
        self.findings = []
        
        # Run validation checks
        self._check_missing_metadata()
        self._check_suspicious_values()
        self._check_license()
        self._check_provenance()
        
        return self.findings
    
    def _check_missing_metadata(self) -> None:
        """Check for missing important metadata fields using SBOM features."""
        if not self.sbom_features:
            return  # Skip if no SBOM features available
            
        missing_fields = []
        
        if not self.sbom_features.has_version:
            missing_fields.append('version')
        
        if not self.sbom_features.has_description:
            missing_fields.append('description')
        
        if not self.sbom_features.has_author:
            missing_fields.append('author')
        
        if not self.sbom_features.has_license:
            missing_fields.append('license')
        
        if missing_fields:
            self.findings.append(SecurityFinding(
                id='METADATA.MISSING_FIELDS',
                type='metadata_validation',
                severity=Severity.MEDIUM,
                title='Important metadata fields are missing',
                description=f'Model is missing {len(missing_fields)} important metadata field(s): {", ".join(missing_fields)}. '
                           'Incomplete metadata may indicate poor quality or tampered model.',
                recommendation='Request complete metadata from model provider',
                evidence={
                    'missing_fields': missing_fields,
                    'has_author': self.sbom_features.has_author,
                    'has_description': self.sbom_features.has_description,
                    'has_version': self.sbom_features.has_version,
                    'has_license': self.sbom_features.has_license
                },
                scanner='metadata_validator',
                created_at=datetime.utcnow().isoformat() + 'Z'
            ))
    
    def _check_suspicious_values(self) -> None:
        """Check for suspicious metadata values using SBOM features."""
        if not self.sbom_features:
            return  # Skip if no SBOM features available
        
        # Check for suspicious keywords (already handled in backdoor scanner)
        # This method is now simplified since most checks moved to SBOM features
        pass
    
    def _check_license(self) -> None:
        """Check model license information using SBOM features."""
        if not self.sbom_features:
            return
            
        if not self.sbom_features.has_license:
            self.findings.append(SecurityFinding(
                id='METADATA.NO_LICENSE',
                type='metadata_validation',
                severity=Severity.LOW,
                title='Model has no license information',
                description='Model does not specify a license, which may have legal implications',
                recommendation='Verify license terms with model provider before use',
                evidence={
                    'has_license': self.sbom_features.has_license
                },
                scanner='metadata_validator',
                created_at=datetime.utcnow().isoformat() + 'Z'
            ))
    
    def _check_provenance(self) -> None:
        """Check model provenance information using SBOM features."""
        if not self.sbom_features:
            return  # Skip if no SBOM features available
            
        # Check if author is specified
        if not self.sbom_features.has_author:
            self.findings.append(SecurityFinding(
                id='METADATA.NO_AUTHOR',
                type='metadata_validation',
                severity=Severity.LOW,
                title='Model author not specified',
                description='Model does not specify an author, making it difficult to verify authenticity',
                recommendation='Verify model source and authenticity through other means',
                evidence={
                    'has_author': self.sbom_features.has_author
                },
                scanner='metadata_validator',
                created_at=datetime.utcnow().isoformat() + 'Z'
            ))
        
        # Check if version is available
        if not self.sbom_features.has_version:
            self.findings.append(SecurityFinding(
                id='METADATA.NO_TIMESTAMP',
                type='metadata_validation',
                severity=Severity.LOW,
                title='Model version not available',
                description='Model does not have version information, making it difficult to assess freshness',
                recommendation='Request version and creation information from model provider',
                evidence={
                    'has_version': self.sbom_features.has_version
                },
                scanner='metadata_validator',
                created_at=datetime.utcnow().isoformat() + 'Z'
            ))


def validate_metadata(sbom_features: Optional[SBOMFeatures], model_format: ModelFormat) -> List[SecurityFinding]:
    """
    Convenience function to validate metadata.
    
    Args:
        sbom_features: Extracted SBOM features
        model_format: Detected model format
        
    Returns:
        List of security findings
    """
    validator = MetadataValidator(sbom_features, model_format)
    return validator.scan()
