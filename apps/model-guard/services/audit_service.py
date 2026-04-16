"""
Audit logging service for ModelGuard.

Integrates with the shared audit_events table for compliance tracking.
"""

import json
from datetime import datetime
from typing import Any, Dict, Optional
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from gateway.db import get_async_session


class AuditService:
    """Service for logging audit events to shared audit_events table."""
    
    def __init__(self, db_session: Optional[AsyncSession] = None):
        """
        Initialize audit service.
        
        Args:
            db_session: Optional database session for testing
        """
        self.db_session = db_session
    
    async def log_event(
        self,
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
        Log an audit event.
        
        Args:
            tenant_id: Tenant identifier
            actor_user_id: User who performed the action
            action: Action identifier (e.g., 'model.scan.completed')
            target_type: Type of target resource (e.g., 'model_artifact')
            target_id: ID of target resource
            metadata: Additional metadata as JSON
            ip_address: Optional IP address
            user_agent: Optional user agent
            
        Returns:
            Audit event ID
        """
        # Get or create database session
        if self.db_session:
            session = self.db_session
            should_close = False
        else:
            session = await get_async_session()
            should_close = True
        
        try:
            event_id = str(uuid4())
            
            # Insert audit event
            query = text("""
                INSERT INTO audit_events (
                    id, tenant_id, actor_user_id, action,
                    target_type, target_id, metadata,
                    ip_address, user_agent, created_at
                ) VALUES (
                    :id, :tenant_id, :actor_user_id, :action,
                    :target_type, :target_id, :metadata,
                    :ip_address, :user_agent, :created_at
                )
            """)
            
            await session.execute(
                query,
                {
                    'id': event_id,
                    'tenant_id': tenant_id,
                    'actor_user_id': actor_user_id,
                    'action': action,
                    'target_type': target_type,
                    'target_id': target_id,
                    'metadata': json.dumps(metadata or {}),
                    'ip_address': ip_address or 'unknown',
                    'user_agent': user_agent or 'modelguard-service',
                    'created_at': datetime.utcnow()
                }
            )
            
            await session.commit()
            return event_id
            
        except Exception as e:
            await session.rollback()
            # Don't fail the main operation if audit logging fails
            # Just log the error
            print(f"⚠️  Failed to log audit event: {e}")
            return ""
        finally:
            if should_close:
                await session.close()
    
    async def log_scan_started(
        self,
        tenant_id: str,
        user_id: str,
        artifact_id: str,
        uri: str,
        detected_format: str
    ) -> str:
        """Log when a model scan is started."""
        return await self.log_event(
            tenant_id=tenant_id,
            actor_user_id=user_id,
            action='model.scan.started',
            target_type='model_artifact',
            target_id=artifact_id,
            metadata={
                'uri': uri,
                'format': detected_format
            }
        )
    
    async def log_scan_completed(
        self,
        tenant_id: str,
        user_id: str,
        artifact_id: str,
        scan_id: str,
        approval_status: str,
        findings_count: int,
        critical_count: int,
        high_count: int,
        scan_duration_ms: int
    ) -> str:
        """Log when a model scan is completed."""
        return await self.log_event(
            tenant_id=tenant_id,
            actor_user_id=user_id,
            action='model.scan.completed',
            target_type='model_artifact',
            target_id=artifact_id,
            metadata={
                'scan_id': scan_id,
                'approval_status': approval_status,
                'findings_count': findings_count,
                'critical_count': critical_count,
                'high_count': high_count,
                'scan_duration_ms': scan_duration_ms
            }
        )
    
    async def log_scan_failed(
        self,
        tenant_id: str,
        user_id: str,
        uri: str,
        error: str
    ) -> str:
        """Log when a model scan fails."""
        return await self.log_event(
            tenant_id=tenant_id,
            actor_user_id=user_id,
            action='model.scan.failed',
            target_type='model_artifact',
            target_id=None,
            metadata={
                'uri': uri,
                'error': error
            }
        )
    
    async def log_model_approved(
        self,
        tenant_id: str,
        user_id: str,
        artifact_id: str,
        scan_id: str,
        added_to_registry: bool
    ) -> str:
        """Log when a model is approved and added to registry."""
        return await self.log_event(
            tenant_id=tenant_id,
            actor_user_id=user_id,
            action='model.approved',
            target_type='model_artifact',
            target_id=artifact_id,
            metadata={
                'scan_id': scan_id,
                'added_to_registry': added_to_registry
            }
        )
    
    async def log_model_rejected(
        self,
        tenant_id: str,
        user_id: str,
        artifact_id: str,
        scan_id: str,
        reason: str
    ) -> str:
        """Log when a model is rejected."""
        return await self.log_event(
            tenant_id=tenant_id,
            actor_user_id=user_id,
            action='model.rejected',
            target_type='model_artifact',
            target_id=artifact_id,
            metadata={
                'scan_id': scan_id,
                'reason': reason
            }
        )


# Global service instance
_audit_service: Optional[AuditService] = None


def get_audit_service() -> AuditService:
    """
    Get or create audit service instance.
    
    Returns:
        AuditService instance
    """
    global _audit_service
    if _audit_service is None:
        _audit_service = AuditService()
    return _audit_service

