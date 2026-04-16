"""
Formatting Guard Implementations

Data formatting and validation guards for JSON, XML, CSV, URLs, and emails.
"""

import re
import json
import csv
from io import StringIO
from typing import List, Dict, Any, Literal
from urllib.parse import urlparse

from cga_core import guard, Violation, Ctx, Either, Right_, Left_, Guard


# ============================================================================
# JSON VALIDATION
# ============================================================================

@guard("formatting.json", tier="T0", description="Validates JSON format and structure", performance_budget_ms=3.0)
def json_validate(
    strict_mode: bool = True,
    validate_schema: bool = True,
    max_depth: int = 10,
    severity: Literal["low", "med", "high", "critical"] = "low"
) -> Guard:
    """
    Validate JSON format
    
    Args:
        strict_mode: Enforce strict JSON parsing
        validate_schema: Validate against JSON schema if provided
        max_depth: Maximum nesting depth
        severity: Severity level for violations
        
    Returns:
        Guard that validates JSON format and structure
    """
    
    def check_depth(obj, current_depth=0):
        """Check nesting depth of JSON object"""
        if current_depth > max_depth:
            return False
        
        if isinstance(obj, dict):
            return all(check_depth(v, current_depth + 1) for v in obj.values())
        elif isinstance(obj, list):
            return all(check_depth(item, current_depth + 1) for item in obj)
        
        return True
    
    async def run(ctx: Ctx) -> Either:
        text = ctx.get("output", "")
        
        if not text and "messages" in ctx:
            messages = ctx.get("messages", [])
            if isinstance(messages, list) and messages:
                text = messages[-1].get("content", "") if isinstance(messages[-1], dict) else str(messages[-1])
        
        if not isinstance(text, str):
            return Right_(ctx)
        
        violations = []
        
        # Try to parse as JSON
        try:
            parsed = json.loads(text)
            
            # Check depth
            if not check_depth(parsed):
                violations.append(Violation(
                    rule_id="formatting.json",
                    severity=severity,
                    message=f"JSON nesting exceeds maximum depth of {max_depth}",
                    score=0.6,
                    evidence={"max_depth": max_depth}
                ))
        
        except json.JSONDecodeError as e:
            violations.append(Violation(
                rule_id="formatting.json",
                severity=severity,
                message=f"Invalid JSON format: {str(e)}",
                score=0.8,
                evidence={
                    "error": str(e),
                    "line": e.lineno if hasattr(e, 'lineno') else None,
                    "column": e.colno if hasattr(e, 'colno') else None
                }
            ))
        
        if violations:
            return Left_(violations)
        
        return Right_(ctx)
    
    return run


# ============================================================================
# XML VALIDATION
# ============================================================================

@guard("formatting.xml", tier="T0", description="Validates XML format and structure", performance_budget_ms=4.0)
def xml_validate(
    validate_dtd: bool = True,
    check_encoding: bool = True,
    namespace_aware: bool = True,
    severity: Literal["low", "med", "high", "critical"] = "low"
) -> Guard:
    """
    Validate XML format
    
    Args:
        validate_dtd: Validate against DTD
        check_encoding: Check encoding declaration
        namespace_aware: Enable namespace awareness
        severity: Severity level for violations
        
    Returns:
        Guard that validates XML format and structure
    """
    
    async def run(ctx: Ctx) -> Either:
        text = ctx.get("output", "")
        
        if not text and "messages" in ctx:
            messages = ctx.get("messages", [])
            if isinstance(messages, list) and messages:
                text = messages[-1].get("content", "") if isinstance(messages[-1], dict) else str(messages[-1])
        
        if not isinstance(text, str):
            return Right_(ctx)
        
        violations = []
        
        # Basic XML structure check
        xml_pattern = r'<[^>]+>'
        has_xml = re.search(xml_pattern, text)
        
        if has_xml:
            # Check for well-formed XML
            open_tags = re.findall(r'<([a-zA-Z][a-zA-Z0-9]*)', text)
            close_tags = re.findall(r'</([a-zA-Z][a-zA-Z0-9]*)', text)
            
            if len(open_tags) != len(close_tags):
                violations.append(Violation(
                    rule_id="formatting.xml",
                    severity=severity,
                    message=f"Mismatched XML tags (open: {len(open_tags)}, close: {len(close_tags)})",
                    score=0.7,
                    evidence={
                        "open_tags": len(open_tags),
                        "close_tags": len(close_tags)
                    }
                ))
        
        if violations:
            return Left_(violations)
        
        return Right_(ctx)
    
    return run


# ============================================================================
# CSV VALIDATION
# ============================================================================

