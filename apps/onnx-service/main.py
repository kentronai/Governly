"""
ONNX Inference Service - Main Application

Lightweight, high-performance ONNX inference service.
Loads models on startup and serves fast inference via HTTP.
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from config import get_settings
from logging_config import setup_logging, get_logger
from middleware import LoggingMiddleware
from db import get_session
from model_loader import preload_all_models, get_cache_stats
from inference import run_inference, run_batch_inference, InferenceRequest

# Setup logging
settings = get_settings()
setup_logging(settings.log_level)
logger = get_logger(__name__)


# =====================================================
# Request/Response Models
# =====================================================

class InferRequest(BaseModel):
    """Single inference request"""
    prompt: str = Field(..., description="Text to analyze")
    risk_category: str = Field(..., description="Risk category (e.g., toxicity, jailbreak)")


class BatchInferRequest(BaseModel):
    """Batch inference request"""
    prompt: str = Field(..., description="Text to analyze")
    risk_categories: list[str] = Field(..., description="List of risk categories")


class InferResponse(BaseModel):
    """Inference response"""
    model_id: str
    model_name: str
    risk_category: str
    predictions: list[dict]
    max_confidence: float
    latency_ms: float


class BatchInferResponse(BaseModel):
    """Batch inference response"""
    results: dict[str, InferResponse]
    total_latency_ms: float


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    service: str
    models_loaded: int


class CacheStatsResponse(BaseModel):
    """Cache statistics response"""
    total_models: int
    models: list[dict]


# =====================================================
# Lifespan Management
# =====================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan manager - runs on startup and shutdown
    
    Startup: 
    1. Initialize Redis cache
    2. Preload all models from DB
    
    Shutdown: 
    1. Cleanup Redis connections
    """
    import os
    
    # GCS credentials: Uses Application Default Credentials (ADC) automatically
    # - Cloud Run: Uses service account attached to Cloud Run service
    # - Local dev: Uses gcloud auth credentials
    # - Cloud Build: Uses Cloud Build service account
    logger.info("🔑 Using GCS credentials from ADC (Application Default Credentials)")
    logger.info("🚀 Starting ONNX Inference Service")
    logger.info(f"📊 Config: {settings.log_level} logging, cache at {settings.onnx_model_cache_path}")
    
    # =====================================================
    # Step 0: Setup Environment
    # =====================================================
    
    # Set transformers cache path from settings
    # This ensures all Hugging Face libraries use the correct writable path
    cache_dir_transformers = settings.transformers_cache
    Path(cache_dir_transformers).mkdir(parents=True, exist_ok=True)
    
    logger.info(f"🔧 Config: transformers_cache at {cache_dir_transformers}")
    
    # =====================================================
    # Step 1: Initialize Redis Cache
    # =====================================================
    
    from cache import InferenceCache, set_inference_cache
    
    inference_cache = InferenceCache(redis_url=settings.redis_url)
    await inference_cache.initialize()
    set_inference_cache(inference_cache)
    app.state.inference_cache = inference_cache
    logger.info("✅ Redis inference cache initialized")
    
    # =====================================================
    # Step 2: Preload Models
    # =====================================================
    
    # Create cache directory
    cache_dir = Path(settings.onnx_model_cache_path)
    cache_dir.mkdir(parents=True, exist_ok=True)
    
    # Preload models on startup
    import asyncio
    
    try:
        logger.info("📦 Preloading models from database...")
        logger.info(f"🔌 Database URL: {settings.database_url.split('@')[1] if '@' in settings.database_url else 'hidden'}")
        
        async def _preload_models():
            async with get_session() as db_session:
                logger.info("✅ Database session created, fetching models...")
                stats = await preload_all_models(db_session, cache_dir)
                logger.info(f"✅ Preloaded {stats['total_models']} models in {stats['load_time_seconds']}s")
                
                if stats['total_models'] == 0:
                    logger.warning("⚠️  No models loaded! Service will return errors for inference requests.")
        
        # Wrap entire preload operation in timeout (60 seconds total)
        await asyncio.wait_for(_preload_models(), timeout=60.0)
            
    except asyncio.TimeoutError:
        error_msg = "Model preloading timed out after 60 seconds"
        logger.error(f"❌ {error_msg}", exc_info=True)
        logger.warning("⚠️  Starting service anyway - models will load on first request")
    except Exception as e:
        logger.error(f"❌ Failed to preload models: {e}", exc_info=True)
        logger.warning("⚠️  Starting service anyway - models will load on first request")
    
    logger.info("✅ ONNX Inference Service ready")
    
    yield
    
    # =====================================================
    # Cleanup on shutdown
    # =====================================================
    
    logger.info("👋 Shutting down ONNX Inference Service")
    
    # Close Redis connection pool
    try:
        if hasattr(app.state, 'inference_cache'):
            await app.state.inference_cache.close()
            logger.info("✅ Redis connection pool closed")
    except Exception as e:
        logger.error(f"Failed to close Redis connection: {e}")


