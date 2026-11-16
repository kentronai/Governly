"""
Validation Guard Implementations

Guards for validating string content, including substring checks,
required string presence, and content validation patterns.
"""

from typing import Literal, Optional, List, Union, Any
from cga_core.message_text import last_message_text
import re

from cga_core import guard, Violation, Ctx, Either, Right_, Left_, Guard


@guard(
    "validation.contains_string",
    tier="T0",
    description="Validates that a string contains a specified substring",
    performance_budget_ms=1.0
)
def contains_string(
    substring: str,
    case_sensitive: bool = True,
    severity: Literal["low", "med", "high", "critical"] = "med"
) -> Guard:
    """
    Validates that a string contains a substring.
    
    Args:
        substring: The substring to search for
        case_sensitive: Whether the search should be case-sensitive
        severity: Severity level for violations
        
    Returns:
        Guard that validates substring presence
        
    Example:
        Guard will fail if the substring is not found in the text
        
    Raises:
        ValueError: If substring is empty
    """
    if not substring:
        raise ValueError("substring cannot be empty")
    
    async def run(ctx: Ctx) -> Either:
        """Validate that the output contains the substring."""
        text = ctx.get("output", "")
        
        # Handle messages context (for input guards)
        if not text and "messages" in ctx:
            messages = ctx.get("messages", [])
            if isinstance(messages, list) and messages:
                text = last_message_text(messages)
        
        if not isinstance(text, str):
            return Right_(ctx)
        
        # Perform substring check
        if case_sensitive:
            contains = substring in text
        else:
            contains = substring.lower() in text.lower()
        
        if not contains:
            return Left_([Violation(
                rule_id="validation.contains_string",
                severity=severity,
                message=f"String doesn't contain substring '{substring}'",
                score=1.0,
                evidence={
                    "substring": substring,
                    "text_length": len(text),
                    "text_preview": text[:100] + "..." if len(text) > 100 else text,
                    "case_sensitive": case_sensitive
                }
            )])
        
        return Right_(ctx)
    
    return run


@guard(
    "validation.not_contains_string",
    tier="T0",
    description="Validates that a string does NOT contain a specified substring",
    performance_budget_ms=1.0
)
def not_contains_string(
    substring: str,
    case_sensitive: bool = True,
    severity: Literal["low", "med", "high", "critical"] = "med"
) -> Guard:
    """
    Validates that a string does NOT contain a substring.
    
    Useful for blocking forbidden words or phrases.
    
    Args:
        substring: The substring that should NOT be present
        case_sensitive: Whether the search should be case-sensitive
        severity: Severity level for violations
        
    Returns:
        Guard that validates substring absence
    """
    if not substring:
        raise ValueError("substring cannot be empty")
    
    async def run(ctx: Ctx) -> Either:
        """Validate that the output does NOT contain the substring."""
        text = ctx.get("output", "")
        
        if not text and "messages" in ctx:
            messages = ctx.get("messages", [])
            if isinstance(messages, list) and messages:
                text = last_message_text(messages)
        
        if not isinstance(text, str):
            return Right_(ctx)
        
        # Perform substring check
        if case_sensitive:
            contains = substring in text
        else:
            contains = substring.lower() in text.lower()
        
        if contains:
            return Left_([Violation(
                rule_id="validation.not_contains_string",
                severity=severity,
                message=f"String contains forbidden substring '{substring}'",
                score=1.0,
                evidence={
                    "substring": substring,
                    "text_length": len(text),
                    "text_preview": text[:100] + "..." if len(text) > 100 else text,
                    "case_sensitive": case_sensitive
                }
            )])
        
        return Right_(ctx)
    
    return run


