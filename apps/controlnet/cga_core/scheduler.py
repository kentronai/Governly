"""
Smart Guard Scheduler

Implements intelligent scheduling with:
- Tiered execution (T0 → T1 → T2)
- Parallel execution within tiers
- Intelligent gating based on risk scores
- Early exit on critical violations
- Adaptive batching for large guard sets
"""

import asyncio
import logging
import math
import os
from typing import List, Dict, Any, Literal, Optional

from .types import Guard, Ctx, Either, Left_, Right_, Violation

logger = logging.getLogger(__name__)


class ExecutionResult:
    """Result of guard execution with metadata"""
    
    def __init__(self, result: Either, metadata: Dict[str, Any]):
        self.result = result
        self.metadata = metadata
        self.violations = result["left"] if result["_tag"] == "Left" else []
        self.max_score = max((v.get("score", 0.0) for v in self.violations), default=0.0)
    
    def has_critical_violations(self) -> bool:
        """Check if any critical or high severity violations exist"""
        return any(
            v.get("severity") in ["critical", "high"] 
            for v in self.violations
        )
    
    def has_suspicious_patterns(self) -> bool:
        """Check if suspicious patterns detected (score > 0.3)"""
        return self.max_score > 0.3


class SmartGuardScheduler:
    """
    Intelligent scheduler for policies with many guardrails
    
    Execution logic:
    - T0 (regex/fast): Always runs in parallel
    - T1 (medium): Gated by similarity bounds (not T0 results)
    - T2 (ONNX/heavy): Gated by similarity bounds (not T1 results)
    
    Performance optimizations:
    1. Tier-based execution (T0 → T1 → T2)
    2. True parallel execution within tiers
    3. Early exit on critical violations
    4. Similarity-based intelligent gating (NOT score-based)
    5. Adaptive batching for large guard sets
    6. Fast/block paths via similarity bounds
    
    Performance targets:
    - Fast path (< lower bound): < 5ms (60-70% of requests)
    - T0 only: < 10ms (20-25% of requests)
    - T0 + T1: < 30ms (8-10% of requests)
    - T0 + T1 + T2: < 100ms (2-5% of requests)
    """
    
    def __init__(self, similarity_lower_bound: float = 0.20, similarity_upper_bound: float = 0.90):
        """
        Initialize scheduler with similarity bounds
        
        Args:
            similarity_lower_bound: Skip expensive guards if similarity < this (default 0.20)
            similarity_upper_bound: Skip ONNX if similarity > this (default 0.90)
        """
        self.similarity_lower_bound = similarity_lower_bound
        self.similarity_upper_bound = similarity_upper_bound
    
    async def execute_policy(
        self,
        guards: List[Dict[str, Any]],
        context: Ctx,
        risk_level: Literal["low", "medium", "high", "critical"] = "medium",
        max_similarity: Optional[float] = None
    ) -> Either:
        """
        Execute policy with tiered approach + similarity bounds
        
        Similarity-based optimization:
        - < lower_bound: Skip T1/T2 (fast path for safe prompts)
        - > upper_bound: Block immediately (high-confidence violations)
        - Between bounds: Normal T0 → T1 → T2 execution
        
        Args:
            guards: List of guard definitions with {guard: Guard, tier: str, ...}
            context: Context to process
            risk_level: Risk level (informational, not used for gating)
            max_similarity: Maximum similarity score from routing (optional)
            
        Returns:
            Either with violations or context
        """
        # Check similarity bounds for early exit
        if max_similarity is not None:
            logger.info(f"🔍 Checking similarity bounds: similarity={max_similarity:.3f}, lower={self.similarity_lower_bound}, upper={self.similarity_upper_bound}")
            bounds_result = self._check_similarity_bounds(max_similarity, context)
            if bounds_result is not None:
                logger.info(f"⚡ Early exit triggered by similarity bounds")
                return bounds_result
        
        t0_guards = [g["guard"] for g in guards if g.get("tier") == "T0"]
        t1_guards = [g["guard"] for g in guards if g.get("tier") == "T1"]
        t2_guards = [g["guard"] for g in guards if g.get("tier") == "T2"]
        
        logger.info(
            f"Executing policy: T0={len(t0_guards)}, T1={len(t1_guards)}, "
            f"T2={len(t2_guards)}, risk_level={risk_level}, similarity={max_similarity}"
        )
        
        # Execute T0 guards (always run, parallel)
        if t0_guards:
            t0_result = await self._execute_parallel(t0_guards, context, "T0")
            if t0_result.has_critical_violations():
                logger.info("Early exit: T0 critical violations detected")
                return t0_result.result
        
        # Execute T1 guards (check similarity bounds)
        if t1_guards and self._should_run_t1(max_similarity):
            t1_result = await self._execute_parallel(t1_guards, context, "T1")
            if t1_result.has_critical_violations():
                logger.info("Early exit: T1 critical violations detected")
                return t1_result.result
        elif t1_guards:
            logger.info(f"⚡ Skipping T1: similarity {max_similarity} out of bounds")
        
        # Execute T2 guards (check similarity bounds)
        if t2_guards and self._should_run_t2(max_similarity):
            logger.info(f"Running T2 guards: {len(t2_guards)} ONNX models...")
            t2_result = await self._execute_parallel(t2_guards, context, "T2")
            return t2_result.result
        elif t2_guards:
            logger.info(f"⚡ Skipping T2 (ONNX): similarity {max_similarity} out of bounds")
        
        return Right_(context)
    
    async def _execute_parallel(
        self,
        guards: List[Guard],
        context: Ctx,
        tier: str
    ) -> ExecutionResult:
        """
        Execute guards in true parallel with adaptive batching
        
        Args:
            guards: List of guards to execute
            context: Context to process
            tier: Tier identifier for logging
            
        Returns:
            ExecutionResult with aggregated violations
        """
        if not guards:
            return ExecutionResult(Right_(context), {"tier": tier, "count": 0})
        
        if len(guards) <= 10:
            # Small batch - execute all in parallel
            results = await asyncio.gather(
                *[g(context) for g in guards],
                return_exceptions=True
            )
        else:
            # Large batch - adaptive batching to prevent resource exhaustion
            batch_size = self._calculate_optimal_batch_size(len(guards))
            results = []
            
            for i in range(0, len(guards), batch_size):
                batch = guards[i:i+batch_size]
                batch_results = await asyncio.gather(
                    *[g(context) for g in batch],
                    return_exceptions=True
                )
                results.extend(batch_results)
                
                # Early exit if critical violation found in batch
                if any(
                    isinstance(r, dict) and 
                    r.get("_tag") == "Left" and
                    any(v.get("severity") in ["critical", "high"] for v in r.get("left", []))
                    for r in batch_results
                ):
                    logger.info(f"Early exit in batch {i//batch_size + 1}/{(len(guards) + batch_size - 1)//batch_size}")
                    break
        
        # Aggregate results
        all_violations = []
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Guard execution error: {result}")
                all_violations.append({
                    "rule_id": "execution.error",
                    "severity": "critical",
                    "message": str(result),
                    "score": 1.0
                })
            elif result["_tag"] == "Left":
                all_violations.extend(result["left"])
        
        final_result = Left_(all_violations) if all_violations else Right_(context)
        return ExecutionResult(final_result, {"tier": tier, "count": len(guards)})
    
    def _check_similarity_bounds(
        self,
        max_similarity: float,
        context: Ctx
    ) -> Optional[Either]:
        """
        Check similarity bounds for early exit optimization
        
        Returns:
            - Left (violation) if similarity > upper_bound (block immediately)
            - Right (context) if similarity < lower_bound (skip expensive guards)
            - None if within bounds (continue normal execution)
        """
        # Fast path: Very low similarity - safe prompt, skip expensive guards
        if max_similarity < self.similarity_lower_bound:
            logger.info(
                f"⚡ Fast path: similarity {max_similarity:.3f} < lower bound {self.similarity_lower_bound:.3f} "
                f"- skipping all expensive guards"
            )
            return Right_(context)
        
        # Block path: Very high similarity - high confidence violation
        if max_similarity > self.similarity_upper_bound:
            logger.info(
                f"⚡ Block path: similarity {max_similarity:.3f} > upper bound {self.similarity_upper_bound:.3f} "
                f"- blocking without ONNX verification"
            )
            return Left_([{
                "rule_id": "similarity.high_confidence_violation",
                "message": f"High confidence violation detected (similarity: {max_similarity:.2%})",
                "severity": "critical",
                "score": max_similarity,
                "tier": "T0",
                "phase": "input",
                "evidence": {
                    "max_similarity": max_similarity,
                    "upper_bound": self.similarity_upper_bound,
                    "optimization": "similarity_bounds"
                }
            }])
        
        # Within bounds - continue normal execution
        return None
    
    def _should_run_t1(self, max_similarity: Optional[float]) -> bool:
        """
        Check if T1 guards should run based on similarity bounds
        
        Skip T1 if similarity is out of bounds (too low or too high)
        """
        if max_similarity is None:
            return True  # No similarity info, run T1
        
        # Skip if below lower bound (fast path) or above upper bound (already blocked)
        return self.similarity_lower_bound <= max_similarity <= self.similarity_upper_bound
    
    def _should_run_t2(self, max_similarity: Optional[float]) -> bool:
        """
        Check if T2 guards (ONNX) should run based on similarity bounds
        
        Skip T2 if similarity is out of bounds (too low or too high)
        """
        if max_similarity is None:
            return True  # No similarity info, run T2
        
        # Skip if below lower bound (fast path) or above upper bound (already blocked)
        return self.similarity_lower_bound <= max_similarity <= self.similarity_upper_bound
    
    def _calculate_optimal_batch_size(self, total_guards: int) -> int:
        """
        Calculate optimal batch size based on guard count and available CPU cores
        
        Args:
            total_guards: Total number of guards to execute
            
        Returns:
            Optimal batch size
        """
        cpu_cores = os.cpu_count() or 4
        # Use sqrt(n) * cores as heuristic for optimal batching
        optimal = int(math.sqrt(total_guards) * cpu_cores)
        # Clamp between 5 and 20 for reasonable concurrency
        return max(5, min(optimal, 20))
