"""
Backdoor detection scanner.

This module detects potential backdoors and suspicious patterns in ML models
using heuristics and anomaly detection.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from ..types import SecurityFinding, Severity, ModelMetadata, ModelFormat, SBOMFeatures


class BackdoorScanner:
    """Scans models for potential backdoors and suspicious patterns."""
    
    def __init__(self, sbom_features: Optional[SBOMFeatures], model_format: ModelFormat):
        """
        Initialize backdoor scanner.
        
        Args:
            sbom_features: Extracted SBOM features
            model_format: Detected model format
        """
        self.sbom_features = sbom_features
        self.model_format = model_format
        self.findings: List[SecurityFinding] = []
    
    def scan(self) -> List[SecurityFinding]:
        """
        Scan model for backdoor indicators.
        
        Returns:
            List of security findings
        """
        self.findings = []
        
        # Run various heuristic checks
        self._check_model_complexity()
        self._check_external_data()
        self._check_suspicious_metadata()
        self._check_unusual_operators()
        self._check_dependency_risks()  # NEW: Advanced dependency analysis
        
        return self.findings
    
    def _check_model_complexity(self) -> None:
        """Check for unusual model complexity that may indicate backdoors."""
        # Use SBOM features for complexity analysis
        if not self.sbom_features:
            return  # Skip if no SBOM features available
            
        operator_count = self.sbom_features.operator_count
        complexity_score = self.sbom_features.model_complexity_score
        
        if operator_count > 1000:
            self.findings.append(SecurityFinding(
                id='BACKDOOR.COMPLEXITY.HIGH',
                type='backdoor_detection',
                severity=Severity.MEDIUM,
                title='Unusually complex model detected',
                description=f'Model has {operator_count} operators with complexity score {complexity_score:.2f}, which is unusually high. '
                           'Complex models may hide backdoors or malicious behavior.',
                recommendation='Review model architecture and verify it matches expected complexity',
                evidence={
                    'operator_count': operator_count,
                    'complexity_score': complexity_score,
                    'threshold': 1000
                },
                scanner='backdoor_scanner',
                created_at=datetime.utcnow().isoformat() + 'Z'
            ))
        
        # Check for very deep models
        if operator_count > 500 and operator_count < 1000:
            self.findings.append(SecurityFinding(
                id='BACKDOOR.COMPLEXITY.MODERATE',
                type='backdoor_detection',
                severity=Severity.LOW,
                title='Moderately complex model',
                description=f'Model has {operator_count} operators with complexity score {complexity_score:.2f}. Review architecture.',
                recommendation='Verify model complexity matches expected use case',
                evidence={
                    'operator_count': operator_count,
                    'complexity_score': complexity_score
                },
                scanner='backdoor_scanner',
                created_at=datetime.utcnow().isoformat() + 'Z'
            ))
        
        # NEW: Advanced complexity analysis using SBOM features
        if complexity_score > 10.0:
            self.findings.append(SecurityFinding(
                id='BACKDOOR.COMPLEXITY.EXTREME',
                type='backdoor_detection',
                severity=Severity.HIGH,
                title='Extremely complex model detected',
                description=f'Model has extreme complexity score {complexity_score:.2f} with {operator_count} operators, {self.sbom_features.custom_operator_count} custom ops, and {self.sbom_features.external_data_count} external data references. This level of complexity may hide malicious behavior.',
                recommendation='Thoroughly audit this model before deployment. Consider using simpler alternatives.',
                evidence={
                    'complexity_score': complexity_score,
                    'operator_count': operator_count,
                    'custom_operator_count': self.sbom_features.custom_operator_count,
                    'external_data_count': self.sbom_features.external_data_count,
                    'runtime_dependencies': self.sbom_features.runtime_dependencies,
                    'library_dependencies': self.sbom_features.library_dependencies
                },
                scanner='backdoor_scanner',
                created_at=datetime.utcnow().isoformat() + 'Z'
            ))
    
    def _check_external_data(self) -> None:
        """Check for external data references that may be malicious."""
        if not self.sbom_features or not self.sbom_features.has_external_data:
            return
        
        self.findings.append(SecurityFinding(
            id='BACKDOOR.EXTERNAL_DATA',
            type='backdoor_detection',
            severity=Severity.HIGH,
            title='External data references detected',
            description=f'Model references {self.sbom_features.external_data_count} external data source(s). '
                       'External data can be used to inject backdoors or exfiltrate information.',
            recommendation='Review all external data references and verify they are necessary and trusted',
            evidence={
                'external_data_count': self.sbom_features.external_data_count,
                'has_external_data': self.sbom_features.has_external_data
            },
            scanner='backdoor_scanner',
            cwe_id='CWE-494',
            created_at=datetime.utcnow().isoformat() + 'Z'
        ))
    
    def _check_suspicious_metadata(self) -> None:
        """Check metadata for suspicious patterns using SBOM features."""
        # Use SBOM features for suspicious keyword detection
        if not self.sbom_features or not self.sbom_features.suspicious_keywords:
            return
            
        self.findings.append(SecurityFinding(
                id='BACKDOOR.METADATA.SUSPICIOUS',
                type='backdoor_detection',
                severity=Severity.CRITICAL,
                title='Suspicious keywords in model metadata',
                description=f'Model metadata contains suspicious keywords: {", ".join(self.sbom_features.suspicious_keywords)}',
                recommendation='DO NOT USE THIS MODEL. Report to security team.',
                evidence={
                    'keywords_found': self.sbom_features.suspicious_keywords,
                    'count': len(self.sbom_features.suspicious_keywords)
                },
                scanner='backdoor_scanner',
                created_at=datetime.utcnow().isoformat() + 'Z'
            ))
    
    def _check_unusual_operators(self) -> None:
        """Check for unusual operator patterns using SBOM features."""
        if not self.sbom_features:
            return  # Skip if no SBOM features available
            
        # Check for network-related operators (potential data exfiltration)
        if self.sbom_features.has_network_ops:
            self.findings.append(SecurityFinding(
                id='BACKDOOR.OPERATORS.NETWORK',
                type='backdoor_detection',
                severity=Severity.CRITICAL,
                title='Network-related operators detected',
                description='Model uses operators that may enable network communication. '
                           'This could be used for data exfiltration or command & control.',
                recommendation='DO NOT USE THIS MODEL. Verify with model provider.',
                evidence={
                    'has_network_ops': self.sbom_features.has_network_ops,
                    'complexity_score': self.sbom_features.model_complexity_score
                },
                scanner='backdoor_scanner',
                cwe_id='CWE-912',
                created_at=datetime.utcnow().isoformat() + 'Z'
            ))
        
        # Check for file system operators (potential data theft)
        if self.sbom_features.has_file_ops:
            self.findings.append(SecurityFinding(
                id='BACKDOOR.OPERATORS.FILESYSTEM',
                type='backdoor_detection',
                severity=Severity.HIGH,
                title='File system operators detected',
                description='Model uses operators that may access file system',
                recommendation='Review model carefully and verify file operations are necessary',
                evidence={
                    'has_file_ops': self.sbom_features.has_file_ops,
                    'complexity_score': self.sbom_features.model_complexity_score
                },
                scanner='backdoor_scanner',
                cwe_id='CWE-73',
                created_at=datetime.utcnow().isoformat() + 'Z'
            ))
    
    def _check_dependency_risks(self) -> None:
        """Check for risky dependencies using SBOM features."""
        if not self.sbom_features:
            return  # Skip if no SBOM features available
        
        # Check for high-risk runtime dependencies
        high_risk_runtimes = ['torch', 'tensorflow', 'keras']
        risky_deps = [dep for dep in self.sbom_features.runtime_dependencies if dep in high_risk_runtimes]
        
        if risky_deps:
            self.findings.append(SecurityFinding(
                id='BACKDOOR.DEPENDENCIES.HIGH_RISK',
                type='backdoor_detection',
                severity=Severity.MEDIUM,
                title='High-risk runtime dependencies detected',
                description=f'Model requires high-risk runtime dependencies: {", ".join(risky_deps)}. These frameworks have known security vulnerabilities and attack vectors.',
                recommendation='Review dependency versions and consider using safer alternatives like SafeTensors or ONNX',
                evidence={
                    'risky_dependencies': risky_deps,
                    'all_runtime_deps': self.sbom_features.runtime_dependencies,
                    'all_library_deps': self.sbom_features.library_dependencies,
                    'complexity_score': self.sbom_features.model_complexity_score
                },
                scanner='backdoor_scanner',
                created_at=datetime.utcnow().isoformat() + 'Z'
            ))
        
        # Check for too many dependencies (attack surface)
        total_deps = len(self.sbom_features.runtime_dependencies) + len(self.sbom_features.library_dependencies)
        if total_deps > 5:
            self.findings.append(SecurityFinding(
                id='BACKDOOR.DEPENDENCIES.MANY',
                type='backdoor_detection',
                severity=Severity.LOW,
                title='Model has many dependencies',
                description=f'Model requires {total_deps} dependencies, increasing attack surface. More dependencies mean more potential vulnerabilities.',
                recommendation='Minimize dependencies and audit each one for security issues',
                evidence={
                    'total_dependencies': total_deps,
                    'runtime_dependencies': self.sbom_features.runtime_dependencies,
                    'library_dependencies': self.sbom_features.library_dependencies
                },
                scanner='backdoor_scanner',
                created_at=datetime.utcnow().isoformat() + 'Z'
            ))


def scan_for_backdoors(sbom_features: Optional[SBOMFeatures], model_format: ModelFormat) -> List[SecurityFinding]:
    """
    Convenience function to scan for backdoors.
    
    Args:
        sbom_features: Extracted SBOM features
        model_format: Detected model format
        
    Returns:
        List of security findings
    """
    scanner = BackdoorScanner(sbom_features, model_format)
    return scanner.scan()
