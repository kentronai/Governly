"""
Test cases for CGA lens and focus mechanisms

Critical tests for the array handling bug fix:
- lens should return arrays for wildcard JSONPath patterns
- setter should properly update individual array elements
- focus should process each array item independently
"""

import pytest
from cga_core import lens, focus, Right_, Left_, Violation, is_left, is_right, get_context


class TestLensArrayHandling:
    """Test lens with array patterns (messages[*].content)"""
    
    def test_lens_getter_returns_array_for_wildcard(self):
        """Lens getter should return array for wildcard patterns, not concatenated string"""
        getter, setter = lens("messages[*].content")
        
        ctx = {
            "messages": [
                {"role": "user", "content": "Hello"},
                {"role": "assistant", "content": "Hi there"},
                {"role": "user", "content": "How are you?"}
            ]
        }
        
        result = getter(ctx)
        
        # Should return array, not concatenated string
        assert isinstance(result, list)
        assert result == ["Hello", "Hi there", "How are you?"]
        assert result != "Hello Hi there How are you?"  # NOT concatenated
    
    def test_lens_setter_updates_individual_array_elements(self):
        """Lens setter should update each array element, not replace with single string"""
        getter, setter = lens("messages[*].content")
        
        ctx = {
            "messages": [
                {"role": "user", "content": "My email is john@example.com"},
                {"role": "assistant", "content": "Got it"},
                {"role": "user", "content": "My phone is 555-1234"}
            ]
        }
        
        # Simulate PII redaction
        redacted = [
            "My email is [EMAIL]",
            "Got it",
            "My phone is [PHONE]"
        ]
        
        updated_ctx = setter(ctx, redacted)
        
        # Check structure is preserved
        assert len(updated_ctx["messages"]) == 3
        assert updated_ctx["messages"][0]["content"] == "My email is [EMAIL]"
        assert updated_ctx["messages"][1]["content"] == "Got it"
        assert updated_ctx["messages"][2]["content"] == "My phone is [PHONE]"
        
        # Ensure roles are preserved
        assert updated_ctx["messages"][0]["role"] == "user"
        assert updated_ctx["messages"][1]["role"] == "assistant"
        assert updated_ctx["messages"][2]["role"] == "user"
    
    def test_lens_setter_broadcast_single_value(self):
        """Lens setter can broadcast single value to all matches"""
        getter, setter = lens("items[*].status")
        
        ctx = {
            "items": [
                {"id": 1, "status": "pending"},
                {"id": 2, "status": "pending"},
                {"id": 3, "status": "pending"}
            ]
        }
        
        # Broadcast single value
        updated_ctx = setter(ctx, "approved")
        
        assert all(item["status"] == "approved" for item in updated_ctx["items"])
        assert all(item["id"] in [1, 2, 3] for item in updated_ctx["items"])


class TestFocusArrayHandling:
    """Test focus with array patterns"""
    
    @pytest.mark.asyncio
    async def test_focus_processes_each_array_item_independently(self):
        """Focus should process each array item through the guard independently"""
        getter, setter = lens("messages[*].content")
        
        # Simple uppercase guard
        async def uppercase_guard(ctx):
            content = ctx.get("output", "")
            if isinstance(content, str):
                return Right_({"output": content.upper()})
            return Right_(ctx)
        
        focused_guard = focus(getter, setter, uppercase_guard)
        
        ctx = {
            "messages": [
                {"role": "user", "content": "hello"},
                {"role": "assistant", "content": "hi"},
                {"role": "user", "content": "goodbye"}
            ]
        }
        
        result = await focused_guard(ctx)
        
        assert is_right(result)
        updated = get_context(result)
        
        assert updated["messages"][0]["content"] == "HELLO"
        assert updated["messages"][1]["content"] == "HI"
        assert updated["messages"][2]["content"] == "GOODBYE"
    
    @pytest.mark.asyncio
    async def test_focus_short_circuits_on_violation(self):
        """Focus should stop and return violation if any array item violates"""
        getter, setter = lens("messages[*].content")
        
        # Guard that blocks profanity
        async def profanity_guard(ctx):
            content = ctx.get("output", "")
            if "badword" in content.lower():
                return Left_([
                    Violation(
                        rule_id="test.profanity",
                        severity="high",
                        message="Profanity detected"
                    )
                ])
            return Right_(ctx)
        
        focused_guard = focus(getter, setter, profanity_guard)
        
        ctx = {
            "messages": [
                {"role": "user", "content": "Hello"},
                {"role": "assistant", "content": "Hi"},
                {"role": "user", "content": "This has badword in it"}
            ]
        }
        
        result = await focused_guard(ctx)
        
        assert is_left(result)
        # Should not process further messages after violation


