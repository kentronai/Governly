"""
Router Configuration API - Manage centroids and prompts
Allows customers to configure their embedding-based routing
"""

import logging
import json
from typing import List, Optional, Dict, Any
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from ..db import get_db
from ..auth import require_tenant_auth, TenantContext
from cga_core.either import Right  # For type checking preload results
# from ..models import PolicyAnalyzeResponse  # Not needed for router config

router = APIRouter(prefix="/router", tags=["router-config"])
logger = logging.getLogger(__name__)


# =====================================================
# Request/Response Models
# =====================================================

class PromptCreate(BaseModel):
    """Create a new prompt for centroid"""
    prompt: str
    risk_category: Optional[str] = None


class PromptResponse(BaseModel):
    """Prompt response model"""
    id: str
    prompt: str
    risk_category: Optional[str]
    is_active: bool
    created_at: str
    updated_at: str


class CentroidCreate(BaseModel):
    """Create a new centroid configuration"""
    risk_category: str
    threshold: float = 0.45  # Default threshold (tuned for better detection)
    
    class Config:
        json_schema_extra = {
            "example": {
                "risk_category": "jailbreak",
                "threshold": 0.45
            }
        }
    
    def __init__(self, **data):
        super().__init__(**data)
        # Clamp threshold to 0-1
        if self.threshold < 0.0:
            self.threshold = 0.0
        elif self.threshold > 1.0:
            self.threshold = 1.0


class CentroidResponse(BaseModel):
    """Centroid response model"""
    id: str
    risk_category: str
    threshold: Optional[float]
    is_active: bool
    prompt_count: int
    created_at: str


class PromptToCentroidLink(BaseModel):
    """Link a prompt to a centroid"""
    prompt_id: str
    centroid_id: str
    weight: float = 1.0
    
    class Config:
        json_schema_extra = {
            "example": {
                "prompt_id": "uuid-here",
                "centroid_id": "uuid-here",
                "weight": 1.0
            }
        }
    
    def __init__(self, **data):
        super().__init__(**data)
        # Ensure weight is positive
        if self.weight <= 0:
            self.weight = 1.0


# =====================================================
# Prompt Management
# =====================================================

@router.post("/prompts", response_model=PromptResponse)
async def create_prompt(
    prompt: PromptCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(require_tenant_auth)
):
    """Create a new prompt for routing"""
    prompt_id = str(uuid4())
    user_id = tenant.auth.user_id
    
    query = text("""
        INSERT INTO router_prompts (
            id, prompt, category, is_active, metadata
        ) VALUES (
            :id, :prompt, :risk_category, true, :metadata
        )
        RETURNING id, prompt, category as risk_category, is_active, created_at, updated_at
    """)
    
    result = await db.execute(query, {
        "id": prompt_id,
        "prompt": prompt.prompt,
        "risk_category": prompt.risk_category,
        # router_prompts has no tenant column (global by design); the owning
        # tenant is tagged in metadata so only it can delete the row.
        "metadata": json.dumps({"tenant_id": tenant.tenant_id, "created_by": user_id}),
    })
    await db.commit()
    
    row = result.fetchone()
    
    return PromptResponse(
        id=str(row[0]),
        prompt=row[1],
        risk_category=row[2],
        is_active=row[3],
        created_at=str(row[4]),
        updated_at=str(row[5])
    )


@router.get("/prompts", response_model=List[PromptResponse])
async def list_prompts(
    request: Request,
    risk_category: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(require_tenant_auth)
):
    """List all prompts for this tenant with pagination"""
    
    if risk_category:
        query = text("""
            SELECT id, prompt, category as risk_category, is_active, created_at, updated_at
            FROM router_prompts
            WHERE category = :risk_category
              AND is_active = true
              AND (metadata->>'tenant_id' IS NULL OR metadata->>'tenant_id' = :tenant_id)
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """)
        params = {
            "tenant_id": tenant.tenant_id,
            "risk_category": risk_category,
            "limit": limit,
            "offset": offset
        }
    else:
        query = text("""
            SELECT id, prompt, category as risk_category, is_active, created_at, updated_at
            FROM router_prompts
            WHERE is_active = true
              AND (metadata->>'tenant_id' IS NULL OR metadata->>'tenant_id' = :tenant_id)
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """)
        params = {
            "tenant_id": tenant.tenant_id,
            "limit": limit,
            "offset": offset
        }
    
    result = await db.execute(query, params)
    rows = result.fetchall()
    
    return [PromptResponse(
        id=str(row[0]),
        prompt=row[1],
        risk_category=row[2],
        is_active=row[3],
        created_at=str(row[4]),
        updated_at=str(row[5])
    ) for row in rows]


