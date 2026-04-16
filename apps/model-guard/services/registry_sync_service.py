"""
ONNX Registry Sync Service for ModelGuard.

Syncs approved models to ControlNet's ONNX Registry so they can be used at runtime.
"""

import json
from pathlib import Path
from typing import Any, Dict, Optional
from uuid import UUID

from modelguard_core.types import ModelMetadata


class RegistrySyncService:
    """Service for syncing approved models to ControlNet's ONNX Registry."""
    
    def __init__(self, registry_dir: Optional[str] = None):
        """
        Initialize registry sync service.
        
        Args:
            registry_dir: Directory for ControlNet's ONNX models (default: ../controlnet/models)
        """
        if registry_dir:
            self.registry_dir = Path(registry_dir)
        else:
            # Default: ../controlnet/models from model-guard directory
            self.registry_dir = Path(__file__).parent.parent.parent / "controlnet" / "models"
        
        # Ensure directory exists
        self.registry_dir.mkdir(parents=True, exist_ok=True)
    
    async def sync_approved_model(
        self,
        artifact_id: UUID,
        tenant_id: str,
        model_path: Path,
        metadata: ModelMetadata,
        category: str = "user_uploaded",
        default_threshold: float = 0.7,
        performance_budget_ms: float = 100.0
    ) -> tuple[bool, str]:
        """
        Sync an approved model to ONNX Registry.
        
        Creates a JSON configuration file that ControlNet's ONNXModelRegistry
        will discover and load automatically.
        
        Args:
            artifact_id: Model artifact UUID
            tenant_id: Tenant identifier
            model_path: Path to the model file
            metadata: Model metadata from scan
            category: Model category (default: 'user_uploaded')
            default_threshold: Default confidence threshold
            performance_budget_ms: Performance budget in milliseconds
            
        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            # Generate unique model ID
            model_id = f"scanned_{tenant_id}_{artifact_id}".replace("-", "_")
            
            # Copy model file to ControlNet's models directory
            target_model_path = self.registry_dir / f"{model_id}.onnx"
            
            # Only copy if it's an ONNX model
            if metadata.format.value == "onnx" and model_path.exists():
                import shutil
                shutil.copy2(model_path, target_model_path)
            else:
                return False, f"Only ONNX models can be synced to registry (got: {metadata.format.value})"
            
            # Create ONNX model configuration
            model_config = {
                "id": model_id,
                "name": metadata.description or f"User Model {artifact_id}",
                "description": f"Scanned and approved model from tenant {tenant_id}",
                "category": category,
                "model_path": str(target_model_path),
                "tokenizer_config": {
                    "model_type": "bert",  # Default assumption
                    "vocab_size": 30522,
                    "max_length": 512,
                },
                "labels": ["safe", "unsafe"],  # Default labels
                "default_threshold": default_threshold,
                "performance_budget_ms": performance_budget_ms,
                "accuracy": metadata.accuracy if hasattr(metadata, 'accuracy') else None,
                "model_size_mb": round(metadata.file_size / (1024 * 1024), 2) if metadata.file_size else None,
                "supported_languages": ["en"],
                "source_url": None,
                "license": metadata.license,
                # ModelGuard-specific metadata
                "_modelguard_metadata": {
                    "artifact_id": str(artifact_id),
                    "tenant_id": tenant_id,
                    "scanned": True,
                    "producer": metadata.producer,
                    "version": metadata.version,
                }
            }
            
            # Write configuration JSON file
            config_path = self.registry_dir / f"{model_id}.json"
            with open(config_path, 'w') as f:
                json.dump(model_config, f, indent=2)
            
            return True, f"Model synced to registry: {model_id}"
            
        except Exception as e:
            return False, f"Failed to sync model to registry: {str(e)}"
    
    async def remove_model_from_registry(
        self,
        artifact_id: UUID,
        tenant_id: str
    ) -> tuple[bool, str]:
        """
        Remove a model from ONNX Registry.
        
        Deletes both the model file and configuration JSON.
        
        Args:
            artifact_id: Model artifact UUID
            tenant_id: Tenant identifier
            
        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            model_id = f"scanned_{tenant_id}_{artifact_id}".replace("-", "_")
            
            # Remove model file
            model_path = self.registry_dir / f"{model_id}.onnx"
            if model_path.exists():
                model_path.unlink()
            
            # Remove config file
            config_path = self.registry_dir / f"{model_id}.json"
            if config_path.exists():
                config_path.unlink()
            
            return True, f"Model removed from registry: {model_id}"
            
        except Exception as e:
            return False, f"Failed to remove model from registry: {str(e)}"
    
    def is_synced(self, artifact_id: UUID, tenant_id: str) -> bool:
        """
        Check if a model is currently synced to registry.
        
        Args:
            artifact_id: Model artifact UUID
            tenant_id: Tenant identifier
            
        Returns:
            True if model is in registry, False otherwise
        """
        model_id = f"scanned_{tenant_id}_{artifact_id}".replace("-", "_")
        config_path = self.registry_dir / f"{model_id}.json"
        return config_path.exists()


# Global service instance
_registry_sync_service: Optional[RegistrySyncService] = None


def get_registry_sync_service() -> RegistrySyncService:
    """
    Get or create registry sync service instance.
    
    Returns:
        RegistrySyncService instance
    """
    global _registry_sync_service
    if _registry_sync_service is None:
        _registry_sync_service = RegistrySyncService()
    return _registry_sync_service

