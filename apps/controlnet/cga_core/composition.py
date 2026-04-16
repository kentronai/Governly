"""
Composition Engine for Composable Guard Algebra

Provides algebraic composition operators with true parallel execution.
Extends the basic combinators with fluent API and advanced composition patterns.
"""

import asyncio
from typing import Callable, List, Optional

from .types import Guard, Ctx, Either, Left_, Right_, Violation


class GuardOps:
    """
    Fluent API for guard composition with algebraic operators
    
    Example:
        policy = (
            GuardOps(pii_guard)
            .then(toxicity_guard)
            .parallel(jailbreak_guard)
            .build()
        )
    """
    
    def __init__(self, guard: Guard):
        self.guard = guard
    
    def then(self, other: Guard) -> 'GuardOps':
        """
        Sequential composition: self ∘ other (monadic bind)
        Short-circuits on first failure
        """
        async def composed(ctx: Ctx) -> Either:
            result = await self.guard(ctx)
            if result["_tag"] == "Left":
                return result
            return await other(result["right"])
        
        return GuardOps(composed)
    
    def parallel(self, other: Guard) -> 'GuardOps':
        """
        Parallel composition: self ⊗ other (tensor product)
        Runs both guards concurrently, collects all violations
        """
        async def composed(ctx: Ctx) -> Either:
            results = await asyncio.gather(
                self.guard(ctx),
                other(ctx),
                return_exceptions=True
            )
            
            all_violations = []
            for result in results:
                if isinstance(result, Exception):
                    all_violations.append(Violation(
                        rule_id="composition.error",
                        severity="critical",
                        message=f"Guard execution failed: {str(result)}",
                        score=1.0
                    ))
                elif result["_tag"] == "Left":
                    all_violations.extend(result["left"])
            
            return Left_(all_violations) if all_violations else Right_(ctx)
        
        return GuardOps(composed)
    
    def when(self, predicate: Callable[[Ctx], bool], guard: Guard) -> 'GuardOps':
        """
        Conditional composition: run guard only when predicate holds
        """
        async def composed(ctx: Ctx) -> Either:
            result = await self.guard(ctx)
            if result["_tag"] == "Left":
                return result
            
            next_ctx = result["right"]
            if predicate(next_ctx):
                return await guard(next_ctx)
            return result
        
        return GuardOps(composed)
    
    def timeout(self, ms: int) -> 'GuardOps':
        """
        Timeout composition: fail if guard exceeds time limit
        """
        async def composed(ctx: Ctx) -> Either:
            try:
                return await asyncio.wait_for(
                    self.guard(ctx),
                    timeout=ms / 1000.0
                )
            except asyncio.TimeoutError:
                return Left_([Violation(
                    rule_id="composition.timeout",
                    severity="high",
                    message=f"Guard exceeded timeout of {ms}ms",
                    score=1.0
                )])
        
        return GuardOps(composed)
    
    def build(self) -> Guard:
        """Return the composed guard"""
        return self.guard


def par(*guards: Guard) -> Guard:
    """
    Parallel composition of multiple guards
    Runs all guards concurrently using asyncio.gather
    
    Args:
        *guards: Guards to run in parallel
        
    Returns:
        Guard that runs all guards concurrently
    """
    if not guards:
        return identity_guard()
    
    if len(guards) == 1:
        return guards[0]
    
    async def composed(ctx: Ctx) -> Either:
        results = await asyncio.gather(
            *[g(ctx) for g in guards],
            return_exceptions=True
        )
        
        all_violations = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                all_violations.append(Violation(
                    rule_id=f"composition.guard_{i}.error",
                    severity="critical",
                    message=f"Guard execution failed: {str(result)}",
                    score=1.0
                ))
            elif result["_tag"] == "Left":
                all_violations.extend(result["left"])
        
        return Left_(all_violations) if all_violations else Right_(ctx)
    
    return composed


def identity_guard() -> Guard:
    """
    Identity guard: always succeeds
    Identity element for composition (monoid unit)
    """
    async def guard(ctx: Ctx) -> Either:
        return Right_(ctx)
    
    return guard


def compose_with_timeout(guard: Guard, timeout_ms: int) -> Guard:
    """
    Compose guard with timeout
    
    Args:
        guard: Guard to wrap
        timeout_ms: Timeout in milliseconds
        
    Returns:
        Guard that fails if it exceeds timeout
    """
    async def timed_guard(ctx: Ctx) -> Either:
        try:
            return await asyncio.wait_for(
                guard(ctx),
                timeout=timeout_ms / 1000.0
            )
        except asyncio.TimeoutError:
            return Left_([Violation(
                rule_id="timeout",
                severity="high",
                message=f"Guard exceeded timeout of {timeout_ms}ms",
                score=1.0
            )])
    
    return timed_guard


