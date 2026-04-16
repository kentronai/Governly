"""
SARIF report generation for model scans.

This module generates SARIF 2.1.0 reports for integration with
CI/CD systems and security platforms like GitHub Security.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from ..types import SecurityFinding, Severity, ModelFormat


class SARIFReportGenerator:
    """Generates SARIF 2.1.0 reports for model scans."""
    
    # SARIF spec version
    SARIF_VERSION = '2.1.0'
    SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json'
    
    # Severity mapping to SARIF levels
    SEVERITY_TO_LEVEL = {
        Severity.CRITICAL: 'error',
        Severity.HIGH: 'error',
        Severity.MEDIUM: 'warning',
        Severity.LOW: 'note',
        Severity.INFO: 'note'
    }
    
    def __init__(
        self,
        scan_id: str,
        model_uri: str,
        model_format: ModelFormat,
        findings: List[SecurityFinding],
        tool_version: str = '1.0.0'
    ):
        """
        Initialize SARIF report generator.
        
        Args:
            scan_id: Unique scan identifier
            model_uri: Original model URI
            model_format: Detected model format
            findings: Security findings from scan
            tool_version: Version of ModelGuard tool
        """
        self.scan_id = scan_id
        self.model_uri = model_uri
        self.model_format = model_format
        self.findings = findings
        self.tool_version = tool_version
    
    def generate(self) -> Dict[str, Any]:
        """
        Generate complete SARIF report.
        
        Returns:
            Dictionary containing SARIF 2.1.0 report
        """
        # Build rules from findings
        rules = self._build_rules()
        
        # Build results from findings
        results = self._build_results()
        
        # Build complete SARIF document
        sarif = {
            '$schema': self.SARIF_SCHEMA,
            'version': self.SARIF_VERSION,
            'runs': [{
                'tool': {
                    'driver': {
                        'name': 'ModelGuard',
                        'version': self.tool_version,
                        'informationUri': 'https://kentron.ai/modelguard',
                        'organization': 'Kentron',
                        'shortDescription': {
                            'text': 'AI Model Security Scanner'
                        },
                        'fullDescription': {
                            'text': 'ModelGuard scans machine learning models for security vulnerabilities, '
                                   'malicious code, and compliance issues.'
                        },
                        'rules': rules
                    }
                },
                'results': results,
                'invocations': [{
                    'executionSuccessful': True,
                    'startTimeUtc': datetime.utcnow().isoformat() + 'Z',
                    'properties': {
                        'scan_id': self.scan_id,
                        'model_uri': self.model_uri,
                        'model_format': self.model_format.value
                    }
                }]
            }]
        }
        
        return sarif
    
    def _build_rules(self) -> List[Dict[str, Any]]:
        """Build SARIF rules from findings."""
        # Collect unique rule IDs
        rule_ids = set()
        rules_dict = {}
        
        for finding in self.findings:
            if finding.id not in rule_ids:
                rule_ids.add(finding.id)
                rules_dict[finding.id] = {
                    'id': finding.id,
                    'name': finding.type,
                    'shortDescription': {
                        'text': finding.title
                    },
                    'fullDescription': {
                        'text': finding.description or finding.title
                    },
                    'helpUri': f'https://kentron.ai/docs/rules/{finding.id}',
                    'properties': {
                        'scanner': finding.scanner,
                        'precision': 'high',
                        'security-severity': self._severity_to_score(finding.severity)
                    }
                }
                
                if finding.cwe_id:
                    rules_dict[finding.id]['properties']['cwe'] = [finding.cwe_id]
        
        return list(rules_dict.values())
    
    def _build_results(self) -> List[Dict[str, Any]]:
        """Build SARIF results from findings."""
        results = []
        
        for finding in self.findings:
            result = {
                'ruleId': finding.id,
                'level': self.SEVERITY_TO_LEVEL.get(finding.severity, 'note'),
                'message': {
                    'text': finding.description or finding.title
                },
                'properties': {
                    'severity': finding.severity.value,
                    'scanner': finding.scanner
                }
            }
            
            # Add location if available
            if finding.location:
                result['locations'] = [{
                    'physicalLocation': {
                        'artifactLocation': {
                            'uri': self.model_uri
                        },
                        'region': {
                            'startLine': 1,
                            'properties': finding.location
                        }
                    }
                }]
            
            # Add evidence if available
            if finding.evidence:
                result['properties']['evidence'] = finding.evidence
            
            # Add recommendation if available
            if finding.recommendation:
                result['message']['markdown'] = (
                    f"**{finding.title}**\n\n"
                    f"{finding.description}\n\n"
                    f"**Recommendation:** {finding.recommendation}"
                )
            
            # Add CWE reference if available
            if finding.cwe_id:
                result['properties']['cwe'] = finding.cwe_id
            
            results.append(result)
        
        return results
    
    def _severity_to_score(self, severity: Severity) -> str:
        """Convert severity to SARIF security-severity score (0.0-10.0)."""
        scores = {
            Severity.CRITICAL: '9.0',
            Severity.HIGH: '7.0',
            Severity.MEDIUM: '5.0',
            Severity.LOW: '3.0',
            Severity.INFO: '1.0'
        }
        return scores.get(severity, '0.0')


def generate_sarif_report(
    scan_id: str,
    model_uri: str,
    model_format: ModelFormat,
    findings: List[SecurityFinding],
    tool_version: str = '1.0.0'
) -> Dict[str, Any]:
    """
    Convenience function to generate SARIF report.
    
    Args:
        scan_id: Unique scan identifier
        model_uri: Original model URI
        model_format: Detected model format
        findings: Security findings from scan
        tool_version: Version of ModelGuard tool
        
    Returns:
        SARIF 2.1.0 report dictionary
    """
    generator = SARIFReportGenerator(
        scan_id=scan_id,
        model_uri=model_uri,
        model_format=model_format,
        findings=findings,
        tool_version=tool_version
    )
    return generator.generate()
