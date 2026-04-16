"""
Test cases for CGA combinators (seq, allOf, anyOf, kOf, unless)
"""

import pytest
from cga_core import (
    seq,
    allOf,
    anyOf,
    kOf,
    unless,
    Right_,
    Left_,
    Violation,
    is_left,
    is_right,
    get_context,
    get_violations
)


class TestSeqCombinator:
    """Test seq (sequential) combinator"""
    
    @pytest.mark.asyncio
    async def test_seq_all_pass(self):
        """seq should chain guards sequentially when all pass"""
        async def guard1(ctx):
            return Right_({**ctx, "step1": "done"})
        
        async def guard2(ctx):
            return Right_({**ctx, "step2": "done"})
        
        async def guard3(ctx):
            return Right_({**ctx, "step3": "done"})
        
        combined = seq(guard1, guard2, guard3)
        result = await combined({"input": "test"})
        
        assert is_right(result)
        ctx = get_context(result)
        assert ctx["step1"] == "done"
        assert ctx["step2"] == "done"
        assert ctx["step3"] == "done"
    
    @pytest.mark.asyncio
    async def test_seq_stops_on_first_failure(self):
        """seq should stop on first violation"""
        async def guard1(ctx):
            return Right_({**ctx, "step1": "done"})
        
        async def guard2(ctx):
            return Left_([Violation("test.guard2", "high", "Guard 2 failed")])
        
        async def guard3(ctx):
            return Right_({**ctx, "step3": "done"})
        
        combined = seq(guard1, guard2, guard3)
        result = await combined({"input": "test"})
        
        assert is_left(result)
        violations = get_violations(result)
        assert len(violations) == 1
        assert violations[0]["rule_id"] == "test.guard2"


class TestAllOfCombinator:
    """Test allOf (parallel) combinator"""
    
    @pytest.mark.asyncio
    async def test_allof_all_pass(self):
        """allOf should run all guards and merge contexts"""
        async def guard1(ctx):
            return Right_({**ctx, "check1": "pass"})
        
        async def guard2(ctx):
            return Right_({**ctx, "check2": "pass"})
        
        async def guard3(ctx):
            return Right_({**ctx, "check3": "pass"})
        
        combined = allOf(guard1, guard2, guard3)
        result = await combined({"input": "test"})
        
        assert is_right(result)
        ctx = get_context(result)
        assert ctx["check1"] == "pass"
        assert ctx["check2"] == "pass"
        assert ctx["check3"] == "pass"
    
    @pytest.mark.asyncio
    async def test_allof_collects_all_violations(self):
        """allOf should collect all violations even if multiple fail"""
        async def guard1(ctx):
            return Left_([Violation("test.guard1", "high", "Guard 1 failed")])
        
        async def guard2(ctx):
            return Right_({**ctx, "check2": "pass"})
        
        async def guard3(ctx):
            return Left_([Violation("test.guard3", "med", "Guard 3 failed")])
        
        combined = allOf(guard1, guard2, guard3)
        result = await combined({"input": "test"})
        
        assert is_left(result)
        violations = get_violations(result)
        assert len(violations) == 2
        assert any(v["rule_id"] == "test.guard1" for v in violations)
        assert any(v["rule_id"] == "test.guard3" for v in violations)


class TestAnyOfCombinator:
    """Test anyOf (at least one must pass) combinator"""
    
    @pytest.mark.asyncio
    async def test_anyof_one_passes(self):
        """anyOf should succeed if at least one guard passes"""
        async def guard1(ctx):
            return Left_([Violation("test.guard1", "high", "Guard 1 failed")])
        
        async def guard2(ctx):
            return Right_({**ctx, "check2": "pass"})
        
        async def guard3(ctx):
            return Left_([Violation("test.guard3", "high", "Guard 3 failed")])
        
        combined = anyOf(guard1, guard2, guard3)
        result = await combined({"input": "test"})
        
        assert is_right(result)
        ctx = get_context(result)
        assert ctx["check2"] == "pass"
    
    @pytest.mark.asyncio
    async def test_anyof_all_fail(self):
        """anyOf should fail if all guards fail"""
        async def guard1(ctx):
            return Left_([Violation("test.guard1", "high", "Guard 1 failed")])
        
        async def guard2(ctx):
            return Left_([Violation("test.guard2", "high", "Guard 2 failed")])
        
        combined = anyOf(guard1, guard2)
        result = await combined({"input": "test"})
        
        assert is_left(result)
        violations = get_violations(result)
        assert len(violations) == 2