@guard(
    "validation.ends_with",
    tier="T0",
    description="Validates that a string or list ends with a specified value",
    performance_budget_ms=1.0
)
def ends_with(
    end: Union[str, List[str]],
    severity: Literal["low", "med", "high", "critical"] = "med"
) -> Guard:
    """
    Validates that a string or list ends with a specified value.
    
    Args:
        end: The required last element (string for string validation, 
             list element for list validation)
        severity: Severity level for violations
        
    Returns:
        Guard that validates the ending value
        
    Example:
        For strings: "hello world" ends with "world"
        For lists: ["a", "b", "c"] ends with "c"
    """
    async def run(ctx: Ctx) -> Either:
        """Validate that the output ends with the specified value."""
        value = ctx.get("output", "")
        
        # Handle messages context (for input guards)
        if not value and "messages" in ctx:
            messages = ctx.get("messages", [])
            if isinstance(messages, list) and messages:
                value = last_message_text(messages)
        
        # Handle empty values
        if not value:
            return Left_([Violation(
                rule_id="validation.ends_with",
                severity=severity,
                message=f"Value is empty, cannot end with '{end}'",
                score=1.0,
                evidence={
                    "end": end,
                    "value_type": type(value).__name__
                }
            )])
        
        # Handle string validation
        if isinstance(value, str):
            if not isinstance(end, str):
                return Left_([Violation(
                    rule_id="validation.ends_with",
                    severity=severity,
                    message=f"String value requires string 'end' parameter, got {type(end).__name__}",
                    score=1.0,
                    evidence={"end": end, "end_type": type(end).__name__}
                )])
            
            if not value.endswith(end):
                return Left_([Violation(
                    rule_id="validation.ends_with",
                    severity=severity,
                    message=f"String '{value[:50]}...' does not end with '{end}'",
                    score=1.0,
                    evidence={
                        "end": end,
                        "value": value[:100] + "..." if len(value) > 100 else value,
                        "actual_end": value[-len(end):] if len(value) >= len(end) else value,
                        "value_length": len(value)
                    }
                )])
        
        # Handle list validation
        elif isinstance(value, list):
            if len(value) == 0:
                return Left_([Violation(
                    rule_id="validation.ends_with",
                    severity=severity,
                    message=f"List is empty, cannot end with '{end}'",
                    score=1.0,
                    evidence={"end": end}
                )])
            
            if value[-1] != end:
                return Left_([Violation(
                    rule_id="validation.ends_with",
                    severity=severity,
                    message=f"List does not end with '{end}'. Last element is '{value[-1]}'",
                    score=1.0,
                    evidence={
                        "end": end,
                        "actual_end": value[-1],
                        "list_length": len(value),
                        "last_element": value[-1]
                    }
                )])
        
        else:
            return Left_([Violation(
                rule_id="validation.ends_with",
                severity=severity,
                message=f"Value type '{type(value).__name__}' not supported. Expected string or list.",
                score=1.0,
                evidence={"value_type": type(value).__name__, "end": end}
            )])
        
        return Right_(ctx)
    
    return run


@guard(
    "validation.lowercase",
    tier="T0",
    description="Validates that a string is lowercase",
    performance_budget_ms=1.0
)
def lowercase(
    severity: Literal["low", "med", "high", "critical"] = "med"
) -> Guard:
    """
    Validates that a string is lowercase.
    
    Args:
        severity: Severity level for violations
        
    Returns:
        Guard that validates lowercase format
        
    Example:
        "hello world" passes, "Hello World" fails
    """
    async def run(ctx: Ctx) -> Either:
        """Validate that the output is lowercase."""
        text = ctx.get("output", "")
        
        # Handle messages context (for input guards)
        if not text and "messages" in ctx:
            messages = ctx.get("messages", [])
            if isinstance(messages, list) and messages:
                text = last_message_text(messages)
        
        if not isinstance(text, str):
            return Right_(ctx)
        
        # Check if string is lowercase
        if text.lower() != text:
            return Left_([Violation(
                rule_id="validation.lowercase",
                severity=severity,
                message=f"Value '{text[:50]}...' is not lowercase",
                score=1.0,
                evidence={
                    "value": text[:100] + "..." if len(text) > 100 else text,
                    "lowercase_value": text.lower()[:100] + "..." if len(text) > 100 else text.lower(),
                    "value_length": len(text)
                }
            )])
        
        return Right_(ctx)
    
    return run


