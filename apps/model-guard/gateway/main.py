"""
FastAPI application for ModelGuard service.

This module sets up the FastAPI application with middleware, routes,
and lifecycle management.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging

from gateway.config import get_settings
from gateway.db import init_db, close_db
from gateway.routes import scans, reports, bias_detection


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    """
    Application lifespan manager.
    
    Handles startup and shutdown events.
    """
    # Startup
    logger.info("Starting ModelGuard service...")
    settings = get_settings()
    logger.info(f"Environment: {settings.environment}")
    logger.info(f"Port: {settings.port}")
    
    try:
        await init_db()
        logger.info("Database initialized")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
    
    yield
    
    # Shutdown
    logger.info("Shutting down ModelGuard service...")
    try:
        await close_db()
        logger.info("Database connections closed")
    except Exception as e:
        logger.error(f"Error closing database: {e}")


def create_app() -> FastAPI:
    """
    Create and configure FastAPI application.
    
    Returns:
        Configured FastAPI application
    """
    settings = get_settings()
    
    app = FastAPI(
        title="ModelGuard API",
        description="AI Model Security Scanner - Scan ML models for security vulnerabilities",
        version=settings.service_version,
        docs_url="/docs" if settings.debug else None,
        redoc_url="/redoc" if settings.debug else None,
        lifespan=lifespan
    )
    
    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=settings.cors_allow_methods,
        allow_headers=settings.cors_allow_headers,
    )
    
    # Add request ID middleware
    @app.middleware("http")
    async def add_request_id(request: Request, call_next):
        import uuid
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
    
    # Add logging middleware
    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        logger.info(f"{request.method} {request.url.path}")
        response = await call_next(request)
        logger.info(f"{request.method} {request.url.path} - {response.status_code}")
        return response
    
    # Global exception handler
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.error(f"Unhandled exception: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "error": "internal_server_error",
                "message": "An internal error occurred",
                "request_id": getattr(request.state, "request_id", None)
            }
        )
    
    # Health check endpoint
    @app.get("/health")
    async def health_check():
        """Health check endpoint."""
        return {
            "status": "healthy",
            "service": settings.service_name,
            "version": settings.service_version,
            "environment": settings.environment
        }
    
    # Root endpoint
    @app.get("/")
    async def root():
        """Root endpoint with API information."""
        return {
            "service": settings.service_name,
            "version": settings.service_version,
            "docs": "/docs" if settings.debug else None,
            "health": "/health"
        }
    
    # Debug JWT endpoint (development only)
    @app.get("/debug/jwt")
    async def debug_jwt(request: Request):
        """Debug endpoint to test JWT validation."""
        if settings.environment != "development":
            raise HTTPException(status_code=404, detail="Not found")
        
        auth_header = request.headers.get("authorization", "")
        if not auth_header:
            return {
                "error": "No authorization header provided",
                "usage": "Add 'Authorization: Bearer <your-jwt-token>' header"
            }
        
        try:
            from gateway.jwt_utils import validate_clerk_jwt
            user_info = validate_clerk_jwt(auth_header)
            return {
                "status": "success",
                "user_info": user_info,
                "environment": settings.environment,
                "clerk_config": {
                    "has_secret_key": bool(settings.clerk_secret_key),
                    "has_frontend_api": bool(getattr(settings, 'clerk_frontend_api', None))
                }
            }
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "error_type": type(e).__name__,
                "environment": settings.environment,
                "clerk_config": {
                    "has_secret_key": bool(settings.clerk_secret_key),
                    "has_frontend_api": bool(getattr(settings, 'clerk_frontend_api', None))
                }
            }
    
    # Include routers
    app.include_router(
        scans.router,
        prefix="/modelguard/scan",
        tags=["scans"]
    )
    
    app.include_router(
        reports.router,
        prefix="/modelguard/reports",
        tags=["reports"]
    )
    
    app.include_router(
        bias_detection.router,
        prefix="/modelguard/bias-detection",
        tags=["bias-detection"]
    )
    
    logger.info("ModelGuard API initialized")
    
    return app


# Create app instance
app = create_app()


if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower()
    )
