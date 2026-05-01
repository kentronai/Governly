"""
Configuration for ONNX Inference Service

Centralized, validated configuration using pydantic-settings.
Follows same pattern as controlnet gateway for consistency.
"""

from functools import lru_cache
from pydantic import Field, field_validator, AliasChoices
from pydantic_settings import BaseSettings, SettingsConfigDict
import tempfile
from pathlib import Path


class Settings(BaseSettings):
    """
    ONNX Service settings - single source of truth for all configuration
    
    Categories:
    - Environment & Server
    - Database & Cache
    - GCP & Storage
    - Performance & Timeouts
    """
    
    model_config = SettingsConfigDict(
        case_sensitive=False,
        extra="ignore",  # Ignore extra env vars (prevents warnings)
        validate_default=True,
        populate_by_name=True  # Allow using both field names and aliases
    )
    
    # =====================================================
    # Environment & Server
    # =====================================================
    
    environment: str = Field(
        description="Environment: development, staging, production"
    )
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8002, validation_alias=AliasChoices("PORT", "port"), description="Server port (Cloud Run sets PORT=8080)")
    log_level: str = Field(
        description="Application log level"
    )
    
    # =====================================================
    # Database & Cache
    # =====================================================
    
    database_url: str = Field(
        description="PostgreSQL connection string (asyncpg driver)"
    )
    
    redis_url: str = Field(
        description="Redis connection URL"
    )
    
    # =====================================================
    # GCP & Storage
    # =====================================================
    
    gcp_project_id: str = Field(
        default="",
        validation_alias=AliasChoices("GCP_PROJECT_ID", "gcp_project_id"),
        description="GCP project ID (optional when using AWS S3)"
    )
    
    gcs_model_bucket: str = Field(
        default="",
        validation_alias=AliasChoices("GCS_MODEL_BUCKET", "gcs_model_bucket"),
        description="GCS bucket for ONNX models (optional alternative to S3)"
    )

    s3_model_bucket: str = Field(
        default="",
        validation_alias=AliasChoices("S3_MODEL_BUCKET", "s3_model_bucket"),
        description="S3 bucket for ONNX models (optional alternative to GCS)"
    )

    aws_region: str = Field(
        default="us-east-1",
        validation_alias=AliasChoices("AWS_REGION", "aws_region"),
        description="AWS region for S3 model bucket"
    )
    
    onnx_model_cache_path: str = Field(
        validation_alias=AliasChoices("ONNX_MODEL_CACHE_PATH", "onnx_model_cache_path"),
        description="Local path for caching ONNX models"
    )

    transformers_cache: str = Field(
        default_factory=lambda: str(Path(tempfile.gettempdir()) / "transformers_cache"),
        validation_alias=AliasChoices("TRANSFORMERS_CACHE", "transformers_cache"),
        description="Path for Transformers cache (defaults to temp dir)"
    )
    
    # =====================================================
    # Performance & Timeouts
    # =====================================================
    
    max_concurrent_requests: int = Field(
        default=80,
        description="Maximum concurrent inference requests"
    )
    
    inference_timeout: float = Field(
        default=30.0,
        description="Inference timeout in seconds"
    )

    onnx_intra_op_num_threads: int = Field(
        default=1,
        description="ONNX intra-op threads (default: 1 for max throughput)"
    )

    onnx_inter_op_num_threads: int = Field(
        default=1,
        description="ONNX inter-op threads (default: 1 for max throughput)"
    )

    onnx_execution_mode: str = Field(
        default="SEQUENTIAL",
        description="ONNX execution mode: SEQUENTIAL or PARALLEL"
    )
    
    # =====================================================
    # Validators
    # =====================================================
    
    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        """Ensure database URL uses asyncpg driver"""
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v
    
    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        """Validate log level"""
        valid_levels = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        v_upper = v.upper()
        if v_upper not in valid_levels:
            raise ValueError(f"log_level must be one of {valid_levels}")
        return v_upper


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance
    
    This is the recommended way to access settings in your application.
    The settings are cached so they're only loaded once.
    
    Usage:
        from config import get_settings
        
        settings = get_settings()
        print(settings.database_url)
    """
    return Settings()
