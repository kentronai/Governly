"""
Model Loader - Loads ONNX models from DB on startup

Functional approach with Either for error handling.
Loads all active models into memory for fast inference.
"""

import asyncio
import logging
from typing import Any
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from config import get_settings

logger = logging.getLogger(__name__)


# =====================================================
# Types
# =====================================================

@dataclass(frozen=True)
class ModelSpec:
    """Immutable model specification"""
    model_id: str
    name: str
    storage_url: str
    risk_category: str
    metadata: dict[str, Any] | None = None  # JSON metadata from database


@dataclass(frozen=True)
class LoadedModel:
    """Immutable loaded model"""
    model_id: str
    name: str
    risk_category: str
    session: Any  # ort.InferenceSession
    tokenizer: Any  # Pre-loaded tokenizer object
    input_names: list[str]
    output_names: list[str]
    tokenizer_name: str = "bert-base-uncased"  # Default tokenizer
    class_labels: list[str] | None = None  # Class labels from metadata
    label_mapping: dict[str, str] | None = None  # Label mapping from metadata


# =====================================================
# Model Configuration (Tokenizer mappings)
# =====================================================

# Map risk categories to their tokenizer models
# Reference: https://huggingface.co/onnx-community/piiranha-v1-detect-personal-information-ONNX
TOKENIZER_MAP = {
    # PII: Piiranha model (base: microsoft/mdeberta-v3-base, requires sentencepiece)
    "pii": "microsoft/mdeberta-v3-base",  
    # Jailbreak: protectai/deberta-v3-base-prompt-injection-v2 (base: microsoft/deberta-v3-base)
    "jailbreak": "microsoft/deberta-v3-base",
    "toxicity": "bert-base-uncased",
    "bias": "bert-base-uncased",
    "hate": "bert-base-uncased",
    # Add more mappings as needed
}


def get_tokenizer_for_risk_category(risk_category: str) -> str:
    """Get appropriate tokenizer for risk category"""
    return TOKENIZER_MAP.get(risk_category, "bert-base-uncased")


# =====================================================
# Model Cache (Global state for preloaded models)
# =====================================================

_model_cache: dict[str, LoadedModel] = {}


def get_cached_model(model_id: str) -> LoadedModel | None:
    """Get cached model by ID"""
    return _model_cache.get(model_id)


def get_cached_model_by_category(risk_category: str) -> LoadedModel | None:
    """Get cached model by risk category"""
    for model in _model_cache.values():
        if model.risk_category == risk_category:
            return model
    return None


def cache_model(model: LoadedModel) -> None:
    """Cache loaded model"""
    _model_cache[model.model_id] = model
    logger.info(f"✅ Cached model: {model.model_id} ({model.name}) for {model.risk_category}")


def get_cache_stats() -> dict[str, Any]:
    """Get cache statistics"""
    return {
        "total_models": len(_model_cache),
        "models": [
            {
                "model_id": m.model_id,
                "name": m.name,
                "risk_category": m.risk_category
            }
            for m in _model_cache.values()
        ]
    }


# =====================================================
# Pure Functions
# =====================================================