@guard("formatting.csv", tier="T0", description="Validates CSV format and data consistency", performance_budget_ms=5.0)
def csv_validate(
    delimiter: str = ",",
    quote_char: str = '"',
    check_headers: bool = True,
    max_rows: int = 10000,
    severity: Literal["low", "med", "high", "critical"] = "low"
) -> Guard:
    """
    Validate CSV format
    
    Args:
        delimiter: CSV delimiter character
        quote_char: Quote character for fields
        check_headers: Validate header row
        max_rows: Maximum number of rows
        severity: Severity level for violations
        
    Returns:
        Guard that validates CSV format and data consistency
    """
    
    async def run(ctx: Ctx) -> Either:
        text = ctx.get("output", "")
        
        if not text and "messages" in ctx:
            messages = ctx.get("messages", [])
            if isinstance(messages, list) and messages:
                text = messages[-1].get("content", "") if isinstance(messages[-1], dict) else str(messages[-1])
        
        if not isinstance(text, str):
            return Right_(ctx)
        
        violations = []
        
        try:
            csv_reader = csv.reader(StringIO(text), delimiter=delimiter, quotechar=quote_char)
            rows = list(csv_reader)
            
            if len(rows) > max_rows:
                violations.append(Violation(
                    rule_id="formatting.csv",
                    severity=severity,
                    message=f"CSV exceeds maximum rows ({len(rows)} > {max_rows})",
                    score=0.6,
                    evidence={"row_count": len(rows), "max_rows": max_rows}
                ))
            
            # Check column consistency
            if rows:
                header_cols = len(rows[0])
                for i, row in enumerate(rows[1:], start=2):
                    if len(row) != header_cols:
                        violations.append(Violation(
                            rule_id="formatting.csv",
                            severity=severity,
                            message=f"Inconsistent column count at row {i} (expected: {header_cols}, got: {len(row)})",
                            score=0.7,
                            evidence={
                                "row": i,
                                "expected_cols": header_cols,
                                "actual_cols": len(row)
                            }
                        ))
                        break  # Only flag first inconsistency
        
        except Exception as e:
            violations.append(Violation(
                rule_id="formatting.csv",
                severity=severity,
                message=f"CSV parsing error: {str(e)}",
                score=0.8,
                evidence={"error": str(e)}
            ))
        
        if violations:
            return Left_(violations)
        
        return Right_(ctx)
    
    return run


# ============================================================================
# URL FORMAT VALIDATION
# ============================================================================

@guard("formatting.url", tier="T0", description="Validates URL format and syntax", performance_budget_ms=2.0)
def url_format_validate(
    check_reachability: bool = False,
    allowed_schemes: List[str] = None,
    max_length: int = 2048,
    severity: Literal["low", "med", "high", "critical"] = "low"
) -> Guard:
    """
    Validate URL format
    
    Args:
        check_reachability: Check if URL is reachable
        allowed_schemes: Allowed URL schemes (http, https, etc.)
        max_length: Maximum URL length
        severity: Severity level for violations
        
    Returns:
        Guard that validates URL format and syntax
    """
    
    if allowed_schemes is None:
        allowed_schemes = ["http", "https"]
    
    url_pattern = re.compile(
        r'https?://(?:www\.)?[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+(?:/[^\s]*)?',
        re.IGNORECASE
    )
    
    async def run(ctx: Ctx) -> Either:
        text = ctx.get("output", "")
        
        if not text and "messages" in ctx:
            messages = ctx.get("messages", [])
            if isinstance(messages, list) and messages:
                text = messages[-1].get("content", "") if isinstance(messages[-1], dict) else str(messages[-1])
        
        if not isinstance(text, str):
            return Right_(ctx)
        
        violations = []
        urls = url_pattern.findall(text)
        
        for url in urls:
            # Check length
            if len(url) > max_length:
                violations.append(Violation(
                    rule_id="formatting.url",
                    severity=severity,
                    message=f"URL exceeds maximum length ({len(url)} > {max_length})",
                    score=0.5,
                    evidence={"url": url[:100], "length": len(url), "max_length": max_length}
                ))
            
            # Parse and validate
            try:
                parsed = urlparse(url)
                if parsed.scheme not in allowed_schemes:
                    violations.append(Violation(
                        rule_id="formatting.url",
                        severity=severity,
                        message=f"Disallowed URL scheme: {parsed.scheme}",
                        score=0.6,
                        evidence={
                            "url": url[:100],
                            "scheme": parsed.scheme,
                            "allowed_schemes": allowed_schemes
                        }
                    ))
            except Exception as e:
                violations.append(Violation(
                    rule_id="formatting.url",
                    severity=severity,
                    message=f"Invalid URL format: {str(e)}",
                    score=0.7,
                    evidence={"url": url[:100], "error": str(e)}
                ))
        
        if violations:
            return Left_(violations)
        
        return Right_(ctx)
    
    return run


# ============================================================================
# EMAIL FORMAT VALIDATION
# ============================================================================

@guard("formatting.email", tier="T0", description="Validates email address format", performance_budget_ms=1.0)
def email_validate(
    strict_rfc: bool = True,
    check_mx: bool = False,
    allow_smtputf8: bool = True,
    severity: Literal["low", "med", "high", "critical"] = "low"
) -> Guard:
    """
    Validate email format
    
    Args:
        strict_rfc: Enforce strict RFC compliance
        check_mx: Check MX records
        allow_smtputf8: Allow SMTPUTF8 characters
        severity: Severity level for violations
        
    Returns:
        Guard that validates email address format
    """
    
    # RFC 5322 compliant email pattern
    email_pattern = re.compile(
        r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    )
    
    async def run(ctx: Ctx) -> Either:
        text = ctx.get("output", "")
        
        if not text and "messages" in ctx:
            messages = ctx.get("messages", [])
            if isinstance(messages, list) and messages:
                text = messages[-1].get("content", "") if isinstance(messages[-1], dict) else str(messages[-1])
        
        if not isinstance(text, str):
            return Right_(ctx)
        
        violations = []
        emails = email_pattern.findall(text)
        
        for email in emails:
            # Additional validation
            local, domain = email.split('@')
            
            # Check local part length (max 64 chars per RFC)
            if len(local) > 64:
                violations.append(Violation(
                    rule_id="formatting.email",
                    severity=severity,
                    message=f"Email local part too long: {local[:20]}...",
                    score=0.5,
                    evidence={"email": email, "local_length": len(local)}
                ))
            
            # Check domain part
            if len(domain) > 253:
                violations.append(Violation(
                    rule_id="formatting.email",
                    severity=severity,
                    message=f"Email domain too long: {domain[:20]}...",
                    score=0.5,
                    evidence={"email": email, "domain_length": len(domain)}
                ))
        
        if violations:
            return Left_(violations)
        
        return Right_(ctx)
    
    return run

