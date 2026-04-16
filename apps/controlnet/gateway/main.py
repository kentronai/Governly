"""ControlNet Gateway - Main FastAPI Application."""

import asyncio
from contextlib import asynccontextmanager
from gateway.routes import guardrails, policies, cache_admin
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from gateway.config import get_settings
from gateway.logging import setup_logging, get_logger

# Setup logging first
settings = get_settings()
setup_logging(settings.log_level)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler
    
    Simplified startup:
    1. Settings & Redis
    2. Policy cache
    3. Risk Detector (LanceDB for embedding-based routing)
    
    Note: ONNX inference now handled by dedicated remote service
    """
    logger.info("🚀 ControlNet Gateway starting...")
    logger.info("environment", env=settings.environment)
    logger.info("database_configured", url=settings.database_url[:50] + "...")
    
    # =====================================================
    # Step 1: Core Services (Redis, Settings)
    # =====================================================
    
    from .cache import PolicyCache
    
    app.state.settings = settings
    
    # ✅ ROOT FIX: Initialize background tasks list for observability logging
    # This ensures background tasks created by middleware are stored and executed
    app.state.background_tasks = []
    logger.info("✅ Settings loaded")
    logger.info("✅ Background tasks list initialized")
    logger.info("gcs_bucket", bucket=settings.gcs_bucket or "NOT SET")
    logger.info("gcs_model_bucket", bucket=settings.gcs_model_bucket or "NOT SET")
    
    # =====================================================
    # Step 2: Policy Cache
    # =====================================================
    
    policy_cache = PolicyCache(
        redis_url=settings.redis_url,
        default_policy_id=settings.default_policy_id,
        settings=settings
    )
    await policy_cache.initialize()
    app.state.policy_cache = policy_cache
    logger.info("✅ Policy cache initialized")
    
    # =====================================================
    # Step 3: Initialize Risk Detector (SYNCHRONOUSLY!)
    # =====================================================
    
    logger.info("📦 Initializing LanceDB risk detector...")
    try:
        from cga_core.risk_detector import create_risk_detector
        
        if settings.gcs_model_bucket:
            # Initialize risk detector NOW (not in background task)
            # This prevents race conditions with incoming requests
            risk_detector = create_risk_detector(
                gcs_bucket=settings.gcs_model_bucket
            )
            app.state.risk_detector = risk_detector
            logger.info("✅ Risk detector ready (LanceDB auto-embedding)")
        else:
            logger.warning("⚠️  GCS_MODEL_BUCKET not set - risk detection disabled")
            app.state.risk_detector = None
        
    except FileNotFoundError as e:
        logger.error(f"❌ GCP credentials not found: {e}")
        logger.error("")
        logger.error("💡 SETUP INSTRUCTIONS:")
        logger.error("   1. Run: gcloud auth application-default login")
        logger.error("   2. Restart the application")
        logger.error("")
        # Set to None instead of failing - allow app to start
        app.state.risk_detector = None
        
    except Exception as e:
        logger.error(f"❌ Failed to initialize risk detector: {e}")
        logger.error("   Risk detection will be disabled")
        # Set to None instead of failing - graceful degradation
        app.state.risk_detector = None
    
    logger.info("🎉 ControlNet Gateway initialized")
    logger.info("📊 ONNX inference: Remote service (http://onnx-service:8002)")
    
    
    # Start background task to flush fail-open events to database
    async def flush_fail_open_loop():
        """Periodically flush fail-open events to database"""
        from cga_core.observability import flush_fail_open_events
        while True:
            try:
                await asyncio.sleep(60)  # Every 60 seconds
                await flush_fail_open_events()
                logger.debug("Flushed fail-open events to database")
            except Exception as e:
                logger.error(f"Failed to flush fail-open events: {e}")
    
    # ✅ ROOT FIX: Store background task reference to prevent garbage collection
    flush_task = asyncio.create_task(flush_fail_open_loop())
    app.state.background_tasks.append(flush_task)
    logger.info("✅ Fail-open event persistence started (flushes every 60s)")
    
    # ✅ ROOT FIX: Start background task cleanup loop
    # This ensures completed tasks are removed from the list to prevent memory leaks
    async def cleanup_background_tasks():
        """Periodically clean up completed background tasks"""
        while True:
            try:
                await asyncio.sleep(300)  # Every 5 minutes
                if hasattr(app.state, 'background_tasks'):
                    # Remove completed tasks
                    initial_count = len(app.state.background_tasks)
                    app.state.background_tasks = [
                        task for task in app.state.background_tasks 
                        if not task.done()
                    ]
                    removed = initial_count - len(app.state.background_tasks)
                    if removed > 0:
                        logger.debug(f"Cleaned up {removed} completed background tasks")
            except Exception as e:
                logger.error(f"Failed to cleanup background tasks: {e}")
    
    cleanup_task = asyncio.create_task(cleanup_background_tasks())
    app.state.background_tasks.append(cleanup_task)
    logger.info("✅ Background task cleanup started (runs every 5 minutes)")
    
    yield
    
    # Cleanup on shutdown
    logger.info("👋 ControlNet Gateway shutting down...")
    
    # ✅ ROOT FIX: Wait for all background tasks to complete before shutdown
    # This ensures observability logs are written before the app exits
    if hasattr(app.state, 'background_tasks') and app.state.background_tasks:
        logger.info(f"Waiting for {len(app.state.background_tasks)} background tasks to complete...")
        try:
            # Wait up to 10 seconds for tasks to complete
            await asyncio.wait_for(
                asyncio.gather(*app.state.background_tasks, return_exceptions=True),
                timeout=10.0
            )
            logger.info("✅ All background tasks completed")
        except asyncio.TimeoutError:
            logger.warning("⚠️  Some background tasks did not complete within timeout")
        except Exception as e:
            logger.error(f"Error waiting for background tasks: {e}")
    
    # Flush any remaining events on shutdown
    try:
        from cga_core.observability import flush_fail_open_events
        await flush_fail_open_events()
        logger.info("✅ Flushed remaining fail-open events on shutdown")
    except Exception as e:
        logger.error(f"Failed to flush events on shutdown: {e}")
    
    # Close Redis connection pool
    try:
        if hasattr(app.state, 'policy_cache'):
            await app.state.policy_cache.close()
            logger.info("✅ Redis connection pool closed")
    except Exception as e:
        logger.error(f"Failed to close Redis connection: {e}")


# Create FastAPI app
app = FastAPI(
    title="ControlNet Gateway",
    description="AI Governance and Guardrails Gateway with Composable Guard Algebra",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS - Allow all origins since service is behind load balancer
# The web application handles frontend security
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=False,  # Set to False when allowing all origins
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Middleware Stack (Trylon-inspired clean architecture) ===
# Middleware executes in REVERSE order of registration (last registered = first executed)
# Execution flow: Observability → Input Guards → Policy → Auth → Route Handler
from gateway.middleware import (
    ObservabilityMiddleware,
    InputGuardsMiddleware, 
    PolicyMiddleware,
    AuthenticationMiddleware
)

# 1. Observability (outermost - logs everything)
app.add_middleware(ObservabilityMiddleware)

# 2. Input Guards (DISABLED - route handler runs guards to avoid duplicate execution)
# app.add_middleware(InputGuardsMiddleware)

# 3. Policy (loads and caches policies)
app.add_middleware(PolicyMiddleware)

# 4. Authentication (validates tenant/API keys)
app.add_middleware(AuthenticationMiddleware)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "ControlNet Gateway",
        "version": "0.1.0",
        "status": "operational",
        "docs": "/docs"
    }


@app.get("/healthz")
async def health_check():
    """Liveness probe."""
    return {"status": "healthy"}


@app.get("/readyz")
async def readiness_check():
    """Readiness probe - checks if services are loaded."""
    checks = {
        "api": "healthy",
        "database": "not_checked",
        "redis": "not_checked"
    }
    
    # Check embedding service
    if hasattr(app.state, 'embedding_service'):
        checks["embedding_model"] = "ready"
    else:
        checks["embedding_model"] = "not_loaded"
    
    # Determine overall ready status
    critical_checks = [checks.get("api"), checks.get("embedding_model")]
    ready = all(
        v and ("ready" in str(v).lower() or "healthy" in str(v).lower())
        for v in critical_checks
    )
    
    status_code = 200 if ready else 503
    
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ready" if ready else "initializing",
            "checks": checks
        }
    )


@app.get("/health")
async def legacy_health():
    """Legacy health endpoint for compatibility."""
    return await health_check()


@app.get("/v1/models/status")
async def model_status():
    """Get status of all loaded models."""
    import psutil
    
    checks = {
        "embedding_model": "not_loaded",
        "total_models": 0,
        "memory_usage_mb": 0
    }
    
    # Check embedding service
    if hasattr(app.state, 'embedding_service'):
        checks["embedding_model"] = app.state.embedding_service.model_name
    
    # Memory usage
    try:
        process = psutil.Process()
        checks["memory_usage_mb"] = round(process.memory_info().rss / 1024 / 1024, 2)
    except:
        checks["memory_usage_mb"] = 0
    
    return checks


# Import and include routers
try:
    from .routes import chat, debug, policies, router_config, model_download, observability
    app.include_router(chat.router, prefix="/v1")
    app.include_router(debug.router, prefix="/debug")
    app.include_router(guardrails.router, prefix="/v1")
    app.include_router(policies.router, prefix="/v1")
    app.include_router(cache_admin.router, prefix="/v1")  # Cache management API
    app.include_router(router_config.router, prefix="/v1")  # Router configuration API
    app.include_router(model_download.router)  # Model download API (already has /v1/models prefix)
    app.include_router(observability.router, prefix="/v1/observability")  # Observability metrics
    logger.info("✅ All route modules loaded successfully")
except ImportError as e:
    logger.error(f"Failed to import route modules: {e}", exc_info=True)
    # Try to load individual routes to identify which one failed
    try:
        from .routes import router_config
        app.include_router(router_config.router, prefix="/v1")
        logger.info("✅ Router config loaded")
    except Exception as router_error:
        logger.error(f"Failed to load router_config: {router_error}", exc_info=True)


if __name__ == "__main__":
    import os
    import uvicorn
    uvicorn.run(
        "gateway.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=os.getenv("ENVIRONMENT") == "development",
        log_level=os.getenv("LOG_LEVEL", "info").lower()
    )