@router.delete("/prompts/{prompt_id}")
async def delete_prompt(
    prompt_id: str,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(require_tenant_auth)
):
    """Delete (soft delete) a prompt"""
    query = text("""
        UPDATE router_prompts
        SET is_active = false, updated_at = NOW()
        WHERE id::text = :prompt_id
          AND metadata->>'tenant_id' = :tenant_id
    """)
    
    # Global (untagged) prompts are read-only for tenants.
    result = await db.execute(query, {
        "prompt_id": prompt_id,
        "tenant_id": tenant.tenant_id,
    })
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Prompt not found")
    
    return {"success": True, "message": "Prompt deleted"}


# =====================================================
# Centroid Management
# =====================================================

@router.post("/centroids", response_model=CentroidResponse)
async def create_centroid(
    centroid: CentroidCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(require_tenant_auth)
):
    """Create a new centroid configuration for a risk category"""
    centroid_id = str(uuid4())
    user_id = tenant.auth.user_id
    
    query = text("""
        INSERT INTO router_centroids (
            id, tenant_id, family, threshold, is_active,
            metadata, created_by
        ) VALUES (
            :id, :tenant_id, :risk_category, :threshold, true,
            :metadata, :created_by
        )
        RETURNING id, family as risk_category, threshold, is_active, created_at
    """)
    
    result = await db.execute(query, {
        "id": centroid_id,
        "tenant_id": tenant.tenant_id,
        "risk_category": centroid.risk_category,
        "threshold": centroid.threshold,
        "metadata": json.dumps({}),
        "created_by": user_id
    })
    await db.commit()
    
    row = result.fetchone()
    
    return CentroidResponse(
        id=str(row[0]),
        risk_category=row[1],
        threshold=float(row[2]) if row[2] else None,
        is_active=row[3],
        prompt_count=0,
        created_at=str(row[4])
    )


@router.get("/centroids", response_model=List[CentroidResponse])
async def list_centroids(
    request: Request,
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(require_tenant_auth)
):
    """List all centroids for this tenant with pagination"""
    query = text("""
        SELECT 
            rc.id, rc.family as risk_category, rc.threshold, rc.is_active, rc.created_at,
            COUNT(rpc.prompt_id) as prompt_count
        FROM router_centroids rc
        LEFT JOIN router_prompt_centroids rpc 
            ON rpc.centroid_id = rc.id 
            AND rpc.tenant_id = rc.tenant_id
            AND rpc.is_active = true
        WHERE rc.tenant_id = :tenant_id
          AND rc.is_active = true
        GROUP BY rc.id, rc.family, rc.threshold, rc.is_active, rc.created_at
        ORDER BY rc.created_at DESC
        LIMIT :limit OFFSET :offset
    """)
    
    result = await db.execute(query, {
        "tenant_id": tenant.tenant_id,
        "limit": limit,
        "offset": offset
    })
    rows = result.fetchall()
    
    return [CentroidResponse(
        id=str(row[0]),
        risk_category=row[1],
        threshold=float(row[2]) if row[2] else None,
        is_active=row[3],
        prompt_count=row[5] or 0,
        created_at=str(row[4])
    ) for row in rows]


# =====================================================
# Linking Prompts to Centroids
# =====================================================

