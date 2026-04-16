"""
JSON report generation for model scans.

This module generates comprehensive JSON reports of model security scans
in a structured, machine-readable format.
"""

from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..types import (
    SecurityFinding, ModelMetadata, ModelFormat,
    ScanStatus, ApprovalStatus
)


class JSONReportGenerator:
    """Generates JSON reports for model scans."""
    
    def __init__(
        self,
        scan_id: str,
        model_uri: str,
        model_format: ModelFormat,
        metadata: ModelMetadata,
        findings: List[SecurityFinding],
        sbom: Dict[str, Any],
        scan_status: ScanStatus = ScanStatus.COMPLETED,
        scan_duration_ms: int = 0
    ):
        """
        Initialize JSON report generator.
        
        Args:
            scan_id: Unique scan identifier
            model_uri: Original model URI
            model_format: Detected model format
            metadata: Extracted model metadata
            findings: Security findings from scan
            sbom: Software Bill of Materials
            scan_status: Scan execution status
            scan_duration_ms: Scan duration in milliseconds
        """
        self.scan_id = scan_id
        self.model_uri = model_uri
        self.model_format = model_format
        self.metadata = metadata
        self.findings = findings
        self.sbom = sbom
        self.scan_status = scan_status
        self.scan_duration_ms = scan_duration_ms
    
    def generate(self) -> Dict[str, Any]:
        """
        Generate complete JSON report.
        
        Returns:
            Dictionary containing JSON report
        """
        # Calculate severity counts
        severity_counts = self._calculate_severity_counts()
        
        # Determine approval status
        approval_status = self._determine_approval_status(severity_counts)
        
        # Build report
        report = {
            'report_version': '1.0.0',
            'generated_at': datetime.utcnow().isoformat() + 'Z',
            'scan': {
                'id': self.scan_id,
                'status': self.scan_status.value,
                'duration_ms': self.scan_duration_ms,
                'model_uri': self.model_uri
            },
            'model': {
                'format': self.model_format.value,
                'metadata': {
                    'version': self.metadata.version,
                    'producer': self.metadata.producer,
                    'description': self.metadata.description,
                    'author': self.metadata.author,
                    'license': self.metadata.license,
                    'tags': self.metadata.tags,
                    'file_size': self.metadata.file_size,
                    'created_at': self.metadata.created_at
                },
                'architecture': {
                    'input_shapes': self.metadata.input_shapes,
                    'output_shapes': self.metadata.output_shapes,
                    'operators': self.metadata.operators,
                    'custom_operators': self.metadata.custom_operators,
                    'external_data': self.metadata.external_data
                }
            },
            'security': {
                'approval_status': approval_status.value,
                'findings': {
                    'total': len(self.findings),
                    'by_severity': severity_counts,
                    'details': [self._finding_to_dict(f) for f in self.findings]
                }
            },
            'sbom': self.sbom,
            'recommendations': self._generate_recommendations(severity_counts, approval_status)
        }
        
        return report
    
    def _calculate_severity_counts(self) -> Dict[str, int]:
        """Calculate counts of findings by severity."""
        counts = {
            'critical': 0,
            'high': 0,
            'medium': 0,
            'low': 0,
            'info': 0
        }
        
        for finding in self.findings:
            severity = finding.severity.value
            if severity in counts:
                counts[severity] += 1
        
        return counts
    
    def _determine_approval_status(self, severity_counts: Dict[str, int]) -> ApprovalStatus:
        """Determine model approval status based on findings."""
        if severity_counts['critical'] > 0:
            return ApprovalStatus.REJECTED
        elif severity_counts['high'] > 0:
            return ApprovalStatus.PENDING_REVIEW
        elif severity_counts['medium'] > 3:
            return ApprovalStatus.PENDING_REVIEW
        else:
            return ApprovalStatus.APPROVED
    
    def _finding_to_dict(self, finding: SecurityFinding) -> Dict[str, Any]:
        """Convert SecurityFinding to dictionary."""
        return {
            'id': finding.id,
            'type': finding.type,
            'severity': finding.severity.value,
            'title': finding.title,
            'description': finding.description,
            'recommendation': finding.recommendation,
            'evidence': finding.evidence,
            'scanner': finding.scanner,
            'location': finding.location,
            'cwe_id': finding.cwe_id,
            'created_at': finding.created_at
        }
    
    def _generate_recommendations(
        self, 
        severity_counts: Dict[str, int], 
        approval_status: ApprovalStatus
    ) -> List[str]:
        """Generate actionable recommendations based on findings."""
        recommendations = []
        
        if approval_status == ApprovalStatus.REJECTED:
            recommendations.append('❌ DO NOT USE THIS MODEL - Critical security issues detected')
            recommendations.append('Contact model provider or use alternative model')
        
        if severity_counts['critical'] > 0:
            recommendations.append(f'Address {severity_counts["critical"]} critical security finding(s) immediately')
        
        if severity_counts['high'] > 0:
            recommendations.append(f'Review {severity_counts["high"]} high severity finding(s) before deployment')
        
        if self.model_format == ModelFormat.PYTORCH:
            recommendations.append('Consider converting PyTorch model to SafeTensors format for improved security')
        
        if self.metadata.custom_operators:
            recommendations.append(f'Review {len(self.metadata.custom_operators)} custom operator(s) for security concerns')
        
        if self.metadata.external_data:
            recommendations.append(f'Verify {len(self.metadata.external_data)} external data reference(s) are from trusted sources')
        
        if not self.metadata.license:
            recommendations.append('Obtain and review license information before deployment')
        
        if approval_status == ApprovalStatus.APPROVED:
            recommendations.append('✅ Model passed security scan - safe for deployment')
        
        return recommendations


def generate_json_report(
    scan_id: str,
    model_uri: str,
    model_format: ModelFormat,
    metadata: ModelMetadata,
    findings: List[SecurityFinding],
    sbom: Dict[str, Any],
    scan_status: ScanStatus = ScanStatus.COMPLETED,
    scan_duration_ms: int = 0
) -> Dict[str, Any]:
    """
    Convenience function to generate JSON report.
    
    Args:
        scan_id: Unique scan identifier
        model_uri: Original model URI
        model_format: Detected model format
        metadata: Extracted model metadata
        findings: Security findings from scan
        sbom: Software Bill of Materials
        scan_status: Scan execution status
        scan_duration_ms: Scan duration in milliseconds
        
    Returns:
        JSON report dictionary
    """
    generator = JSONReportGenerator(
        scan_id=scan_id,
        model_uri=model_uri,
        model_format=model_format,
        metadata=metadata,
        findings=findings,
        sbom=sbom,
        scan_status=scan_status,
        scan_duration_ms=scan_duration_ms
    )
    return generator.generate()
