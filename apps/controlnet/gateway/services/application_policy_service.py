"""Tenant-safe resolution of the runtime policy assigned to an application."""

from typing import Optional, Tuple
from sqlalchemy import text

from gateway.db import get_session


async def resolve_application_policy(
    tenant_id: str,
    application_id: Optional[str],
    explicit_policy_id: Optional[str] = None,
) -> Tuple[Optional[str], str]:
    """
    Return (policy UUID, resolution source).

    When application_id is supplied, an explicit policy must belong to that
    application. Without an explicit policy, exactly the active default is
    selected. This prevents a caller from bypassing an application's controls
    with a policy from another application or tenant.
    """
    if not application_id:
        return explicit_policy_id, "explicit" if explicit_policy_id else "unresolved"

    async with get_session() as session:
        if explicit_policy_id:
            query = text("""
                SELECT p.id::text
                FROM application_policies ap
                JOIN applications a ON a.id = ap.application_id
                JOIN policies p ON p.id = ap.policy_id
                WHERE ap.tenant_id = :tenant_id
                  AND ap.application_id::text = :application_id
                  AND a.tenant_id = :tenant_id
                  AND a.deleted_at IS NULL
                  AND ap.is_active = true
                  AND p.tenant_id = :tenant_id
                  AND p.is_active = true
                  AND p.deleted_at IS NULL
                  AND (p.id::text = :policy_id OR p.slug = :policy_id OR p.name = :policy_id)
                LIMIT 1
            """)
            result = await session.execute(query, {
                "tenant_id": tenant_id,
                "application_id": application_id,
                "policy_id": explicit_policy_id,
            })
            row = result.fetchone()
            if not row:
                raise ValueError(
                    "The requested policy is not active for this application or tenant."
                )
            return str(row[0]), "application_explicit"

        query = text("""
            SELECT p.id::text
            FROM application_policies ap
            JOIN applications a ON a.id = ap.application_id
            JOIN policies p ON p.id = ap.policy_id
            WHERE ap.tenant_id = :tenant_id
              AND ap.application_id::text = :application_id
              AND a.tenant_id = :tenant_id
              AND a.deleted_at IS NULL
              AND ap.is_active = true
              AND ap.is_default = true
              AND p.tenant_id = :tenant_id
              AND p.is_active = true
              AND p.deleted_at IS NULL
            ORDER BY ap.priority DESC
            LIMIT 1
        """)
        result = await session.execute(query, {
            "tenant_id": tenant_id,
            "application_id": application_id,
        })
        row = result.fetchone()
        if not row:
            raise ValueError(
                "No active default runtime policy is configured for this application."
            )
        return str(row[0]), "application_default"
