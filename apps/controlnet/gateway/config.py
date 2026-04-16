"""
Configuration management for the Guardrails Gateway

Centralized, validated configuration using pydantic-settings.
All environment variables are defined here with proper types and defaults.
"""

from typing import Dict, List, Optional
from functools import lru_cache

from pydantic import Field, field_validator, model_validator, AliasChoices
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings - single source of truth for all configuration
    
    Categories:
    - Environment & Server
    - Database & Cache
    - Authentication (Clerk)
    - LLM Providers
    - GCP & Storage
    - Performance & Timeouts
    - Feature Flags
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
    port: int = Field(default=8000)
    workers: int = Field(default=1)
    log_level: str = Field(
        description="Application log level"
    )
    sql_echo: bool = Field(default=False, description="Echo SQL queries (debug only)")
    
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
    # Authentication (Clerk) - Optional
    # =====================================================
    
    clerk_frontend_api: str = Field(
        default="",
        description="Clerk frontend API domain (e.g., xxx.clerk.accounts.dev)"
    )
    
    clerk_secret_key: str = Field(
        default="",
        description="Clerk secret key for backend validation"
    )
    
    @property
    def clerk_enabled(self) -> bool:
        """Check if Clerk authentication is enabled"""
        return bool(self.clerk_frontend_api and self.clerk_secret_key)
    
    # =====================================================
    # LLM Providers - Optional (for testing/playground)
    # =====================================================
    
    openai_api_key: str = Field(
        default="",
        description="OpenAI API key (optional, for testing)"
    )
    
    anthropic_api_key: str = Field(
        default="",
        description="Anthropic API key (optional)"
    )
    
    # =====================================================
    # GCP & Storage
    # =====================================================
    
    gcp_project_id: str = Field(
        validation_alias=AliasChoices("GCP_PROJECT_ID", "gcp_project_id"),
        description="GCP project ID (required, from GCP_PROJECT_ID env var)"
    )
    
    gcs_bucket: str = Field(
        validation_alias=AliasChoices("GS_BUCKET_NAME", "gcs_bucket"),
        description="GCS bucket for general storage (policies, documents)"
    )
    
    gcs_model_bucket: str = Field(
        validation_alias=AliasChoices("GCS_MODEL_BUCKET", "gcs_model_bucket"),
        description="GCS bucket for ML models (ONNX, embeddings)"
    )
    
    gcs_credentials_path: str = Field(
        default="",
        validation_alias=AliasChoices("GS_CREDENTIALS_PATH", "gcs_credentials_path"),
        description="Path to GCS service account credentials JSON"
    )
    
    kms_key_name: str = Field(
        default="",
        description="GCP KMS key for encryption"
    )
    
    # =====================================================
    # Performance & Timeouts
    # =====================================================
    
    max_concurrent_requests: int = Field(default=100)
    request_timeout: float = Field(default=45.0)
    connect_timeout: float = Field(default=0.4)
    
    # Guard timeouts
    guard_timeout: float = Field(default=0.2)
    input_guard_timeout: float = Field(default=2.0)
    output_guard_timeout: float = Field(default=1.0)
    tool_guard_timeout: float = Field(default=0.2)
    streaming_window_size: int = Field(default=200)
    
    # =====================================================
    # Policy Settings
    # =====================================================
    
    default_policy_id: str = Field(default="enterprise_default_v1")
    policies_dir: str = Field(default="policies")
    
    # =====================================================
    # CORS
    # =====================================================
    
    cors_origins: List[str] = Field(default=["*"])
    
    # =====================================================
    # Layer 0: Embedding Router Settings
    # =====================================================
    
    enable_embedding_router: bool = Field(
        default=True,
        description="Enable embedding-based family routing"
    )
    
    routing_threshold: int = Field(
        default=10,
        description="Min guardrails to enable routing (adaptive)"
    )
    
    embedding_model_name: str = Field(
        default="sentence-transformers/all-MiniLM-L6-v2",
        description="Embedding model for router"
    )
    
    router_top_k: int = Field(
        default=2,
        description="Number of top families to always select"
    )
    
    router_thresholds: Dict[str, float] = Field(
        default_factory=lambda: {
            "safety": 0.30,
            "security": 0.32,
            "privacy": 0.28,
            "accuracy": 0.30,
            "fairness": 0.28,
            "explainability": 0.32,
            "transparency": 0.30,
            "copyright": 0.28
        },
        description="Similarity thresholds per family"
    )
    
    # =====================================================
    # ONNX Detection Settings (Remote Service)
    # =====================================================
    
    onnx_detection_threshold: float = Field(
        default=0.5,
        description="Confidence threshold for ONNX model violations (0.0-1.0)"
    )
    
    max_onnx_model_size_mb: float = Field(
        default=1000.0,
        env="MAX_ONNX_MODEL_SIZE_MB",
        description="Maximum ONNX model file size in MB (default: 1000MB)"
    )
    
    # =====================================================
    # Smart Execution Bounds (Similarity-Based)
    # =====================================================
    
    similarity_lower_bound: float = Field(
        default=0.20,
        description="Skip expensive guards if similarity < this (low risk, safe prompts)"
    )
    
    similarity_upper_bound: float = Field(
        default=0.90,
        description="Skip ONNX verification if similarity > this (high confidence violation)"
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
        from gateway.config import get_settings
        
        settings = get_settings()
        print(settings.database_url)
    """
    return Settings()
