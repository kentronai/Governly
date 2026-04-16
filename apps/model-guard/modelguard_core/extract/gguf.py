"""
GGUF model extractor.

This module provides functionality to extract metadata and analyze
GGUF (GGML Universal Format) models.
"""

import struct
from typing import Any, Dict, List, Optional

from ..types import ModelMetadata, ModelFormat, SBOMComponent, ExternalSource


class GGUFExtractor:
    """Extracts metadata and analyzes GGUF models."""
    
    GGUF_MAGIC = b'GGUF'
    
    def __init__(self, model_data: bytes):
        """
        Initialize GGUF extractor with model data.
        
        Args:
            model_data: Raw GGUF model data
        """
        self.model_data = model_data
        self.metadata_dict: Dict[str, Any] = {}
        self._parse_header()
    
    def _parse_header(self) -> None:
        """Parse GGUF file header."""
        if len(self.model_data) < 12:
            raise RuntimeError("File too small to be a valid GGUF file")
        
        # Check magic bytes
        magic = self.model_data[:4]
        if magic != self.GGUF_MAGIC:
            raise RuntimeError(f"Invalid GGUF magic bytes: {magic}")
        
        # Parse version
        version = struct.unpack('<I', self.model_data[4:8])[0]
        self.metadata_dict['version'] = version
        
        # Parse tensor count (if available)
        try:
            tensor_count = struct.unpack('<Q', self.model_data[8:16])[0]
            self.metadata_dict['tensor_count'] = tensor_count
        except struct.error:
            self.metadata_dict['tensor_count'] = 0
    
    def extract_metadata(self) -> ModelMetadata:
        """
        Extract metadata from GGUF model.
        
        Returns:
            ModelMetadata object with extracted information
        """
        return ModelMetadata(
            format=ModelFormat.GGUF,
            version=str(self.metadata_dict.get('version', 'unknown')),
            producer='GGML',
            description=f"GGUF model with {self.metadata_dict.get('tensor_count', 0)} tensors",
            input_shapes=[],
            output_shapes=[],
            operators=[],
            custom_operators=[],
            external_data=[],
            file_size=len(self.model_data)
        )
    
    def generate_sbom(self) -> List[SBOMComponent]:
        """
        Generate Software Bill of Materials for GGUF model.
        
        Returns:
            List of SBOM components
        """
        components = [
            SBOMComponent(
                name='ggml',
                type='runtime',
                description='GGML runtime for model execution',
                purl='pkg:generic/ggml'
            )
        ]
        
        return components
    
    def get_external_sources(self) -> List[ExternalSource]:
        """
        Get external data sources referenced by the model.
        
        Returns:
            List of external sources
        """
        # GGUF models typically don't have external data
        return []
    
    def validate_model(self) -> List[str]:
        """
        Validate GGUF model structure and return any issues.
        
        Returns:
            List of validation issues
        """
        issues = []
        
        # Check version
        version = self.metadata_dict.get('version')
        if version and version > 3:
            issues.append(f"GGUF version {version} may not be fully supported")
        
        # Check tensor count
        tensor_count = self.metadata_dict.get('tensor_count', 0)
        if tensor_count == 0:
            issues.append("Model has no tensors")
        
        return issues
