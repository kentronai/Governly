"""
Keras/HDF5 model extractor.

This module provides functionality to extract metadata and analyze
Keras models saved in HDF5 format for security concerns.
"""

import io
from typing import Any, Dict, List, Optional, Set

from ..types import ModelMetadata, ModelFormat, SBOMComponent, ExternalSource


class KerasExtractor:
    """Extracts metadata and analyzes Keras/HDF5 models."""
    
    def __init__(self, model_data: bytes):
        """
        Initialize Keras extractor with model data.
        
        Args:
            model_data: Raw Keras/HDF5 model data
        """
        self.model_data = model_data
        self.h5_file = None
        self._load_model()
    
    def _load_model(self) -> None:
        """Load HDF5 model from data."""
        try:
            import h5py
            self.h5_file = h5py.File(io.BytesIO(self.model_data), 'r')
        except ImportError:
            raise RuntimeError("h5py library not available. Install with: pip install h5py")
        except Exception as e:
            raise RuntimeError(f"Failed to load HDF5 model: {str(e)}")
    
    def extract_metadata(self) -> ModelMetadata:
        """
        Extract metadata from Keras model.
        
        Returns:
            ModelMetadata object with extracted information
        """
        if not self.h5_file:
            raise RuntimeError("Model not loaded")
        
        # Extract basic metadata
        producer = "Keras"
        version = self._extract_keras_version()
        
        # Extract model configuration
        model_config = self._extract_model_config()
        
        # Extract layer information
        layers = self._extract_layers()
        
        # Extract input/output shapes
        input_shapes = self._extract_input_shapes()
        output_shapes = self._extract_output_shapes()
        
        # Extract custom objects
        custom_objects = self._extract_custom_objects()
        
        # Extract additional metadata
        description = self._generate_description(model_config, layers)
        
        return ModelMetadata(
            format=ModelFormat.KERAS,
            version=version,
            producer=producer,
            description=description,
            input_shapes=input_shapes,
            output_shapes=output_shapes,
            operators=layers,
            custom_operators=custom_objects,
            external_data=[],
            file_size=len(self.model_data)
        )
    
    def _extract_model_config(self) -> Dict[str, Any]:
        """Extract model configuration from HDF5 file."""
        config = {}
        
        try:
            if 'model_config' in self.h5_file.attrs:
                import json
                config = json.loads(self.h5_file.attrs['model_config'])
        except Exception:
            pass
        
        return config
    
    def _extract_layers(self) -> List[str]:
        """Extract layer types from the model."""
        layers = []
        
        try:
            if 'model_weights' in self.h5_file:
                for layer_name in self.h5_file['model_weights']:
                    layer_group = self.h5_file['model_weights'][layer_name]
                    if 'class_name' in layer_group.attrs:
                        class_name = layer_group.attrs['class_name'].decode('utf-8')
                        layers.append(class_name)
        except Exception:
            pass
        
        return layers
    
    def _extract_input_shapes(self) -> List[Dict[str, Any]]:
        """Extract input shapes from the model."""
        input_shapes = []
        
        try:
            model_config = self._extract_model_config()
            
            # Try input_layers first
            if 'input_layers' in model_config:
                for input_layer in model_config['input_layers']:
                    if 'config' in input_layer and 'batch_input_shape' in input_layer['config']:
                        shape = input_layer['config']['batch_input_shape']
                        input_shapes.append({
                            'name': input_layer.get('name', 'input'),
                            'type': 'tensor',
                            'shape': shape
                        })
            
            # Try layers with input_shape
            if not input_shapes and 'layers' in model_config:
                for layer in model_config['layers']:
                    if 'config' in layer and 'batch_input_shape' in layer['config']:
                        shape = layer['config']['batch_input_shape']
                        input_shapes.append({
                            'name': layer.get('name', 'input'),
                            'type': 'tensor',
                            'shape': shape
                        })
            
            # Try to extract from model weights if available
            if not input_shapes and 'model_weights' in self.h5_file:
                for layer_name in self.h5_file['model_weights']:
                    layer_group = self.h5_file['model_weights'][layer_name]
                    if 'input_shape' in layer_group.attrs:
                        shape = layer_group.attrs['input_shape']
                        input_shapes.append({
                            'name': layer_name,
                            'type': 'tensor',
                            'shape': shape.tolist() if hasattr(shape, 'tolist') else list(shape)
                        })
                        break  # Just get the first input layer
                        
        except Exception:
            pass
        
        return input_shapes
    
    def _extract_output_shapes(self) -> List[Dict[str, Any]]:
        """Extract output shapes from the model."""
        output_shapes = []
        
        try:
            model_config = self._extract_model_config()
            
            # Try output_layers first
            if 'output_layers' in model_config:
                for output_layer in model_config['output_layers']:
                    output_shapes.append({
                        'name': output_layer.get('name', 'output'),
                        'type': 'tensor',
                        'shape': 'inferred'
                    })
            
            # Try to find output layers from layer configs
            if not output_shapes and 'layers' in model_config:
                for layer in model_config['layers']:
                    if 'config' in layer and 'output_shape' in layer['config']:
                        shape = layer['config']['output_shape']
                        output_shapes.append({
                            'name': layer.get('name', 'output'),
                            'type': 'tensor',
                            'shape': shape
                        })
            
            # If still no output shapes, try to infer from the last layer
            if not output_shapes and 'layers' in model_config:
                last_layer = model_config['layers'][-1] if model_config['layers'] else None
                if last_layer:
                    output_shapes.append({
                        'name': last_layer.get('name', 'output'),
                        'type': 'tensor',
                        'shape': 'inferred'
                    })
                        
        except Exception:
            pass
        
        return output_shapes
    
    def _extract_custom_objects(self) -> List[str]:
        """Extract custom objects from the model."""
        custom_objects = []
        
        try:
            if 'custom_objects' in self.h5_file.attrs:
                import json
                custom_objs = json.loads(self.h5_file.attrs['custom_objects'])
                custom_objects = list(custom_objs.keys())
        except Exception:
            pass
        
        return custom_objects
    
    def _extract_keras_version(self) -> str:
        """Extract Keras version from model."""
        try:
            if 'keras_version' in self.h5_file.attrs:
                return self.h5_file.attrs['keras_version'].decode('utf-8')
            elif 'backend' in self.h5_file.attrs:
                backend = self.h5_file.attrs['backend'].decode('utf-8')
                return f"Keras with {backend} backend"
        except Exception:
            pass
        
        return "Keras 2.x"
    
    def _generate_description(self, model_config: Dict[str, Any], layers: List[str]) -> str:
        """Generate a descriptive model description."""
        try:
            # Get model class name
            class_name = model_config.get('class_name', 'Sequential')
            
            # Count layers
            layer_count = len(layers)
            
            # Get unique layer types
            unique_layers = list(set(layers))
            
            # Generate description
            if layer_count > 0:
                description = f"Keras {class_name} model with {layer_count} layers"
                if len(unique_layers) <= 5:
                    description += f" ({', '.join(unique_layers)})"
                else:
                    description += f" ({len(unique_layers)} different layer types)"
            else:
                description = f"Keras {class_name} model"
            
            return description
            
        except Exception:
            return "Keras model"
    
    def generate_sbom(self) -> List[SBOMComponent]:
        """
        Generate Software Bill of Materials for Keras model.
        
        Returns:
            List of SBOM components
        """
        components = []
        
        # Keras library component
        components.append(SBOMComponent(
            name="keras",
            type="library",
            description="Keras library for deep learning",
            purl="pkg:pypi/keras"
        ))
        
        # TensorFlow component
        components.append(SBOMComponent(
            name="tensorflow",
            type="runtime",
            description="TensorFlow runtime for Keras models",
            purl="pkg:pypi/tensorflow"
        ))
        
        # HDF5 component
        components.append(SBOMComponent(
            name="h5py",
            type="library",
            description="HDF5 library for data storage",
            purl="pkg:pypi/h5py"
        ))
        
        # Custom objects as components
        custom_objects = self._extract_custom_objects()
        for custom_obj in custom_objects:
            components.append(SBOMComponent(
                name=f"custom_{custom_obj}",
                type="custom_object",
                description=f"Custom Keras object: {custom_obj}",
                supplier="unknown"
            ))
        
        return components
    
    def get_external_sources(self) -> List[ExternalSource]:
        """
        Get external data sources referenced by the model.
        
        Returns:
            List of external sources
        """
        sources = []
        
        # Keras models are typically self-contained
        # Check for any external references in metadata
        try:
            if 'external_references' in self.h5_file.attrs:
                import json
                ext_refs = json.loads(self.h5_file.attrs['external_references'])
                for ref in ext_refs:
                    sources.append(ExternalSource(
                        uri=ref,
                        type="external_reference",
                        accessible=False,
                        error="Accessibility not checked"
                    ))
        except Exception:
            pass
        
        return sources
    
    def validate_model(self) -> List[str]:
        """
        Validate Keras model structure and return any issues.
        
        Returns:
            List of validation issues
        """
        issues = []
        
        # Check HDF5 file structure
        if not self.h5_file:
            issues.append("HDF5 file is corrupted or invalid")
            return issues
        
        # Check for required groups
        required_groups = ['model_weights']
        for group in required_groups:
            if group not in self.h5_file:
                issues.append(f"Missing required group: {group}")
        
        # Check for custom objects
        custom_objects = self._extract_custom_objects()
        if custom_objects:
            issues.append(f"Model contains {len(custom_objects)} custom objects: {', '.join(custom_objects)}")
        
        # Check for lambda layers
        layers = self._extract_layers()
        lambda_layers = [layer for layer in layers if 'lambda' in layer.lower()]
        if lambda_layers:
            issues.append(f"Model contains {len(lambda_layers)} lambda layers, which may pose security risks")
        
        return issues
    
    def get_layer_info(self) -> Dict[str, Any]:
        """
        Get detailed layer information.
        
        Returns:
            Dictionary with layer information
        """
        layers = self._extract_layers()
        custom_objects = self._extract_custom_objects()
        
        return {
            'total_layers': len(layers),
            'layer_types': layers,
            'custom_objects': custom_objects,
            'has_lambda_layers': any('lambda' in layer.lower() for layer in layers)
        }