# =====================================================
# FastAPI App
# =====================================================

app = FastAPI(
    title="ONNX Inference Service",
    description="High-performance ONNX model inference for AI governance",
    version="1.7.1",
    lifespan=lifespan
)

# Add middleware
app.add_middleware(LoggingMiddleware)


# =====================================================
# Routes
# =====================================================

@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint"""
    stats = get_cache_stats()
    return HealthResponse(
        status="healthy",
        service="onnx-inference",
        models_loaded=stats["total_models"]
    )


@app.get("/healthz", response_model=HealthResponse)
async def healthz():
    """Kubernetes health check"""
    return await health()


@app.get("/cache/stats", response_model=CacheStatsResponse)
async def cache_stats():
    """Get cache statistics (models + Redis)"""
    stats = get_cache_stats()
    
    # Add Redis cache stats
    try:
        from cache import get_inference_cache
        inference_cache = get_inference_cache()
        if inference_cache:
            redis_stats = await inference_cache.get_stats()
            stats["redis"] = redis_stats
    except Exception as e:
        logger.warning(f"Failed to get Redis stats: {e}")
        stats["redis"] = {"error": str(e)}
    
    return CacheStatsResponse(
        total_models=stats["total_models"],
        models=stats["models"]
    )


@app.post("/infer", response_model=InferResponse)
async def infer(request: InferRequest):
    """
    Run inference for a single risk category
    
    Fast inference using preloaded models + async Redis cache.
    Returns predictions with confidence scores.
    """
    try:
        # Create inference request
        inference_req = InferenceRequest(
            prompt=request.prompt,
            risk_category=request.risk_category
        )
        
        # Run inference (ASYNC - no blocking!)
        from inference import run_inference_async
        result = await run_inference_async(inference_req)
        
        return InferResponse(
            model_id=result.model_id,
            model_name=result.model_name,
            risk_category=result.risk_category,
            predictions=result.predictions,
            max_confidence=result.max_confidence,
            latency_ms=result.latency_ms
        )
        
    except ValueError as e:
        # Model not found or invalid input
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Inference failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Inference failed: {e}")


@app.post("/infer/batch", response_model=BatchInferResponse)
async def infer_batch(request: BatchInferRequest):
    """
    Run inference for multiple risk categories
    
    Processes multiple risk categories for the same prompt.
    Returns results for each category (partial success allowed).
    """
    import time
    
    try:
        start_time = time.time()
        
        # ✅ Run batch inference ASYNC - no blocking!
        from inference import run_batch_inference_async
        results = await run_batch_inference_async(
            prompts=[request.prompt],
            risk_categories=request.risk_categories
        )
        
        total_latency_ms = (time.time() - start_time) * 1000
        
        # Convert to response format
        response_results = {
            risk_category: InferResponse(
                model_id=result.model_id,
                model_name=result.model_name,
                risk_category=result.risk_category,
                predictions=result.predictions,
                max_confidence=result.max_confidence,
                latency_ms=result.latency_ms
            )
            for risk_category, result in results.items()
        }
        
        return BatchInferResponse(
            results=response_results,
            total_latency_ms=total_latency_ms
        )
        
    except Exception as e:
        logger.error(f"Batch inference failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch inference failed: {e}")


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "onnx-inference",
        "version": "1.7.1",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "inference": "/infer",
            "batch_inference": "/infer/batch",
            "cache_stats": "/cache/stats",
            "cache_clear": "/cache/clear"
        }
    }


@app.post("/cache/clear")
async def clear_cache(risk_category: str | None = None):
    """
    Clear inference cache
    
    Args:
        risk_category: Optional risk category to clear (clears all if not specified)
    """
    try:
        from cache import get_inference_cache
        inference_cache = get_inference_cache()
        
        if not inference_cache:
            raise HTTPException(status_code=503, detail="Cache not available")
        
        deleted_count = await inference_cache.clear_cache(risk_category)
        
        return JSONResponse(content={
            "status": "success",
            "message": f"Cleared {deleted_count} cached results",
            "risk_category": risk_category or "all"
        })
    except Exception as e:
        logger.error(f"Failed to clear cache: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to clear cache: {e}")


# =====================================================
# Error Handlers
# =====================================================

@app.exception_handler(404)
async def not_found_handler(request, exc):
    """Custom 404 handler"""
    return JSONResponse(
        status_code=404,
        content={
            "error": "not_found",
            "message": str(exc.detail) if hasattr(exc, "detail") else "Not found"
        }
    )


@app.exception_handler(500)
async def server_error_handler(request, exc):
    """Custom 500 handler"""
    logger.error(f"Server error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_server_error",
            "message": "Internal server error"
        }
    )


if __name__ == "__main__":
    import uvicorn
    import os
    
    # Cloud Run sets PORT env var - use it if available
    port = int(os.getenv("PORT", settings.port))
    
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=port,
        log_level=settings.log_level.lower(),
        reload=False  # Disable reload in production
    )