@router.post("/link-prompt")
async def link_prompt_to_centroid(
    link: PromptToCentroidLink,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(require_tenant_auth)
):
    """Link a prompt to a centroid (with weight)"""
    link_id = str(uuid4())
    user_id = tenant.auth.user_id
    
    # Verify both exist (prompt no longer has tenant_id, but centroid still does)
    verify_query = text("""
        SELECT 1 FROM router_prompts rp, router_centroids rc
        WHERE rp.id = :prompt_id
          AND rc.id = :centroid_id
          AND rc.tenant_id = :tenant_id
    """)
    
    result = await db.execute(verify_query, {
        "prompt_id": link.prompt_id,
        "centroid_id": link.centroid_id,
        "tenant_id": tenant.tenant_id
    })
    
    if not result.fetchone():
        raise HTTPException(
            status_code=400,
            detail="Prompt or centroid not found or centroid belongs to different tenant"
        )
    
    # Create link with tenant-scoped ON CONFLICT
    query = text("""
        INSERT INTO router_prompt_centroids (
            id, tenant_id, prompt_id, centroid_id, weight, is_active, created_by
        ) VALUES (
            :id, :tenant_id, :prompt_id, :centroid_id, :weight, true, :created_by
        )
        ON CONFLICT (tenant_id, prompt_id, centroid_id) 
        DO UPDATE SET weight = EXCLUDED.weight, is_active = true
    """)
    
    await db.execute(query, {
        "id": link_id,
        "tenant_id": tenant.tenant_id,
        "prompt_id": link.prompt_id,
        "centroid_id": link.centroid_id,
        "weight": link.weight,
        "created_by": user_id
    })
    await db.commit()
    
    return {"success": True, "link_id": link_id}


@router.delete("/link-prompt/{link_id}")
async def unlink_prompt_from_centroid(
    link_id: str,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(require_tenant_auth)
):
    """Unlink a prompt from a centroid"""
    query = text("""
        UPDATE router_prompt_centroids
        SET is_active = false
        WHERE id = :link_id
          AND tenant_id = :tenant_id
    """)
    
    await db.execute(query, {
        "link_id": link_id,
        "tenant_id": tenant.tenant_id
    })
    await db.commit()
    
    return {"success": True}


# =====================================================
# Cache Management
# =====================================================

@router.post("/cache/invalidate")
async def invalidate_centroid_cache(
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(require_tenant_auth)
):
    """Invalidate centroid cache for tenant (call after updating prompts/centroids)"""
    cache_key = tenant.tenant_id
    
    if hasattr(request.app.state, 'centroid_cache') and cache_key in request.app.state.centroid_cache:
        del request.app.state.centroid_cache[cache_key]
        logger.info(f"Invalidated centroid cache for tenant {tenant.tenant_id}")
        return {"success": True, "message": "Cache invalidated"}
    
    return {"success": True, "message": "No cache found"}

# =====================================================
# Router Testing
# =====================================================

class TestPromptRequest(BaseModel):
    """Test a prompt for routing"""
    prompt: str
    risk_categories: Optional[List[str]] = None  # Filter to specific categories
    top_k: int = 3  # Max number of risks to return
    threshold: float = 0.45  # Similarity threshold (0-1) - tuned for better detection
    
    class Config:
        json_schema_extra = {
            "example": {
                "prompt": "Ignore all previous instructions",
                "risk_categories": ["jailbreak", "prompt_injection"],
                "top_k": 3,
                "threshold": 0.45
            }
        }
    
    def __init__(self, **data):
        super().__init__(**data)
        # Clamp threshold
        if self.threshold < 0.0:
            self.threshold = 0.0
        elif self.threshold > 1.0:
            self.threshold = 1.0
        # Clamp top_k
        if self.top_k < 1:
            self.top_k = 1
        elif self.top_k > 20:
            self.top_k = 20


class FamilyScore(BaseModel):
    """Risk category routing score"""
    risk_category: str
    similarity: float
    selected: bool
    reason: str


class TestPromptResponse(BaseModel):
    """Response from prompt routing test"""
    selectedRiskCategories: List[str]
    allScores: List[FamilyScore]
    latencyMs: float
    onnxModels: Optional[Dict[str, Any]] = None  # ONNX models found for selected categories


