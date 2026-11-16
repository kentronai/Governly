"""Tenant-safe resolution of the runtime policy assigned to an application."""

from typing import Optional, Tuple
from sqlalchemy import text

from gateway.db import get_session


async def _resolve_tenant_default_policy(session, tenant_id: str) -> Optional[str]:
    """The tenant-wide default policy the gateway enforces when a request has no
    application-specific policy. Set from the tenant policy list in the web app
    (policies.is_tenant_default). At most one active policy carries the flag."""
    query = text("""
        SELECT p.id::text
        FROM policies p
        WHERE p.tenant_id = :tenant_id
          AND p.is_tenant_default = true
          AND p.is_active = true
          AND p.deleted_at IS NULL
        LIMIT 1
    """)
    result = await session.execute(query, {"tenant_id": tenant_id})
    row = result.fetchone()
    return str(row[0]) if row else None


async def resolve_application_policy(
    tenant_id: str,
    application_id: Optional[str],
    explicit_policy_id: Optional[str] = None,
) -> Tuple[Optional[str], str]:
    """
    Return (policy UUID, resolution source).

    Resolution order:
      1. An explicit policy id, when the request names one actively linked to
         its application. Without an application, an explicit id is honoured
         only when the tenant has no enabled default.
      2. The application's active default policy.
      3. The tenant-wide default policy (policies.is_tenant_default) — this is
         the "enable once, enforce everywhere" fallback that applies whenever an
         application has no policy of its own (or no application context at all).

    The per-application policy always wins over the tenant default, so an app
    that selects its own T0/T1/T2 policy is never overridden by the global one.
    """
    if not application_id:
        async with get_session() as session:
            tenant_default = await _resolve_tenant_default_policy(session, tenant_id)
        # An enabled tenant default is enforced on all traffic without an
        # application: naming another (weaker) policy must not bypass it.
        if tenant_default:
            return tenant_default, "tenant_default"
        if explicit_policy_id:
            # Tenant ownership is enforced when PolicyCache loads it (the
            # lookup is scoped by tenant_id), so a foreign id fails closed.
            return explicit_policy_id, "explicit"
        return None, "unresolved"

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
                    "The requested policy is not linked and active for this application."
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
        if row:
            return str(row[0]), "application_default"

        # No application-specific policy: fall back to the tenant-wide default
        # so an enabled global policy enforces everywhere automatically.
        tenant_default = await _resolve_tenant_default_policy(session, tenant_id)
        if tenant_default:
            return tenant_default, "tenant_default"
        raise ValueError(
            "No active runtime policy is configured for this application, and "
            "no tenant default policy is enabled."
        )
