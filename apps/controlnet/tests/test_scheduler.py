"""
Unit tests for smart guard scheduler
"""

import pytest
import asyncio
from cga_core.scheduler import SmartGuardScheduler, ExecutionResult
from cga_core.types import Ctx, Right_, Left_, Violation


@pytest.mark.asyncio
async def test_scheduler_tiered_execution():
    """Test that scheduler runs guards in tiered order"""
    execution_order = []
    
    async def t0_guard(ctx):
        execution_order.append("T0")
        return Right_(ctx)
    
    async def t1_guard(ctx):
        execution_order.append("T1")
        return Right_(ctx)
    
    async def t2_guard(ctx):
        execution_order.append("T2")
        return Right_(ctx)
    
    guards = [
        {"guard": t0_guard, "tier": "T0"},
        {"guard": t1_guard, "tier": "T1"},
        {"guard": t2_guard, "tier": "T2"},
    ]
    
    scheduler = SmartGuardScheduler()
    result = await scheduler.execute_policy(guards, {"test": "data"}, risk_level="critical")
    
    assert result["_tag"] == "Right"
    # With critical risk level, all tiers should run
    assert "T0" in execution_order
    assert "T1" in execution_order
    assert "T2" in execution_order


@pytest.mark.asyncio
async def test_scheduler_early_exit_on_critical_t0():
    """Test early exit when T0 finds critical violation"""
    execution_order = []
    
    async def t0_guard(ctx):
        execution_order.append("T0")
        return Left_([Violation(
            rule_id="test.critical",
            severity="critical",
            message="Critical violation in T0",
            score=1.0
        )])
    
    async def t1_guard(ctx):
        execution_order.append("T1")
        return Right_(ctx)
    
    guards = [
        {"guard": t0_guard, "tier": "T0"},
        {"guard": t1_guard, "tier": "T1"},
    ]
    
    scheduler = SmartGuardScheduler()
    result = await scheduler.execute_policy(guards, {"test": "data"})
    
    assert result["_tag"] == "Left"
    assert "T0" in execution_order
    assert "T1" not in execution_order  # Should not run T1


@pytest.mark.asyncio
async def test_scheduler_early_exit_on_critical_t1():
    """Test early exit when T1 finds critical violation"""
    execution_order = []
    
    async def t0_guard(ctx):
        execution_order.append("T0")
        return Left_([Violation(
            rule_id="test.suspicious",
            severity="medium",
            message="Suspicious pattern",
            score=0.6
        )])
    
    async def t1_guard(ctx):
        execution_order.append("T1")
        return Left_([Violation(
            rule_id="test.critical",
            severity="critical",
            message="Critical violation in T1",
            score=1.0
        )])
    
    async def t2_guard(ctx):
        execution_order.append("T2")
        return Right_(ctx)
    
    guards = [
        {"guard": t0_guard, "tier": "T0"},
        {"guard": t1_guard, "tier": "T1"},
        {"guard": t2_guard, "tier": "T2"},
    ]
    
    scheduler = SmartGuardScheduler()
    result = await scheduler.execute_policy(guards, {"test": "data"})
    
    assert result["_tag"] == "Left"
    assert "T0" in execution_order
    assert "T1" in execution_order
    assert "T2" not in execution_order  # Should not run T2


@pytest.mark.asyncio
async def test_scheduler_intelligent_gating_low_risk():
    """Test that T1/T2 are skipped with low similarity (fast path)"""
    execution_order = []
    
    async def t0_guard(ctx):
        execution_order.append("T0")
        return Right_(ctx)  # Clean result
    
    async def t1_guard(ctx):
        execution_order.append("T1")
        return Right_(ctx)
    
    async def t2_guard(ctx):
        execution_order.append("T2")
        return Right_(ctx)
    
    guards = [
        {"guard": t0_guard, "tier": "T0"},
        {"guard": t1_guard, "tier": "T1"},
        {"guard": t2_guard, "tier": "T2"},
    ]
    
    scheduler = SmartGuardScheduler()
    # Low similarity triggers fast path - skips T1/T2
    result = await scheduler.execute_policy(
        guards, 
        {"test": "data"}, 
        risk_level="low",
        max_similarity=0.15  # Below lower bound (0.20)
    )
    
    assert result["_tag"] == "Right"
    # Fast path: No guards run when similarity is below lower bound
    assert len(execution_order) == 0


@pytest.mark.asyncio
async def test_scheduler_intelligent_gating_high_score():
    """Test that T1 runs when T0 has high scores"""
    execution_order = []
    
    async def t0_guard(ctx):
        execution_order.append("T0")
        return Left_([Violation(
            rule_id="test.suspicious",
            severity="medium",
            message="Suspicious pattern",
            score=0.6  # Above threshold
        )])
    
    async def t1_guard(ctx):
        execution_order.append("T1")
        return Right_(ctx)
    
    guards = [
        {"guard": t0_guard, "tier": "T0"},
        {"guard": t1_guard, "tier": "T1"},
    ]
    
    scheduler = SmartGuardScheduler()
    result = await scheduler.execute_policy(guards, {"test": "data"}, risk_level="medium")
    
    assert "T0" in execution_order
    assert "T1" in execution_order  # Should run because score > 0.5


