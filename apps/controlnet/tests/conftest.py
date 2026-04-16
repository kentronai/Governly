"""
Pytest configuration and fixtures
"""

import asyncio
import pytest
import tempfile
from pathlib import Path

from cga_core import clear_registry


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(autouse=True)
def clear_guard_registry():
    """Clear guard registry before each test and re-register guards"""
    import importlib
    import sys
    
    # Clear registry
    clear_registry()
    
    # Force reload guard modules to re-run @guard decorators
    guard_modules = [
        'guard_packs.default_guardrails.guards',
        'guard_packs.formatting.guards',
        'guard_packs.validation.guards',
    ]
    
    for module_name in guard_modules:
        if module_name in sys.modules:
            importlib.reload(sys.modules[module_name])
        else:
            try:
                __import__(module_name)
            except ImportError:
                pass  # Module might not exist
    
    yield
    # Don't clear after test - next test will clear before it runs


@pytest.fixture
def temp_policy_dir():
    """Create temporary directory for policy files"""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def sample_policy_yaml():
    """Sample policy YAML content"""
    return """
policy: test_policy
guards:
  - id: pii.detect
    target: messages[*].content
    with: 
      types: ["EMAIL"]
      anonymize_mode: "mask"
      threshold: 1.0
      severity: "high"

  - id: profanity.detect
    target: output.text
    with:
      categories: ["profanity"]
      threshold: 0.75
      severity: "med"

compose:
  root: allOf(default_pii, default_profanity)
"""


@pytest.fixture
def sample_messages():
    """Sample chat messages"""
    return [
        {"role": "user", "content": "Send an email to john@example.com about the meeting"},
        {"role": "assistant", "content": "I'll help you draft an email about the meeting."}
    ]


@pytest.fixture
def sample_output():
    """Sample output content"""
    return "I'll help you draft an email about the meeting."


@pytest.fixture
def sample_political_output():
    """Sample political content that should be blocked"""
    return "You should vote for the candidate in the upcoming election."
