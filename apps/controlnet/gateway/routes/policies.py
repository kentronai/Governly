"""
Policy Management Routes

Simplified policy CRUD operations without AI analysis or file uploads.
Focuses on core functionality: create, read, update, delete policies with guardrails.
"""

import json
import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel

from ..db import get_db
from ..auth import require_tenant_auth, TenantContext
from ..validators import validate_guard_params

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/policies", tags=["policies"])


# =====================================================
# Pydantic Models
# =====================================================

class GuardrailConfig(BaseModel):
    """Guardrail configuration for policy"""
    guardrail_id: str
    phase: str
    params: Dict[str, Any] = {}
    order_index: int = 0


class PolicyCreateRequest(BaseModel):
    """Policy creation request"""
    name: str
    description: str
    version: str = "v1"
    guardrails: List[GuardrailConfig]
    composition: Dict[str, str] = {"input": "allOf", "output": "allOf"}
    status: str = "active"
    is_active: bool = True
    application_id: Optional[str] = None


class PolicyUpdateRequest(BaseModel):
    """Policy update request"""
    name: Optional[str] = None
    description: Optional[str] = None
    guardrails: Optional[List[GuardrailConfig]] = None
    composition: Optional[Dict[str, str]] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None
    application_id: Optional[str] = None


# =====================================================
# Helper Functions
# =====================================================

async def validate_application_id(application_id: str, tenant_id: str, db: AsyncSession) -> bool:
    """Validate that application exists and belongs to tenant"""
    if not application_id:
        return False
        
    result = await db.execute(
        text("""
            SELECT id FROM applications 
            WHERE id = :application_id 
            AND tenant_id = :tenant_id 
            AND deleted_at IS NULL
        """),
        {"application_id": application_id, "tenant_id": tenant_id}
    )
    
    if not result.fetchone():
        raise HTTPException(
            status_code=400,
            detail=f"Application {application_id} not found or doesn't belong to tenant"
        )
    
    return True


async def validate_policy_name_uniqueness(
    application_id: str, 
    policy_name: str, 
    version: str, 
    db: AsyncSession,
    exclude_policy_id: Optional[str] = None
) -> bool:
    """Validate that policy name + version is unique within application"""
    if not application_id:
        return True
        
    query = """
        SELECT id FROM application_policies 
        WHERE application_id = :application_id 
        AND policy_name = :policy_name 
        AND policy_version = :version
    """
    params = {
        "application_id": application_id, 
        "policy_name": policy_name, 
        "version": version
    }
    
    if exclude_policy_id:
        query += " AND policy_id != :exclude_policy_id"
        params["exclude_policy_id"] = exclude_policy_id
    
    result = await db.execute(text(query), params)
    
    if result.fetchone():
        raise HTTPException(
            status_code=400,
            detail=f"Policy '{policy_name}' version '{version}' already exists in this application"
        )
    
    return True


async def process_guardrail(
    guardrail: GuardrailConfig,
    db: AsyncSession
) -> Dict[str, Any]:
    """
    Process a single guardrail: fetch metadata, merge params, validate
    
    Args:
        guardrail: Guardrail configuration
        db: Database session
        
    Returns:
        Dict with guardrail_key and normalized_params
    """
    # Fetch guardrail metadata
    guardrail_info = await db.execute(
        text("SELECT default_params, key FROM guardrails WHERE id = :id AND deleted_at IS NULL"),
        {"id": guardrail.guardrail_id}
    )
    guardrail_row = guardrail_info.fetchone()
    
    if not guardrail_row:
        raise HTTPException(
            status_code=400,
            detail=f"Guardrail {guardrail.guardrail_id} not found"
        )
    
    guardrail_key = guardrail_row[1]
    default_params = dict(guardrail_row[0]) if guardrail_row[0] else {}
    
    # Clean null values from user params
    user_params = {k: v for k, v in guardrail.params.items() if v is not None}
    
    # Handle string-to-list conversion for certain fields
    if "types" in user_params and isinstance(user_params["types"], str):
        # Convert comma-separated string to list
        user_params["types"] = [t.strip() for t in user_params["types"].split(",") if t.strip()]
    
    if "categories" in user_params and isinstance(user_params["categories"], str):
        # Convert comma-separated string to list
        user_params["categories"] = [c.strip() for c in user_params["categories"].split(",") if c.strip()]
    
    # Merge params: defaults < user params (excluding nulls)
    merged_params = {}
    merged_params.update(default_params)
    merged_params.update(user_params)
    
    # Validate with Pydantic
    try:
        normalized_params = await validate_guard_params(guardrail_key, merged_params, db)
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid parameters for {guardrail_key}: {str(e)}"
        )
    
    return {
        "key": guardrail_key,
        "params": normalized_params
    }


