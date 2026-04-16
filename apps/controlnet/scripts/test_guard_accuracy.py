#!/usr/bin/env python3
"""
Guard Accuracy Testing Script

This script tests guardrail accuracy by comparing expected vs actual blocking behavior.
It reads a CSV file with prompts and risk categories, then tests both regex guards and
ONNX models, and calculates accuracy metrics.

CSV Format Required:
    prompt, risk_category, severity

Where:
    - prompt: The text to test
    - risk_category: One of "toxicity", "jailbreak", or "pii"
    - severity: Severity value (stored but not used for determining expected blocking)
    
Note: All prompts with risk categories are expected to be blocked.

The script tests:
    1. Regex guards (T0) - pattern-based detection
    2. ONNX models (T2) - ML-based detection via remote service
    3. Combined blocking (blocked if either regex OR ONNX detects violation)

Usage:
    python scripts/test_guard_accuracy.py [--csv path/to/test_data.csv] [--output results.csv] [--onnx-threshold 0.5]
"""

import asyncio
import csv
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@dataclass
class TestCase:
    """A single test case from the CSV file."""

    prompt: str
    risk_category: str
    severity: str
    expected_blocked: bool  # Always True (all prompts with risk categories should be blocked)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for CSV export."""
        return asdict(self)


@dataclass
class TestResult:
    """Result from testing a single prompt."""

    prompt: str
    risk_category: str
    severity: str
    guard_id: str
    expected_blocked: bool
    actual_blocked: bool
    correct: bool
    execution_time_ms: float
    violation_message: Optional[str] = None
    violation_severity: Optional[str] = None
    violation_score: Optional[float] = None
    error: Optional[str] = None
    # ONNX-specific fields
    onnx_blocked: Optional[bool] = None
    onnx_confidence: Optional[float] = None
    onnx_model_id: Optional[str] = None
    onnx_error: Optional[str] = None
    blocked_by: Optional[str] = None  # "regex", "onnx", "both", or None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for CSV export."""
        return asdict(self)


@dataclass
class AccuracyMetrics:
    """Accuracy metrics for a guard or overall."""

    total: int
    true_positives: int
    true_negatives: int
    false_positives: int
    false_negatives: int
    accuracy: float
    precision: float
    recall: float
    f1_score: float

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return asdict(self)