class TestLensSingleValue:
    """Test lens with single value patterns"""
    
    def test_lens_getter_single_value(self):
        """Lens getter should return single value for non-wildcard patterns"""
        getter, setter = lens("output.text")
        
        ctx = {"output": {"text": "Hello world"}}
        
        result = getter(ctx)
        
        assert result == "Hello world"
        assert not isinstance(result, list)
    
    def test_lens_setter_single_value(self):
        """Lens setter should update single value"""
        getter, setter = lens("output.text")
        
        ctx = {"output": {"text": "Original"}}
        
        updated_ctx = setter(ctx, "Updated")
        
        assert updated_ctx["output"]["text"] == "Updated"
    
    @pytest.mark.asyncio
    async def test_focus_single_value(self):
        """Focus should work with single values"""
        getter, setter = lens("output")
        
        async def append_guard(ctx):
            content = ctx.get("output", "")
            return Right_({"output": content + " processed"})
        
        focused_guard = focus(getter, setter, append_guard)
        
        ctx = {"output": "test"}
        
        result = await focused_guard(ctx)
        
        assert is_right(result)
        updated = get_context(result)
        assert updated["output"] == "test processed"


class TestLensEdgeCases:
    """Test edge cases and error handling"""
    
    def test_lens_getter_empty_array(self):
        """Lens getter should handle empty arrays"""
        getter, setter = lens("messages[*].content")
        
        ctx = {"messages": []}
        
        result = getter(ctx)
        
        # Empty messages array: JSONPath finds messages but no content to extract
        # Returns None because no matches found
        assert result is None
    
    def test_lens_getter_missing_field(self):
        """Lens getter should handle missing fields gracefully"""
        getter, setter = lens("messages[*].content")
        
        ctx = {}
        
        result = getter(ctx)
        
        assert result is None
    
    def test_lens_setter_mismatched_array_length(self):
        """Lens setter should handle mismatched array lengths"""
        getter, setter = lens("items[*].value")
        
        ctx = {
            "items": [
                {"value": 1},
                {"value": 2},
                {"value": 3}
            ]
        }
        
        # Try to set array with different length - should broadcast
        updated_ctx = setter(ctx, [10, 20])
        
        # Should not crash - implementation may broadcast or handle differently
        assert "items" in updated_ctx


class TestRegressionForBug:
    """Regression tests for the concatenation bug"""
    
    @pytest.mark.asyncio
    async def test_multiple_messages_stay_separate(self):
        """Messages should never be concatenated into a single string"""
        getter, setter = lens("messages[*].content")
        
        # Simulate PII redaction guard
        async def pii_redact_guard(ctx):
            content = ctx.get("output", "")
            if isinstance(content, str):
                import re
                # Redact emails
                content = re.sub(r'\b[\w.-]+@[\w.-]+\.\w+\b', '[EMAIL]', content)
                # Redact phones
                content = re.sub(r'\b\d{3}-\d{4}\b', '[PHONE]', content)
                return Right_({"output": content})
            return Right_(ctx)
        
        focused_guard = focus(getter, setter, pii_redact_guard)
        
        ctx = {
            "messages": [
                {"role": "user", "content": "My email is john@example.com and my phone is 555-1234"},
                {"role": "assistant", "content": "Got it"},
                {"role": "user", "content": "Contact me at jane@example.com"}
            ]
        }
        
        result = await focused_guard(ctx)
        
        assert is_right(result)
        updated = get_context(result)
        
        # Verify messages stay separate
        assert len(updated["messages"]) == 3
        
        # Verify redaction worked on individual messages
        assert "[EMAIL]" in updated["messages"][0]["content"]
        assert "[PHONE]" in updated["messages"][0]["content"]
        assert updated["messages"][1]["content"] == "Got it"
        assert "[EMAIL]" in updated["messages"][2]["content"]
        
        # CRITICAL: Verify NOT concatenated
        all_content = " ".join(m["content"] for m in updated["messages"])
        assert all_content != updated["messages"][0]["content"]  # Not all in one message


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