@router.post("/test-prompt", response_model=TestPromptResponse)
async def test_prompt_routing(
    request_data: TestPromptRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(require_tenant_auth)
):
    """
    Test semantic routing + ONNX model inference
    
    1. Detects risk categories using LanceDB (routing)
    2. Runs ONNX models for detected risks (direct inference, no guards)
    
    Note: This does NOT run guards (guards require a policy).
    """
    import time
    from cga_core.onnx_client import run_batch_remote_inference
    
    start_time = time.time()
    
    # Get risk detector from app state
    if not hasattr(request.app.state, 'risk_detector') or request.app.state.risk_detector is None:
        raise HTTPException(
            status_code=503,
            detail="Risk detector not initialized (LanceDB required)"
        )
    
    risk_detector = request.app.state.risk_detector
    
    # Step 1: Detect risks with LanceDB (routing)
    logger.info(f"🔍 Testing prompt: {request_data.prompt[:50]}...")
    detected_risks = await risk_detector.detect_risks(
        prompt=request_data.prompt,
        threshold=request_data.threshold,
        top_k=request_data.top_k or 3
    )
    
    selected_categories = [risk.risk_category for risk in detected_risks]
    all_scores = [
        FamilyScore(
            risk_category=risk.risk_category,
            similarity=risk.similarity,
            selected=True,
            reason=f"Detected (score: {risk.similarity:.3f})"
        )
        for risk in detected_risks
    ]
    
    logger.info(f"🎯 Detected risks: {selected_categories}")
    
    # Step 2: Run ONNX models for detected risk categories via remote service
    onnx_results = None
    if selected_categories:
        try:
            logger.info(f"🤖 Running ONNX models for {len(selected_categories)} risk categories...")
            onnx_results = await run_batch_remote_inference(
                prompt=request_data.prompt,
                risk_categories=selected_categories
            )
            logger.info(f"✅ ONNX inference complete: {len(onnx_results)} models run")
        except Exception as e:
            logger.error(f"ONNX inference failed: {e}", exc_info=True)
            onnx_results = {
                "error": str(e),
                "note": "ONNX models failed to run"
            }
    else:
        logger.info("ℹ️ No risks detected - skipping ONNX inference")
    
    latency_ms = (time.time() - start_time) * 1000
    
    return TestPromptResponse(
        selectedRiskCategories=selected_categories,
        allScores=all_scores,
        latencyMs=latency_ms,
        onnxModels=onnx_results
    )


# =====================================================
# ONNX Model Preloading
# =====================================================