async def fetch_active_models(db_session: AsyncSession) -> list[ModelSpec]:
    """
    Fetch all active ONNX models from database
    
    Pure function: DB → list of model specs
    """
    try:
        logger.info("🔍 Querying database for active models...")
        
        # Test connection first with timeout
        await asyncio.wait_for(
            db_session.execute(text("SELECT 1")),
            timeout=10.0
        )
        logger.info("✅ Database connection test successful")
        
        # First, check if we have any active models at all
        logger.info("📊 Checking for active models...")
        count_query = text("SELECT COUNT(*) as count FROM onnx_models WHERE is_active = true")
        count_result = await asyncio.wait_for(
            db_session.execute(count_query),
            timeout=10.0
        )
        count_row = count_result.fetchone()
        active_count = count_row[0] if count_row else 0
        logger.info(f"📊 Found {active_count} active models in onnx_models table")
        
        # Check if we have any risk_category_links
        logger.info("📊 Checking risk_category_links...")
        links_query = text("SELECT COUNT(*) as count FROM risk_category_links WHERE entity_type = 'onnx_model'")
        links_result = await asyncio.wait_for(
            db_session.execute(links_query),
            timeout=10.0
        )
        links_row = links_result.fetchone()
        links_count = links_row[0] if links_row else 0
        logger.info(f"📊 Found {links_count} risk_category_links for onnx_model")
        
        # Now execute the main query
        query = text("""
            SELECT DISTINCT
                om.model_id,
                om.name,
                om.storage_url,
                rc.slug as risk_category,
                om.metadata
            FROM onnx_models om
            INNER JOIN risk_category_links rcl ON rcl.entity_id = om.id
            INNER JOIN risk_categories rc ON rc.id = rcl.category_id
            WHERE om.is_active = true
              AND rcl.entity_type = 'onnx_model'
              AND om.storage_url IS NOT NULL
              AND LENGTH(om.storage_url) > 0
            ORDER BY rc.slug, om.model_id
        """)
        
        logger.info("📝 Executing main query...")
        result = await asyncio.wait_for(
            db_session.execute(query),
            timeout=30.0
        )
        logger.info("✅ Query executed, fetching rows...")
        rows = result.fetchall()
        logger.info(f"✅ Fetched {len(rows)} rows from database")
        
        import json
        
        models = []
        for row in rows:
            # Parse metadata JSON if present
            metadata = None
            if row.metadata:
                try:
                    if isinstance(row.metadata, str):
                        metadata = json.loads(row.metadata)
                    else:
                        metadata = row.metadata  # Already a dict (JSONB from PostgreSQL)
                except (json.JSONDecodeError, TypeError) as e:
                    logger.warning(f"Failed to parse metadata for {row.model_id}: {e}")
                    metadata = None
            
            models.append(
                ModelSpec(
                    model_id=row.model_id,
                    name=row.name,
                    storage_url=row.storage_url,
                    risk_category=row.risk_category,
                    metadata=metadata
                )
            )
        
        logger.info(f"📊 Found {len(models)} active models in database")
        for model in models:
            logger.info(f"  - {model.model_id}: {model.name} ({model.risk_category})")
        
        return models
    except asyncio.TimeoutError as e:
        error_msg = "Database query timed out after 30 seconds"
        logger.error(f"❌ {error_msg}", exc_info=True)
        raise RuntimeError(error_msg) from e
    except Exception as e:
        logger.error(f"❌ Database query failed: {e}", exc_info=True)
        raise


def load_model_from_storage(spec: ModelSpec, cache_dir: Path) -> LoadedModel:
    """
    Load ONNX model from object storage (GCS or S3)
    
    Pure function: ModelSpec → LoadedModel
    Raises on failure (fail-fast)
    """
    import onnxruntime as ort
    from urllib.parse import urlparse
    
    # GCS credentials: Uses Application Default Credentials (ADC) automatically
    # - Cloud Run: Uses service account attached to Cloud Run service
    # - Local dev: Uses gcloud auth credentials
    # - Cloud Build: Uses Cloud Build service account
    
    parsed = urlparse(spec.storage_url)
    if parsed.scheme not in {"gs", "s3"}:
        raise ValueError(f"Unsupported model storage URL scheme: {spec.storage_url}")

    bucket_name = parsed.netloc
    blob_path = parsed.path.lstrip("/")
    if not bucket_name or not blob_path:
        raise ValueError(f"Invalid storage URL format: {spec.storage_url}")
    
    # Setup cache path
    cache_file = cache_dir / f"{spec.model_id}.onnx"
    
    # Always ensure model is on disk (ONNX Runtime works better with file paths)
    if not cache_file.exists():
        from config import get_settings

        settings = get_settings()

        if parsed.scheme == "gs":
            from google.cloud import storage

            logger.info(f"💾 Downloading from GCS: {spec.storage_url}")
            client = storage.Client(project=settings.gcp_project_id)
            logger.info(f"🔑 Using ADC for GCS access in project: {settings.gcp_project_id}")

            bucket = client.bucket(bucket_name)
            blob = bucket.blob(blob_path)
            model_bytes = blob.download_as_bytes()
        else:
            import boto3

            logger.info(f"💾 Downloading from S3: {spec.storage_url}")
            s3_client = boto3.client("s3", region_name=settings.aws_region)
            response = s3_client.get_object(Bucket=bucket_name, Key=blob_path)
            model_bytes = response["Body"].read()

        # Save to disk cache
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_bytes(model_bytes)
        logger.info(f"💾 Saved to cache: {cache_file}")
    else:
        logger.info(f"⚡ Loading from disk cache: {cache_file}")
    
    # Verify file exists and is readable
    if not cache_file.exists() or cache_file.stat().st_size == 0:
        raise RuntimeError(f"Model file not found or empty: {cache_file}")
    
    # Create ONNX session from file path (more reliable than bytes)
    logger.info(f"🔧 Creating ONNX InferenceSession from: {cache_file}")
    session_options = ort.SessionOptions()
    # Optimize for high concurrency on Cloud Run (limited vCPUs)
    # Use sequential execution to minimize context switching and thread contention
    # Configurable via settings for tuning
    settings = get_settings()
    session_options.intra_op_num_threads = settings.onnx_intra_op_num_threads
    session_options.inter_op_num_threads = settings.onnx_inter_op_num_threads
    
    if settings.onnx_execution_mode.upper() == "PARALLEL":
        session_options.execution_mode = ort.ExecutionMode.ORT_PARALLEL
    else:
        session_options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        
    session_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    
    logger.info(f"⚙️  ORT Config: intra={settings.onnx_intra_op_num_threads}, inter={settings.onnx_inter_op_num_threads}, mode={settings.onnx_execution_mode}")
    
    # Use file path instead of bytes - ONNX Runtime handles this more reliably
    session = ort.InferenceSession(
        str(cache_file),
        sess_options=session_options,
        providers=['CPUExecutionProvider']
    )
    logger.info(f"✅ ONNX InferenceSession created successfully")
    
    # Extract metadata
    input_names = [i.name for i in session.get_inputs()]
    output_names = [o.name for o in session.get_outputs()]
    
    # Get appropriate tokenizer for this risk category
    tokenizer_name = get_tokenizer_for_risk_category(spec.risk_category)
    logger.info(f"Using tokenizer: {tokenizer_name} for {spec.risk_category}")

    # Initialize tokenizer once
    from transformers import AutoTokenizer
    
    settings = get_settings()
    cache_dir_transformers = settings.transformers_cache
    
    # Note: Environment variables are set in main.py startup
    # We still pass cache_dir explicitly for safety

    tokenizer = AutoTokenizer.from_pretrained(
        tokenizer_name,
        cache_dir=cache_dir_transformers,
        use_fast=False  # Use slow tokenizer for better compatibility
    )
    logger.info(f"✅ Tokenizer initialized for {spec.risk_category}")
    
    # Extract class_labels and label_mapping from metadata
    class_labels = None
    label_mapping = None
    if spec.metadata:
        class_labels = spec.metadata.get("class_labels")
        label_mapping = spec.metadata.get("label_mapping")
        if label_mapping:
            # Convert string keys to int keys for easier lookup
            label_mapping = {int(k): v for k, v in label_mapping.items()}
            logger.info(f"✅ Loaded label_mapping for {spec.risk_category}: {label_mapping}")
        if class_labels:
            logger.info(f"✅ Loaded class_labels for {spec.risk_category}: {class_labels}")
        if not class_labels and not label_mapping:
            logger.warning(f"⚠️  No class_labels or label_mapping found in metadata for {spec.risk_category}")
    
    return LoadedModel(
        model_id=spec.model_id,
        name=spec.name,
        risk_category=spec.risk_category,
        session=session,
        tokenizer=tokenizer,
        input_names=input_names,
        output_names=output_names,
        tokenizer_name=tokenizer_name,
        class_labels=class_labels,
        label_mapping=label_mapping
    )


