"""
Custom operators security scanner.

This module detects and analyzes custom operators in ML models,
identifying potential security risks from non-standard operations.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional, Set

from ..types import SecurityFinding, Severity, ModelMetadata, ModelFormat, SBOMFeatures


class CustomOpsScanner:
    """Scans models for custom operators and non-standard operations."""
    
    # Trusted operator domains
    TRUSTED_DOMAINS = {
        'ai.onnx',
        'ai.onnx.ml',
        'ai.onnx.preview.training',
        'com.microsoft',
        'com.microsoft.nuphar',
        'org.pytorch.aten',
    }
    
    def __init__(self, sbom_features: Optional[SBOMFeatures], model_format: ModelFormat):
        """
        Initialize custom ops scanner.
        
        Args:
            sbom_features: Extracted SBOM features (can be None for fallback)
            model_format: Detected model format
        """
        self.sbom_features = sbom_features
        self.model_format = model_format
        self.findings: List[SecurityFinding] = []
    
    def scan(self) -> List[SecurityFinding]:
        """
        Scan model for custom operator security issues.
        
        Returns:
            List of security findings
        """
        self.findings = []
        
        # Only scan formats that support explicit operators
        if self.model_format == ModelFormat.ONNX:
            self._scan_onnx_operators()
        elif self.model_format == ModelFormat.TENSORFLOW:
            self._scan_tensorflow_operators()
        
        # Check for custom operators using SBOM features
        if self.sbom_features and self.sbom_features.has_custom_ops:
            self._scan_custom_operators()
        
        return self.findings
    
    def _scan_onnx_operators(self) -> None:
        """Scan ONNX model for custom operators."""
        # Use SBOM features for domain analysis
        if not self.sbom_features:
            return  # Skip if no SBOM features available
            
        untrusted_domains = self.sbom_features.untrusted_domains
        
        if untrusted_domains:
            self.findings.append(SecurityFinding(
                id='ONNX.CUSTOM_OPS.UNTRUSTED_DOMAIN',
                type='custom_operators',
                severity=Severity.HIGH,
                title='Untrusted operator domains detected',
                description=f'Model uses {len(untrusted_domains)} non-standard operator domain(s): {", ".join(untrusted_domains)}. '
                           'Custom operators may contain malicious code or vulnerabilities.',
                recommendation='Review custom operators and verify they are from trusted sources. '
                              'Add to allowlist if verified safe.',
                evidence={
                    'untrusted_domains': untrusted_domains,
                    'trusted_domains': self.sbom_features.trusted_domains,
                    'custom_operator_count': self.sbom_features.custom_operator_count
                },
                scanner='custom_ops_scanner',
                location={'operators': untrusted_domains},
                cwe_id='CWE-829',
                created_at=datetime.utcnow().isoformat() + 'Z'
            ))
    
    def _scan_tensorflow_operators(self) -> None:
        """Scan TensorFlow model for custom operators."""
        # TensorFlow custom ops detection using SBOM features
        if not self.sbom_features:
            return  # Skip if no SBOM features available
            
        if self.sbom_features.has_custom_ops:
            self.findings.append(SecurityFinding(
                id='TF.CUSTOM_OPS.DETECTED',
                type='custom_operators',
                severity=Severity.MEDIUM,
                title='TensorFlow custom operators detected',
                description=f'Model uses {self.sbom_features.custom_operator_count} custom operator(s)',
                recommendation='Review custom operators for security concerns',
                evidence={
                    'custom_operator_count': self.sbom_features.custom_operator_count,
                    'has_custom_ops': self.sbom_features.has_custom_ops
                },
                scanner='custom_ops_scanner',
                created_at=datetime.utcnow().isoformat() + 'Z'
            ))
    
    def _scan_custom_operators(self) -> None:
        """Scan for any custom operators using SBOM features."""
        if not self.sbom_features or not self.sbom_features.has_custom_ops:
            return
        
        # Check for suspicious keywords in SBOM features
        if self.sbom_features.suspicious_keywords:
            self.findings.append(SecurityFinding(
                id='MODEL.CUSTOM_OPS.SUSPICIOUS',
                type='custom_operators',
                severity=Severity.CRITICAL,
                title='Suspicious keywords detected in model',
                description=f'Found suspicious keywords: {", ".join(self.sbom_features.suspicious_keywords)} that may indicate malicious behavior',
                recommendation='Thoroughly inspect this model before using it',
                evidence={
                    'suspicious_keywords': self.sbom_features.suspicious_keywords,
                    'count': len(self.sbom_features.suspicious_keywords)
                },
                scanner='custom_ops_scanner',
                cwe_id='CWE-912',
                created_at=datetime.utcnow().isoformat() + 'Z'
            ))
        
        # General warning for many custom operators
        if self.sbom_features.custom_operator_count > 5:
            self.findings.append(SecurityFinding(
                id='MODEL.CUSTOM_OPS.MANY',
                type='custom_operators',
                severity=Severity.MEDIUM,
                title=f'Model uses many custom operators ({self.sbom_features.custom_operator_count})',
                description='Large number of custom operators increases attack surface and complexity',
                recommendation='Review all custom operators and ensure they are necessary',
                evidence={
                    'custom_operator_count': self.sbom_features.custom_operator_count,
                    'complexity_score': self.sbom_features.model_complexity_score
                },
                scanner='custom_ops_scanner',
                created_at=datetime.utcnow().isoformat() + 'Z'
            ))


def scan_custom_operators(sbom_features: Optional[SBOMFeatures], model_format: ModelFormat) -> List[SecurityFinding]:
    """
    Convenience function to scan for custom operator issues.
    
    Args:
        sbom_features: Extracted SBOM features
        model_format: Detected model format
        
    Returns:
        List of security findings
    """
    scanner = CustomOpsScanner(sbom_features, model_format)
    return scanner.scan()