class GuardAccuracyTester:
    """Test guardrail accuracy against labeled test data."""

    # Map risk categories to guard IDs
    RISK_CATEGORY_TO_GUARD: Dict[str, str] = {
        "toxicity": "toxicity.detect",
        "jailbreak": "jailbreak.detect",
        "pii": "pii.detect",
    }

    # Default guard parameters
    GUARD_PARAMS: Dict[str, Dict[str, Any]] = {
        "toxicity.detect": {
            "categories": ["toxic", "insult", "threat"],
            "threshold": 0.7,
            "severity": "high",
        },
        "jailbreak.detect": {
            "threshold": 0.6,
            "severity": "critical",
        },
        "pii.detect": {
            "types": ["EMAIL", "PHONE", "SSN", "CREDIT_CARD"],
            "anonymize_mode": "mask",
            "threshold": 1.0,
            "severity": "high",
        },
    }
    
    # ONNX detection threshold (default 0.5)
    ONNX_THRESHOLD: float = 0.5

    def __init__(self, csv_file: str) -> None:
        """
        Initialize the accuracy tester.

        Args:
            csv_file: Path to CSV file with test cases
        """
        self.csv_file = Path(csv_file)
        self.test_cases: List[TestCase] = []
        self.results: List[TestResult] = []
        self.guard_registry: Dict[str, Any] = {}
        self._load_test_cases()
        self._import_guards()

    def _load_test_cases(self) -> None:
        """Load test cases from CSV file."""
        if not self.csv_file.exists():
            raise FileNotFoundError(f"CSV file not found: {self.csv_file}")

        logger.info(f"Loading test cases from {self.csv_file}")

        with open(self.csv_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            
            # Validate required columns
            required_columns = {"prompt", "risk_category", "severity"}
            if not required_columns.issubset(reader.fieldnames or []):
                missing = required_columns - (set(reader.fieldnames or []))
                raise ValueError(f"Missing required columns: {missing}")

            for idx, row in enumerate(reader, start=1):
                prompt = row.get("prompt", "").strip()
                risk_category = row.get("risk_category", "").strip().lower()
                severity = row.get("severity", "").strip().lower()

                if not prompt:
                    logger.warning(f"Row {idx}: Empty prompt, skipping")
                    continue

                if risk_category not in self.RISK_CATEGORY_TO_GUARD:
                    logger.warning(
                        f"Row {idx}: Unknown risk_category '{risk_category}', skipping. "
                        f"Expected one of: {list(self.RISK_CATEGORY_TO_GUARD.keys())}"
                    )
                    continue

                # All prompts with risk categories should be expected to be blocked
                # (severity field is not used for determining expected blocking)
                expected_blocked = True

                test_case = TestCase(
                    prompt=prompt,
                    risk_category=risk_category,
                    severity=severity,
                    expected_blocked=expected_blocked,
                )
                self.test_cases.append(test_case)

        logger.info(f"Loaded {len(self.test_cases)} test cases")

    def _import_guards(self) -> None:
        """Import guard factories from the registry."""
        logger.info("Importing guard factories...")

        try:
            # Auto-detect ONNX service URL before importing ONNX client
            # When running locally (outside Docker), use localhost
            # When running inside Docker, use service name
            import os
            if not os.getenv("ONNX_SERVICE_URL"):
                # Default to localhost for local development (Docker port mapping)
                # User can override with ONNX_SERVICE_URL env var if needed
                os.environ["ONNX_SERVICE_URL"] = "http://localhost:8002"
                logger.info("Using ONNX service URL: http://localhost:8002 (set ONNX_SERVICE_URL env var to override)")

            # Import guard pack modules to register guards
            import guard_packs.default_guardrails

            # Import registry after guards are registered
            from cga_core import registry

            self.guard_registry = registry.get_registry()
            logger.info(f"Found {len(self.guard_registry)} registered guards")

        except Exception as e:
            logger.error(f"Failed to import guards: {e}", exc_info=True)
            raise

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
                "messages": [{"role": "user", "content": prompt_text}],
                "output": prompt_text,
                "phase": "input",
                "content": prompt_text,
            }

            # Instantiate guard with parameters
            try:
                guard = guard_factory(**factory_params)
            except TypeError:
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

    async def _run_onnx_detection(
        self,
        risk_category: str,
        prompt_text: str,
    ) -> Tuple[bool, Optional[float], Optional[str], Optional[str]]:
        """
        Run ONNX model inference for a risk category.

        Args:
            risk_category: Risk category (e.g., "toxicity", "jailbreak", "pii")
            prompt_text: Prompt text to test

        Returns:
            Tuple of (blocked, confidence, model_id, error)
        """
        try:
            from cga_core.onnx_client import run_batch_remote_inference

            # Run ONNX inference
            onnx_results = await run_batch_remote_inference(
                prompt=prompt_text,
                risk_categories=[risk_category]
            )

            # Check if we got results for this category
            if risk_category not in onnx_results:
                return False, None, None, f"No ONNX model for {risk_category}"

            result = onnx_results[risk_category]

            # Check if inference was successful
            if result.get("status") != "success":
                return False, None, None, result.get("note", "ONNX inference failed")

            # Get max confidence from predictions
            predictions = result.get("predictions", [])
            if not predictions:
                return False, None, None, "No predictions returned"

            max_confidence = result.get("max_confidence", 0.0)

            # Check if confidence exceeds threshold
            blocked = max_confidence >= self.ONNX_THRESHOLD
            model_id = result.get("model_id")

            return blocked, max_confidence, model_id, None

        except Exception as e:
            logger.debug(f"Error running ONNX for {risk_category}: {e}")
            return False, None, None, str(e)

    async def test_all_cases(self) -> None:
        """Test all test cases against their corresponding guards and ONNX models."""
        logger.info(f"Testing {len(self.test_cases)} test cases (Regex + ONNX)...")

        import time

        for idx, test_case in enumerate(self.test_cases, 1):
            guard_id = self.RISK_CATEGORY_TO_GUARD[test_case.risk_category]
            factory_params = self.GUARD_PARAMS.get(guard_id, {})

            logger.info(
                f"[{idx}/{len(self.test_cases)}] Testing {test_case.risk_category} "
                f"(severity: {test_case.severity}) - "
                f"'{test_case.prompt[:50]}{'...' if len(test_case.prompt) > 50 else ''}'"
            )

            start_time = time.time()

            try:
                # Run regex guard
                regex_violated, message, severity, score = await asyncio.wait_for(
                    self._run_guard(guard_id, test_case.prompt, factory_params),
                    timeout=5.0,
                )

                # Run ONNX detection
                onnx_blocked, onnx_confidence, onnx_model_id, onnx_error = await asyncio.wait_for(
                    self._run_onnx_detection(test_case.risk_category, test_case.prompt),
                    timeout=10.0,  # ONNX may take longer
                )

                execution_time_ms = (time.time() - start_time) * 1000

                # Determine if blocked (by regex, ONNX, or both)
                actual_blocked = regex_violated or onnx_blocked
                
                # Determine which method blocked
                if regex_violated and onnx_blocked:
                    blocked_by = "both"
                elif regex_violated:
                    blocked_by = "regex"
                elif onnx_blocked:
                    blocked_by = "onnx"
                else:
                    blocked_by = None

                # Compare expected vs actual
                correct = (actual_blocked == test_case.expected_blocked)

                result = TestResult(
                    prompt=test_case.prompt,
                    risk_category=test_case.risk_category,
                    severity=test_case.severity,
                    guard_id=guard_id,
                    expected_blocked=test_case.expected_blocked,
                    actual_blocked=actual_blocked,
                    correct=correct,
                    execution_time_ms=execution_time_ms,
                    violation_message=message,
                    violation_severity=severity,
                    violation_score=score,
                    error=None,
                    onnx_blocked=onnx_blocked,
                    onnx_confidence=onnx_confidence,
                    onnx_model_id=onnx_model_id,
                    onnx_error=onnx_error,
                    blocked_by=blocked_by,
                )
                self.results.append(result)

                status = "[OK]" if correct else "[FAIL]"
                regex_status = "BLOCKED" if regex_violated else "ALLOWED"
                if onnx_blocked and onnx_confidence is not None:
                    onnx_status = f"BLOCKED ({onnx_confidence:.2%})"
                elif onnx_blocked:
                    onnx_status = "BLOCKED"
                else:
                    onnx_status = "ALLOWED"
                logger.info(
                    f"  {status} Expected: {'BLOCKED' if test_case.expected_blocked else 'ALLOWED'}, "
                    f"Actual: {'BLOCKED' if actual_blocked else 'ALLOWED'} "
                    f"(Regex: {regex_status}, ONNX: {onnx_status}) "
                    f"({execution_time_ms:.2f}ms)"
                )

            except asyncio.TimeoutError:
                logger.warning(f"  [TIMEOUT] Timeout after 10 seconds")
                self.results.append(
                    TestResult(
                        prompt=test_case.prompt,
                        risk_category=test_case.risk_category,
                        severity=test_case.severity,
                        guard_id=guard_id,
                        expected_blocked=test_case.expected_blocked,
                        actual_blocked=False,
                        correct=False,
                        execution_time_ms=(time.time() - start_time) * 1000,
                        error="Timeout after 10 seconds",
                    )
                )
            except Exception as e:
                logger.error(f"  [ERROR] {e}")
                self.results.append(
                    TestResult(
                        prompt=test_case.prompt,
                        risk_category=test_case.risk_category,
                        severity=test_case.severity,
                        guard_id=guard_id,
                        expected_blocked=test_case.expected_blocked,
                        actual_blocked=False,
                        correct=False,
                        execution_time_ms=(time.time() - start_time) * 1000,
                        error=str(e),
                    )
                )

    def calculate_metrics(self, results: Optional[List[TestResult]] = None) -> Dict[str, AccuracyMetrics]:
        """
        Calculate accuracy metrics.

        Args:
            results: Optional list of results to calculate metrics for.
                    If None, uses self.results.

        Returns:
            Dictionary mapping guard_id to AccuracyMetrics, plus "overall" key
        """
        if results is None:
            results = self.results

        if not results:
            return {}

        # Calculate overall metrics
        overall_metrics = self._calculate_metrics_for_results(results, "overall")

        # Calculate per-guard metrics
        guard_metrics: Dict[str, AccuracyMetrics] = {"overall": overall_metrics}

        for guard_id in self.RISK_CATEGORY_TO_GUARD.values():
            guard_results = [r for r in results if r.guard_id == guard_id]
            if guard_results:
                guard_metrics[guard_id] = self._calculate_metrics_for_results(
                    guard_results, guard_id
                )

        return guard_metrics

    def _calculate_metrics_for_results(
        self, results: List[TestResult], label: str
    ) -> AccuracyMetrics:
        """
        Calculate metrics for a specific set of results.

        Args:
            results: List of test results
            label: Label for these results (unused, kept for API consistency)

        Returns:
            AccuracyMetrics object
        """
        tp = sum(1 for r in results if r.expected_blocked and r.actual_blocked)
        tn = sum(1 for r in results if not r.expected_blocked and not r.actual_blocked)
        fp = sum(1 for r in results if not r.expected_blocked and r.actual_blocked)
        fn = sum(1 for r in results if r.expected_blocked and not r.actual_blocked)

        total = len(results)
        accuracy = (tp + tn) / total if total > 0 else 0.0
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1_score = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

        return AccuracyMetrics(
            total=total,
            true_positives=tp,
            true_negatives=tn,
            false_positives=fp,
            false_negatives=fn,
            accuracy=accuracy,
            precision=precision,
            recall=recall,
            f1_score=f1_score,
        )

    def print_accuracy_report(self) -> None:
        """Print detailed accuracy report to console."""
        metrics = self.calculate_metrics()

        print("\n" + "=" * 80)
        print("GUARDRAIL ACCURACY REPORT")
        print("=" * 80)

        # Overall metrics
        overall = metrics.get("overall")
        if overall:
            print(f"\n[OVERALL METRICS]")
            print(f"  Total Tests: {overall.total}")
            print(f"  Accuracy: {overall.accuracy:.2%}")
            print(f"  Precision: {overall.precision:.2%}")
            print(f"  Recall: {overall.recall:.2%}")
            print(f"  F1 Score: {overall.f1_score:.2%}")
            print(f"\n  Confusion Matrix:")
            print(f"    True Positives (TP):  {overall.true_positives}")
            print(f"    True Negatives (TN):  {overall.true_negatives}")
            print(f"    False Positives (FP): {overall.false_positives}")
            print(f"    False Negatives (FN): {overall.false_negatives}")

        # Per-guard metrics
        print(f"\n\n[PER-GUARD METRICS]")
        print(f"{'Guard ID':<25} {'Accuracy':<12} {'Precision':<12} {'Recall':<12} {'F1 Score':<12} {'Tests':<8}")
        print("-" * 80)

        for guard_id in sorted(self.RISK_CATEGORY_TO_GUARD.values()):
            if guard_id in metrics:
                m = metrics[guard_id]
                print(
                    f"{guard_id:<25} {m.accuracy:<12.2%} {m.precision:<12.2%} "
                    f"{m.recall:<12.2%} {m.f1_score:<12.2%} {m.total:<8}"
                )

        # Show ONNX vs Regex comparison
        print(f"\n\n[ONNX vs REGEX COMPARISON]")
        print("-" * 80)
        regex_only = sum(1 for r in self.results if r.blocked_by == "regex")
        onnx_only = sum(1 for r in self.results if r.blocked_by == "onnx")
        both = sum(1 for r in self.results if r.blocked_by == "both")
        neither = sum(1 for r in self.results if r.blocked_by is None)
        print(f"  Blocked by Regex only: {regex_only}")
        print(f"  Blocked by ONNX only: {onnx_only}")
        print(f"  Blocked by both: {both}")
        print(f"  Not blocked: {neither}")

        # Show incorrect predictions
        incorrect = [r for r in self.results if not r.correct]
        if incorrect:
            print(f"\n\n[INCORRECT PREDICTIONS] ({len(incorrect)}/{len(self.results)})")
            print("-" * 80)
            for r in incorrect[:20]:  # Show first 20
                expected = "BLOCKED" if r.expected_blocked else "ALLOWED"
                actual = "BLOCKED" if r.actual_blocked else "ALLOWED"
                blocked_by_str = f" (by {r.blocked_by})" if r.blocked_by else ""
                print(f"  [{r.risk_category}] Expected: {expected}, Actual: {actual}{blocked_by_str}")
                print(f"    Prompt: {r.prompt[:80]}{'...' if len(r.prompt) > 80 else ''}")
                if r.onnx_confidence is not None:
                    print(f"    ONNX Confidence: {r.onnx_confidence:.2%}")
                if r.error:
                    print(f"    Error: {r.error}")
                if r.onnx_error:
                    print(f"    ONNX Error: {r.onnx_error}")
                print()

            if len(incorrect) > 20:
                print(f"  ... and {len(incorrect) - 20} more")

        print("\n" + "=" * 80)

    def save_results_csv(self, output_path: str) -> None:
        """
        Save detailed results to CSV file.

        Args:
            output_path: Path to save CSV file
        """
        logger.info(f"Saving results to {output_path}")

        with open(output_path, 'w', newline='', encoding='utf-8') as f:
            fieldnames = [
                "prompt",
                "risk_category",
                "severity",
                "guard_id",
                "expected_blocked",
                "actual_blocked",
                "correct",
                "execution_time_ms",
                "violation_message",
                "violation_severity",
                "violation_score",
                "error",
                "onnx_blocked",
                "onnx_confidence",
                "onnx_model_id",
                "onnx_error",
                "blocked_by",
            ]

            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()

            for result in self.results:
                writer.writerow(result.to_dict())

        logger.info(f"Results saved to {output_path}")


