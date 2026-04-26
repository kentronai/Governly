"""
Configuration management for ModelGuard service.

This module handles application configuration from environment variables
and provides typed access to configuration values.
"""

import os
from typing import Optional

from pydantic import Field, AliasChoices
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        case_sensitive=False,
        extra="ignore",
        populate_by_name=True
    )
    
    # Service Configuration
    service_name: str = "ModelGuard"
    service_version: str = "1.0.0"
    environment: str = Field(default="development")
    port: int = Field(default=8001, validation_alias=AliasChoices("PORT", "port"))
    host: str = "0.0.0.0"
    debug: bool = False
    
    # Database Configuration
    database_url: str = Field(default="postgresql://postgres:postgres@localhost:5432/ai_governance")
    database_pool_size: int = 10
    database_max_overflow: int = 20
    database_pool_timeout: int = 30
    database_pool_recycle: int = 3600  # Recycle connections every hour
    
    # Redis Configuration
    redis_url: str = Field(default="redis://localhost:6379/0")
    redis_ttl: int = 3600  # 1 hour
    
    # Authentication
    clerk_secret_key: Optional[str] = None
    clerk_publishable_key: Optional[str] = None
    api_key_header: str = "X-API-Key"
    
    # Storage Configuration
    temp_storage_dir: str = "/tmp/modelguard"
    max_upload_size_mb: int = 500
    max_download_size_mb: int = 2000  # 2GB limit for downloads
    enable_streaming_scan: bool = True  # Stream large files instead of full download
    
    # Scanning Configuration
    scan_timeout_seconds: int = 300  # 5 minutes
    max_concurrent_scans: int = 5
    enable_pickle_scanning: bool = True
    enable_backdoor_scanning: bool = True
    enable_metadata_validation: bool = True
    
    # HuggingFace Configuration
    hf_token: Optional[str] = None
    hf_cache_dir: Optional[str] = None
    
    # AWS Configuration (for S3)
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None
    aws_region: str = Field(
        default="us-east-1",
        validation_alias=AliasChoices("AWS_REGION", "aws_region"),
    )
    s3_bucket_name: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("S3_MODEL_BUCKET", "s3_bucket_name"),
        description="S3 bucket for model artifacts (preferred over GCS when set)",
    )

    # Google Cloud Storage Configuration (legacy, kept for back-compat)
    gs_project_id: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("GCP_PROJECT_ID", "gs_project_id")
    )
    gs_bucket_name: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("GS_BUCKET_NAME", "gs_bucket_name")
    )
    gs_credentials_path: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("GS_CREDENTIALS_PATH", "gs_credentials_path")
    )
    
    # CORS Configuration
    cors_origins: list[str] = ["http://localhost:3000"]
    cors_allow_credentials: bool = True
    cors_allow_methods: list[str] = ["*"]
    cors_allow_headers: list[str] = ["*"]
    
    # Logging Configuration
    log_level: str = "INFO"
    log_format: str = "json"


# Global settings instance
_settings: Optional[Settings] = None


def get_settings() -> Settings:
    """
    Get application settings singleton.
    
    Returns:
        Settings instance
    """
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
