"""
SBOM (Software Bill of Materials) generation for ML models.

This module provides functionality to build comprehensive SBOM documents
for machine learning models, including dependencies and components.
"""

import hashlib
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from .types import ModelFormat, ModelMetadata, SBOMComponent, SBOMDocument, SBOMFeatures


class SBOMBuilder:
    """Builds Software Bill of Materials for ML models."""
    
    def __init__(self, model_path: Path, format_type: ModelFormat, metadata: ModelMetadata):
        """
        Initialize SBOM builder.
        
        Args:
            model_path: Path to the model file
            format_type: Detected model format
            metadata: Extracted model metadata
        """
        self.model_path = model_path
        self.format_type = format_type
        self.metadata = metadata
        self.components: List[SBOMComponent] = []
    
    def build(self) -> SBOMDocument:
        """
        Build complete SBOM document.
        
        Returns:
            SBOMDocument containing standardized SBOM structure
        """
        # Calculate file hash
        file_hash = self._calculate_file_hash()
        
        # Collect components
        self._collect_runtime_components()
        self._collect_model_components()
        
        # Build SBOM document
        sbom_doc = SBOMDocument(
            serial_number=f'urn:uuid:{self._generate_uuid()}',
            metadata={
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'tools': [{
                    'vendor': 'Kentron',
                    'name': 'ModelGuard',
                    'version': '1.0.0'
                }],
                'component': {
                    'type': 'machine-learning-model',
                    'name': self.model_path.name,
                    'version': self.metadata.version or 'unknown',
                    'description': self.metadata.description,
                    'hashes': [{
                        'alg': 'SHA-256',
                        'content': file_hash
                    }],
                    'properties': [
                        {'name': 'format', 'value': self.format_type.value},
                        {'name': 'producer', 'value': self.metadata.producer or 'unknown'},
                        {'name': 'file_size', 'value': str(self.metadata.file_size or 0)}
                    ]
                }
            },
            components=[self._component_to_dict(comp) for comp in self.components],
            model_info={
                'format': self.format_type.value,
                'input_shapes': self.metadata.input_shapes,
                'output_shapes': self.metadata.output_shapes,
                'operators': self.metadata.operators,
                'custom_operators': self.metadata.custom_operators,
                'external_data': self.metadata.external_data,
                'file_size': self.metadata.file_size,
                'producer': self.metadata.producer,
                'version': self.metadata.version,
                'description': self.metadata.description,
                'author': self.metadata.author,
                'license': self.metadata.license,
                'tags': self.metadata.tags,
                'created_at': self.metadata.created_at
            }
        )
        
        return sbom_doc
    
    def _calculate_file_hash(self) -> str:
        """Calculate SHA-256 hash of model file."""
        sha256_hash = hashlib.sha256()
        
        with open(self.model_path, 'rb') as f:
            for byte_block in iter(lambda: f.read(4096), b''):
                sha256_hash.update(byte_block)
        
        return sha256_hash.hexdigest()
    
    def _generate_uuid(self) -> str:
        """Generate UUID for SBOM."""
        import uuid
        return str(uuid.uuid4())
    
    def _collect_runtime_components(self) -> None:
        """Collect runtime dependencies based on model format."""
        runtime_map = {
            ModelFormat.ONNX: [
                SBOMComponent(
                    name='onnxruntime',
                    type='runtime',
                    description='ONNX Runtime for model execution',
                    purl='pkg:pypi/onnxruntime'
                ),
                SBOMComponent(
                    name='onnx',
                    type='library',
                    description='ONNX library for model format support',
                    purl='pkg:pypi/onnx'
                )
            ],
            ModelFormat.PYTORCH: [
                SBOMComponent(
                    name='torch',
                    version=self.metadata.version,
                    type='runtime',
                    description='PyTorch runtime for model execution',
                    purl=f'pkg:pypi/torch@{self.metadata.version or "latest"}'
                )
            ],
            ModelFormat.KERAS: [
                SBOMComponent(
                    name='tensorflow',
                    type='runtime',
                    description='TensorFlow runtime for Keras models',
                    purl='pkg:pypi/tensorflow'
                ),
                SBOMComponent(
                    name='keras',
                    type='library',
                    description='Keras library for model definition',
                    purl='pkg:pypi/keras'
                )
            ],
            ModelFormat.SAFETENSORS: [
                SBOMComponent(
                    name='safetensors',
                    type='library',
                    description='SafeTensors library for safe tensor serialization',
                    purl='pkg:pypi/safetensors'
                )
            ],
            ModelFormat.TENSORFLOW: [
                SBOMComponent(
                    name='tensorflow',
                    type='runtime',
                    description='TensorFlow runtime for model execution',
                    purl='pkg:pypi/tensorflow'
                )
            ],
            ModelFormat.TFLITE: [
                SBOMComponent(
                    name='tensorflow-lite',
                    type='runtime',
                    description='TensorFlow Lite runtime for model execution',
                    purl='pkg:pypi/tensorflow-lite'
                )
            ],
            ModelFormat.GGUF: [
                SBOMComponent(
                    name='ggml',
                    type='runtime',
                    description='GGML runtime for model execution',
                    purl='pkg:generic/ggml'
                )
            ]
        }
        
        runtime_components = runtime_map.get(self.format_type, [])
        self.components.extend(runtime_components)
    
    def _collect_model_components(self) -> None:
        """Collect model-specific components."""
        # Add custom operators as components
        for custom_op in self.metadata.custom_operators:
            self.components.append(SBOMComponent(
                name=f'custom_operator_{custom_op}',
                type='custom-operator',
                description=f'Custom operator: {custom_op}',
                supplier='unknown'
            ))
        
        # Add external data references as components
        for ext_data in self.metadata.external_data:
            self.components.append(SBOMComponent(
                name=f'external_data',
                type='external-data',
                description=f'External data reference: {ext_data}',
                supplier='unknown'
            ))
    
    def _component_to_dict(self, component: SBOMComponent) -> Dict[str, Any]:
        """Convert SBOMComponent to dictionary."""
        comp_dict = {
            'name': component.name,
            'type': component.type
        }
        
        if component.version:
            comp_dict['version'] = component.version
        if component.purl:
            comp_dict['purl'] = component.purl
        if component.license:
            comp_dict['license'] = component.license
        if component.supplier:
            comp_dict['supplier'] = component.supplier
        if component.description:
            comp_dict['description'] = component.description
        if component.hashes:
            comp_dict['hashes'] = component.hashes
        if component.external_refs:
            comp_dict['externalReferences'] = component.external_refs
        
        return comp_dict