@guard(
    "validation.uppercase",
    tier="T0",
    description="Validates that a string is uppercase",
    performance_budget_ms=1.0
)
def uppercase(
    severity: Literal["low", "med", "high", "critical"] = "med"
) -> Guard:
    """
    Validates that a string is uppercase.
    
    Args:
        severity: Severity level for violations
        
    Returns:
        Guard that validates uppercase format
        
    Example:
        "HELLO WORLD" passes, "Hello World" fails
    """
    async def run(ctx: Ctx) -> Either:
        """Validate that the output is uppercase."""
        text = ctx.get("output", "")
        
        # Handle messages context (for input guards)
        if not text and "messages" in ctx:
            messages = ctx.get("messages", [])
            if isinstance(messages, list) and messages:
                text = last_message_text(messages)
        
        if not isinstance(text, str):
            return Right_(ctx)
        
        # Check if string is uppercase
        if text.upper() != text:
            return Left_([Violation(
                rule_id="validation.uppercase",
                severity=severity,
                message=f"Value '{text[:50]}...' is not uppercase",
                score=1.0,
                evidence={
                    "value": text[:100] + "..." if len(text) > 100 else text,
                    "uppercase_value": text.upper()[:100] + "..." if len(text) > 100 else text.upper(),
                    "value_length": len(text)
                }
            )])
        
        return Right_(ctx)
    
    return run


@guard(
    "validation.one_line",
    tier="T0",
    description="Validates that a string is a single line (no newlines)",
    performance_budget_ms=1.0
)
def one_line(
    severity: Literal["low", "med", "high", "critical"] = "med"
) -> Guard:
    """
    Validates that a string is a single line (contains no newline characters).
    
    Args:
        severity: Severity level for violations
        
    Returns:
        Guard that validates single-line format
        
    Example:
        "hello world" passes, "hello\\nworld" fails
    """
    async def run(ctx: Ctx) -> Either:
        """Validate that the output is a single line."""
        text = ctx.get("output", "")
        
        # Handle messages context (for input guards)
        if not text and "messages" in ctx:
            messages = ctx.get("messages", [])
            if isinstance(messages, list) and messages:
                text = last_message_text(messages)
        
        if not isinstance(text, str):
            return Right_(ctx)
        
        # Check if string contains newlines
        lines = text.splitlines()
        if len(lines) > 1:
            return Left_([Violation(
                rule_id="validation.one_line",
                severity=severity,
                message=f"Value contains {len(lines)} lines (expected 1 line)",
                score=1.0,
                evidence={
                    "line_count": len(lines),
                    "first_line": lines[0][:100] + "..." if len(lines[0]) > 100 else lines[0],
                    "total_length": len(text),
                    "has_newlines": "\n" in text or "\r" in text
                }
            )])
        
        return Right_(ctx)
    
    return run


