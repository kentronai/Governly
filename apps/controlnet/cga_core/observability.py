"""
Observability for fail-open cases
Tracks when guards timeout or fail to execute

Integrates with existing observability_logs table in PostgreSQL.
Fail-open events are stored in metadata field for long-term tracking.
"""

import logging
import time
from typing import Dict, Any, Optional
from dataclasses import dataclass, asdict
import asyncio

logger = logging.getLogger(__name__)


@dataclass
class GuardFailureMetric:
    """Metric for guard execution failure"""
    timestamp: float
    guard_phase: str  # input, output, tool_args, tool_result
    failure_type: str  # timeout, exception
    timeout_ms: float
    error_message: str
    tenant_id: Optional[str] = None
    policy_id: Optional[str] = None
    request_id: Optional[str] = None


class FailOpenObserver:
    """
    Observer for fail-open events in the gateway
    
    Tracks when guards fail to execute and requests are allowed through.
    Stores data in both:
    1. In-memory cache (last hour, for quick stats)
    2. PostgreSQL observability_logs table (long-term storage)
    
    This is critical for monitoring gateway health and identifying issues.
    """
    
    def __init__(self):
        self._failures: list[GuardFailureMetric] = []
        self._failure_counts: Dict[str, int] = {}
        self._db_write_queue: list[GuardFailureMetric] = []
        self._max_memory_age = 3600.0  # Keep 1 hour in memory
    
    def record_timeout(
        self,
        phase: str,
        timeout_ms: float,
        tenant_id: Optional[str] = None,
        policy_id: Optional[str] = None,
        request_id: Optional[str] = None
    ):
        """Record a guard timeout event"""
        metric = GuardFailureMetric(
            timestamp=time.time(),
            guard_phase=phase,
            failure_type="timeout",
            timeout_ms=timeout_ms,
            error_message=f"Guard execution timed out after {timeout_ms}ms",
            tenant_id=tenant_id,
            policy_id=policy_id,
            request_id=request_id
        )
        
        # Store in memory for quick stats
        self._failures.append(metric)
        self._increment_failure_count(phase, "timeout")
        
        # Queue for database write (async, non-blocking)
        self._db_write_queue.append(metric)
        
        logger.warning(
            f"⏰ FAIL-OPEN: {phase} guard timed out "
            f"(tenant={tenant_id}, policy={policy_id}, request={request_id})"
        )
        
        # Auto-cleanup old entries
        self._cleanup_old_entries()
    
    def record_exception(
        self,
        phase: str,
        error: Exception,
        tenant_id: Optional[str] = None,
        policy_id: Optional[str] = None,
        request_id: Optional[str] = None
    ):
        """Record a guard execution exception"""
        metric = GuardFailureMetric(
            timestamp=time.time(),
            guard_phase=phase,
            failure_type="exception",
            timeout_ms=0.0,
            error_message=str(error),
            tenant_id=tenant_id,
            policy_id=policy_id,
            request_id=request_id
        )
        
        # Store in memory for quick stats
        self._failures.append(metric)
        self._increment_failure_count(phase, "exception")
        
        # Queue for database write (async, non-blocking)
        self._db_write_queue.append(metric)
        
        logger.error(
            f"💥 FAIL-OPEN: {phase} guard crashed "
            f"(tenant={tenant_id}, policy={policy_id}, request={request_id}): {error}"
        )
        
        # Auto-cleanup old entries
        self._cleanup_old_entries()
    
    def _increment_failure_count(self, phase: str, failure_type: str):
        """Increment failure counter for metrics"""
        key = f"{phase}.{failure_type}"
        self._failure_counts[key] = self._failure_counts.get(key, 0) + 1
    
    def _cleanup_old_entries(self):
        """Remove entries older than max_memory_age"""
        cutoff = time.time() - self._max_memory_age
        self._failures = [f for f in self._failures if f.timestamp >= cutoff]
    
    async def flush_to_database(self):
        """
        Flush queued failures to database (observability_logs table)
        
        This is called periodically or manually to persist fail-open events.
        Non-blocking - failures during write are logged but don't block.
        """
        if not self._db_write_queue:
            return
        
        try:
            from gateway.db import get_db
            from gateway.services.observability_service import log_request
            
            # Process queue
            queue_copy = self._db_write_queue.copy()
            self._db_write_queue.clear()
            
            async for db_session in get_db():
                for metric in queue_copy:
                    try:
                        # Log fail-open event to observability_logs
                        await log_request(
                            db_session=db_session,
                            tenant_id=metric.tenant_id or "system",
                            request_id=metric.request_id or f"fail_open_{int(metric.timestamp)}",
                            method="FAIL_OPEN",
                            path=f"/internal/fail-open/{metric.guard_phase}",
                            status_code=200,  # Request was allowed through
                            latency_ms=int(metric.timeout_ms),
                            request_payload={"phase": metric.guard_phase},
                            response_payload={"allowed": True, "fail_open": True},
                            guardrail_results={
                                "fail_open": True,
                                "phase": metric.guard_phase,
                                "failure_type": metric.failure_type,
                                "error_message": metric.error_message
                            },
                            policy_id=metric.policy_id,
                            metadata={
                                "fail_open_event": True,
                                "guard_phase": metric.guard_phase,
                                "failure_type": metric.failure_type,
                                "timeout_ms": metric.timeout_ms,
                                "timestamp": metric.timestamp
                            }
                        )
                    except Exception as e:
                        logger.error(f"Failed to persist fail-open event to database: {e}")
                
                break  # Only need first iteration
                
        except Exception as e:
            logger.error(f"Failed to flush fail-open events to database: {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get failure statistics (in-memory, last hour)"""
        return {
            "total_failures": len(self._failures),
            "failure_counts": self._failure_counts,
            "recent_failures": [
                asdict(f) for f in self._failures[-10:]  # Last 10 failures
            ],
            "queued_for_db": len(self._db_write_queue),
            "memory_window_seconds": self._max_memory_age
        }
    
    def get_failure_rate(self, phase: str, time_window_seconds: float = 60.0) -> float:
        """
        Get failure rate for a phase within time window
        
        Args:
            phase: Guard phase (input, output, etc.)
            time_window_seconds: Time window in seconds
            
        Returns:
            Failure rate (failures per second)
        """
        now = time.time()
        cutoff = now - time_window_seconds
        
        recent_failures = [
            f for f in self._failures
            if f.guard_phase == phase and f.timestamp >= cutoff
        ]
        
        if not recent_failures:
            return 0.0
        
        return len(recent_failures) / time_window_seconds


# Global observer instance
_observer = FailOpenObserver()


def get_fail_open_observer() -> FailOpenObserver:
    """Get the global fail-open observer"""
    return _observer


def record_guard_timeout(
    phase: str,
    timeout_ms: float,
    tenant_id: Optional[str] = None,
    policy_id: Optional[str] = None,
    request_id: Optional[str] = None
):
    """
    Record a guard timeout (convenience function)
    
    Call this from guard execution code when a timeout occurs.
    Events are queued for database persistence.
    """
    _observer.record_timeout(phase, timeout_ms, tenant_id, policy_id, request_id)


def record_guard_exception(
    phase: str,
    error: Exception,
    tenant_id: Optional[str] = None,
    policy_id: Optional[str] = None,
    request_id: Optional[str] = None
):
    """
    Record a guard exception (convenience function)
    
    Call this from guard execution code when an exception occurs.
    Events are queued for database persistence.
    """
    _observer.record_exception(phase, error, tenant_id, policy_id, request_id)


def get_fail_open_stats() -> Dict[str, Any]:
    """Get fail-open statistics (convenience function)"""
    return _observer.get_stats()


async def flush_fail_open_events():
    """
    Flush fail-open events to database (convenience function)
    
    Call this periodically (e.g., every 60 seconds) or on shutdown.
    """
    await _observer.flush_to_database()