def generate_policy_yaml(
    policy_name: str,
    description: str,
    guardrails: List[Dict[str, Any]],
    composition: Dict[str, str]
) -> str:
    """
    Generate YAML policy content from guardrails
    
    Args:
        policy_name: Policy name
        description: Policy description
        guardrails: List of {id, key, phase, params, order_index}
        composition: Composition strategy per phase
        
    Returns:
        YAML content as string
    """
    yaml_lines = [
        f"policy: {policy_name.replace(' ', '_').lower()}",
        f"description: {description}",
        "",
        "guards:"
    ]
    
    # Add guards
    for g in guardrails:
        yaml_lines.append(f"  - id: {g['key']}")
        
        # Target based on phase
        if g['phase'] == "input":
            yaml_lines.append(f"    target: messages[*].content")
        else:
            yaml_lines.append(f"    target: output")
        
        # Add parameters if present
        if g.get('params'):
            yaml_lines.append(f"    with:")
            for key, value in g['params'].items():
                yaml_lines.append(f"      {key}: {json.dumps(value)}")
        
        yaml_lines.append("")
    
    # Build composition
    yaml_lines.append("compose:")
    
    # Group guards by phase
    phase_guards = {}
    for g in guardrails:
        phase = g['phase']
        if phase not in phase_guards:
            phase_guards[phase] = []
        guard_var = g['key'].replace('.', '_')
        phase_guards[phase].append(guard_var)
    
    # Build phase compositions
    for phase in ['input', 'output', 'tool_args', 'tool_result']:
        if phase in phase_guards and phase_guards[phase]:
            strategy = composition.get(phase, 'allOf')
            guard_list = ', '.join(phase_guards[phase])
            yaml_lines.append(f"  {phase}: {strategy}({guard_list})")
    
    # Build root composition
    phases_present = list(phase_guards.keys())
    if len(phases_present) == 1:
        yaml_lines.append(f"  root: {phases_present[0]}")
    elif len(phases_present) > 1:
        yaml_lines.append(f"  root: seq({', '.join(phases_present)})")
    elif guardrails:
        # Fallback to first guard
        first_var = guardrails[0]['key'].replace('.', '_')
        yaml_lines.append(f"  root: {first_var}")
    
    return "\n".join(yaml_lines)


