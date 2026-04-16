# gateway/routes/guardrails.py
"""
Guardrail management endpoints
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, bindparam
from sqlalchemy import JSON as SAJSON, String
from uuid import uuid4
from datetime import datetime
import json

from ..db import get_db
from ..auth import require_tenant_auth, TenantContext
from ..models import GuardrailCreate, GuardrailResponse

router = APIRouter(prefix="/guardrails", tags=["guardrails"])


@router.post("", response_model=GuardrailResponse)
async def create_guardrail(
    guardrail: GuardrailCreate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(require_tenant_auth)
):
    """Create a new guardrail with all required fields"""
    try:
        # Insert into database with all fields
        insert_sql = text(
            """
            INSERT INTO guardrails (
                tenant_id,
                key,
                version,
                category,
                description,
                tier,
                performance_budget_ms,
                requires_onnx,
                onnx_model_id,
                default_params,
                metadata,
                is_enabled,
                pack_name,
                function_name,
                input_schema,
                output_schema,
                fallback_strategy,
                created_by,
                updated_by
            ) VALUES (
                :tenant_id,
                :key,
                :version,
                :category,
                :description,
                :tier,
                :performance_budget_ms,
                :requires_onnx,
                :onnx_model_id,
                :default_params,
                :metadata,
                :is_enabled,
                :pack_name,
                :function_name,
                :input_schema,
                :output_schema,
                :fallback_strategy,
                :created_by,
                :updated_by
            )
            RETURNING id, created_at, updated_at, deleted_at
            """
        )

        params = {
            "tenant_id": tenant.tenant_id,  # ✅ From validated header, not request body
            "key": guardrail.key,
            "version": guardrail.version,
            "category": guardrail.category,
            "description": guardrail.description,
            "tier": guardrail.tier.value,
            "performance_budget_ms": guardrail.performance_budget_ms,
            "requires_onnx": guardrail.requires_onnx,
            "onnx_model_id": guardrail.onnx_model_id,
            "default_params": json.dumps(guardrail.default_params or {}),
            "metadata": json.dumps(guardrail.metadata or {}),
            "is_enabled": guardrail.is_enabled,
            "pack_name": guardrail.pack_name,
            "function_name": guardrail.function_name,
            "input_schema": json.dumps(guardrail.input_schema) if guardrail.input_schema else None,
            "output_schema": json.dumps(guardrail.output_schema) if guardrail.output_schema else None,
            "fallback_strategy": guardrail.fallback_strategy,
            "created_by": tenant.auth.user_id,  # ✅ Clerk user ID from JWT
            "updated_by": tenant.auth.user_id,  # ✅ Clerk user ID from JWT
        }

        result = await db.execute(insert_sql, params)
        row = result.one()
        guardrail_id = row.id
        
        # Link guardrail to risk category via risk_category_links
        if guardrail.category:
            link_query = text("""
                INSERT INTO risk_category_links (
                    id, category_id, entity_type, entity_id
                )
                SELECT 
                    gen_random_uuid(),
                    rc.id,
                    'guardrail',
                    :entity_id
                FROM risk_categories rc
                WHERE rc.slug = :slug
                ON CONFLICT (entity_type, entity_id, category_id) DO NOTHING
            """)
            
            await db.execute(link_query, {
                "entity_id": guardrail_id,
                "slug": guardrail.category
            })
        
        await db.commit()

        return GuardrailResponse(
            id=row.id,
            tenant_id=tenant.tenant_id,  # ✅ From validated header
            key=guardrail.key,
            version=guardrail.version,
            category=guardrail.category,
            description=guardrail.description,
            tier=guardrail.tier,
            performance_budget_ms=guardrail.performance_budget_ms,
            requires_onnx=guardrail.requires_onnx,
            onnx_model_id=guardrail.onnx_model_id,
            default_params=guardrail.default_params,
            metadata=guardrail.metadata,
            is_enabled=guardrail.is_enabled,
            pack_name=guardrail.pack_name,
            function_name=guardrail.function_name,
            input_schema=guardrail.input_schema,
            output_schema=guardrail.output_schema,
            fallback_strategy=guardrail.fallback_strategy,
            created_by=tenant.auth.user_id,  # ✅ Clerk user ID from JWT
            updated_by=tenant.auth.user_id,  # ✅ Clerk user ID from JWT
            created_at=row.created_at,
            updated_at=row.updated_at,
            deleted_at=row.deleted_at,
        )

    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create guardrail: {str(e)}")
