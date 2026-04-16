"""
Audit Service for ControlNet Operations

Comprehensive audit logging for:
- Model uploads to GCS
- Router operations and risk category selection
- Policy compilation
- ONNX model registration
- Guardrail execution decisions

Follows database architecture patterns for audit events.
"""

import uuid
import json
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import asyncio

logger = logging.getLogger(__name__)


class AuditService:
    """Service for logging audit events to the database"""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
    
    async def log_audit_event(
        self,
        db_session: AsyncSession,
        tenant_id: str,
        actor_user_id: str,
        action: str,
        target_type: Optional[str] = None,
        target_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> str:
        """
        Log audit event to audit_events table.
        
        Args:
            db_session: Database session
            tenant_id: Tenant identifier (for multi-tenancy)
            actor_user_id: User ID who performed the action
            action: Action performed (e.g., "model.upload", "router.select")
            target_type: Type of target (e.g., "onnx_model", "policy")
            target_id: ID of the target entity
            metadata: Additional metadata about the action
            ip_address: IP address of the actor
            user_agent: User agent string
            
        Returns:
            Audit event UUID
        """
        try:
            audit_id = str(uuid.uuid4())
            
            query = text("""
                INSERT INTO audit_events (
                    id, tenant_id, actor_user_id, action, target_type, target_id,
                    metadata, ip_address, user_agent, created_at
                )
                VALUES (
                    :id, :tenant_id, :actor_user_id, :action, :target_type, :target_id,
                    CAST(:metadata AS jsonb), :ip_address, :user_agent, NOW()
                )
            """)
            
            await db_session.execute(
                query,
                {
                    "id": audit_id,
                    "tenant_id": tenant_id,
                    "actor_user_id": actor_user_id,
                    "action": action,
                    "target_type": target_type,
                    "target_id": target_id,
                    "metadata": json.dumps(metadata or {}),
                    "ip_address": ip_address or "unknown",
                    "user_agent": user_agent or "unknown"
                }
            )
            
            await db_session.commit()
            
            self.logger.info(f"Audit event logged: {action} by {actor_user_id}")
            return audit_id
            
        except Exception as e:
            self.logger.error(f"Failed to log audit event: {e}")
            await db_session.rollback()
            raise
    
    async def log_model_upload(
        self,
        db_session: AsyncSession,
        tenant_id: str,
        actor_user_id: str,
        model_id: str,
        model_name: str,
        gcs_path: str,
        file_size_bytes: int,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Log model upload to GCS"""
        return await self.log_audit_event(
            db_session=db_session,
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            action="model.upload",
            target_type="onnx_model",
            target_id=model_id,
            metadata={
                "model_name": model_name,
                "gcs_path": gcs_path,
                "file_size_bytes": file_size_bytes,
                "upload_timestamp": datetime.now(timezone.utc).isoformat(),
                **(metadata or {})
            }
        )
    
    async def log_model_registration(
        self,
        db_session: AsyncSession,
        tenant_id: str,
        actor_user_id: str,
        model_id: str,
        model_name: str,
        category: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Log ONNX model registration"""
        return await self.log_audit_event(
            db_session=db_session,
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            action="model.register",
            target_type="onnx_model",
            target_id=model_id,
            metadata={
                "model_name": model_name,
                "category": category,
                "registration_timestamp": datetime.now(timezone.utc).isoformat(),
                **(metadata or {})
            }
        )
    
    async def log_router_operation(
        self,
        db_session: AsyncSession,
        tenant_id: str,
        actor_user_id: str,
        prompt: str,
        selected_families: list,
        similarity_scores: Dict[str, float],
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Log router risk category selection"""
        return await self.log_audit_event(
            db_session=db_session,
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            action="router.select",
            target_type="risk_categories",
            target_id=None,
            metadata={
                "prompt": prompt[:500],  # Truncate for storage
                "selected_families": selected_families,
                "similarity_scores": similarity_scores,
                "selection_timestamp": datetime.now(timezone.utc).isoformat(),
                **(metadata or {})
            }
        )
    
    async def log_policy_compilation(
        self,
        db_session: AsyncSession,
        tenant_id: str,
        actor_user_id: str,
        policy_id: str,
        policy_name: str,
        compilation_time_ms: float,
        guard_count: int,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Log policy compilation"""
        return await self.log_audit_event(
            db_session=db_session,
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            action="policy.compile",
            target_type="policy",
            target_id=policy_id,
            metadata={
                "policy_name": policy_name,
                "compilation_time_ms": compilation_time_ms,
                "guard_count": guard_count,
                "compilation_timestamp": datetime.now(timezone.utc).isoformat(),
                **(metadata or {})
            }
        )
    
    async def log_guardrail_execution(
        self,
        db_session: AsyncSession,
        tenant_id: str,
        actor_user_id: str,
        guard_id: str,
        execution_time_ms: float,
        decision: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Log guardrail execution decision"""
        return await self.log_audit_event(
            db_session=db_session,
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            action="guardrail.execute",
            target_type="guardrail",
            target_id=guard_id,
            metadata={
                "execution_time_ms": execution_time_ms,
                "decision": decision,
                "execution_timestamp": datetime.now(timezone.utc).isoformat(),
                **(metadata or {})
            }
        )


# Global audit service instance
_audit_service = None


def get_audit_service() -> AuditService:
    """Get global audit service instance"""
    global _audit_service
    if _audit_service is None:
        _audit_service = AuditService()
    return _audit_service


# Convenience functions for common operations
async def log_model_upload_audit(
    db_session: AsyncSession,
    tenant_id: str,
    actor_user_id: str,
    model_id: str,
    model_name: str,
    gcs_path: str,
    file_size_bytes: int,
    metadata: Optional[Dict[str, Any]] = None
) -> str:
    """Convenience function for logging model uploads"""
    audit_service = get_audit_service()
    return await audit_service.log_model_upload(
        db_session, tenant_id, actor_user_id, model_id, model_name,
        gcs_path, file_size_bytes, metadata
    )


async def log_router_selection_audit(
    db_session: AsyncSession,
    tenant_id: str,
    actor_user_id: str,
    prompt: str,
    selected_families: list,
    similarity_scores: Dict[str, float],
    metadata: Optional[Dict[str, Any]] = None
) -> str:
    """Convenience function for logging router selections"""
    audit_service = get_audit_service()
    return await audit_service.log_router_operation(
        db_session, tenant_id, actor_user_id, prompt,
        selected_families, similarity_scores, metadata
    )


async def log_model_registration_audit(
    db_session: AsyncSession,
    tenant_id: str,
    actor_user_id: str,
    model_id: str,
    model_name: str,
    category: str,
    metadata: Optional[Dict[str, Any]] = None
) -> str:
    """Convenience function for logging model registration"""
    audit_service = get_audit_service()
    return await audit_service.log_model_registration(
        db_session, tenant_id, actor_user_id, model_id, model_name, category, metadata
    )


async def log_policy_compilation_audit(
    db_session: AsyncSession,
    tenant_id: str,
    actor_user_id: str,
    policy_id: str,
    policy_name: str,
    compilation_time_ms: float,
    guard_count: int,
    metadata: Optional[Dict[str, Any]] = None
) -> str:
    """Convenience function for logging policy compilation"""
    audit_service = get_audit_service()
    return await audit_service.log_policy_compilation(
        db_session, tenant_id, actor_user_id, policy_id,
        policy_name, compilation_time_ms, guard_count, metadata
    )
