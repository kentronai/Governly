"""
Model format detection and sniffing.

This module provides functionality to detect the format of ML models
by examining file headers, magic bytes, and content structure.
"""

import io
import struct
from pathlib import Path
from typing import Optional, Tuple

from .types import ModelFormat


class FormatDetector:
    """Detects model formats from file content and headers."""
    
    # Magic bytes for different formats
    MAGIC_BYTES = {
        # ONNX: starts with protobuf header
        b'\x08': ModelFormat.ONNX,
        
        # HDF5/Keras: starts with HDF5 magic
        b'\x89HDF\r\n\x1a\n': ModelFormat.KERAS,
        
        # TensorFlow SavedModel: contains specific markers
        b'saved_model.pb': ModelFormat.TENSORFLOW,
        
        # TFLite: starts with specific header
        b'TFL3': ModelFormat.TFLITE,
        
        # GGUF: starts with GGUF magic
        b'GGUF': ModelFormat.GGUF,
    }
    
    # File extensions mapping
    EXTENSION_MAP = {
        '.onnx': ModelFormat.ONNX,
        '.pt': ModelFormat.PYTORCH,
        '.pth': ModelFormat.PYTORCH,
        '.h5': ModelFormat.KERAS,
        '.hdf5': ModelFormat.KERAS,
        '.safetensors': ModelFormat.SAFETENSORS,
        '.pb': ModelFormat.TENSORFLOW,
        '.tflite': ModelFormat.TFLITE,
        '.gguf': ModelFormat.GGUF,
    }
    
    @classmethod
    def detect_from_file(cls, file_path: Path) -> Tuple[ModelFormat, Optional[str]]:
        """
        Detect model format from file path and content.
        
        Args:
            file_path: Path to the model file
            
        Returns:
            Tuple of (detected_format, error_message)
        """
        try:
            # First try extension-based detection
            extension = file_path.suffix.lower()
            if extension in cls.EXTENSION_MAP:
                return cls.EXTENSION_MAP[extension], None
            
            # Then try content-based detection
            with open(file_path, 'rb') as f:
                return cls.detect_from_stream(f)
                
        except Exception as e:
            return ModelFormat.UNKNOWN, f"Error reading file: {str(e)}"
    
    @classmethod
    def detect_from_bytes(cls, data: bytes) -> Tuple[ModelFormat, Optional[str]]:
        """
        Detect model format from byte data.
        
        Args:
            data: Raw model data
            
        Returns:
            Tuple of (detected_format, error_message)
        """
        try:
            stream = io.BytesIO(data)
            return cls.detect_from_stream(stream)
        except Exception as e:
            return ModelFormat.UNKNOWN, f"Error analyzing data: {str(e)}"
    
    @classmethod
    def detect_from_stream(cls, stream: io.IOBase) -> Tuple[ModelFormat, Optional[str]]:
        """
        Detect model format from file stream.
        
        Args:
            stream: File-like object containing model data
            
        Returns:
            Tuple of (detected_format, error_message)
        """
        try:
            # Read first 1KB for magic byte detection
            stream.seek(0)
            header = stream.read(1024)
            
            if not header:
                return ModelFormat.UNKNOWN, "Empty file"
            
            # Check magic bytes
            detected_format = cls._check_magic_bytes(header)
            if detected_format != ModelFormat.UNKNOWN:
                return detected_format, None
            
            # Check for SafeTensors format (has specific JSON structure)
            if cls._is_safetensors(header):
                return ModelFormat.SAFETENSORS, None
            
            # Check for specific format patterns
            detected_format = cls._check_format_patterns(header)
            if detected_format != ModelFormat.UNKNOWN:
                return detected_format, None
            
            # Check for ZIP-like structure (PyTorch)
            if cls._is_zip_like(header):
                return ModelFormat.PYTORCH, None
            
            # Check for protobuf structure (ONNX, TensorFlow)
            if cls._is_protobuf(header):
                # Try to determine if it's ONNX or TensorFlow
                if cls._is_onnx_protobuf(header):
                    return ModelFormat.ONNX, None
                elif cls._is_tensorflow_protobuf(header):
                    return ModelFormat.TENSORFLOW, None
            
            return ModelFormat.UNKNOWN, "Unknown format"
            
        except Exception as e:
            return ModelFormat.UNKNOWN, f"Error analyzing stream: {str(e)}"
    
    @classmethod
    def _check_magic_bytes(cls, header: bytes) -> ModelFormat:
        """Check for known magic bytes in header."""
        for magic, format_type in cls.MAGIC_BYTES.items():
            if header.startswith(magic):
                return format_type
        return ModelFormat.UNKNOWN
    
    @classmethod
    def _check_format_patterns(cls, header: bytes) -> ModelFormat:
        """Check for format-specific patterns in header."""
        header_str = header.decode('utf-8', errors='ignore').lower()
        
        # Check for SafeTensors
        if '__safetensors__' in header_str:
            return ModelFormat.SAFETENSORS
        
        # Check for GGUF
        if 'gguf' in header_str[:100]:
            return ModelFormat.GGUF
        
        # Check for TensorFlow SavedModel
        if 'saved_model' in header_str or 'tensorflow' in header_str:
            return ModelFormat.TENSORFLOW
        
        # Check for ONNX
        if 'onnx' in header_str or 'opset' in header_str:
            return ModelFormat.ONNX
        
        return ModelFormat.UNKNOWN
    
    @classmethod
    def _is_zip_like(cls, header: bytes) -> bool:
        """Check if file has ZIP-like structure (PyTorch)."""
        # PyTorch models are ZIP files - check for various ZIP signatures
        if len(header) < 4:
            return False
        
        # Check for ZIP file signatures
        zip_signatures = [
            b'PK\x03\x04',  # Local file header
            b'PK\x05\x06',  # End of central directory
            b'PK\x01\x02',  # Central directory file header
            b'PK\x07\x08',  # Data descriptor
        ]
        
        for sig in zip_signatures:
            if header.startswith(sig):
                return True
        
        # Also check if it starts with PK (more general)
        if header.startswith(b'PK'):
            return True
            
        return False
    
    @classmethod
    def _is_protobuf(cls, header: bytes) -> bool:
        """Check if file contains protobuf data."""
        # Protobuf files typically start with field number 1
        # This is a simplified check
        return len(header) > 0 and (header[0] & 0x07) in [0, 1, 2, 5]
    
    @classmethod
    def _is_onnx_protobuf(cls, header: bytes) -> bool:
        """Check if protobuf is ONNX format."""
        try:
            # Look for ONNX-specific patterns
            header_str = header.decode('utf-8', errors='ignore')
            onnx_indicators = ['onnx', 'opset', 'ir_version', 'producer_name']
            return any(indicator in header_str.lower() for indicator in onnx_indicators)
        except:
            return False
    
    @classmethod
    def _is_tensorflow_protobuf(cls, header: bytes) -> bool:
        """Check if protobuf is TensorFlow format."""
        try:
            # Look for TensorFlow-specific patterns
            header_str = header.decode('utf-8', errors='ignore')
            tf_indicators = ['tensorflow', 'saved_model', 'meta_graph', 'signature']
            return any(indicator in header_str.lower() for indicator in tf_indicators)
        except:
            return False
    
    @classmethod
    def _is_safetensors(cls, header: bytes) -> bool:
        """Check if file is SafeTensors format."""
        try:
            # SafeTensors files start with a JSON header containing metadata
            # Look for JSON-like structure at the beginning
            header_str = header.decode('utf-8', errors='ignore')
            
            # SafeTensors typically starts with JSON metadata
            # Look for common JSON patterns and SafeTensors-specific fields
            safetensors_indicators = [
                '__metadata__',
                'dtype',
                'shape',
                'data_offsets'
            ]
            
            # Check if it looks like JSON and contains SafeTensors indicators
            if header_str.strip().startswith('{') and any(indicator in header_str for indicator in safetensors_indicators):
                return True
                
            return False
        except:
            return False
    
    @classmethod
    def get_format_info(cls, format_type: ModelFormat) -> dict:
        """
        Get information about a model format.
        
        Args:
            format_type: The model format
            
        Returns:
            Dictionary with format information
        """
        format_info = {
            ModelFormat.ONNX: {
                'name': 'ONNX',
                'description': 'Open Neural Network Exchange format',
                'extensions': ['.onnx'],
                'magic_bytes': ['\x08'],
                'security_concerns': ['Custom operators', 'External data references'],
                'scan_capabilities': ['Format validation', 'Custom ops detection', 'SBOM generation']
            },
            ModelFormat.PYTORCH: {
                'name': 'PyTorch',
                'description': 'PyTorch model format (pickle-based)',
                'extensions': ['.pt', '.pth'],
                'magic_bytes': ['PK'],
                'security_concerns': ['Pickle deserialization', 'Arbitrary code execution'],
                'scan_capabilities': ['Pickle detection', 'Format validation', 'SBOM generation']
            },
            ModelFormat.KERAS: {
                'name': 'Keras/HDF5',
                'description': 'Keras model saved in HDF5 format',
                'extensions': ['.h5', '.hdf5'],
                'magic_bytes': ['\x89HDF\r\n\x1a\n'],
                'security_concerns': ['Lambda layers', 'Custom objects'],
                'scan_capabilities': ['Format validation', 'Lambda detection', 'SBOM generation']
            },
            ModelFormat.SAFETENSORS: {
                'name': 'SafeTensors',
                'description': 'Safe tensor serialization format',
                'extensions': ['.safetensors'],
                'magic_bytes': ['__safetensors__'],
                'security_concerns': ['Metadata validation'],
                'scan_capabilities': ['Format validation', 'Metadata validation', 'SBOM generation']
            },
            ModelFormat.TENSORFLOW: {
                'name': 'TensorFlow',
                'description': 'TensorFlow SavedModel format',
                'extensions': ['.pb'],
                'magic_bytes': ['saved_model.pb'],
                'security_concerns': ['Custom operations', 'External data'],
                'scan_capabilities': ['Format validation', 'Custom ops detection', 'SBOM generation']
            },
            ModelFormat.TFLITE: {
                'name': 'TensorFlow Lite',
                'description': 'TensorFlow Lite model format',
                'extensions': ['.tflite'],
                'magic_bytes': ['TFL3'],
                'security_concerns': ['Operator validation'],
                'scan_capabilities': ['Format validation', 'Operator validation', 'SBOM generation']
            },
            ModelFormat.GGUF: {
                'name': 'GGUF',
                'description': 'GGML Universal Format',
                'extensions': ['.gguf'],
                'magic_bytes': ['GGUF'],
                'security_concerns': ['Metadata validation'],
                'scan_capabilities': ['Format validation', 'Metadata validation', 'SBOM generation']
            },
            ModelFormat.UNKNOWN: {
                'name': 'Unknown',
                'description': 'Unknown or unsupported format',
                'extensions': [],
                'magic_bytes': [],
                'security_concerns': ['Unknown security risks'],
                'scan_capabilities': ['Basic file analysis']
            }
        }
        
        return format_info.get(format_type, format_info[ModelFormat.UNKNOWN])


def detect_model_format(file_path: Path) -> Tuple[ModelFormat, Optional[str]]:
    """
    Convenience function to detect model format from file path.
    
    Args:
        file_path: Path to the model file
        
    Returns:
        Tuple of (detected_format, error_message)
    """
    return FormatDetector.detect_from_file(file_path)


def detect_model_format_from_bytes(data: bytes) -> Tuple[ModelFormat, Optional[str]]:
    """
    Convenience function to detect model format from byte data.
    
    Args:
        data: Raw model data
        
    Returns:
        Tuple of (detected_format, error_message)
    """
    return FormatDetector.detect_from_bytes(data)
