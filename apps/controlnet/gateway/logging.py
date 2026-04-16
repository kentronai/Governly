"""
Centralized Logging Configuration

Structured JSON logging using structlog for Cloud Logging compatibility.
All logs are JSON-formatted with consistent fields for easy querying.
"""

import sys
import logging
import structlog


def setup_logging(log_level: str = "INFO"):
    """
    Setup structured JSON logging with structlog.
    
    Output format: JSON lines to stdout
    Fields: timestamp, level, logger, event, trace_id, ...
    
    Benefits:
    - Cloud Logging automatically parses JSON
    - Easy to query and filter
    - Consistent structured format
    - Trace correlation support
    """
    # Map log level string to logging constant
    level_map = {
        "DEBUG": logging.DEBUG,
        "INFO": logging.INFO,
        "WARNING": logging.WARNING,
        "ERROR": logging.ERROR,
        "CRITICAL": logging.CRITICAL,
    }
    log_level_value = level_map.get(log_level.upper(), logging.INFO)
    
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.StackInfoRenderer(),
            structlog.dev.set_exc_info,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer()
        ],
        wrapper_class=structlog.make_filtering_bound_logger(log_level_value),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """
    Get a structured logger instance.
    
    Usage:
        logger = get_logger(__name__)
        logger.info("request_started", trace_id="abc123", tenant_id="tenant1")
        logger.error("request_failed", error=str(e), trace_id="abc123")
    """
    return structlog.get_logger(name)


# Module-level logger for backwards compatibility
logger = get_logger("gateway")

