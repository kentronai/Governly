"""
ONNX model extractor.

This module provides functionality to extract metadata and analyze
ONNX models for security concerns and compliance.
"""

import io
from typing import Any, Dict, List, Optional, Set

from ..types import ModelMetadata, ModelFormat, SBOMComponent, ExternalSource


class ONNXExtractor:
    """Extracts metadata and analyzes ONNX models."""
    
    # Standard ONNX operators (as of ONNX 1.15)
    STANDARD_OPERATORS = {
        'Abs', 'Acos', 'Acosh', 'Add', 'And', 'ArgMax', 'ArgMin', 'Asin', 'Asinh',
        'Atan', 'Atanh', 'AveragePool', 'BatchNormalization', 'BitShift', 'Cast',
        'Ceil', 'Clip', 'Compress', 'Concat', 'ConcatFromSequence', 'Constant',
        'ConstantOfShape', 'Conv', 'ConvInteger', 'ConvTranspose', 'Cos', 'Cosh',
        'CumSum', 'DepthToSpace', 'DequantizeLinear', 'Det', 'Div', 'Dropout',
        'DynamicQuantizeLinear', 'Einsum', 'Elu', 'Equal', 'Erf', 'Exp', 'Expand',
        'EyeLike', 'Flatten', 'Floor', 'GRU', 'Gather', 'GatherElements', 'GatherND',
        'Gemm', 'GlobalAveragePool', 'GlobalLpPool', 'GlobalMaxPool', 'Greater',
        'GreaterOrEqual', 'HardSigmoid', 'Hardmax', 'Identity', 'If', 'InstanceNormalization',
        'IsInf', 'IsNaN', 'LRN', 'LSTM', 'LeakyRelu', 'Less', 'LessOrEqual', 'Log',
        'LogSoftmax', 'Loop', 'LpNormalization', 'LpPool', 'MatMul', 'MatMulInteger',
        'Max', 'MaxPool', 'MaxRoiPool', 'MaxUnpool', 'Mean', 'Min', 'Mod', 'Mul',
        'Multinomial', 'Neg', 'NonMaxSuppression', 'NonZero', 'Not', 'OneHot',
        'Or', 'PRelu', 'Pad', 'Pow', 'QLinearConv', 'QLinearMatMul', 'QuantizeLinear',
        'RNN', 'RandomNormal', 'RandomNormalLike', 'RandomUniform', 'RandomUniformLike',
        'Range', 'Reciprocal', 'ReduceL1', 'ReduceL2', 'ReduceLogSum', 'ReduceLogSumExp',
        'ReduceMax', 'ReduceMean', 'ReduceMin', 'ReduceProd', 'ReduceSum', 'ReduceSumSquare',
        'Relu', 'Reshape', 'Resize', 'ReverseSequence', 'RoiAlign', 'Round', 'Scan',
        'Scatter', 'ScatterElements', 'ScatterND', 'Selu', 'SequenceAt', 'SequenceConstruct',
        'SequenceEmpty', 'SequenceErase', 'SequenceInsert', 'SequenceLength', 'Shape',
        'Shrink', 'Sigmoid', 'Sign', 'Sin', 'Sinh', 'Size', 'Slice', 'Softmax',
        'SoftmaxCrossEntropyLoss', 'Softplus', 'Softsign', 'SpaceToDepth', 'Split',
        'SplitToSequence', 'Sqrt', 'Squeeze', 'StringNormalizer', 'Sub', 'Sum',
        'Tan', 'Tanh', 'TfIdfVectorizer', 'ThresholdedRelu', 'Tile', 'TopK', 'Transpose',
        'Trilu', 'Unique', 'Unsqueeze', 'Upsample', 'Where', 'Xor'
    }
    
    def __init__(self, model_data: bytes):
        """
        Initialize ONNX extractor with model data.
        
        Args:
            model_data: Raw ONNX model data
        """
        self.model_data = model_data
        self.model = None
        self._load_model()
    
    def _load_model(self) -> None:
        """Load ONNX model from data."""
        try:
            import onnx
        except ImportError:
            raise RuntimeError("ONNX library not available. Install with: pip install onnx")
        
        # Validate file size and basic structure
        if len(self.model_data) == 0:
            raise RuntimeError("ONNX model data is empty")
        
        if len(self.model_data) < 8:
            raise RuntimeError("ONNX model data is too small to be a valid model")
        
        # Check for ONNX magic bytes (protobuf format)
        # ONNX files typically start with protobuf magic bytes
        if not self._is_valid_onnx_format():
            raise RuntimeError("File does not appear to be a valid ONNX model format")
        
        try:
            self.model = onnx.load_from_string(self.model_data)
        except Exception as e:
            error_msg = str(e)
            if "Error parsing message with type 'onnx.ModelProto'" in error_msg:
                raise RuntimeError(
                    "ONNX model appears to be corrupted or invalid. "
                    "The file may not be a proper ONNX model or may have been damaged during transfer. "
                    f"Original error: {error_msg}"
                )
            elif "protobuf" in error_msg.lower():
                raise RuntimeError(
                    "ONNX model protobuf parsing failed. "
                    "The file may be corrupted or in an unsupported ONNX version. "
                    f"Original error: {error_msg}"
                )
            else:
                raise RuntimeError(f"Failed to load ONNX model: {error_msg}")
    
    def _is_valid_onnx_format(self) -> bool:
        """Check if the data appears to be a valid ONNX format."""
        try:
            # ONNX files are protobuf files, so they should start with valid protobuf data
            # Check for common protobuf patterns
            if len(self.model_data) < 4:
                return False
            
            # Basic checks for protobuf format
            # Protobuf messages typically start with field numbers (1-15) in the first few bytes
            first_byte = self.model_data[0]
            
            # Field numbers 1-15 are encoded as single bytes in protobuf
            # This is a basic heuristic - not foolproof but catches obvious issues
            if first_byte == 0 or first_byte > 127:
                return False
            
            # Additional check: look for reasonable protobuf structure
            # ONNX models should have reasonable field structure
            return True
            
        except Exception:
            return False
    
    def extract_metadata(self) -> ModelMetadata:
        """
        Extract metadata from ONNX model.
        
        Returns:
            ModelMetadata object with extracted information
        """
        if not self.model:
            raise RuntimeError("Model not loaded")
        
        # Extract basic metadata
        producer_name = None
        producer_version = None
        model_version = None
        doc_string = None
        
        if hasattr(self.model, 'producer_name'):
            producer_name = self.model.producer_name
        if hasattr(self.model, 'producer_version'):
            producer_version = self.model.producer_version
        if hasattr(self.model, 'model_version'):
            model_version = str(self.model.model_version)
        if hasattr(self.model, 'doc_string'):
            doc_string = self.model.doc_string
        
        # Extract input/output shapes
        input_shapes = []
        output_shapes = []
        
        if hasattr(self.model, 'graph') and self.model.graph:
            # Input shapes
            for input_tensor in self.model.graph.input:
                shape_info = {
                    'name': input_tensor.name,
                    'type': str(input_tensor.type.tensor_type.elem_type) if input_tensor.type.tensor_type else 'unknown',
                    'shape': [dim.dim_value for dim in input_tensor.type.tensor_type.shape.dim] if input_tensor.type.tensor_type.shape else []
                }
                input_shapes.append(shape_info)
            
            # Output shapes
            for output_tensor in self.model.graph.output:
                shape_info = {
                    'name': output_tensor.name,
                    'type': str(output_tensor.type.tensor_type.elem_type) if output_tensor.type.tensor_type else 'unknown',
                    'shape': [dim.dim_value for dim in output_tensor.type.tensor_type.shape.dim] if output_tensor.type.tensor_type.shape else []
                }
                output_shapes.append(shape_info)
        
        # Extract operators
        operators = self._extract_operators()
        custom_operators = self._extract_custom_operators(operators)
        
        # Extract external data references
        external_data = self._extract_external_data()
        
        return ModelMetadata(
            format=ModelFormat.ONNX,
            version=model_version,
            producer=producer_name,
            description=doc_string,
            input_shapes=input_shapes,
            output_shapes=output_shapes,
            operators=operators,
            custom_operators=custom_operators,
            external_data=external_data,
            file_size=len(self.model_data)
        )
    
    def _extract_operators(self) -> List[str]:
        """Extract all operators used in the model."""
        operators = set()
        
        if hasattr(self.model, 'graph') and self.model.graph:
            for node in self.model.graph.node:
                operators.add(node.op_type)
        
        return sorted(list(operators))
    
    def _extract_custom_operators(self, all_operators: List[str]) -> List[str]:
        """Extract custom (non-standard) operators."""
        return [op for op in all_operators if op not in self.STANDARD_OPERATORS]
    
    def _extract_external_data(self) -> List[str]:
        """Extract external data references."""
        external_data = []
        
        if hasattr(self.model, 'graph') and self.model.graph:
            for node in self.model.graph.node:
                # Check for external data in initializers
                for attr in node.attribute:
                    if attr.type == 4:  # TENSOR type
                        tensor = attr.t
                        if hasattr(tensor, 'external_data') and tensor.external_data:
                            for ext_data in tensor.external_data:
                                if hasattr(ext_data, 'key') and hasattr(ext_data, 'value'):
                                    external_data.append(f"{ext_data.key}: {ext_data.value}")
        
        return external_data
    
    def generate_sbom(self) -> List[SBOMComponent]:
        """
        Generate Software Bill of Materials for ONNX model.
        
        Returns:
            List of SBOM components
        """
        components = []
        
        # ONNX Runtime component
        components.append(SBOMComponent(
            name="onnxruntime",
            type="runtime",
            description="ONNX Runtime for model execution",
            purl="pkg:pypi/onnxruntime"
        ))
        
        # ONNX library component
        components.append(SBOMComponent(
            name="onnx",
            type="library",
            description="ONNX library for model format support",
            purl="pkg:pypi/onnx"
        ))
        
        # Model-specific components
        if hasattr(self.model, 'graph') and self.model.graph:
            # Add custom operators as components
            custom_ops = self._extract_custom_operators(self._extract_operators())
            for op in custom_ops:
                components.append(SBOMComponent(
                    name=f"custom_op_{op}",
                    type="custom_operator",
                    description=f"Custom ONNX operator: {op}",
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
        external_data = self._extract_external_data()
        
        for ext_ref in external_data:
            sources.append(ExternalSource(
                uri=ext_ref,
                type="external_data",
                accessible=False,  # Would need to check accessibility
                error="Accessibility not checked"
            ))
        
        return sources
    
    def validate_model(self) -> List[str]:
        """
        Validate ONNX model structure and return any issues.
        
        Returns:
            List of validation issues
        """
        issues = []
        
        try:
            import onnx
            onnx.checker.check_model(self.model)
        except Exception as e:
            issues.append(f"Model validation failed: {str(e)}")
        
        # Check for suspicious patterns
        if hasattr(self.model, 'graph') and self.model.graph:
            # Check for excessive external data
            external_data = self._extract_external_data()
            if len(external_data) > 10:
                issues.append(f"Model has {len(external_data)} external data references, which may indicate security concerns")
            
            # Check for custom operators
            custom_ops = self._extract_custom_operators(self._extract_operators())
            if custom_ops:
                issues.append(f"Model uses {len(custom_ops)} custom operators: {', '.join(custom_ops)}")
        
        return issues