# =====================================================
# Orchestration (High-level control flow)
# =====================================================

async def preload_all_models(db_session: AsyncSession, cache_dir: Path) -> dict[str, Any]:
    """
    Preload all active models on startup
    
    Orchestration function: fetches specs, loads models, caches them
    Returns stats about loaded models
    """
    import time
    
    start_time = time.time()
    logger.info(f"🚀 preload_all_models started at {start_time}")
    
    # Fetch model specs from DB
    logger.info("📞 Calling fetch_active_models...")
    try:
        model_specs = await fetch_active_models(db_session)
        logger.info(f"✅ fetch_active_models returned {len(model_specs) if model_specs else 0} models")
    except Exception as e:
        logger.error(f"❌ fetch_active_models failed: {e}", exc_info=True)
        raise
    
    if not model_specs:
        logger.warning("⚠️  No active models found in database")
        return {"total_models": 0, "models": [], "load_time_seconds": 0}
    
    # Load each model
    loaded_count = 0
    failed_count = 0
    
    for spec in model_specs:
        try:
            logger.info(f"🔄 Loading model: {spec.model_id} ({spec.name})")
            loaded_model = load_model_from_storage(spec, cache_dir)
            cache_model(loaded_model)
            loaded_count += 1
        except Exception as e:
            logger.error(f"❌ Failed to load {spec.model_id}: {e}")
            failed_count += 1
            # Continue loading other models (partial failure is ok)
    
    elapsed = time.time() - start_time
    
    logger.info(f"✅ Preloaded {loaded_count} models in {elapsed:.1f}s (failed: {failed_count})")
    
    return {
        "total_models": loaded_count,
        "failed_models": failed_count,
        "load_time_seconds": round(elapsed, 2),
        "models": [
            {
                "model_id": m.model_id,
                "name": m.name,
                "risk_category": m.risk_category
            }
            for m in _model_cache.values()
        ]
    }