@guard(
    "validation.reading_time",
    tier="T0",
    description="Validates that text can be read within a specified time limit",
    performance_budget_ms=2.0
)
def reading_time(
    reading_time: float,
    words_per_minute: int = 200,
    severity: Literal["low", "med", "high", "critical"] = "med"
) -> Guard:
    """
    Validates that a string can be read in less than a certain amount of time.
    
    Uses average human reading speed (default 200 words/minute) to estimate reading time.
    
    Args:
        reading_time: Maximum reading time in minutes
        words_per_minute: Average reading speed (default: 200 words/min)
        severity: Severity level for violations
        
    Returns:
        Guard that validates reading time
        
    Example:
        reading_time=2.0 means text should be readable in under 2 minutes
    """
    if reading_time <= 0:
        raise ValueError("reading_time must be greater than 0")
    
    if words_per_minute <= 0:
        raise ValueError("words_per_minute must be greater than 0")
    
    async def run(ctx: Ctx) -> Either:
        """Validate that the output can be read within the time limit."""
        text = ctx.get("output", "")
        
        # Handle messages context (for input guards)
        if not text and "messages" in ctx:
            messages = ctx.get("messages", [])
            if isinstance(messages, list) and messages:
                text = last_message_text(messages)
        
        if not isinstance(text, str):
            return Right_(ctx)
        
        # Estimate reading time: word count / words per minute
        word_count = len(text.split())
        estimated_time = word_count / words_per_minute
        
        # Check if reading time exceeds limit
        if estimated_time > reading_time:
            return Left_([Violation(
                rule_id="validation.reading_time",
                severity=severity,
                message=f"Text should be readable within {reading_time:.3f} min but took {estimated_time:.3f} min to read",
                score=min(1.0, estimated_time / reading_time),  # Score based on excess time
                evidence={
                    "max_reading_time_minutes": reading_time,
                    "estimated_reading_time_minutes": round(estimated_time, 3),
                    "word_count": word_count,
                    "words_per_minute": words_per_minute,
                    "excess_time_minutes": round(estimated_time - reading_time, 3)
                }
            )])
        
        return Right_(ctx)
    
    return run


@guard(
    "validation.regex_match",
    tier="T0",
    description="Validates that a string matches a regular expression pattern",
    performance_budget_ms=3.0
)
def regex_match(
    regex: str,
    match_type: Literal["fullmatch", "search"] = "fullmatch",
    severity: Literal["low", "med", "high", "critical"] = "med"
) -> Guard:
    """
    Validates that a value matches a regular expression.
    
    Args:
        regex: Regular expression pattern to match
        match_type: "fullmatch" requires entire string to match, 
                   "search" requires pattern to be found anywhere
        severity: Severity level for violations
        
    Returns:
        Guard that validates regex pattern matching
        
    Example:
        regex="^[A-Z]+$" with match_type="fullmatch" requires all uppercase letters
        regex="\\d{3}-\\d{2}-\\d{4}" matches SSN format
    """
    if not regex:
        raise ValueError("regex cannot be empty")
    
    # Compile regex pattern for performance
    try:
        compiled_pattern = re.compile(regex)
    except re.error as e:
        raise ValueError(f"Invalid regex pattern: {e}")
    
    async def run(ctx: Ctx) -> Either:
        """Validate that the output matches the regex pattern."""
        text = ctx.get("output", "")
        
        # Handle messages context (for input guards)
        if not text and "messages" in ctx:
            messages = ctx.get("messages", [])
            if isinstance(messages, list) and messages:
                text = last_message_text(messages)
        
        if not isinstance(text, str):
            return Right_(ctx)
        
        # Perform regex match based on match_type
        if match_type == "fullmatch":
            matches = compiled_pattern.fullmatch(text) is not None
        else:  # match_type == "search"
            matches = compiled_pattern.search(text) is not None
        
        if not matches:
            return Left_([Violation(
                rule_id="validation.regex_match",
                severity=severity,
                message=f"Value does not match regex pattern '{regex}' (match_type: {match_type})",
                score=1.0,
                evidence={
                    "regex": regex,
                    "match_type": match_type,
                    "value": text[:100] + "..." if len(text) > 100 else text,
                    "value_length": len(text)
                }
            )])
        
        return Right_(ctx)
    
    return run