def build_sbom(model_path: Path, format_type: ModelFormat, metadata: ModelMetadata) -> SBOMDocument:
    """
    Convenience function to build SBOM.
    
    Args:
        model_path: Path to the model file
        format_type: Detected model format
        metadata: Extracted model metadata
        
    Returns:
        SBOMDocument containing standardized SBOM structure
    """
    builder = SBOMBuilder(model_path, format_type, metadata)
    return builder.build()


def extract_sbom_features(sbom: SBOMDocument) -> SBOMFeatures:
    """
    Extract security-relevant features from SBOM for scanner analysis.
    
    Args:
        sbom: SBOM document
        
    Returns:
        SBOMFeatures containing extracted features
    """
    model_info = sbom.model_info
    
    # Basic structure features
    operator_count = len(model_info.get('operators', []))
    custom_operator_count = len(model_info.get('custom_operators', []))
    external_data_count = len(model_info.get('external_data', []))
    
    # Security-relevant features
    has_pickle = model_info.get('format') == 'pytorch'
    has_lambda_layers = False  # Would need to check model content
    has_custom_ops = custom_operator_count > 0
    has_external_data = external_data_count > 0
    
    # Check for network and file operations in operators
    network_ops = ['http', 'tcp', 'udp', 'socket', 'fetch', 'request', 'url']
    file_ops = ['file', 'read', 'write', 'open', 'save', 'load']
    
    all_operators = model_info.get('operators', []) + model_info.get('custom_operators', [])
    has_network_ops = any(any(net_op in op.lower() for net_op in network_ops) for op in all_operators)
    has_file_ops = any(any(file_op in op.lower() for file_op in file_ops) for op in all_operators)
    
    # Metadata features
    has_license = bool(model_info.get('license'))
    has_author = bool(model_info.get('author'))
    has_description = bool(model_info.get('description'))
    has_version = bool(model_info.get('version'))
    
    # Complexity score (simple heuristic)
    complexity_score = (
        operator_count * 0.1 +
        custom_operator_count * 0.5 +
        external_data_count * 0.3 +
        (1 if has_network_ops else 0) * 0.8 +
        (1 if has_file_ops else 0) * 0.6
    )
    
    # Check for suspicious keywords
    suspicious_keywords = []
    text_fields = [
        model_info.get('description', ''),
        model_info.get('author', ''),
        ' '.join(model_info.get('tags', []))
    ]
    
    suspicious_patterns = [
        'backdoor', 'trojan', 'malware', 'exploit', 'hack',
        'poison', 'attack', 'bypass', 'steal', 'exfiltrate'
    ]
    
    for field in text_fields:
        if field:
            field_lower = field.lower()
            for pattern in suspicious_patterns:
                if pattern in field_lower and pattern not in suspicious_keywords:
                    suspicious_keywords.append(pattern)
    
    # Domain analysis for ONNX models
    trusted_domains = ['ai.onnx', 'ai.onnx.ml', 'com.microsoft', 'org.pytorch.aten']
    untrusted_domains = []
    
    if model_info.get('format') == 'onnx':
        for op in model_info.get('operators', []):
            if '::' in op:
                domain = op.split('::')[0]
                if domain not in trusted_domains and domain not in untrusted_domains:
                    untrusted_domains.append(domain)
    
    # Extract runtime dependencies from components
    runtime_deps = []
    library_deps = []
    
    for component in sbom.components:
        comp_type = component.get('type', '')
        comp_name = component.get('name', '')
        
        if comp_type == 'runtime':
            runtime_deps.append(comp_name)
        elif comp_type == 'library':
            library_deps.append(comp_name)
    
    return SBOMFeatures(
        format=model_info.get('format', 'unknown'),
        operator_count=operator_count,
        custom_operator_count=custom_operator_count,
        external_data_count=external_data_count,
        has_pickle=has_pickle,
        has_lambda_layers=has_lambda_layers,
        has_custom_ops=has_custom_ops,
        has_external_data=has_external_data,
        has_network_ops=has_network_ops,
        has_file_ops=has_file_ops,
        has_license=has_license,
        has_author=has_author,
        has_description=has_description,
        has_version=has_version,
        model_complexity_score=complexity_score,
        suspicious_keywords=suspicious_keywords,
        trusted_domains=trusted_domains,
        untrusted_domains=untrusted_domains,
        runtime_dependencies=runtime_deps,
        library_dependencies=library_deps
    )