@pytest.mark.asyncio
async def test_scheduler_parallel_execution_within_tier():
    """Test that guards within a tier run in parallel"""
    start_times = []
    
    async def slow_guard1(ctx):
        start_times.append(asyncio.get_event_loop().time())
        await asyncio.sleep(0.05)
        return Right_(ctx)
    
    async def slow_guard2(ctx):
        start_times.append(asyncio.get_event_loop().time())
        await asyncio.sleep(0.05)
        return Right_(ctx)
    
    guards = [
        {"guard": slow_guard1, "tier": "T0"},
        {"guard": slow_guard2, "tier": "T0"},
    ]
    
    scheduler = SmartGuardScheduler()
    await scheduler.execute_policy(guards, {"test": "data"})
    
    # Both guards should start within 10ms of each other
    assert len(start_times) == 2
    assert abs(start_times[1] - start_times[0]) < 0.01


@pytest.mark.asyncio
async def test_scheduler_handles_guard_exceptions():
    """Test that scheduler handles guard exceptions gracefully"""
    async def crashing_guard(ctx):
        raise ValueError("Guard crashed")
    
    async def normal_guard(ctx):
        return Right_(ctx)
    
    guards = [
        {"guard": crashing_guard, "tier": "T0"},
        {"guard": normal_guard, "tier": "T0"},
    ]
    
    scheduler = SmartGuardScheduler()
    result = await scheduler.execute_policy(guards, {"test": "data"})
    
    assert result["_tag"] == "Left"
    assert any("error" in v.get("rule_id", "").lower() for v in result["left"])


@pytest.mark.asyncio
async def test_scheduler_adaptive_batching_large_set():
    """Test adaptive batching for large guard sets"""
    guard_count = 0
    
    async def counting_guard(ctx):
        nonlocal guard_count
        guard_count += 1
        await asyncio.sleep(0.001)
        return Right_(ctx)
    
    # Create 50 guards
    guards = [{"guard": counting_guard, "tier": "T0"} for _ in range(50)]
    
    scheduler = SmartGuardScheduler()
    result = await scheduler.execute_policy(guards, {"test": "data"}, risk_level="critical")
    
    assert result["_tag"] == "Right"
    assert guard_count == 50


@pytest.mark.asyncio
async def test_scheduler_t2_gating_requires_high_t1_score():
    """Test that T2 is skipped with high similarity (block path)"""
    execution_order = []
    
    async def t0_guard(ctx):
        execution_order.append("T0")
        return Right_(ctx)
    
    async def t1_guard(ctx):
        execution_order.append("T1")
        return Right_(ctx)
    
    async def t2_guard(ctx):
        execution_order.append("T2")
        return Right_(ctx)
    
    guards = [
        {"guard": t0_guard, "tier": "T0"},
        {"guard": t1_guard, "tier": "T1"},
        {"guard": t2_guard, "tier": "T2"},
    ]
    
    scheduler = SmartGuardScheduler()
    # High similarity triggers block path - returns violation immediately
    result = await scheduler.execute_policy(
        guards, 
        {"test": "data"}, 
        risk_level="medium",
        max_similarity=0.95  # Above upper bound (0.90)
    )
    
    # Block path: Returns violation without running any guards
    assert result["_tag"] == "Left"
    assert len(execution_order) == 0
    violations = result["left"]
    assert len(violations) == 1
    assert violations[0]["rule_id"] == "similarity.high_confidence_violation"


@pytest.mark.asyncio
async def test_scheduler_critical_risk_runs_all_tiers():
    """Test that critical risk level runs all tiers"""
    execution_order = []
    
    async def t0_guard(ctx):
        execution_order.append("T0")
        return Right_(ctx)
    
    async def t1_guard(ctx):
        execution_order.append("T1")
        return Right_(ctx)
    
    async def t2_guard(ctx):
        execution_order.append("T2")
        return Right_(ctx)
    
    guards = [
        {"guard": t0_guard, "tier": "T0"},
        {"guard": t1_guard, "tier": "T1"},
        {"guard": t2_guard, "tier": "T2"},
    ]
    
    scheduler = SmartGuardScheduler()
    result = await scheduler.execute_policy(guards, {"test": "data"}, risk_level="critical")
    
    assert result["_tag"] == "Right"
    assert "T0" in execution_order
    assert "T1" in execution_order
    assert "T2" in execution_order


@pytest.mark.asyncio
async def test_execution_result_has_critical_violations():
    """Test ExecutionResult.has_critical_violations() method"""
    result_left = Left_([Violation(
        rule_id="test.critical",
        severity="critical",
        message="Critical",
        score=1.0
    )])
    
    exec_result = ExecutionResult(result_left, {})
    assert exec_result.has_critical_violations() is True


@pytest.mark.asyncio
async def test_execution_result_has_suspicious_patterns():
    """Test ExecutionResult.has_suspicious_patterns() method"""
    result_left = Left_([Violation(
        rule_id="test.suspicious",
        severity="medium",
        message="Suspicious",
        score=0.5
    )])
    
    exec_result = ExecutionResult(result_left, {})
    assert exec_result.has_suspicious_patterns() is True