@guard(
    "validation.regex_block",
    tier="T0",
    description="Blocks content if it matches a forbidden regex pattern (for content filtering)",
    performance_budget_ms=3.0
)
def regex_block(
    regex: str,
    severity: Literal["low", "med", "high", "critical"] = "high"
) -> Guard:
    """
    Blocks content if it matches a regex pattern.
    
    Use this for content filtering (detecting forbidden patterns).
    Unlike regex_match which requires content TO match, this guard
    blocks content that DOES match the pattern.
    
    Args:
        regex: Regular expression pattern to block
        severity: Severity level for violations
        
    Returns:
        Guard that blocks if pattern is found
        
    Example:
        regex="password|secret|api.?key" blocks content containing sensitive patterns
        regex="\\d{3}-\\d{2}-\\d{4}" blocks SSN-like patterns
    """
    if not regex:
        raise ValueError("regex cannot be empty")
    
    # Compile regex pattern for performance
    try:
        compiled_pattern = re.compile(regex, re.IGNORECASE)
    except re.error as e:
        raise ValueError(f"Invalid regex pattern: {e}")
    
    async def run(ctx: Ctx) -> Either:
        """Block if content matches the forbidden regex pattern."""
        text = ctx.get("output", "")
        
        # Handle messages context (for input guards)
        if not text and "messages" in ctx:
            messages = ctx.get("messages", [])
            if isinstance(messages, list) and messages:
                text = last_message_text(messages)
        
        if not isinstance(text, str):
            return Right_(ctx)
        
        # Check if pattern is found (search mode - anywhere in text)
        match = compiled_pattern.search(text)
        
        if match:
            return Left_([Violation(
                rule_id="validation.regex_block",
                severity=severity,
                message=f"Content matches forbidden pattern '{regex}'",
                score=1.0,
                evidence={
                    "regex": regex,
                    "matched_text": match.group(),
                    "match_position": match.start(),
                    "value_preview": text[:100] + "..." if len(text) > 100 else text,
                    "value_length": len(text)
                }
            )])
        
        return Right_(ctx)
    
    return run


@guard(
    "validation.valid_choices",
    tier="T0",
    description="Validates that a value belongs to a subset of acceptable choices",
    performance_budget_ms=1.0
)
def valid_choices(
    choices: List[Any],
    severity: Literal["low", "med", "high", "critical"] = "med"
) -> Guard:
    """
    Validates that a value is within the acceptable choices.
    
    Args:
        choices: List of valid choices (can be strings, numbers, etc.)
        severity: Severity level for violations
        
    Returns:
        Guard that validates value is in choices list
        
    Example:
        choices=["yes", "no", "maybe"] ensures value is one of these options
    """
    if not choices:
        raise ValueError("choices cannot be empty - please provide a list of choices")
    
    async def run(ctx: Ctx) -> Either:
        """Validate that the output is in the choices list."""
        value = ctx.get("output", "")
        
        # Handle messages context (for input guards)
        if not value and "messages" in ctx:
            messages = ctx.get("messages", [])
            if isinstance(messages, list) and messages:
                value = last_message_text(messages)
        
        # Handle string values - strip whitespace
        if isinstance(value, str):
            value = value.strip()
        
        # Check if value is in choices
        if value not in choices:
            return Left_([Violation(
                rule_id="validation.valid_choices",
                severity=severity,
                message=f"Value '{value}' is not in choices {choices}",
                score=1.0,
                evidence={
                    "value": value,
                    "choices": choices,
                    "value_type": type(value).__name__
                }
            )])
        
        return Right_(ctx)
    
    return run


