"""
SafeTensors model extractor.

This module provides functionality to extract metadata and analyze
SafeTensors models.
"""

import json
import struct
from typing import Any, Dict, List, Optional

from ..types import ModelMetadata, ModelFormat, SBOMComponent, ExternalSource


class SafeTensorsExtractor:
    """Extracts metadata and analyzes SafeTensors models."""
    
    def __init__(self, model_data: bytes):
        """
        Initialize SafeTensors extractor with model data.
        
        Args:
            model_data: Raw SafeTensors model data
        """
        self.model_data = model_data
        self.header: Dict[str, Any] = {}
        self.tensors: Dict[str, Any] = {}
        self._parse_header()
    
    def _parse_header(self) -> None:
        """Parse SafeTensors header."""
        if len(self.model_data) < 8:
            raise RuntimeError("File too small to be a valid SafeTensors file")
        
        # First 8 bytes contain the header size
        header_size = struct.unpack('<Q', self.model_data[:8])[0]
        
        if len(self.model_data) < 8 + header_size:
            raise RuntimeError("File truncated or corrupted")
        
        # Parse header JSON
        header_bytes = self.model_data[8:8 + header_size]
        try:
            self.header = json.loads(header_bytes.decode('utf-8'))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            raise RuntimeError(f"Failed to parse SafeTensors header: {str(e)}")
        
        # Extract tensor information
        self.tensors = {k: v for k, v in self.header.items() if k != '__metadata__'}
    
    def extract_metadata(self) -> ModelMetadata:
        """
        Extract metadata from SafeTensors model.
        
        Returns:
            ModelMetadata object with extracted information
        """
        # Extract metadata section if present
        metadata = self.header.get('__metadata__', {})
        
        # Extract tensor shapes as input/output info
        input_shapes = []
        for name, tensor_info in self.tensors.items():
            if isinstance(tensor_info, dict):
                shape_info = {
                    'name': name,
                    'dtype': tensor_info.get('dtype', 'unknown'),
                    'shape': tensor_info.get('shape', [])
                }
                input_shapes.append(shape_info)
        
        return ModelMetadata(
            format=ModelFormat.SAFETENSORS,
            version=metadata.get('version'),
            producer=metadata.get('producer', 'SafeTensors'),
            description=metadata.get('description', f'SafeTensors model with {len(self.tensors)} tensors'),
            author=metadata.get('author'),
            license=metadata.get('license'),
            tags=metadata.get('tags', []) if isinstance(metadata.get('tags'), list) else [],
            input_shapes=input_shapes,
            output_shapes=[],
            operators=[],
            custom_operators=[],
            external_data=[],
            file_size=len(self.model_data)
        )
    
    def generate_sbom(self) -> List[SBOMComponent]:
        """
        Generate Software Bill of Materials for SafeTensors model.
        
        Returns:
            List of SBOM components
        """
        components = [
            SBOMComponent(
                name='safetensors',
                type='library',
                description='SafeTensors library for safe tensor serialization',
                purl='pkg:pypi/safetensors'
            )
        ]
        
        # Add framework-specific components if detected
        metadata = self.header.get('__metadata__', {})
        framework = metadata.get('framework')
        
        if framework == 'pytorch' or framework == 'torch':
            components.append(SBOMComponent(
                name='torch',
                type='runtime',
                description='PyTorch runtime',
                purl='pkg:pypi/torch'
            ))
        elif framework == 'tensorflow' or framework == 'tf':
            components.append(SBOMComponent(
                name='tensorflow',
                type='runtime',
                description='TensorFlow runtime',
                purl='pkg:pypi/tensorflow'
            ))
        
        return components
    
    def get_external_sources(self) -> List[ExternalSource]:
        """
        Get external data sources referenced by the model.
        
        Returns:
            List of external sources
        """
        # SafeTensors doesn't support external data by design
        return []
    
    def validate_model(self) -> List[str]:
        """
        Validate SafeTensors model structure and return any issues.
        
        Returns:
            List of validation issues
        """
        issues = []
        
        # Check if tensors exist
        if not self.tensors:
            issues.append("Model has no tensors")
        
        # Validate tensor information
        for name, tensor_info in self.tensors.items():
            if not isinstance(tensor_info, dict):
                issues.append(f"Invalid tensor info for '{name}'")
                continue
            
            if 'dtype' not in tensor_info:
                issues.append(f"Tensor '{name}' missing dtype")
            
            if 'shape' not in tensor_info:
                issues.append(f"Tensor '{name}' missing shape")
        
        return issues