class TestKOfCombinator:
    """Test kOf (k out of n must pass) combinator"""
    
    @pytest.mark.asyncio
    async def test_kof_exactly_k_pass(self):
        """kOf should succeed when exactly k guards pass"""
        async def guard1(ctx):
            return Right_({**ctx, "check1": "pass"})
        
        async def guard2(ctx):
            return Right_({**ctx, "check2": "pass"})
        
        async def guard3(ctx):
            return Left_([Violation("test.guard3", "high", "Guard 3 failed")])
        
        combined = kOf(2, guard1, guard2, guard3)
        result = await combined({"input": "test"})
        
        assert is_right(result)
    
    @pytest.mark.asyncio
    async def test_kof_more_than_k_pass(self):
        """kOf should succeed when more than k guards pass"""
        async def guard1(ctx):
            return Right_({**ctx, "check1": "pass"})
        
        async def guard2(ctx):
            return Right_({**ctx, "check2": "pass"})
        
        async def guard3(ctx):
            return Right_({**ctx, "check3": "pass"})
        
        combined = kOf(2, guard1, guard2, guard3)
        result = await combined({"input": "test"})
        
        assert is_right(result)
    
    @pytest.mark.asyncio
    async def test_kof_fewer_than_k_pass(self):
        """kOf should fail when fewer than k guards pass"""
        async def guard1(ctx):
            return Right_({**ctx, "check1": "pass"})
        
        async def guard2(ctx):
            return Left_([Violation("test.guard2", "high", "Guard 2 failed")])
        
        async def guard3(ctx):
            return Left_([Violation("test.guard3", "high", "Guard 3 failed")])
        
        combined = kOf(2, guard1, guard2, guard3)
        result = await combined({"input": "test"})
        
        assert is_left(result)
        violations = get_violations(result)
        assert len(violations) == 2


class TestUnlessCombinator:
    """Test unless (conditional) combinator"""
    
    @pytest.mark.asyncio
    async def test_unless_condition_passes_guard_runs(self):
        """unless should run guard when condition passes"""
        async def condition(ctx):
            return Right_(ctx)  # Condition passes
        
        async def guard(ctx):
            return Right_({**ctx, "guard_ran": True})
        
        combined = unless(condition, guard)
        result = await combined({"input": "test"})
        
        assert is_right(result)
        ctx = get_context(result)
        assert ctx.get("guard_ran") is True
    
    @pytest.mark.asyncio
    async def test_unless_condition_fails_guard_skipped(self):
        """unless should skip guard when condition fails"""
        async def condition(ctx):
            return Left_([Violation("test.condition", "high", "Condition failed")])
        
        async def guard(ctx):
            return Right_({**ctx, "guard_ran": True})
        
        combined = unless(condition, guard)
        result = await combined({"input": "test"})
        
        # Should return original context without running guard
        assert is_right(result)
        ctx = get_context(result)
        assert "guard_ran" not in ctx


class TestCombinatorComposition:
    """Test composing multiple combinators"""
    
    @pytest.mark.asyncio
    async def test_nested_combinators(self):
        """Combinators should compose correctly"""
        async def guard1(ctx):
            return Right_({**ctx, "g1": "pass"})
        
        async def guard2(ctx):
            return Right_({**ctx, "g2": "pass"})
        
        async def guard3(ctx):
            return Right_({**ctx, "g3": "pass"})
        
        async def guard4(ctx):
            return Right_({**ctx, "g4": "pass"})
        
        # allOf(seq(g1, g2), seq(g3, g4))
        combined = allOf(
            seq(guard1, guard2),
            seq(guard3, guard4)
        )
        
        result = await combined({"input": "test"})
        
        assert is_right(result)
        ctx = get_context(result)
        assert all(k in ctx for k in ["g1", "g2", "g3", "g4"])


class TestCombinatorEdgeCases:
    """Test edge cases for combinators"""
    
    @pytest.mark.asyncio
    async def test_seq_empty(self):
        """seq with no guards should return context unchanged"""
        combined = seq()
        result = await combined({"input": "test"})
        
        assert is_right(result)
        ctx = get_context(result)
        assert ctx["input"] == "test"
    
    @pytest.mark.asyncio
    async def test_allof_single_guard(self):
        """allOf with single guard should work"""
        async def guard(ctx):
            return Right_({**ctx, "check": "pass"})
        
        combined = allOf(guard)
        result = await combined({"input": "test"})
        
        assert is_right(result)
        ctx = get_context(result)
        assert ctx["check"] == "pass"
    
    @pytest.mark.asyncio
    async def test_kof_k_zero(self):
        """kOf with k=0 should always pass"""
        async def guard(ctx):
            return Left_([Violation("test", "high", "Failed")])
        
        combined = kOf(0, guard)
        result = await combined({"input": "test"})
        
        assert is_right(result)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