@router.post("/sync-to-lancedb")
async def sync_to_lancedb(
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(require_tenant_auth)
):
    """
    Sync router prompts from PostgreSQL to LanceDB
    
    Reads all active prompts with categories and syncs to LanceDB for fast risk detection.
    Then computes centroids for each risk category.
    """
    if not hasattr(request.app.state, 'risk_detector'):
        raise HTTPException(
            status_code=503,
            detail="Risk detector not initialized. Set GCS_MODEL_BUCKET environment variable."
        )
    
    risk_detector = request.app.state.risk_detector
    
    try:
        # Sync from database
        result = await risk_detector.store.sync_from_database(db)
        
        if result["synced"] == 0:
            return {
                "success": True,
                "synced": 0,
                "message": "No prompts found to sync. Add prompts via Router Training first."
            }
        
        # Compute centroids after syncing
        centroids = risk_detector.store.compute_centroids()
        
        # Get statistics
        stats = risk_detector.store.get_stats()
        
        return {
            "success": True,
            "synced": result["synced"],
            "centroids_computed": len(centroids),
            "stats": stats,
            "message": f"Synced {result['synced']} prompts and computed {len(centroids)} centroids"
        }
        
    except Exception as e:
        logger.error(f"Error syncing to LanceDB: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class BulkUploadRequest(BaseModel):
    """Bulk upload prompts to LanceDB"""
    prompts: List[Dict[str, Any]]


class EmbeddingBatchRequest(BaseModel):
    """Batch embedding request"""
    prompts: List[str]


@router.get("/config/gcs-bucket")
async def get_gcs_bucket_config(
    request: Request,
):
    """
    Get GCS bucket configuration
    
    Used by frontend to fetch GCS bucket without duplicating env variables.
    This endpoint is public (no auth) as bucket name is not sensitive.
    """
    from gateway.config import Settings
    settings = Settings()
    
    if not settings.gcs_model_bucket:
        raise HTTPException(
            status_code=503,
            detail="GCS_MODEL_BUCKET not configured on backend. Set GCS_MODEL_BUCKET environment variable."
        )
    
    return {
        "bucket": settings.gcs_model_bucket
    }


@router.post("/bulk-upload")
async def bulk_upload_to_lancedb(
    data: BulkUploadRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(require_tenant_auth)
):
    """
    Bulk upload prompts to both LanceDB (GCS) and PostgreSQL (router_prompts table)
    
    Accepts array of prompts with risk_category and optional severity.
    - Saves to LanceDB (persists to GCS) for vector search
    - Saves to PostgreSQL router_prompts table for UI display
    LanceDB automatically computes embeddings - no manual encoding needed!
    """
    if not hasattr(request.app.state, 'risk_detector'):
        raise HTTPException(
            status_code=503,
            detail="Risk detector not initialized. Set GCS_MODEL_BUCKET environment variable."
        )
    
    risk_detector = request.app.state.risk_detector
    user_id = tenant.auth.user_id
    
    try:
        # Validate prompts (NO embeddings needed!)
        valid_prompts = []
        for p in data.prompts:
            if 'prompt' not in p or 'risk_category' not in p:
                continue
            
            valid_prompts.append({
                "prompt": p['prompt'],
                "risk_category": p['risk_category'],
                "severity": p.get('severity', 5)
            })
        
        if len(valid_prompts) == 0:
            raise HTTPException(
                status_code=400,
                detail="No valid prompts found. Each prompt must have 'prompt' and 'risk_category' fields."
            )
        
        # Step 1: Add to LanceDB in batch (persists to GCS)
        # Run in thread pool to avoid blocking async event loop
        import asyncio
        loop = asyncio.get_event_loop()
        try:
            await loop.run_in_executor(None, risk_detector.store.add_prompts_batch, valid_prompts)
            logger.info(f"✅ Added {len(valid_prompts)} prompts to LanceDB (GCS)")
        except Exception as lancedb_error:
            logger.error(f"❌ LanceDB error: {lancedb_error}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Failed to save to LanceDB: {str(lancedb_error)}"
            )
        
        # Step 2: Insert into PostgreSQL router_prompts table (for UI display)
        inserted_count = 0
        for prompt_data in valid_prompts:
            prompt_id = str(uuid4())
            try:
                query = text("""
                    INSERT INTO router_prompts (
                        id, prompt, category, is_active, metadata
                    ) VALUES (
                        :id, :prompt, :risk_category, true, :metadata
                    )
                    ON CONFLICT (id) DO NOTHING
                """)
                
                await db.execute(query, {
                    "id": prompt_id,
                    "prompt": prompt_data["prompt"],
                    "risk_category": prompt_data["risk_category"],
                    "metadata": json.dumps({
                        "severity": prompt_data["severity"],
                        "tenant_id": tenant.tenant_id,
                        "created_by": user_id,
                    }),
                })
                inserted_count += 1
            except Exception as e:
                logger.warning(f"Failed to insert prompt {prompt_id} into PostgreSQL: {e}")
                # Continue with other prompts even if one fails
        
        # Commit all PostgreSQL inserts
        await db.commit()
        logger.info(f"✅ Inserted {inserted_count} prompts into PostgreSQL router_prompts table")
        
        # Compute centroids after adding (also run in thread pool)
        # Note: add_prompts_batch already computes centroids, but we do it again to ensure consistency
        try:
            centroids = await loop.run_in_executor(None, risk_detector.store.compute_centroids)
        except Exception as centroid_error:
            logger.warning(f"⚠️ Failed to compute centroids (non-critical): {centroid_error}")
            centroids = {}
        
        # Get statistics
        stats = risk_detector.store.get_stats()
        
        return {
            "success": True,
            "uploaded": len(valid_prompts),
            "lancedb_saved": len(valid_prompts),
            "postgres_saved": inserted_count,
            "centroids_computed": len(centroids),
            "stats": stats,
            "message": f"Uploaded {len(valid_prompts)} prompts to LanceDB (GCS) and {inserted_count} to PostgreSQL. Computed {len(centroids)} centroids."
        }
        
    except Exception as e:
        logger.error(f"Error bulk uploading: {e}", exc_info=True)
        await db.rollback()  # Rollback PostgreSQL transaction on error
        raise HTTPException(status_code=500, detail=str(e))




