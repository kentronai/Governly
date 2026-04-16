"""
TensorFlow Lite model extractor.

This module provides functionality to extract metadata and analyze
TensorFlow Lite models.
"""

import struct
from typing import Any, Dict, List, Optional

from ..types import ModelMetadata, ModelFormat, SBOMComponent, ExternalSource


class TFLiteExtractor:
    """Extracts metadata and analyzes TensorFlow Lite models."""
    
    TFLITE_MAGIC = b'TFL3'
    
    def __init__(self, model_data: bytes):
        """
        Initialize TFLite extractor with model data.
        
        Args:
            model_data: Raw TFLite model data
        """
        self.model_data = model_data
        self.model_info: Dict[str, Any] = {}
        self._parse_header()
    
    def _parse_header(self) -> None:
        """Parse TFLite file header."""
        if len(self.model_data) < 8:
            raise RuntimeError("File too small to be a valid TFLite file")
        
        # Check magic bytes (should be at end of file for FlatBuffers)
        # TFLite uses FlatBuffers format
        magic = self.model_data[-4:]
        if magic != self.TFLITE_MAGIC:
            # Try checking beginning
            magic = self.model_data[:4]
            if magic != self.TFLITE_MAGIC:
                # Could still be valid TFLite, just different version
                self.model_info['magic_valid'] = False
            else:
                self.model_info['magic_valid'] = True
        else:
            self.model_info['magic_valid'] = True
    
    def extract_metadata(self) -> ModelMetadata:
        """
        Extract metadata from TFLite model.
        
        Returns:
            ModelMetadata object with extracted information
        """
        return ModelMetadata(
            format=ModelFormat.TFLITE,
            version='unknown',
            producer='TensorFlow Lite',
            description='TensorFlow Lite model',
            input_shapes=[],
            output_shapes=[],
            operators=[],
            custom_operators=[],
            external_data=[],
            file_size=len(self.model_data)
        )
    
    def generate_sbom(self) -> List[SBOMComponent]:
        """
        Generate Software Bill of Materials for TFLite model.
        
        Returns:
            List of SBOM components
        """
        components = [
            SBOMComponent(
                name='tensorflow-lite',
                type='runtime',
                description='TensorFlow Lite runtime for model execution',
                purl='pkg:pypi/tensorflow-lite'
            )
        ]
        
        return components
    
    def get_external_sources(self) -> List[ExternalSource]:
        """
        Get external data sources referenced by the model.
        
        Returns:
            List of external sources
        """
        # TFLite models typically don't have external data
        return []
    
    def validate_model(self) -> List[str]:
        """
        Validate TFLite model structure and return any issues.
        
        Returns:
            List of validation issues
        """
        issues = []
        
        if not self.model_info.get('magic_valid'):
            issues.append("TFLite magic bytes not found - file may be corrupted")
        
        # Check minimum file size
        if len(self.model_data) < 1024:
            issues.append("File size suspiciously small for a TFLite model")
        
        return issues
