"""
Report generation for model scans.

This package provides report generators in various formats including
JSON and SARIF 2.1.0 for CI/CD integration.
"""

from .json_report import JSONReportGenerator, generate_json_report
from .sarif_report import SARIFReportGenerator, generate_sarif_report

__all__ = [
    "JSONReportGenerator",
    "generate_json_report",
    "SARIFReportGenerator",
    "generate_sarif_report",
]