async def main() -> int:
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Test guardrail accuracy")
    parser.add_argument(
        "--csv",
        type=str,
        default="test_prompts.csv",
        help="Path to CSV file with test cases (default: test_prompts.csv)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="accuracy_results.csv",
        help="Path to save results CSV (default: accuracy_results.csv)",
    )
    parser.add_argument(
        "--onnx-threshold",
        type=float,
        default=0.5,
        help="ONNX detection threshold (default: 0.5)",
    )

    args = parser.parse_args()

    try:
        # Create tester
        tester = GuardAccuracyTester(args.csv)
        tester.ONNX_THRESHOLD = args.onnx_threshold

        # Run tests
        await tester.test_all_cases()

        # Print report
        tester.print_accuracy_report()

        # Save results
        tester.save_results_csv(args.output)

        # Calculate final metrics
        metrics = tester.calculate_metrics()
        overall = metrics.get("overall")

        if overall:
            logger.info(f"\n[SUCCESS] Testing complete! Overall accuracy: {overall.accuracy:.2%}")
            return 0 if overall.accuracy >= 0.8 else 1  # Exit code 1 if accuracy < 80%
        else:
            logger.error("No results to analyze")
            return 1

    except FileNotFoundError as e:
        logger.error(f"File not found: {e}")
        logger.info("\nCSV file format should be:")
        logger.info("  prompt, risk_category, severity")
        logger.info("\nExample:")
        logger.info('  "My email is test@example.com", pii, high')
        logger.info('  "This is a clean message", toxicity, low')
        return 1
    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)

