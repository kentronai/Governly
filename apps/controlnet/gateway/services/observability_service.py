"""
Observability Service - Track all requests through ControlNet

Comprehensive logging for:
- Policy enforcement tracking
- Guardrail execution metrics
- Violation detection and details
- Request/response auditing
- Performance monitoring
"""

import uuid
import json
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import JSON
import logging

logger = logging.getLogger(__name__)


async def get_application_id_from_policy(
    db_session: AsyncSession,
    policy_id: str,
    tenant_id: str
) -> Optional[str]:
    """
    Fetch application_id from application_policies table by policy_id.
    
    This links policies to applications, enabling us to track which application
    made the request through the observability logs.
    
    Args:
        db_session: Database session
        policy_id: Policy UUID that was applied
        tenant_id: Tenant identifier (for tenant isolation)
        
    Returns:
        Application UUID if found, None otherwise
        
    Example:
        If policy_id='abc123' is linked to app 'xyz789',
        this function returns 'xyz789'
    """
    try:
        query = text("""
            SELECT application_id
            FROM application_policies
            WHERE policy_id = :policy_id
              AND tenant_id = :tenant_id
              AND is_active = true
            LIMIT 1
        """)
        
        result = await db_session.execute(
            query,
            {"policy_id": policy_id, "tenant_id": tenant_id}
        )
        row = result.fetchone()
        
        if row:
            app_id = row[0]
            logger.debug(f"Resolved policy {policy_id} -> application {app_id}")
            return app_id
        
        logger.debug(f"No application found for policy {policy_id}")
        return None
        
    except Exception as e:
        logger.warning(f"Failed to fetch application_id for policy {policy_id}: {e}")
        return None