# =====================================================
# Routes
# =====================================================

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_policy(
    policy_data: PolicyCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new policy with guardrails
    
    Validates application, processes guardrails, generates YAML,
    and creates all necessary database records.
    """
    try:
        tenant = await require_tenant_auth(request)
        
        # Validate application if provided
        if policy_data.application_id:
            await validate_application_id(policy_data.application_id, tenant.tenant_id, db)
            await validate_policy_name_uniqueness(
                policy_data.application_id, 
                policy_data.name, 
                policy_data.version, 
                db
            )
        
        # Create policy in database
        policy_id_result = await db.execute(
            text("""
                INSERT INTO policies (
                    tenant_id, name, description, version, status, is_active,
                    created_by, updated_by, metadata
                )
                VALUES (
                    :tenant_id, :name, :description, :version, :status, :is_active,
                    :user_id, :user_id, CAST(:metadata AS jsonb)
                )
                RETURNING id
            """),
            {
                "tenant_id": tenant.tenant_id,
                "name": policy_data.name,
                "description": policy_data.description,
                "version": policy_data.version,
                "status": policy_data.status,
                "is_active": policy_data.is_active,
                "user_id": tenant.auth.user_id,
                "metadata": json.dumps({
                    "created_via": "api",
                    "guardrails_count": len(policy_data.guardrails)
                })
            }
        )
        
        policy_id = str(policy_id_result.fetchone()[0])
        
        # Process and insert guardrails
        processed_guardrails = []
        for guardrail in policy_data.guardrails:
            processed = await process_guardrail(guardrail, db)
            
            await db.execute(
                text("""
                    INSERT INTO policy_guardrails (
                        tenant_id, policy_id, guardrail_id, phase,
                        params, order_index, enabled,
                        created_by, updated_by
                    )
                    VALUES (
                        :tenant_id, :policy_id, :guardrail_id, :phase,
                        CAST(:params AS jsonb), :order_index, true,
                        :user_id, :user_id
                    )
                """),
                {
                    "tenant_id": tenant.tenant_id,
                    "policy_id": policy_id,
                    "guardrail_id": guardrail.guardrail_id,
                    "phase": guardrail.phase,
                    "params": json.dumps(processed['params']),
                    "order_index": guardrail.order_index,
                    "user_id": tenant.auth.user_id
                }
            )
            
            processed_guardrails.append({
                "id": guardrail.guardrail_id,
                "key": processed['key'],
                "phase": guardrail.phase,
                "params": processed['params'],
                "order_index": guardrail.order_index
            })
        
        # Generate YAML
        yaml_content = generate_policy_yaml(
            policy_name=policy_data.name,
            description=policy_data.description,
            guardrails=processed_guardrails,
            composition=policy_data.composition
        )
        
        # Update policy with YAML
        await db.execute(
            text("UPDATE policies SET yaml = :yaml, updated_at = NOW() WHERE id = :policy_id"),
            {"yaml": yaml_content, "policy_id": policy_id}
        )
        
        # Link to application if provided
        if policy_data.application_id:
            await db.execute(
                text("""
                    INSERT INTO application_policies (
                        tenant_id, application_id, policy_id, policy_name, policy_version, 
                        is_active, priority, created_by
                    )
                    VALUES (
                        :tenant_id, :application_id, :policy_id, :policy_name, :policy_version,
                        true, 0, :user_id
                    )
                """),
                {
                    "tenant_id": tenant.tenant_id,
                    "application_id": policy_data.application_id,
                    "policy_id": policy_id,
                    "policy_name": policy_data.name,
                    "policy_version": policy_data.version,
                    "user_id": tenant.auth.user_id
                }
            )
        
        await db.commit()
        
        logger.info(f"✅ Created policy {policy_id} with {len(policy_data.guardrails)} guardrails")
        
        return {
            "success": True,
            "policy_id": policy_id,
            "name": policy_data.name,
            "guardrails_count": len(policy_data.guardrails),
            "application_id": policy_data.application_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to create policy: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{policy_id}")
async def update_policy(
    policy_id: str,
    policy_data: PolicyUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Update an existing policy
    
    Supports updating metadata, guardrails, and application association.
    Regenerates YAML automatically when guardrails change.
    """
    try:
        tenant = await require_tenant_auth(request)
        
        # Fetch existing policy
        policy_result = await db.execute(
            text("""
                SELECT id, tenant_id, name, description, version, status, is_active
                FROM policies
                WHERE id = :policy_id AND tenant_id = :tenant_id AND deleted_at IS NULL
            """),
            {"policy_id": policy_id, "tenant_id": tenant.tenant_id}
        )
        policy_row = policy_result.fetchone()
        
        if not policy_row:
            raise HTTPException(
                status_code=404,
                detail=f"Policy {policy_id} not found"
            )
        
        existing_policy = {
            "name": policy_row[2],
            "description": policy_row[3],
            "version": policy_row[4]
        }

        # An empty guardrails list on an update almost always means the caller
        # failed to resolve its guardrails (e.g. a stale/filtered lookup) rather
        # than a deliberate request to strip the policy bare. Reject it instead
        # of silently wiping every guardrail via the delete-then-reinsert below.
        if policy_data.guardrails is not None and len(policy_data.guardrails) == 0:
            raise HTTPException(
                status_code=400,
                detail="Policy update must include at least one guardrail; refusing to clear all guardrails."
            )

        # Update policy metadata if provided
        update_fields = []
        update_values = {"policy_id": policy_id, "user_id": tenant.auth.user_id}
        
        if policy_data.name is not None:
            update_fields.append("name = :name")
            update_values["name"] = policy_data.name
        
        if policy_data.description is not None:
            update_fields.append("description = :description")
            update_values["description"] = policy_data.description
        
        if policy_data.status is not None:
            update_fields.append("status = :status")
            update_values["status"] = policy_data.status
        
        if policy_data.is_active is not None:
            update_fields.append("is_active = :is_active")
            update_values["is_active"] = policy_data.is_active
        
        if update_fields:
            update_fields.extend(["updated_by = :user_id", "updated_at = NOW()"])
            
            await db.execute(
                text(f"""
                    UPDATE policies
                    SET {', '.join(update_fields)}
                    WHERE id = :policy_id AND tenant_id = :tenant_id
                """),
                {**update_values, "tenant_id": tenant.tenant_id}
            )
        
        # Handle guardrail updates if provided
        if policy_data.guardrails is not None:
            # Delete existing guardrails
            await db.execute(
                text("DELETE FROM policy_guardrails WHERE policy_id = :policy_id AND tenant_id = :tenant_id"),
                {"policy_id": policy_id, "tenant_id": tenant.tenant_id}
            )
            
            # Insert new guardrails
            processed_guardrails = []
            for guardrail in policy_data.guardrails:
                processed = await process_guardrail(guardrail, db)
                
                await db.execute(
                    text("""
                        INSERT INTO policy_guardrails (
                            tenant_id, policy_id, guardrail_id, phase,
                            params, order_index, enabled,
                            created_by, updated_by
                        )
                        VALUES (
                            :tenant_id, :policy_id, :guardrail_id, :phase,
                            CAST(:params AS jsonb), :order_index, true,
                            :user_id, :user_id
                        )
                    """),
                    {
                        "tenant_id": tenant.tenant_id,
                        "policy_id": policy_id,
                        "guardrail_id": guardrail.guardrail_id,
                        "phase": guardrail.phase,
                        "params": json.dumps(processed['params']),
                        "order_index": guardrail.order_index,
                        "user_id": tenant.auth.user_id
                    }
                )
                
                processed_guardrails.append({
                    "id": guardrail.guardrail_id,
                    "key": processed['key'],
                    "phase": guardrail.phase,
                    "params": processed['params'],
                    "order_index": guardrail.order_index
                })
            
            # Regenerate YAML
            final_name = policy_data.name if policy_data.name is not None else existing_policy["name"]
            final_description = policy_data.description if policy_data.description is not None else existing_policy["description"]
            composition = policy_data.composition if policy_data.composition is not None else {"input": "allOf", "output": "allOf"}
            
            yaml_content = generate_policy_yaml(
                policy_name=final_name,
                description=final_description,
                guardrails=processed_guardrails,
                composition=composition
            )
            
            await db.execute(
                text("UPDATE policies SET yaml = :yaml, updated_at = NOW() WHERE id = :policy_id"),
                {"yaml": yaml_content, "policy_id": policy_id}
            )
        
        # Handle application association update
        if policy_data.application_id is not None:
            # Delete existing association
            await db.execute(
                text("DELETE FROM application_policies WHERE policy_id = :policy_id AND tenant_id = :tenant_id"),
                {"policy_id": policy_id, "tenant_id": tenant.tenant_id}
            )
            
            # Create new association if application_id provided
            if policy_data.application_id:
                await validate_application_id(policy_data.application_id, tenant.tenant_id, db)
                
                final_name = policy_data.name if policy_data.name is not None else existing_policy["name"]
                
                await db.execute(
                    text("""
                        INSERT INTO application_policies (
                            tenant_id, application_id, policy_id, policy_name, policy_version,
                            is_active, priority, created_by
                        )
                        VALUES (
                            :tenant_id, :application_id, :policy_id, :policy_name, :policy_version,
                            true, 0, :user_id
                        )
                    """),
                    {
                        "tenant_id": tenant.tenant_id,
                        "application_id": policy_data.application_id,
                        "policy_id": policy_id,
                        "policy_name": final_name,
                        "policy_version": existing_policy["version"],
                        "user_id": tenant.auth.user_id
                    }
                )
        
        # Invalidate cache
        if hasattr(request.app.state, 'policy_cache'):
            await request.app.state.policy_cache.invalidate_policy(tenant.tenant_id, policy_id)
        
        await db.commit()
        
        logger.info(f"✅ Updated policy {policy_id}")
        
        return {
            "success": True,
            "policy_id": policy_id,
            "message": "Policy updated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to update policy: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/guardrails")
async def get_available_guardrails(
    request: Request, 
    db: AsyncSession = Depends(get_db),
    include_onnx: bool = True
):
    """
    Get all available guardrails for policy creation
    
    Args:
        include_onnx: If False, filters out guards that require ONNX
    """
    try:
        tenant = await require_tenant_auth(request)
        
        where_clause = "is_enabled = true AND deleted_at IS NULL AND (is_global = true OR tenant_id = :tenant_id)"
        if not include_onnx:
            where_clause += " AND (requires_onnx = false OR requires_onnx IS NULL)"
        
        result = await db.execute(
            text(f"""
                SELECT id, key, name, description, category, tier, 
                       infrastructure, default_params, avg_latency_ms,
                       pack_name, function_name, requires_onnx, onnx_model_id
                FROM guardrails
                WHERE {where_clause}
                ORDER BY category, tier, name
            """),
            {"tenant_id": tenant.tenant_id}
        )
        
        guardrails = []
        for row in result.fetchall():
            guardrails.append({
                "id": str(row[0]),
                "key": row[1],
                "name": row[2],
                "description": row[3],
                "category": row[4],
                "tier": row[5],
                "infrastructure": row[6],
                "default_params": row[7] if row[7] else {},
                "avg_latency_ms": float(row[8]) if row[8] else None,
                "pack_name": row[9],
                "function_name": row[10],
                "requires_onnx": row[11],
                "onnx_model_id": row[12],
            })
        
        return {
            "success": True,
            "guardrails": guardrails,
            "total_count": len(guardrails),
            "filtered_onnx": not include_onnx
        }
        
    except Exception as e:
        logger.error(f"Failed to fetch guardrails: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{policy_id}/invalidate-cache")
async def invalidate_policy_cache(
    policy_id: str,
    request: Request,
    tenant: TenantContext = Depends(require_tenant_auth)
):
    """
    Invalidate cached policy to force recompilation
    Useful after code changes that affect policy metadata extraction
    """
    try:
        if not hasattr(request.app.state, 'policy_cache'):
            raise HTTPException(status_code=503, detail="Policy cache not initialized")
        
        await request.app.state.policy_cache.invalidate_policy(tenant.tenant_id, policy_id)
        
        logger.info(f"✅ Cache invalidated for policy {policy_id} (tenant: {tenant.tenant_id})")
        
        return {
            "success": True,
            "message": f"Policy cache invalidated for {policy_id}",
            "tenant_id": tenant.tenant_id,
            "policy_id": policy_id
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to invalidate cache: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

