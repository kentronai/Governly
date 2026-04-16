"""
Comprehensive Guard Packs Testing and Benchmarking Framework

This script tests all available guard packs against prompts from a CSV file
and generates detailed benchmarking results.

Features:
- Tests each guard against each prompt
- Measures execution time for performance benchmarking
- Handles both pattern-based (T0/T1) and ONNX-based (T2) guards
- Generates detailed CSV results with violations and timing
- Provides console summary statistics
"""

# Fix Python path to allow imports from apps.controlnet
import sys
from pathlib import Path

project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(project_root / "apps" / "controlnet"))

import asyncio
import csv
import json
import logging
import time
from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional, Tuple

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@dataclass
class GuardTestResult:
    """Results from testing a single guard against a prompt."""

    prompt_index: int
    prompt_text: str
    guard_id: str
    guard_tier: str
    execution_time_ms: float
    violated: bool
    violation_message: Optional[str] = None
    violation_severity: Optional[str] = None
    violation_score: Optional[float] = None
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert result to dictionary for CSV export."""
        return asdict(self)


class GuardPackTester:
    """Comprehensive guard pack testing framework."""

    # Define which guards to test and their parameters
    GUARDS_TO_TEST: Dict[str, Dict[str, Any]] = {
        # Default Guardrails (Core Production Guards)
        "profanity.detect": {"categories": ["profanity"], "threshold": 0.7, "severity": "med"},
        "jailbreak.detect": {"threshold": 0.8, "severity": "high"},
        "toxicity.detect": {"categories": ["toxic", "insult", "threat"], "threshold": 0.7, "severity": "high"},
        "pii.detect": {"types": ["EMAIL", "PHONE", "SSN", "CREDIT_CARD"], "anonymize_mode": "mask", "threshold": 1.0, "severity": "high"},
        
        # Formatting Guards
        "formatting.json": {},
        "formatting.xml": {},
        "formatting.csv": {},
        "formatting.url": {},
        "formatting.email": {},
        "formatting.phone": {},
        "formatting.date": {},
        "formatting.credit_card": {},
        
        # Validation Guards
        "validation.contains_string": {"required_strings": ["test"], "case_sensitive": False},
        "validation.matches_pattern": {"pattern": ".*", "error_message": "Pattern not matched"},
        "validation.length_check": {"min_length": 1, "max_length": 1000},
        "validation.forbidden_patterns": {"patterns": ["forbidden"]},
    }

    def __init__(self, prompts_file: str = "prompts.csv"):
        """Initialize the tester."""
        self.prompts_file = prompts_file
        self.prompts: List[str] = []
        self.results: List[GuardTestResult] = []
        self.guard_registry: Dict[str, Any] = {}
        self.guards_to_test: List[str] = []
        self._load_prompts()

    def _load_prompts(self) -> None:
        """Load prompts from CSV file."""
        prompts_path = Path(self.prompts_file)
        
        if not prompts_path.exists():
            logger.error(f"Prompts CSV not found: {prompts_path}")
            raise FileNotFoundError(f"Missing {prompts_path}")

        with open(prompts_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Try different column names
                prompt_text = (
                    row.get("prompt")
                    or row.get("text")
                    or row.get("content")
                    or row.get("input")
                )
                if prompt_text:
                    self.prompts.append(prompt_text)

        logger.info(f"Loaded {len(self.prompts)} prompts from {prompts_path}")

    def _import_guards(self) -> None:
        """Dynamically import guard factories from the registry."""
        logger.info("Importing guard factories...")

        try:
            # First, import all guard_packs modules to register guards via @guard decorators
            logger.info("Loading guard pack modules...")
            import guard_packs.default_guardrails
            import guard_packs.formatting
            import guard_packs.validation
            
            logger.info("All guard pack modules loaded")
            
            # Now import registry AFTER guards are registered
            from cga_core import registry
            logger.info("Registry module imported")
            
            # Get all registered guards from the registry
            all_registered_guards = registry.get_registry()
            
            logger.info(f"Found {len(all_registered_guards)} registered guards in registry")
            if all_registered_guards:
                logger.info("Registered guards:")
                for guard_id, guard_metadata in sorted(all_registered_guards.items()):
                    logger.info(f"  ✓ {guard_id} (Tier: {guard_metadata.tier})")
            
            # Store the registry for later use
            self.guard_registry = all_registered_guards
            
            # Build a list of all guards to test
            self.guards_to_test = list(all_registered_guards.keys())
            
            logger.info(f"Will test {len(self.guards_to_test)} guards")

        except Exception as e:
            logger.error(f"Failed to import guard packs: {e}", exc_info=True)
            logger.error("Falling back to empty guard list")
            self.guard_registry = {}
            self.guards_to_test = []

    async def _run_guard(
        self,
        guard_id: str,
        prompt_text: str,
        factory_params: Dict[str, Any],
    ) -> Tuple[bool, Optional[str], Optional[str], Optional[float]]:
        """
        Run a single guard against a prompt.

        Args:
            guard_id: ID of the guard to run
            prompt_text: Prompt text to test
            factory_params: Parameters for guard factory

        Returns:
            Tuple of (violated, message, severity, score)
        """
        try:
            from cga_core.types import is_left, get_violations

            # Check if guard is in registry
            if guard_id not in self.guard_registry:
                logger.debug(f"Guard not in registry: {guard_id}")
                return False, None, None, None

            guard_metadata = self.guard_registry[guard_id]
            guard_factory = guard_metadata.factory

            # Create context
            ctx = {
                "output": prompt_text,
                "phase": "input",
                "content": prompt_text,
            }

            # Instantiate guard with parameters
            try:
                # Try with params first
                guard = guard_factory(**factory_params)
            except TypeError as e:
                # If params don't work, try without them
                try:
                    guard = guard_factory()
                except Exception as e2:
                    logger.debug(f"Could not instantiate {guard_id}: {e2}")
                    return False, None, None, None

            # Run guard asynchronously
            result = await guard(ctx)

            # Check result
            if is_left(result):
                violations = get_violations(result)
                if violations:
                    first_violation = violations[0]
                    return (
                        True,
                        first_violation.get("message", "Violation detected"),
                        first_violation.get("severity"),
                        first_violation.get("score"),
                    )

            return False, None, None, None

        except Exception as e:
            logger.debug(f"Error running guard {guard_id}: {e}")
            return False, str(e), None, None

    async def _test_single_prompt(self, prompt_index: int, prompt_text: str) -> None:
        """
        Test a single prompt against all guards.

        Args:
            prompt_index: Index of the prompt
            prompt_text: The prompt text to test
        """
        display_prompt = prompt_text[:50] + "..." if len(prompt_text) > 50 else prompt_text
        logger.info(f"Testing prompt {prompt_index + 1}/{len(self.prompts)}: {display_prompt}")

        for guard_id in self.guards_to_test:
            start_time = time.time()

            try:
                # Get factory params for this guard
                factory_params = self.GUARDS_TO_TEST.get(guard_id, {})
                
                # Run guard with timeout
                violated, message, severity, score = await asyncio.wait_for(
                    self._run_guard(guard_id, prompt_text, factory_params),
                    timeout=5.0,  # 5 second timeout per guard
                )
                execution_time_ms = (time.time() - start_time) * 1000

                # Get guard tier from registry
                guard_meta = self.guard_registry.get(guard_id)
                tier = guard_meta.tier if guard_meta else "unknown"

                # Record result
                result = GuardTestResult(
                    prompt_index=prompt_index,
                    prompt_text=prompt_text,
                    guard_id=guard_id,
                    guard_tier=tier,
                    execution_time_ms=execution_time_ms,
                    violated=violated,
                    violation_message=message,
                    violation_severity=severity,
                    violation_score=score,
                    error=None,
                )
                self.results.append(result)

            except asyncio.TimeoutError:
                logger.warning(f"  {guard_id}: TIMEOUT (>5s)")
                self.results.append(
                    GuardTestResult(
                        prompt_index=prompt_index,
                        prompt_text=prompt_text,
                        guard_id=guard_id,
                        guard_tier="unknown",
                        execution_time_ms=(time.time() - start_time) * 1000,
                        violated=False,
                        violation_message=None,
                        violation_severity=None,
                        violation_score=None,
                        error="Timeout after 5 seconds",
                    )
                )
            except Exception as e:
                logger.debug(f"  {guard_id}: ERROR - {str(e)}")
                self.results.append(
                    GuardTestResult(
                        prompt_index=prompt_index,
                        prompt_text=prompt_text,
                        guard_id=guard_id,
                        guard_tier="unknown",
                        execution_time_ms=(time.time() - start_time) * 1000,
                        violated=False,
                        violation_message=None,
                        violation_severity=None,
                        violation_score=None,
                        error=str(e),
                    )
                )

    async def test_all_prompts(self) -> None:
        """Test all prompts against all guards."""
        logger.info(f"Starting test of {len(self.prompts)} prompts against "
                   f"{len(self.guards_to_test)} guards")

        start_time = time.time()

        for idx, prompt in enumerate(self.prompts):
            await self._test_single_prompt(idx, prompt)

        total_time = time.time() - start_time
        logger.info(f"Testing completed in {total_time:.2f}s")

    def generate_benchmark_csv(self, output_path: str = "guard_benchmark_results.csv") -> None:
        """
        Generate CSV file with benchmark results.

        Args:
            output_path: Path to write CSV file
        """
        logger.info(f"Generating benchmark CSV: {output_path}")

        with open(output_path, 'w', newline='', encoding='utf-8') as f:
            fieldnames = [
                "prompt_index",
                "prompt_text",
                "guard_id",
                "guard_tier",
                "execution_time_ms",
                "violated",
                "violation_message",
                "violation_severity",
                "violation_score",
                "error",
            ]

            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()

            for result in self.results:
                writer.writerow(result.to_dict())

        logger.info(f"Benchmark results written to {output_path}")

    def print_summary_statistics(self) -> None:
        """Print summary statistics to console."""
        if not self.results:
            logger.warning("No results to summarize")
            return

        print("\n" + "=" * 80)
        print("GUARD PACKS BENCHMARK SUMMARY")
        print("=" * 80)

        # Overall statistics
        total_tests = len(self.results)
        total_violations = sum(1 for r in self.results if r.violated)
        total_errors = sum(1 for r in self.results if r.error)
        total_time_ms = sum(r.execution_time_ms for r in self.results)

        print(f"\nOverall Statistics:")
        print(f"  Total Tests: {total_tests}")
        print(f"  Violations Detected: {total_violations} ({total_violations/total_tests*100:.1f}%)")
        print(f"  Errors: {total_errors} ({total_errors/total_tests*100:.1f}%)")
        print(f"  Total Execution Time: {total_time_ms:.2f}ms")
        print(f"  Average Time per Test: {total_time_ms/total_tests:.2f}ms")

        # Per-guard statistics
        print(f"\n\nPer-Guard Statistics:")
        print(f"{'Guard ID':<35} {'Tier':<5} {'Tests':<6} {'Violations':<12} {'Avg Time (ms)':<15} {'Errors':<6}")
        print("-" * 85)

        guard_stats: Dict[str, Dict[str, Any]] = {}
        for result in self.results:
            guard_id = result.guard_id
            if guard_id not in guard_stats:
                guard_stats[guard_id] = {
                    "tier": result.guard_tier,
                    "tests": 0,
                    "violations": 0,
                    "total_time": 0.0,
                    "errors": 0,
                }

            guard_stats[guard_id]["tests"] += 1
            if result.violated:
                guard_stats[guard_id]["violations"] += 1
            if result.error:
                guard_stats[guard_id]["errors"] += 1
            guard_stats[guard_id]["total_time"] += result.execution_time_ms

        for guard_id in sorted(guard_stats.keys()):
            stats = guard_stats[guard_id]
            avg_time = stats["total_time"] / stats["tests"] if stats["tests"] > 0 else 0
            print(
                f"{guard_id:<35} {stats['tier']:<5} "
                f"{stats['tests']:<6} {stats['violations']:<12} "
                f"{avg_time:<15.2f} {stats['errors']:<6}"
            )

        # Per-tier statistics
        print(f"\n\nPer-Tier Statistics:")
        print(f"{'Tier':<10} {'Avg Time (ms)':<20} {'Min Time (ms)':<20} {'Max Time (ms)':<20}")
        print("-" * 70)

        tier_stats: Dict[str, List[float]] = {}
        for result in self.results:
            tier = result.guard_tier
            if tier not in tier_stats:
                tier_stats[tier] = []
            tier_stats[tier].append(result.execution_time_ms)

        for tier in sorted(tier_stats.keys()):
            times = tier_stats[tier]
            print(
                f"{tier:<10} {sum(times)/len(times):<20.2f} "
                f"{min(times):<20.2f} {max(times):<20.2f}"
            )

        print("\n" + "=" * 80)


async def main() -> None:
    """Main entry point for the testing framework."""
    # Path to prompts CSV
    prompts_csv = Path(__file__).parent / "prompts.csv"

    if not prompts_csv.exists():
        logger.error(f"Prompts CSV not found at {prompts_csv}")
        logger.info("Please ensure prompts.csv exists in the project root")
        sys.exit(1)

    # Create tester
    tester = GuardPackTester(str(prompts_csv))

    # Import guards
    tester._import_guards()

    # Run tests
    try:
        await tester.test_all_prompts()
    except Exception as e:
        logger.error(f"Testing failed: {e}", exc_info=True)
        sys.exit(1)

    # Generate results
    output_csv = Path(__file__).parent / "guard_benchmark_results.csv"
    tester.generate_benchmark_csv(str(output_csv))

    # Print summary
    tester.print_summary_statistics()

    logger.info("Benchmarking complete!")


if __name__ == "__main__":
    asyncio.run(main())