@guard(
    "validation.valid_length",
    tier="T0",
    description="Validates that the length of a string or list is within expected range",
    performance_budget_ms=1.0
)
def valid_length(
    min: Optional[int] = None,
    max: Optional[int] = None,
    severity: Literal["low", "med", "high", "critical"] = "med"
) -> Guard:
    """
    Validates that the length of value is within the expected range.
    
    Supports both strings and lists.
    
    Args:
        min: The inclusive minimum length (None for no minimum)
        max: The inclusive maximum length (None for no maximum)
        severity: Severity level for violations
        
    Returns:
        Guard that validates length constraints
        
    Example:
        min=5, max=10 ensures value length is between 5 and 10 characters/elements
    """
    if min is not None and min < 0:
        raise ValueError("min length must be >= 0")
    if max is not None and max < 0:
        raise ValueError("max length must be >= 0")
    if min is not None and max is not None and min > max:
        raise ValueError("min length must be <= max length")
    
    async def run(ctx: Ctx) -> Either:
        """Validate that the output length is within the expected range."""
        value = ctx.get("output", "")
        
        # Handle messages context (for input guards)
        if not value and "messages" in ctx:
            messages = ctx.get("messages", [])
            if isinstance(messages, list) and messages:
                value = last_message_text(messages)
        
        # Handle non-string/list values
        if not isinstance(value, (str, list)):
            return Right_(ctx)
        
        value_length = len(value)
        violations = []
        
        # Check minimum length
        if min is not None and value_length < min:
            violations.append(Violation(
                rule_id="validation.valid_length",
                severity=severity,
                message=f"Value has length {value_length} which is less than minimum {min}",
                score=1.0,
                evidence={
                    "length": value_length,
                    "min_length": min,
                    "max_length": max,
                    "value_type": type(value).__name__,
                    "value_preview": str(value)[:100] + "..." if len(str(value)) > 100 else str(value)
                }
            ))
        
        # Check maximum length
        if max is not None and value_length > max:
            violations.append(Violation(
                rule_id="validation.valid_length",
                severity=severity,
                message=f"Value has length {value_length} which is greater than maximum {max}",
                score=1.0,
                evidence={
                    "length": value_length,
                    "min_length": min,
                    "max_length": max,
                    "value_type": type(value).__name__,
                    "value_preview": str(value)[:100] + "..." if len(str(value)) > 100 else str(value)
                }
            ))
        
        if violations:
            return Left_(violations)
        
        return Right_(ctx)
    
    return run


@guard(
    "validation.valid_range",
    tier="T0",
    description="Validates that a numerical value is within an expected range",
    performance_budget_ms=1.0
)
def valid_range(
    min: Optional[Union[int, float]] = None,
    max: Optional[Union[int, float]] = None,
    severity: Literal["low", "med", "high", "critical"] = "med"
) -> Guard:
    """
    Validates that a numerical value is within a range.
    
    Args:
        min: The inclusive minimum value (None for no minimum)
        max: The inclusive maximum value (None for no maximum)
        severity: Severity level for violations
        
    Returns:
        Guard that validates numeric range constraints
        
    Example:
        min=0, max=100 ensures value is between 0 and 100 (inclusive)
    """
    if min is not None and max is not None and min > max:
        raise ValueError("min value must be <= max value")
    
    async def run(ctx: Ctx) -> Either:
        """Validate that the output is within the expected range."""
        value = ctx.get("output", "")
        
        # Handle messages context (for input guards)
        if not value and "messages" in ctx:
            messages = ctx.get("messages", [])
            if isinstance(messages, list) and messages:
                value = last_message_text(messages)
        
        # Try to convert to numeric if it's a string
        if isinstance(value, str):
            try:
                # Try int first, then float
                if '.' in value or 'e' in value.lower() or 'E' in value:
                    value = float(value)
                else:
                    value = int(value)
            except (ValueError, TypeError):
                return Right_(ctx)  # Not a numeric string, skip validation
        
        # Check if value is numeric
        if not isinstance(value, (int, float)):
            return Right_(ctx)
        
        violations = []
        
        # Check minimum value
        if min is not None and value < min:
            violations.append(Violation(
                rule_id="validation.valid_range",
                severity=severity,
                message=f"Value {value} is less than minimum {min}",
                score=1.0,
                evidence={
                    "value": value,
                    "min": min,
                    "max": max,
                    "value_type": type(value).__name__
                }
            ))
        
        # Check maximum value
        if max is not None and value > max:
            violations.append(Violation(
                rule_id="validation.valid_range",
                severity=severity,
                message=f"Value {value} is greater than maximum {max}",
                score=1.0,
                evidence={
                    "value": value,
                    "min": min,
                    "max": max,
                    "value_type": type(value).__name__
                }
            ))
        
        if violations:
            return Left_(violations)
        
        return Right_(ctx)
    
    return run
