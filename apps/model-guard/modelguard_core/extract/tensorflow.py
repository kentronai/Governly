"""
TensorFlow model extractor.

This module provides functionality to extract metadata and analyze
TensorFlow SavedModel format.
"""

from pathlib import Path
from typing import Any, Dict, List, Optional

from ..types import ModelMetadata, ModelFormat, SBOMComponent, ExternalSource


class TensorFlowExtractor:
    """Extracts metadata and analyzes TensorFlow models."""
    
    def __init__(self, model_data: bytes):
        """
        Initialize TensorFlow extractor with model data.
        
        Args:
            model_data: Raw TensorFlow model data
        """
        self.model_data = model_data
        self.model_info: Dict[str, Any] = {}
        self._analyze_model()
    
    def _analyze_model(self) -> None:
        """Analyze TensorFlow model structure."""
        try:
            # Try to parse as protobuf
            import tensorflow as tf
            
            # This is a simplified analysis
            # Real implementation would need to properly parse SavedModel directory structure
            self.model_info['tensorflow_available'] = True
            self.model_info['format'] = 'tensorflow'
            
        except ImportError:
            # TensorFlow not available - do basic analysis
            self.model_info['tensorflow_available'] = False
            self.model_info['format'] = 'tensorflow'
            
            # Check for protobuf structure
            if self.model_data[:4] == b'\x08\x01\x12':
                self.model_info['is_protobuf'] = True
            else:
                self.model_info['is_protobuf'] = False
    
    def extract_metadata(self) -> ModelMetadata:
        """
        Extract metadata from TensorFlow model.
        
        Returns:
            ModelMetadata object with extracted information
        """
        return ModelMetadata(
            format=ModelFormat.TENSORFLOW,
            version='unknown',
            producer='TensorFlow',
            description='TensorFlow SavedModel',
            input_shapes=[],
            output_shapes=[],
            operators=[],
            custom_operators=[],
            external_data=[],
            file_size=len(self.model_data)
        )
    
    def generate_sbom(self) -> List[SBOMComponent]:
        """
        Generate Software Bill of Materials for TensorFlow model.
        
        Returns:
            List of SBOM components
        """
        components = [
            SBOMComponent(
                name='tensorflow',
                type='runtime',
                description='TensorFlow runtime for model execution',
                purl='pkg:pypi/tensorflow'
            )
        ]
        
        return components
    
    def get_external_sources(self) -> List[ExternalSource]:
        """
        Get external data sources referenced by the model.
        
        Returns:
            List of external sources
        """
        # Would need to analyze SavedModel structure for external data
        return []
    
    def validate_model(self) -> List[str]:
        """
        Validate TensorFlow model structure and return any issues.
        
        Returns:
            List of validation issues
        """
        issues = []
        
        if not self.model_info.get('is_protobuf'):
            issues.append("Model may not be valid TensorFlow protobuf format")
        
        if not self.model_info.get('tensorflow_available'):
            issues.append("TensorFlow library not available for full validation")
        
        return issues
