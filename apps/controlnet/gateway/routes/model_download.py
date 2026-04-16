"""
Model Download Endpoint

Handles model file downloads only.
Model listing is handled by Next.js server actions (apps/web/src/actions/onnx-models.ts).
Supports shared models (global) and tenant-specific models.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from pydantic import BaseModel
from typing import Optional
import structlog
from pathlib import Path
import asyncio
import json
import datetime

from gateway.auth import require_tenant_auth, TenantContext
from gateway.config import get_settings

logger = structlog.get_logger(__name__)


def _get_onnx_registry():
    """Get ONNX registry - returns None if not available"""
    try:
        from cga_core.onnx_registry import get_onnx_registry
        return get_onnx_registry()
    except ImportError:
        logger.warning("onnx_registry not available - model download endpoints disabled")
        return None

router = APIRouter(prefix="/v1/models", tags=["models"])


class DownloadRequest(BaseModel):
    model_id: str
    tenant_id: Optional[str] = None


class DownloadFromUrlRequest(BaseModel):
    url: str
    filename: str
    family: Optional[str] = None  # Optional family for automatic centroid mapping
    tenant_id: Optional[str] = None


@router.post("/download")
async def download_model(
    request: DownloadRequest,
    background_tasks: BackgroundTasks
):
    """
    Trigger model download from HuggingFace
    
    This is a background task - the download happens asynchronously.
    Check status via the /status endpoint or logs.
    """
    settings = get_settings()
    registry = _get_onnx_registry()
    if not registry:
        raise HTTPException(
            status_code=503,
            detail="Model registry not available. ONNX models are now handled by the dedicated ONNX service."
        )
    model_info = registry.get_model(request.model_id)
    
    if not model_info:
        raise HTTPException(
            status_code=404,
            detail=f"Model {request.model_id} not found in registry"
        )
    
    # Check if model already exists in GCS
    if settings.gcs_model_bucket:
        from google.cloud import storage
        client = storage.Client()
        bucket = client.bucket(settings.gcs_model_bucket)
        blob = bucket.blob(model_info.model_path)
        
        if blob.exists():
            storage_url = f"gs://{settings.gcs_model_bucket}/{model_info.model_path}"
            return {
                "status": "already_downloaded",
                "model_id": request.model_id,
                "path": storage_url
            }
    
    # Check if huggingface_hub is available
    try:
        from huggingface_hub import hf_hub_download, list_repo_files
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="huggingface_hub not installed. Install with: pip install huggingface_hub"
        )
    
    # Parse HuggingFace URL
    if not model_info.source_url or "huggingface.co" not in model_info.source_url:
        raise HTTPException(
            status_code=400,
            detail="No HuggingFace URL configured for this model"
        )
    
    url_parts = model_info.source_url.replace("https://huggingface.co/", "").strip("/").split("/")
    repo_id = "/".join(url_parts[:2])
    
    # Try to find ONNX files
    try:
        repo_files = list(list_repo_files(repo_id))
        onnx_files = [f for f in repo_files if f.endswith(".onnx")]
        
        if not onnx_files:
            return {
                "status": "no_onnx_files",
                "model_id": request.model_id,
                "repo_id": repo_id,
                "message": "No ONNX files found in HuggingFace repository. Model needs conversion.",
                "url": model_info.source_url
            }
        
        # Stream directly to GCS (fail-fast if bucket not configured)
        if not settings.gcs_model_bucket:
            raise HTTPException(
                status_code=500,
                detail="GCS_MODEL_BUCKET not configured. Set GCS_MODEL_BUCKET environment variable."
            )
        
        # Stream directly from HuggingFace to GCS using streaming_upload utilities
        from cga_core.streaming_upload import stream_hf_to_gcs_with_durability
        
        blob_name = str(model_info.model_path)
        
        logger.info(f"📥 Streaming model from HuggingFace to GCS: gs://{gcs_bucket}/{blob_name}")
        
        # Stream directly to GCS (no local storage)
        bytes_written, etag, metadata = await stream_hf_to_gcs_with_durability(
            model_name=repo_id,
            filename=onnx_files[0],
            bucket_name=gcs_bucket,
            gcs_path=blob_name
        )
        
        storage_url = f"gs://{gcs_bucket}/{blob_name}"
        logger.info(f"✅ Streamed model to GCS: {storage_url} ({bytes_written} bytes)")
        
        return {
            "status": "downloaded",
            "model_id": request.model_id,
            "path": storage_url,
            "file": onnx_files[0],
            "size_bytes": bytes_written,
            "etag": etag
        }
        
    except Exception as e:
        logger.error(f"Failed to download model {request.model_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to download model: {str(e)}"
        )


@router.get("/status/{model_id}")
async def check_model_status(model_id: str):
    """Check if a model is downloaded"""
    try:
        registry = _get_onnx_registry()
        if not registry:
            raise HTTPException(
                status_code=503,
                detail="Model registry not available. ONNX models are now handled by the dedicated ONNX service."
            )
        model_info = registry.get_model(model_id)
        
        if not model_info:
            raise HTTPException(status_code=404, detail="Model not found")
        
        model_path = Path(model_info.model_path)
        
        return {
            "model_id": model_id,
            "downloaded": model_path.exists(),
            "path": str(model_path),
            "size_mb": round(model_path.stat().st_size / 1024 / 1024, 2) if model_path.exists() else 0
        }
    except Exception as e:
        logger.error(f"Error checking model status: {e}")
        return {
            "model_id": model_id,
            "downloaded": False,
            "path": None,
            "size_mb": 0
        }


@router.post("/download-from-url")
async def download_model_from_url(
    request: DownloadFromUrlRequest,
    tenant: TenantContext = Depends(require_tenant_auth)
):
    """
    Download a model file directly from a URL and save to database
    
    This is useful for downloading ONNX models from any source:
    - HuggingFace direct links
    - GitHub releases
    - S3/GCS URLs
    - Any HTTP/HTTPS URL
    
    If tenant_id is provided, the model is saved as tenant-specific.
    Otherwise, it's saved as a shared model.
    """
    import httpx
    
    try:
        # Use tenant_id from request (if provided) or from auth context
        effective_tenant_id = request.tenant_id or tenant.tenant_id
        
        # Download from URL (follow redirects for HuggingFace)
        logger.info(f"Downloading model from: {request.url} for tenant: {effective_tenant_id}")
        
        async with httpx.AsyncClient(follow_redirects=True, timeout=300.0) as client:
            async with client.stream('GET', request.url) as response:
                response.raise_for_status()
                
                # Create directory structure organized by risk categories
                # For tenant models: models/{tenant_id}/{risk_category}/
                # For shared models: models/shared/{risk_category}/
                
                # Determine base directory
                if effective_tenant_id:
                    base_dir = Path("models") / effective_tenant_id
                else:
                    base_dir = Path("models") / "shared"
                
                # Use provided family (from UI) or default to "uncategorized"
                family = request.family or "uncategorized"
                
                # Create category-specific folder
                category_dir = base_dir / family
                category_dir.mkdir(parents=True, exist_ok=True)
                
                # Save file with timestamp to ensure uniqueness
                timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                safe_filename = request.filename.replace('.onnx', '')
                output_filename = f"{safe_filename}_{timestamp}.onnx"
                output_path = category_dir / output_filename
                
                total_size = 0
                async for chunk in response.aiter_bytes():
                    total_size += len(chunk)
                    with open(output_path, "ab") as f:
                        f.write(chunk)
        
        size_mb = round(output_path.stat().st_size / 1024 / 1024, 2)
        
        logger.info(f"Downloaded model: {output_path} ({size_mb} MB)")
        
        # Check model size against configured limit
        from gateway.config import Settings
        settings = Settings()
        if size_mb > settings.max_onnx_model_size_mb:
            logger.warning(f"Model {output_path.name} is too large ({size_mb}MB > {settings.max_onnx_model_size_mb}MB)")
            output_path.unlink()  # Remove the oversized file
            raise HTTPException(
                status_code=413,
                detail=f"Model too large: {size_mb}MB exceeds limit of {settings.max_onnx_model_size_mb}MB"
            )
        
        # Validate and fix ONNX model to prevent duplicate definition issues
        model_metadata = {}
        try:
            validated_path, model_metadata = await _validate_and_fix_onnx_model(output_path)
            if validated_path != output_path:
                logger.info(f"Model validated and fixed: {validated_path}")
                output_path = validated_path
                
        except Exception as validation_error:
            logger.warning(f"Model validation failed: {validation_error}")
            # Continue with original model - let ONNX Runtime handle the error
        
        # Upload to GCS if bucket is configured
        storage_url = str(output_path)  # Default to local path
        
        if settings.gcs_model_bucket:
            try:
                from google.cloud import storage
                client = storage.Client()
                bucket = client.bucket(settings.gcs_model_bucket)
                
                # Upload to GCS with the same path structure
                blob_name = str(output_path)
                blob = bucket.blob(blob_name)
                
                logger.info(f"Uploading to GCS: gs://{settings.gcs_model_bucket}/{blob_name}")
                blob.upload_from_filename(str(output_path))
                
                # Update storage URL to GCS
                storage_url = f"gs://{settings.gcs_model_bucket}/{blob_name}"
                logger.info(f"✅ Uploaded to GCS: {storage_url}")
                
            except Exception as e:
                logger.error(f"Failed to upload to GCS: {e}, using local path")
        
        # Save to database with tenant context in metadata
        try:
            from gateway.db import get_db
            from sqlalchemy import text as sql_text
            from sqlalchemy.ext.asyncio import AsyncSession
            import uuid as uuid_lib
            
            # Prepare metadata with tenant context
            metadata_dict = {
                "source_url": request.url,
                "tenant_id": effective_tenant_id if effective_tenant_id else None,
                "visibility": "tenant" if effective_tenant_id else "shared",
                "downloaded_at": str(asyncio.get_event_loop().time()),
                "family": family
            }
            
            # Add model metadata if available
            if model_metadata:
                metadata_dict.update(model_metadata)
            
            # Get database connection
            async for db_session in get_db():
                # Generate unique model_id with timestamp (already computed above)
                # Use the same timestamp as filename
                base_name = request.filename.replace('.onnx', '')
                model_id_str = f"{base_name}_{timestamp}"
                
                # Create record in onnx_models table with metadata
                # Note: family field is deprecated - using risk_category_links instead
                insert_query = sql_text("""
                    INSERT INTO onnx_models (
                        id, model_id, name, model_type, family, 
                        version, file_size, storage_url,
                        p50_ms, p95_ms, cost_tier, is_active, framework, metadata
                    ) VALUES (
                        gen_random_uuid(), :model_id, :name, :model_type, ARRAY[]::text[],
                        :version, :file_size, :storage_url,
                        :p50_ms, :p95_ms, :cost_tier, :is_active, 'onnx', CAST(:metadata AS jsonb)
                    )
                    ON CONFLICT (model_id) DO UPDATE
                    SET storage_url = EXCLUDED.storage_url,
                        file_size = EXCLUDED.file_size,
                        metadata = EXCLUDED.metadata
                    RETURNING id
                """)
                
                result = await db_session.execute(insert_query, {
                    "model_id": model_id_str,
                    "name": request.filename.replace('.onnx', '').replace('_', ' ').title(),
                    "model_type": family,  # This is now just for categorization
                    "version": "1.0",
                    "file_size": int(size_mb * 1024 * 1024),
                    "storage_url": storage_url,
                    "p50_ms": 50.0,
                    "p95_ms": 100.0,
                    "cost_tier": "base",
                    "is_active": True,
                    "metadata": json.dumps(metadata_dict)  # Must be JSON string for CAST
                })
                
                # Get the model UUID
                model_row = result.fetchone()
                model_uuid = model_row[0] if model_row else None
                
                # Auto-create risk category if it doesn't exist, then link model to it
                if model_uuid and family != "uncategorized":
                    # First, ensure the risk category exists
                    create_category_query = sql_text("""
                        INSERT INTO risk_categories (
                            id, name, slug, description, severity, 
                            tier_recommendation, color, metadata, created_at, updated_at
                        ) VALUES (
                            gen_random_uuid(), :name, :slug, :description, 'medium',
                            'T1', :color, '{}', NOW(), NOW()
                        )
                        ON CONFLICT (slug) DO NOTHING
                        RETURNING id
                    """)
                    
                    # Generate a nice name and color from the slug
                    category_name = family.replace('_', ' ').replace('-', ' ').title()
                    category_color = _get_category_color(family)
                    
                    await db_session.execute(create_category_query, {
                        "name": category_name,
                        "slug": family,
                        "description": f"Risk category for {category_name} detection models",
                        "color": category_color
                    })
                    
                    # Now link the model to the risk category
                    link_query = sql_text("""
                        INSERT INTO risk_category_links (
                            id, category_id, entity_type, entity_id
                        )
                        SELECT 
                            gen_random_uuid(),
                            rc.id,
                            'onnx_model',
                            CAST(:model_id AS uuid)
                        FROM risk_categories rc
                        WHERE rc.slug = :family
                        ON CONFLICT (entity_type, entity_id, category_id) DO NOTHING
                    """)
                    
                    await db_session.execute(link_query, {
                        "model_id": str(model_uuid),  # Ensure it's a string for UUID casting
                        "family": family
                    })
                    
                    logger.info(f"Created and linked risk category: {family}")
                    # Note: router_centroids uses 'family' field which should match risk_categories.slug
                    # This is the proper architecture - centroids are keyed by risk category slug
                
                await db_session.commit()
                
                logger.info(f"Saved model to database: {request.filename} with family={family}, tenant={effective_tenant_id}")
                if model_uuid:
                    logger.info(f"Linked model to risk category: {family}")
                break
            
        except Exception as db_error:
            logger.warning(f"Could not save to database: {db_error}")
            # Continue anyway - file is downloaded
        
        return {
            "status": "success",
            "path": str(output_path),
            "size_mb": size_mb,
            "url": request.url,
            "filename": request.filename,
            "tenant_id": effective_tenant_id,
            "visibility": "tenant" if effective_tenant_id else "shared"
        }
        
    except Exception as e:
        logger.error(f"Failed to download model from URL: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to download model: {str(e)}"
        )


def _get_category_color(slug: str) -> str:
    """Generate a color for a risk category based on its slug"""
    color_map = {
        'jailbreak': 'red',
        'toxicity': 'orange', 
        'pii': 'blue',
        'privacy': 'blue',
        'safety': 'green',
        'security': 'red',
        'bias': 'purple',
        'financial': 'green',
        'legal': 'blue',
        'sentiment': 'purple',
        'uncategorized': 'gray'
    }
    
    # Try exact match first
    if slug in color_map:
        return color_map[slug]
    
    # Try partial matches
    for key, color in color_map.items():
        if key in slug.lower():
            return color
    
    # Default color
    return 'gray'


async def _validate_and_fix_onnx_model(model_path: Path) -> tuple[Path, dict]:
    """
    Validate and fix ONNX model to prevent duplicate definition issues
    
    Returns:
        Tuple of (path to validated model, model metadata dict)
    """
    try:
        import onnx
        import onnxruntime as ort
        
        # First, try to load the model with ONNX Runtime to detect issues
        try:
            session = ort.InferenceSession(str(model_path))
            logger.info(f"✅ Model {model_path.name} loads successfully - no fixes needed")
            
            # Extract model metadata
            model_metadata = _extract_model_metadata(session)
            return model_path, model_metadata
        except Exception as e:
            error_msg = str(e)
            logger.warning(f"Model {model_path.name} has issues: {error_msg}")
            
            # Check if it's a duplicate definition error
            if "Duplicate definition-site" in error_msg or "Duplicate initializer" in error_msg:
                logger.info(f"Attempting to fix duplicate definitions in {model_path.name}")
                
                # Load with ONNX library
                model = onnx.load(str(model_path))
                
                # Try to remove duplicate initializers
                try:
                    from onnxruntime.tools.remove_initializer_from_input import remove_initializer_from_input
                    remove_initializer_from_input(model)
                    
                    # Save the fixed model
                    fixed_path = model_path.parent / f"{model_path.stem}_fixed{model_path.suffix}"
                    onnx.save(model, str(fixed_path))
                    
                    # Test the fixed model
                    try:
                        test_session = ort.InferenceSession(str(fixed_path))
                        logger.info(f"✅ Fixed model {fixed_path.name} loads successfully")
                        model_metadata = _extract_model_metadata(test_session)
                        return fixed_path, model_metadata
                    except Exception as fix_error:
                        logger.warning(f"Fixed model still has issues: {fix_error}")
                        # Remove the failed fix and continue with original
                        fixed_path.unlink(missing_ok=True)
                        
                except Exception as fix_error:
                    logger.warning(f"Could not fix model: {fix_error}")
            
            # If we can't fix it, log the issue but continue with original
            logger.warning(f"Model {model_path.name} has unfixable issues - will be rejected by ONNX Runtime")
            return model_path, {}
            
    except ImportError as import_error:
        logger.warning(f"ONNX validation dependencies not available: {import_error}")
        return model_path, {}
    except Exception as e:
        logger.warning(f"Unexpected error during model validation: {e}")
        return model_path, {}


def _extract_model_metadata(session) -> dict:
    """
    Extract metadata from ONNX session to understand model requirements
    
    Returns:
        Dict with model metadata including input names, types, and architecture hints
    """
    try:
        inputs = session.get_inputs()
        outputs = session.get_outputs()
        
        metadata = {
            "input_names": [inp.name for inp in inputs],
            "output_names": [out.name for out in outputs],
            "input_shapes": {inp.name: inp.shape for inp in inputs},
            "output_shapes": {out.name: out.shape for out in outputs},
            "model_type": _detect_model_type(inputs),
            "requires_token_type_ids": any("token_type_ids" in inp.name for inp in inputs),
            "max_sequence_length": _detect_max_length(inputs)
        }
        
        logger.info(f"Extracted model metadata: {metadata}")
        return metadata
        
    except Exception as e:
        logger.warning(f"Could not extract model metadata: {e}")
        return {}


def _detect_model_type(inputs) -> str:
    """Detect model type based on input names"""
    input_names = [inp.name for inp in inputs]
    
    if "token_type_ids" in input_names:
        return "bert"
    elif "attention_mask" in input_names and len(input_names) == 2:
        return "roberta"
    elif "input_ids" in input_names and len(input_names) == 1:
        return "gpt"
    else:
        return "unknown"


def _detect_max_length(inputs) -> int:
    """Detect maximum sequence length from input shapes"""
    for inp in inputs:
        if "input_ids" in inp.name and len(inp.shape) >= 2:
            # Shape is typically [batch_size, sequence_length]
            return inp.shape[1] if inp.shape[1] > 0 else 512
    return 512  # Default fallback