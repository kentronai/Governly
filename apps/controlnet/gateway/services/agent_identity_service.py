"""Tenant-safe runtime attribution for discovered agents."""

from typing import Optional, Tuple
from sqlalchemy import text

from gateway.db import get_session


async def resolve_agent_identity(
    tenant_id: str,
    agent_identifier: Optional[str],
    application_id: Optional[str],
) -> Tuple[Optional[str], Optional[str]]:
    """Return the canonical agent UUID and effective linked application UUID."""
    if not agent_identifier:
        return None, application_id
    async with get_session() as session:
        result = await session.execute(text("""
            SELECT id::text, application_id::text
            FROM agents
            WHERE tenant_id = :tenant_id
              AND (id::text = :agent_identifier OR external_agent_id = :agent_identifier)
            LIMIT 1
        """), {"tenant_id": tenant_id, "agent_identifier": agent_identifier})
        row = result.fetchone()
        if not row:
            raise ValueError("The requested agent does not exist in this tenant's discovered inventory.")
        agent_id = str(row[0])
        linked_application_id = str(row[1]) if row[1] else None
        if application_id and linked_application_id and application_id != linked_application_id:
            raise ValueError("The requested agent is not linked to the supplied application.")
        return agent_id, application_id or linked_application_id
