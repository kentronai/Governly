"""
PyTorch model extractor.

This module provides functionality to extract metadata and analyze
PyTorch models for security concerns, particularly pickle-based attacks.

IMPORTANT: This module analyzes PyTorch models WITHOUT executing them.
We never call torch.load() or pickle.load() to avoid arbitrary code execution.

PRODUCTION NOTES:
- Basic opcode scanning implemented (5 dangerous opcodes)
- For comprehensive scanning, consider using pickletools module
- Pattern matching is simple regex-based
- Does not detect all types of backdoors
- Recommended for initial deployment, enhance with ML-based detection later
"""

import io
import re
import zipfile
from typing import Any, Dict, List, Optional, Set

from ..types import ModelMetadata, ModelFormat, SBOMComponent, ExternalSource


class PyTorchExtractor:
    """Extracts metadata and analyzes PyTorch models."""
    
    def __init__(self, model_data: bytes):
        """
        Initialize PyTorch extractor with model data.
        
        Args:
            model_data: Raw PyTorch model data
        """
        self.model_data = model_data
        self.model_info = None
        self._analyze_model()
    
    def _analyze_model(self) -> None:
        """Analyze PyTorch model structure."""
        self.model_info = {
            'is_zip': False,
            'is_pickle': False,
            'zip_contents': [],
            'pickle_objects': [],
            'torch_version': None,
            'model_type': None,
            'state_dict_keys': [],
            'metadata': {}
        }
        
        # Check if it's a ZIP file (newer PyTorch format)
        try:
            with zipfile.ZipFile(io.BytesIO(self.model_data)) as zip_file:
                self.model_info['is_zip'] = True
                self.model_info['zip_contents'] = zip_file.namelist()
                
                # Look for model data (analyze without loading)
                for name in zip_file.namelist():
                    if name.endswith('.pkl') or name == 'data.pkl':
                        try:
                            with zip_file.open(name) as f:
                                data = f.read()
                                # Analyze pickle data WITHOUT executing it
                                self._analyze_pickle_data(data)
                        except Exception as e:
                            self.model_info['pickle_errors'] = str(e)
        except zipfile.BadZipFile:
            # Not a ZIP file, try direct pickle
            self._analyze_pickle_data(self.model_data)
    
    def _analyze_pickle_data(self, data: bytes) -> None:
        """
        Analyze pickle data for security concerns WITHOUT executing it.
        
        This uses static analysis of pickle opcodes to avoid code execution.
        """
        self.model_info['is_pickle'] = True
        
        try:
            # Analyze pickle opcodes WITHOUT loading/executing
            dangerous_opcodes = self._scan_pickle_opcodes(data)
            self.model_info['dangerous_opcodes'] = dangerous_opcodes
            
            # Try to extract metadata from pickle structure without executing
            # We can look for specific patterns in the pickle bytecode
            metadata = self._extract_pickle_metadata_safe(data)
            self.model_info.update(metadata)
            
        except Exception as e:
            self.model_info['pickle_errors'] = f"Failed to analyze pickle: {str(e)}"
    
    def _scan_pickle_opcodes(self, data: bytes) -> List[Dict[str, Any]]:
        """
        Scan pickle data for dangerous opcodes without executing.
        
        Returns:
            List of dangerous opcodes found with their positions
        """
        dangerous = []
        
        # Dangerous pickle opcodes that can execute code
        DANGEROUS_OPCODES = {
            b'R': 'REDUCE - Can execute arbitrary functions',
            b'i': 'INST - Can instantiate arbitrary classes',
            b'o': 'OBJ - Can create arbitrary objects',
            b'c': 'GLOBAL - Can import arbitrary modules',
            b'\x93': 'STACK_GLOBAL - Can import from stack',
        }
        
        # Scan for dangerous opcodes
        pos = 0
        while pos < len(data):
            opcode = data[pos:pos+1]
            if opcode in DANGEROUS_OPCODES:
                # Extract context around the opcode
                context_start = max(0, pos - 20)
                context_end = min(len(data), pos + 20)
                context = data[context_start:context_end]
                
                dangerous.append({
                    'opcode': opcode.hex(),
                    'position': pos,
                    'description': DANGEROUS_OPCODES[opcode],
                    'context': context.hex()[:40]  # Limited context
                })
            pos += 1
        
        return dangerous
    
    def _extract_pickle_metadata_safe(self, data: bytes) -> Dict[str, Any]:
        """
        Extract metadata from pickle without executing it.
        
        This looks for specific patterns in the bytecode.
        """
        metadata = {}
        
        try:
            # Look for PyTorch version string in the data
            data_str = data.decode('latin-1', errors='ignore')
            
            # Search for version patterns
            import re
            version_pattern = r'torch[_\s]*version[_\s]*[:\s]*([0-9]+\.[0-9]+\.[0-9]+)'
            version_match = re.search(version_pattern, data_str, re.IGNORECASE)
            if version_match:
                metadata['torch_version'] = version_match.group(1)
            
            # Look for state_dict keys pattern (without loading)
            # PyTorch models often have readable key names in the pickle
            state_dict_pattern = r'(weight|bias|running_mean|running_var|num_batches_tracked)'
            if re.search(state_dict_pattern, data_str):
                metadata['has_state_dict'] = True
            
            # Check file size as indicator of model complexity
            metadata['pickle_size'] = len(data)
            
        except Exception as e:
            metadata['metadata_extraction_error'] = str(e)
        
        return metadata
    
    def extract_metadata(self) -> ModelMetadata:
        """
        Extract metadata from PyTorch model.
        
        Returns:
            ModelMetadata object with extracted information
        """
        if not self.model_info:
            raise RuntimeError("Model not analyzed")
        
        # Extract basic metadata
        producer = "PyTorch"
        if self.model_info.get('torch_version'):
            producer = f"PyTorch {self.model_info['torch_version']}"
        
        # Extract model type
        model_type = self.model_info.get('model_type', 'Unknown')
        
        # Check if model has state dict structure
        has_state_dict = self.model_info.get('has_state_dict', False)
        
        # Create input/output shapes (PyTorch doesn't store this directly)
        input_shapes = []
        output_shapes = []
        
        # Note: Cannot infer shapes without loading the model
        # This is intentional for security
        
        return ModelMetadata(
            format=ModelFormat.PYTORCH,
            version=self.model_info.get('torch_version'),
            producer=producer,
            description=f"PyTorch model of type {model_type}",
            input_shapes=input_shapes,
            output_shapes=output_shapes,
            operators=[],  # PyTorch doesn't store operator info in the same way
            custom_operators=[],
            external_data=[],
            file_size=len(self.model_data)
        )
    
    def generate_sbom(self) -> List[SBOMComponent]:
        """
        Generate Software Bill of Materials for PyTorch model.
        
        Returns:
            List of SBOM components
        """
        components = []
        
        # PyTorch runtime component
        torch_version = self.model_info.get('torch_version', 'unknown')
        components.append(SBOMComponent(
            name="torch",
            version=torch_version,
            type="runtime",
            description="PyTorch runtime for model execution",
            purl=f"pkg:pypi/torch@{torch_version}"
        ))
        
        # Pickle library component
        components.append(SBOMComponent(
            name="pickle",
            type="library",
            description="Python pickle library for serialization",
            purl="pkg:pypi/pickle"
        ))
        
        # Model-specific components
        if self.model_info.get('model_type'):
            components.append(SBOMComponent(
                name=f"model_{self.model_info['model_type']}",
                type="model",
                description=f"PyTorch model of type {self.model_info['model_type']}",
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
        
        # PyTorch models typically don't have external data references
        # but we check for any potential external references
        if self.model_info.get('zip_contents'):
            for content in self.model_info['zip_contents']:
                if content.startswith('http://') or content.startswith('https://'):
                    sources.append(ExternalSource(
                        uri=content,
                        type="external_reference",
                        accessible=False,
                        error="Accessibility not checked"
                    ))
        
        return sources
    
    def validate_model(self) -> List[str]:
        """
        Validate PyTorch model structure and return any issues.
        
        Returns:
            List of validation issues
        """
        issues = []
        
        # Check for pickle security concerns
        if self.model_info.get('is_pickle'):
            issues.append("Model uses pickle serialization, which poses CRITICAL security risks")
            
            if self.model_info.get('pickle_errors'):
                issues.append(f"Pickle analysis errors: {self.model_info['pickle_errors']}")
        
        # Check for dangerous opcodes
        dangerous_opcodes = self.model_info.get('dangerous_opcodes', [])
        if dangerous_opcodes:
            issues.append(f"Found {len(dangerous_opcodes)} dangerous pickle opcodes that can execute arbitrary code")
            for opcode_info in dangerous_opcodes[:5]:  # Show first 5
                issues.append(f"  - {opcode_info['description']} at position {opcode_info['position']}")
        
        # Check for empty or corrupted model
        if not self.model_info.get('has_state_dict') and not self.model_info.get('zip_contents'):
            issues.append("Model appears to be empty or corrupted")
        
        return issues
    
    def get_security_risks(self) -> List[Dict[str, Any]]:
        """
        Get detailed security risk analysis.
        
        Returns:
            List of security risk information
        """
        risks = []
        
        # Pickle deserialization risk
        if self.model_info.get('is_pickle'):
            dangerous_opcodes = self.model_info.get('dangerous_opcodes', [])
            risks.append({
                'type': 'pickle_deserialization',
                'severity': 'critical',
                'description': 'Model uses pickle serialization which can execute arbitrary code during load',
                'recommendation': 'Convert to SafeTensors format: python -m safetensors.torch.save_model model.pth model.safetensors',
                'evidence': {
                    'dangerous_opcodes_count': len(dangerous_opcodes),
                    'dangerous_opcodes': dangerous_opcodes[:10],  # First 10 opcodes
                    'pickle_size': self.model_info.get('pickle_size'),
                    'errors': self.model_info.get('pickle_errors')
                }
            })
        
        # ZIP-based model risks
        if self.model_info.get('is_zip'):
            zip_contents = self.model_info.get('zip_contents', [])
            if len(zip_contents) > 10:
                risks.append({
                    'type': 'complex_zip_structure',
                    'severity': 'medium',
                    'description': 'Model has complex ZIP structure with many files',
                    'recommendation': 'Review all files in the model archive',
                    'evidence': {
                        'file_count': len(zip_contents),
                        'files': zip_contents
                    }
                })
        
        return risks