async def log_request(
    db_session: AsyncSession,
    tenant_id: str,
    request_id: str,
    method: str,
    path: str,
    status_code: int,
    latency_ms: int,
    request_payload: Dict[str, Any],
    response_payload: Optional[Dict[str, Any]],
    guardrail_results: Optional[Dict[str, Any]],
    policy_id: Optional[str] = None,
    application_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Log request to observability_logs table with comprehensive tracking.
    
    Captures all critical data for:
    - Policy enforcement monitoring
    - Guardrail performance metrics
    - Violation tracking and auditing
    - Request/response analysis
    - Security and compliance auditing
    
    Args:
        db_session: Database session (from get_db())
        tenant_id: Tenant identifier (for multi-tenancy)
        request_id: Unique request identifier
        method: HTTP method (GET, POST, etc.)
        path: Request path
        status_code: HTTP status code (200, 400, 500, etc.)
        latency_ms: Total request latency in milliseconds
        request_payload: Request body/parameters (sanitized)
        response_payload: Response body (sanitized)
        guardrail_results: Comprehensive guardrail execution results including:
            - input_guards: List of input guardrails executed
            - output_guards: List of output guardrails executed
            - policy_decision: 'allow' or 'block'
            - total_execution_time_ms: Total guardrail time
            - violated_guard: Details of violation if blocked
        policy_id: Policy UUID that was applied
        application_id: Application UUID (optional - will be auto-fetched from policy if not provided)
        metadata: Additional metadata including:
            - trace_id: For distributed tracing
            - policy_hash: Policy version hash
            - model: AI model used
            - stream: Whether streaming was used
            - blocked: Boolean if request was blocked
            - error: Boolean if error occurred
            - violation_phase: 'input' or 'output' if blocked
    
    Returns:
        Log entry UUID
        
    Raises:
        Exception: If logging fails (caught in caller)
        
    Example guardrail_results:
    {
        "input_guards": [
            {
                "id": "toxicity.block",
                "name": "Toxicity Filter",
                "tier": "T1",
                "status": "passed",
                "description": "Pattern-based toxicity blocking",
                "execution_time_ms": 1.2
            }
        ],
        "output_guards": [...],
        "policy_decision": "allow",  # or "block"
        "total_execution_time_ms": 2.5,
        "violated_guard": {  # Only if blocked
            "rule_id": "toxicity.block",
            "message": "Toxic content detected",
            "severity": "high"
        }
    }
    """
    try:
        log_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc)
        
        # ✅ Auto-fetch application_id from application_policies if not provided
        if not application_id and policy_id:
            application_id = await get_application_id_from_policy(
                db_session=db_session,
                policy_id=policy_id,
                tenant_id=tenant_id
            )
            if application_id:
                logger.info(f"Auto-fetched application_id={application_id} for policy_id={policy_id}")
        
        # Sanitize and convert payloads to JSON strings
        request_json = json.dumps(request_payload) if request_payload else None
        response_json = json.dumps(response_payload) if response_payload else None
        
        # Ensure guardrail_results has all required fields for auditing
        # Create a copy to avoid mutating the original
        if guardrail_results:
            guardrail_results_copy = guardrail_results.copy()
            
            # Check if _summary already exists (e.g., from blocked requests in InputGuardsMiddleware)
            if "_summary" not in guardrail_results_copy:
                # Add summary metrics for quick querying (for successful requests)
                guardrail_results_copy["_summary"] = {
                    "total_guards": len(guardrail_results_copy.get("input_guards", [])) + 
                                   len(guardrail_results_copy.get("output_guards", [])),
                    "input_guards_count": len(guardrail_results_copy.get("input_guards", [])),
                    "output_guards_count": len(guardrail_results_copy.get("output_guards", [])),
                    "decision": guardrail_results_copy.get("policy_decision", "unknown"),
                    "was_blocked": guardrail_results_copy.get("policy_decision") == "block",
                    "total_time_ms": guardrail_results_copy.get("total_execution_time_ms", 0)
                }
                
                # Add violation summary if blocked
                if guardrail_results_copy.get("policy_decision") == "block":
                    violated = guardrail_results_copy.get("violated_guard", {})
                    guardrail_results_copy["_summary"]["violation"] = {
                        "rule_id": violated.get("rule_id", "unknown"),
                        "message": violated.get("message", "No message"),
                        "phase": metadata.get("violation_phase", "unknown") if metadata else "unknown"
                    }
            # else: _summary already exists, preserve it (from InputGuardsMiddleware)
            
            guardrail_json = json.dumps(guardrail_results_copy)
        else:
            guardrail_json = None
        
        # Ensure metadata has critical fields
        metadata_dict = metadata or {}
        metadata_dict["_logged_at"] = datetime.now(timezone.utc).isoformat()
        metadata_dict["_log_version"] = "1.0"  # For schema evolution
        metadata_dict["application_id_source"] = "auto_fetched" if (not application_id and policy_id) else "provided"
        
        metadata_json = json.dumps(metadata_dict)
        
        query = text("""
            INSERT INTO observability_logs (
                id,
                tenant_id,
                application_id,
                agent_id,
                policy_id,
                request_id,
                timestamp,
                method,
                path,
                status_code,
                latency_ms,
                request_payload,
                response_payload,
                guardrail_results,
                metadata
            ) VALUES (
                :id,
                :tenant_id,
                :application_id,
                :agent_id,
                :policy_id,
                :request_id,
                :timestamp,
                :method,
                :path,
                :status_code,
                :latency_ms,
                CAST(:request_payload AS jsonb),
                CAST(:response_payload AS jsonb),
                CAST(:guardrail_results AS jsonb),
                CAST(:metadata AS jsonb)
            )
            ON CONFLICT (request_id) DO UPDATE SET
                application_id = EXCLUDED.application_id,
                agent_id = EXCLUDED.agent_id,
                policy_id = EXCLUDED.policy_id,
                status_code = EXCLUDED.status_code,
                latency_ms = EXCLUDED.latency_ms,
                response_payload = EXCLUDED.response_payload,
                guardrail_results = EXCLUDED.guardrail_results,
                metadata = EXCLUDED.metadata,
                timestamp = EXCLUDED.timestamp
        """)
        
        await db_session.execute(
            query,
            {
                "id": log_id,
                "tenant_id": tenant_id,
                "application_id": application_id,
                "agent_id": agent_id,
                "policy_id": policy_id,
                "request_id": request_id,
                "timestamp": timestamp,
                "method": method,
                "path": path,
                "status_code": status_code,
                "latency_ms": latency_ms,
                "request_payload": request_json,
                "response_payload": response_json,
                "guardrail_results": guardrail_json,
                "metadata": metadata_json,
            }
        )

        # A guardrail block is a durable finding, not just a transient log row.
        # It is safe to upsert by (observation, rule) when streaming retries the
        # same request ID.
        is_blocked = bool(guardrail_results) and (
            guardrail_results.get("policy_decision") == "block"
            or guardrail_results.get("blocked") is True
            or (guardrail_results.get("_summary") or {}).get("was_blocked") is True
        )
        if is_blocked:
            violated = guardrail_results.get("violated_guard") or {}
            finding_key = violated.get("rule_id") or "policy.violation"
            await db_session.execute(text("""
                INSERT INTO policy_findings (
                    tenant_id, agent_id, application_id, observability_log_id,
                    policy_type, policy_id, source, finding_key, category,
                    severity, status, title, description, evidence,
                    first_detected_at, last_detected_at, updated_at
                ) VALUES (
                    :tenant_id, :agent_id, :application_id,
                    (SELECT id FROM observability_logs WHERE request_id = :request_id),
                    'runtime', :policy_id, 'controlnet_runtime', :finding_key,
                    :category, :severity, 'open', :title, :description,
                    CAST(:evidence AS jsonb), :timestamp, :timestamp, :timestamp
                )
                ON CONFLICT (observability_log_id, finding_key) DO UPDATE SET
                    agent_id = EXCLUDED.agent_id,
                    application_id = EXCLUDED.application_id,
                    evidence = EXCLUDED.evidence,
                    occurrence_count = policy_findings.occurrence_count + 1,
                    last_detected_at = EXCLUDED.last_detected_at,
                    updated_at = EXCLUDED.updated_at
            """), {
                "tenant_id": tenant_id,
                "agent_id": agent_id,
                "application_id": application_id,
                "request_id": request_id,
                "policy_id": policy_id or "unresolved",
                "finding_key": finding_key,
                "category": finding_key.split(".")[0] if "." in finding_key else "policy",
                "severity": violated.get("severity") or "high",
                "title": f"Runtime policy breach: {finding_key}",
                "description": violated.get("message") or "A ControlNet guardrail blocked this request.",
                "evidence": json.dumps({
                    "request_id": request_id,
                    "violation": violated,
                    "phase": (metadata or {}).get("violation_phase", "unknown"),
                    "status_code": status_code,
                }),
                "timestamp": timestamp,
            })
        
        # ✅ NOTE: Don't commit here - get_session() context manager handles commit
        # Committing here would cause a double commit which is harmless but unnecessary
        
        # Log with context for debugging
        decision = guardrail_results.get("policy_decision") if guardrail_results else "none"
        logger.info(
            f"Observability log created: request_id={request_id}, "
            f"log_id={log_id}, policy={policy_id}, app={application_id}, "
            f"decision={decision}, status={status_code}, latency={latency_ms}ms"
        )
        
        return log_id
        
    except Exception as e:
        logger.error(
            f"Failed to log request {request_id} to observability_logs: {e}", 
            exc_info=True
        )
        # Don't fail the request if logging fails
        await db_session.rollback()
        raise


def sanitize_payload(payload: Dict[str, Any], max_size: int = 50000) -> Dict[str, Any]:
    """
    Sanitize payload for logging - remove sensitive data and limit size.
    
    Args:
        payload: Original payload
        max_size: Maximum size in characters
    
    Returns:
        Sanitized payload
    """
    try:
        # Convert to JSON string to check size
        payload_str = json.dumps(payload)
        
        # If too large, truncate
        if len(payload_str) > max_size:
            return {
                "_truncated": True,
                "_original_size": len(payload_str),
                "_preview": payload_str[:max_size] + "..."
            }
        
        return payload
        
    except Exception as e:
        logger.warning(f"Failed to sanitize payload: {e}")
        return {"_error": "Failed to sanitize payload"}


# ============================================================================
# Query Helper Functions for Observability Analytics
# ============================================================================

OBSERVABILITY_QUERIES = {
    "policy_enforcement": """
        -- Policy enforcement statistics by policy
        SELECT 
            policy_id,
            COUNT(*) as total_requests,
            COUNT(CASE WHEN status_code = 200 THEN 1 END) as allowed_requests,
            COUNT(CASE WHEN status_code = 400 THEN 1 END) as blocked_requests,
            COUNT(CASE WHEN status_code >= 500 THEN 1 END) as error_requests,
            ROUND(AVG(latency_ms), 2) as avg_latency_ms,
            ROUND(AVG((guardrail_results->'_summary'->>'total_time_ms')::float), 2) as avg_guard_time_ms,
            COUNT(CASE WHEN guardrail_results->'_summary'->>'was_blocked' = 'true' THEN 1 END) as violations
        FROM observability_logs
        WHERE tenant_id = :tenant_id
          AND created_at > :start_time
          AND policy_id IS NOT NULL
        GROUP BY policy_id
        ORDER BY total_requests DESC
    """,
    
    "violation_details": """
        -- Detailed violation tracking
        SELECT 
            id,
            request_id,
            policy_id,
            timestamp,
            guardrail_results->'_summary'->'violation'->>'rule_id' as violated_rule,
            guardrail_results->'_summary'->'violation'->>'message' as violation_message,
            guardrail_results->'_summary'->'violation'->>'phase' as violation_phase,
            metadata->>'trace_id' as trace_id,
            latency_ms
        FROM observability_logs
        WHERE tenant_id = :tenant_id
          AND guardrail_results->'_summary'->>'was_blocked' = 'true'
          AND created_at > :start_time
        ORDER BY timestamp DESC
        LIMIT :limit
    """,
    
    "guardrail_performance": """
        -- Guardrail execution performance metrics
        SELECT 
            policy_id,
            guardrail_results->'_summary'->>'input_guards_count' as input_guards,
            guardrail_results->'_summary'->>'output_guards_count' as output_guards,
            ROUND(AVG((guardrail_results->'_summary'->>'total_time_ms')::float), 2) as avg_execution_ms,
            ROUND(MAX((guardrail_results->'_summary'->>'total_time_ms')::float), 2) as max_execution_ms,
            COUNT(*) as request_count
        FROM observability_logs
        WHERE tenant_id = :tenant_id
          AND created_at > :start_time
          AND guardrail_results IS NOT NULL
        GROUP BY policy_id, input_guards, output_guards
        ORDER BY avg_execution_ms DESC
    """,
    
    "request_volume": """
        -- Request volume over time (hourly breakdown)
        SELECT 
            DATE_TRUNC('hour', timestamp) as hour,
            COUNT(*) as total_requests,
            COUNT(CASE WHEN status_code = 200 THEN 1 END) as successful,
            COUNT(CASE WHEN status_code = 400 THEN 1 END) as blocked,
            COUNT(CASE WHEN status_code >= 500 THEN 1 END) as errors,
            ROUND(AVG(latency_ms), 2) as avg_latency_ms
        FROM observability_logs
        WHERE tenant_id = :tenant_id
          AND created_at > :start_time
        GROUP BY DATE_TRUNC('hour', timestamp)
        ORDER BY hour DESC
    """,
    
    "slow_requests": """
        -- Identify slow requests for performance optimization
        SELECT 
            request_id,
            policy_id,
            timestamp,
            latency_ms,
            guardrail_results->'_summary'->>'total_time_ms' as guard_time_ms,
            metadata->>'model' as model,
            path
        FROM observability_logs
        WHERE tenant_id = :tenant_id
          AND created_at > :start_time
          AND latency_ms > :threshold_ms
        ORDER BY latency_ms DESC
        LIMIT :limit
    """,
    
    "error_analysis": """
        -- Error tracking and analysis
        SELECT 
            DATE_TRUNC('hour', timestamp) as hour,
            status_code,
            metadata->>'error_type' as error_type,
            COUNT(*) as error_count,
            array_agg(DISTINCT request_id) as request_ids
        FROM observability_logs
        WHERE tenant_id = :tenant_id
          AND created_at > :start_time
          AND status_code >= 400
        GROUP BY DATE_TRUNC('hour', timestamp), status_code, error_type
        ORDER BY hour DESC, error_count DESC
    """
}


async def get_policy_stats(
    db_session: AsyncSession,
    tenant_id: str,
    start_time: datetime,
) -> List[Dict[str, Any]]:
    """
    Get policy enforcement statistics.
    
    Returns metrics per policy including:
    - Total requests
    - Allowed vs blocked count
    - Average latency
    - Violation count
    """
    query = text(OBSERVABILITY_QUERIES["policy_enforcement"])
    result = await db_session.execute(
        query,
        {"tenant_id": tenant_id, "start_time": start_time}
    )
    return [dict(row._mapping) for row in result.fetchall()]


async def get_violation_details(
    db_session: AsyncSession,
    tenant_id: str,
    start_time: datetime,
    limit: int = 100
) -> List[Dict[str, Any]]:
    """
    Get detailed violation tracking.
    
    Returns all blocked requests with:
    - Violated rule ID
    - Violation message
    - Phase (input/output)
    - Trace ID for debugging
    """
    query = text(OBSERVABILITY_QUERIES["violation_details"])
    result = await db_session.execute(
        query,
        {"tenant_id": tenant_id, "start_time": start_time, "limit": limit}
    )
    return [dict(row._mapping) for row in result.fetchall()]


async def get_guardrail_performance(
    db_session: AsyncSession,
    tenant_id: str,
    start_time: datetime
) -> List[Dict[str, Any]]:
    """
    Get guardrail execution performance metrics.
    
    Returns performance data per policy:
    - Number of guards executed
    - Average execution time
    - Max execution time
    """
    query = text(OBSERVABILITY_QUERIES["guardrail_performance"])
    result = await db_session.execute(
        query,
        {"tenant_id": tenant_id, "start_time": start_time}
    )
    return [dict(row._mapping) for row in result.fetchall()]
