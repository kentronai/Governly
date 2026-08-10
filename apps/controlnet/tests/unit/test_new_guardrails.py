"""
Unit tests for the guardrails added to make every marketplace catalog entry
match a real, working detection implementation:

- pii.redact (guard_packs/default_guardrails/guards.py)
- business.competitor_protection, business.brand_tone (guard_packs/business/guards.py)
- tools.allowlist, tools.denylist (guard_packs/tools/guards.py)
"""

import pytest

from cga_core import is_left, is_right, get_violations, get_context
from guard_packs.default_guardrails.guards import pii_redact
from guard_packs.business.guards import competitor_protection, brand_tone
from guard_packs.tools.guards import allowlist, denylist


class TestPiiRedact:
    @pytest.mark.asyncio
    async def test_redacts_ssn_and_never_blocks(self):
        guard = pii_redact(types=["SSN"], mode="mask")
        result = await guard({"output": "my ssn is 123-45-6789, call me back"})

        assert is_right(result)
        ctx = get_context(result)
        assert "123-45-6789" not in ctx["output"]
        assert "[SSN]" in ctx["output"]

    @pytest.mark.asyncio
    async def test_remove_mode_deletes_match(self):
        guard = pii_redact(types=["EMAIL"], mode="remove")
        result = await guard({"output": "reach me at a@b.com please"})

        ctx = get_context(result)
        assert "a@b.com" not in ctx["output"]
        assert "[EMAIL]" not in ctx["output"]

    @pytest.mark.asyncio
    async def test_no_match_passes_through_unchanged(self):
        guard = pii_redact(types=["SSN"])
        result = await guard({"output": "nothing sensitive here"})

        assert is_right(result)
        assert get_context(result)["output"] == "nothing sensitive here"

    @pytest.mark.asyncio
    async def test_invalid_type_rejected_at_construction(self):
        with pytest.raises(ValueError):
            pii_redact(types=["NOT_A_TYPE"])


class TestCompetitorProtection:
    @pytest.mark.asyncio
    async def test_blocks_bare_mention_with_no_restricted_topics(self):
        guard = competitor_protection(competitors=["OldCorp"])
        result = await guard({"output": "OldCorp is a company that exists"})
        assert is_left(result)
        assert get_violations(result)[0]["rule_id"] == "business.competitor_protection"

    @pytest.mark.asyncio
    async def test_allows_mention_outside_restricted_topic(self):
        guard = competitor_protection(competitors=["OldCorp"], restricted_topics=["pricing"])
        result = await guard({"output": "OldCorp's office is in Seattle"})
        assert is_right(result)

    @pytest.mark.asyncio
    async def test_blocks_mention_inside_restricted_topic(self):
        guard = competitor_protection(competitors=["OldCorp"], restricted_topics=["pricing"])
        result = await guard({"output": "our pricing beats OldCorp's pricing"})
        assert is_left(result)

    @pytest.mark.asyncio
    async def test_requires_at_least_one_competitor(self):
        with pytest.raises(ValueError):
            competitor_protection(competitors=[])


class TestBrandTone:
    """
    Pattern-match tests are pure regex and run with no model. The
    semantic-tone tests load the real sentence-transformers model
    (all-MiniLM-L6-v2) on first use in this process - slower, but they
    are exercising the actual production code path, not a mock.
    """

    @pytest.mark.asyncio
    async def test_blocks_configured_pattern(self):
        guard = brand_tone(unprofessional_patterns=[r"\bshut up\b"])
        result = await guard({"output": "just shut up and read the docs"})
        assert is_left(result)
        violation = get_violations(result)[0]
        assert violation["rule_id"] == "business.brand_tone"
        assert violation["evidence"]["detection_method"] == "pattern"

    @pytest.mark.asyncio
    async def test_empty_pattern_list_and_non_professional_tone_never_blocks(self):
        # No patterns configured, and required_tone isn't "professional" -
        # semantic detection is intentionally not engaged for other values.
        guard = brand_tone(unprofessional_patterns=[], required_tone="casual")
        result = await guard({"output": "shut up"})
        assert is_right(result)

    @pytest.mark.asyncio
    async def test_clean_professional_text_passes_semantic_check(self):
        guard = brand_tone(unprofessional_patterns=[])
        result = await guard({"output": "Thanks for your patience while we investigate this."})
        assert is_right(result)

    @pytest.mark.asyncio
    async def test_neutral_factual_text_does_not_false_positive(self):
        guard = brand_tone(unprofessional_patterns=[])
        result = await guard({"output": "The meeting is scheduled for 3 PM on Thursday."})
        assert is_right(result)

    @pytest.mark.asyncio
    async def test_semantic_check_catches_casual_tone_with_no_matching_pattern(self):
        # Nothing in unprofessional_patterns matches this - only the
        # embedding-based tone check can catch it.
        guard = brand_tone(unprofessional_patterns=[])
        result = await guard({"output": "sure, whatever you say"})
        assert is_left(result)
        violation = get_violations(result)[0]
        assert violation["evidence"]["detection_method"] == "semantic_tone"

    @pytest.mark.asyncio
    async def test_pattern_match_short_circuits_before_semantic_check(self):
        # Both would fire here; pattern match must win and report as such.
        guard = brand_tone(unprofessional_patterns=[r"\bwhatever\b"])
        result = await guard({"output": "whatever, not my problem"})
        assert is_left(result)
        assert get_violations(result)[0]["evidence"]["detection_method"] == "pattern"


class TestToolsAllowlist:
    @pytest.mark.asyncio
    async def test_allowed_tool_passes(self):
        guard = allowlist(allowed_tools=["search"])
        result = await guard({"tool_args": {"function_name": "search", "arguments": {}}})
        assert is_right(result)

    @pytest.mark.asyncio
    async def test_unlisted_tool_blocked(self):
        guard = allowlist(allowed_tools=["search"])
        result = await guard({"tool_args": {"function_name": "delete_database", "arguments": {}}})
        assert is_left(result)
        assert get_violations(result)[0]["rule_id"] == "tools.allowlist"

    @pytest.mark.asyncio
    async def test_empty_allowlist_blocks_everything(self):
        guard = allowlist(allowed_tools=[])
        result = await guard({"tool_args": {"function_name": "search", "arguments": {}}})
        assert is_left(result)


class TestToolsDenylist:
    @pytest.mark.asyncio
    async def test_denied_tool_blocked(self):
        guard = denylist(denied_tools=["delete_database"])
        result = await guard({"tool_args": {"function_name": "delete_database", "arguments": {}}})
        assert is_left(result)
        assert get_violations(result)[0]["rule_id"] == "tools.denylist"

    @pytest.mark.asyncio
    async def test_non_denied_tool_passes(self):
        guard = denylist(denied_tools=["delete_database"])
        result = await guard({"tool_args": {"function_name": "search", "arguments": {}}})
        assert is_right(result)

    @pytest.mark.asyncio
    async def test_empty_denylist_never_blocks(self):
        guard = denylist(denied_tools=[])
        result = await guard({"tool_args": {"function_name": "delete_database", "arguments": {}}})
        assert is_right(result)
