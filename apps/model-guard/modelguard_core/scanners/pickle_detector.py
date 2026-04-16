"""
Advanced pickle deserialization security scanner.

This module detects and analyzes pickle-based serialization in ML models,
identifying potential security risks from arbitrary code execution using
proper pickle opcode parsing and exploit pattern detection.
"""

import io
import pickletools
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from ..types import SecurityFinding, Severity, ModelFormat


class AdvancedPickleAnalyzer:
    """
    Advanced pickle analysis with proper opcode parsing.
    
    Uses pickletools for accurate pickle stream analysis and detects:
    - Dangerous opcode sequences
    - Known exploit patterns
    - Suspicious imports and function calls
    - Obfuscated malicious code
    """
    
    # Dangerous modules that should never be imported in pickles
    DANGEROUS_MODULES = {
        'os', 'subprocess', 'sys', 'socket', 'urllib', 'requests',
        'http', 'ftplib', 'telnetlib', 'smtplib', 'pickle', 'importlib',
        '__builtin__', 'builtins', 'nt', 'posix', 'shutil', 'tempfile'
    }
    
    # Dangerous functions that can execute code
    DANGEROUS_FUNCTIONS = {
        'eval', 'exec', 'compile', 'execfile', 'system', 'popen',
        'spawn', 'call', 'run', 'Popen', 'open', 'input', '__import__',
        'getattr', 'setattr', 'delattr', 'dir', 'globals', 'locals',
        'vars', 'apply', 'reload'
    }
    
    # Risky opcodes that enable code execution
    DANGEROUS_OPCODES = {
        'REDUCE': 'Function call - can execute arbitrary code',
        'BUILD': 'Object construction - can instantiate dangerous classes',
        'INST': 'Legacy class instantiation - deprecated but dangerous',
        'OBJ': 'Object instantiation - can create malicious objects',
        'GLOBAL': 'Module/function import - can import malicious code',
        'STACK_GLOBAL': 'Dynamic import from stack - very dangerous',
        'EXT1': 'Extension code 1 - can execute custom code',
        'EXT2': 'Extension code 2 - can execute custom code',
        'EXT4': 'Extension code 4 - can execute custom code',
    }
    
    def __init__(self, model_path: Path):
        """
        Initialize advanced pickle analyzer.
        
        Args:
            model_path: Path to the model file
        """
        self.model_path = model_path
        self.findings: List[SecurityFinding] = []
        self.import_chain: List[Tuple[str, str]] = []  # (module, function)
        self.dangerous_operations: List[Dict[str, Any]] = []
    
    def analyze(self) -> Tuple[List[SecurityFinding], Dict[str, Any]]:
        """
        Perform deep pickle analysis.
        
        Returns:
            Tuple of (findings, analysis_metadata)
        """
        self.findings = []
        self.import_chain = []
        self.dangerous_operations = []
        
        try:
            # Read pickle data
            with open(self.model_path, 'rb') as f:
                pickle_data = f.read()
            
            # Analyze pickle opcodes
            self._analyze_opcodes(pickle_data)
            
            # Detect exploit patterns
            self._detect_exploit_patterns()
            
            # Generate findings based on analysis
            self._generate_findings()
            
            # Build metadata
            metadata = {
                'import_chain': self.import_chain,
                'dangerous_operations_count': len(self.dangerous_operations),
                'dangerous_operations': self.dangerous_operations[:10]  # Limit to first 10
            }
            
            return self.findings, metadata
            
        except Exception as e:
            # If pickle analysis fails, add a generic warning
            self.findings.append(SecurityFinding(
                id='PICKLE.ANALYSIS.ERROR',
                type='pickle_analysis_error',
                severity=Severity.MEDIUM,
                title='Pickle analysis failed',
                description=f'Could not fully analyze pickle data: {str(e)}. '
                           'This may indicate a corrupted file or non-standard pickle format.',
                recommendation='Manually inspect the model file and verify it is from a trusted source',
                evidence={'error': str(e), 'file': str(self.model_path)},
                scanner='advanced_pickle_analyzer',
                location={'file': str(self.model_path)},
                cwe_id='CWE-502',
                created_at=datetime.utcnow().isoformat() + 'Z'
            ))
            
            return self.findings, {'error': str(e)}
    
    def _analyze_opcodes(self, pickle_data: bytes) -> None:
        """
        Parse and analyze pickle opcodes.
        
        Args:
            pickle_data: Raw pickle data
        """
        try:
            # Use pickletools to disassemble pickle data
            opcodes = list(pickletools.genops(pickle_data))
            
            for opcode, arg, pos in opcodes:
                opcode_name = opcode.name
                
                # Track imports
                if opcode_name == 'GLOBAL':
                    self._analyze_global_import(arg)
                
                # Track dangerous operations
                if opcode_name in self.DANGEROUS_OPCODES:
                    self._track_dangerous_operation(opcode_name, arg, pos)
                
                # Analyze specific patterns
                if opcode_name == 'REDUCE':
                    self._analyze_reduce_operation(opcodes, pos)
                
                # Check for obfuscation techniques
                if opcode_name in ['STACK_GLOBAL', 'EXT1', 'EXT2', 'EXT4']:
                    self._flag_obfuscation(opcode_name, pos)
            
        except Exception as e:
            # Fallback to basic analysis if pickletools fails
            self._basic_byte_scan(pickle_data)
    
    def _analyze_global_import(self, arg: str) -> None:
        """
        Analyze GLOBAL opcode (module/function import).
        
        Args:
            arg: Import string (e.g., 'os.system')
        """
        try:
            if '.' in arg:
                parts = arg.rsplit('.', 1)
                module = parts[0]
                func = parts[1] if len(parts) > 1 else ''
            else:
                module = arg
                func = ''
            
            # Track import chain
            self.import_chain.append((module, func))
            
            # Check if dangerous
            if module in self.DANGEROUS_MODULES:
                self.dangerous_operations.append({
                    'type': 'dangerous_import',
                    'module': module,
                    'function': func,
                    'risk': 'CRITICAL',
                    'description': f'Import of dangerous module: {module}'
                })
            
            if func in self.DANGEROUS_FUNCTIONS:
                self.dangerous_operations.append({
                    'type': 'dangerous_function',
                    'module': module,
                    'function': func,
                    'risk': 'CRITICAL',
                    'description': f'Import of dangerous function: {module}.{func}'
                })
        
        except Exception:
            pass
    
    def _track_dangerous_operation(self, opcode_name: str, arg: Any, pos: int) -> None:
        """
        Track dangerous opcode operations.
        
        Args:
            opcode_name: Name of the opcode
            arg: Opcode argument
            pos: Position in pickle stream
        """
        self.dangerous_operations.append({
            'type': 'dangerous_opcode',
            'opcode': opcode_name,
            'description': self.DANGEROUS_OPCODES.get(opcode_name, 'Unknown risk'),
            'position': pos,
            'risk': 'HIGH'
        })
        
        # Risk score calculation removed - not useful for detection
    
    def _analyze_reduce_operation(self, opcodes: list, current_pos: int) -> None:
        """
        Analyze REDUCE opcode for suspicious patterns.
        
        REDUCE is particularly dangerous as it directly calls functions.
        
        Args:
            opcodes: List of all opcodes
            current_pos: Current position in opcode list
        """
        # Look at previous opcodes to understand what's being called
        lookback = 5
        start = max(0, current_pos - lookback)
        context_opcodes = opcodes[start:current_pos + 1]
        
        # Check for dangerous call patterns
        for opcode, arg, pos in context_opcodes:
            if opcode.name == 'GLOBAL':
                # REDUCE following GLOBAL means we're calling that function
                if arg:
                    arg_str = str(arg)
                    if any(dangerous in arg_str for dangerous in 
                           ['os.system', 'subprocess', 'eval', 'exec', '__import__']):
                        self.dangerous_operations.append({
                            'type': 'dangerous_reduce_call',
                            'target': arg_str,
                            'risk': 'CRITICAL',
                            'description': f'REDUCE operation calling dangerous function: {arg_str}'
                        })
    
    def _flag_obfuscation(self, opcode_name: str, pos: int) -> None:
        """
        Flag potential obfuscation techniques.
        
        Args:
            opcode_name: Obfuscation opcode name
            pos: Position in pickle stream
        """
        self.dangerous_operations.append({
            'type': 'obfuscation',
            'opcode': opcode_name,
            'position': pos,
            'risk': 'HIGH',
            'description': f'Potential obfuscation using {opcode_name}'
        })
        # Removed risk score calculation
    
    def _basic_byte_scan(self, pickle_data: bytes) -> None:
        """
        Fallback basic byte scanning if pickletools fails.
        
        Args:
            pickle_data: Raw pickle data
        """
        # Check for dangerous opcodes as bytes
        dangerous_bytes = {
            b'R': 'REDUCE',
            b'i': 'INST',
            b'o': 'OBJ',
            b'c': 'GLOBAL',
            b'\x93': 'STACK_GLOBAL',
        }
        
        for byte_seq, opcode_name in dangerous_bytes.items():
            count = pickle_data.count(byte_seq)
            if count > 0:
                self.dangerous_operations.append({
                    'type': 'byte_scan_detection',
                    'opcode': opcode_name,
                    'count': count,
                    'risk': 'MEDIUM',
                    'description': f'Found {count} instance(s) of {opcode_name} opcode'
                })
    
    def _detect_exploit_patterns(self) -> None:
        """Detect known exploit patterns in import chain and operations."""
        
        # Pattern 1: Remote code execution (socket + eval/exec)
        has_socket = any(module == 'socket' for module, _ in self.import_chain)
        has_eval = any(func in ['eval', 'exec'] for _, func in self.import_chain)
        if has_socket and has_eval:
            self.dangerous_operations.append({
                'type': 'exploit_pattern',
                'pattern': 'remote_code_execution',
                'confidence': 0.95,
                'risk': 'CRITICAL',
                'description': 'Detected remote code execution pattern (socket + eval/exec)'
            })
        
        # Pattern 2: Credential exfiltration (os + socket/urllib)
        has_os = any(module == 'os' for module, _ in self.import_chain)
        has_network = any(module in ['socket', 'urllib', 'requests', 'http'] 
                         for module, _ in self.import_chain)
        if has_os and has_network:
            self.dangerous_operations.append({
                'type': 'exploit_pattern',
                'pattern': 'data_exfiltration',
                'confidence': 0.85,
                'risk': 'CRITICAL',
                'description': 'Detected data exfiltration pattern (os + networking)'
            })
        
        # Pattern 3: Backdoor installation (subprocess + persistence)
        has_subprocess = any(module == 'subprocess' for module, _ in self.import_chain)
        if has_subprocess:
            self.dangerous_operations.append({
                'type': 'exploit_pattern',
                'pattern': 'backdoor_installation',
                'confidence': 0.75,
                'risk': 'CRITICAL',
                'description': 'Detected potential backdoor pattern (subprocess usage)'
            })
        
        # Pattern 4: Dynamic code loading (__import__ + eval)
        has_import = any(func == '__import__' for _, func in self.import_chain)
        if has_import and has_eval:
            self.dangerous_operations.append({
                'type': 'exploit_pattern',
                'pattern': 'dynamic_code_loading',
                'confidence': 0.90,
                'risk': 'CRITICAL',
                'description': 'Detected dynamic code loading pattern (__import__ + eval)'
            })
    
    def _generate_findings(self) -> None:
        """Generate security findings based on analysis."""
        
        # Critical: Only flag actual exploit patterns, not risk scores
        has_exploit_patterns = any(
            op.get('type') == 'exploit_pattern' or 
            op.get('risk') == 'CRITICAL' and op.get('type') in ['dangerous_import', 'dangerous_function']
            for op in self.dangerous_operations
        )
        
        # Check if this looks like a legitimate PyTorch model
        is_likely_pytorch = any(
            'torch' in str(op.get('module', '')).lower() or
            'torch' in str(op.get('function', '')).lower()
            for op in self.dangerous_operations
        )
        
        # For PyTorch models, only flag clear malicious patterns
        if is_likely_pytorch and not has_exploit_patterns:
            should_flag_critical = False  # Don't flag legitimate PyTorch models
        else:
            # For non-PyTorch models, flag exploit patterns
            should_flag_critical = has_exploit_patterns
        
        if should_flag_critical:
            self.findings.append(SecurityFinding(
                id='PICKLE.EXPLOIT.CRITICAL',
                type='pickle_exploit',
                severity=Severity.CRITICAL,
                title='Critical pickle exploit detected',
                description=f'Pickle analysis detected CRITICAL security risks. '
                           f'Found {len(self.dangerous_operations)} dangerous operations including known exploit patterns. '
                           'DO NOT LOAD THIS MODEL.',
                recommendation='BLOCK this model immediately. Report to security team. Do not attempt to load or use this model.',
                evidence={
                    'dangerous_operations': self.dangerous_operations[:20],  # Limit evidence
                    'import_chain': self.import_chain[:20],
                    'critical_issues': [op for op in self.dangerous_operations if op.get('risk') == 'CRITICAL']
                },
                scanner='advanced_pickle_analyzer',
                location={'file': str(self.model_path)},
                cwe_id='CWE-502',
                created_at=datetime.utcnow().isoformat() + 'Z'
            ))
        
        # High: Dangerous imports
        dangerous_imports = [op for op in self.dangerous_operations 
                            if op.get('type') in ['dangerous_import', 'dangerous_function']]
        if dangerous_imports:
            import_list = [f"{op.get('module', '')}.{op.get('function', '')}" 
                          for op in dangerous_imports[:10]]
            self.findings.append(SecurityFinding(
                id='PICKLE.IMPORTS.DANGEROUS',
                type='pickle_dangerous_imports',
                severity=Severity.CRITICAL,
                title=f'Dangerous imports detected in pickle: {len(dangerous_imports)} found',
                description=f'Pickle contains imports of dangerous modules/functions: {", ".join(import_list)}. '
                           'These can be used for arbitrary code execution, data exfiltration, or system compromise.',
                recommendation='Do not load this model. Verify source and scan for malware.',
                evidence={
                    'dangerous_imports': dangerous_imports[:20],
                    'count': len(dangerous_imports),
                    'modules': list(set(op.get('module', '') for op in dangerous_imports))
                },
                scanner='advanced_pickle_analyzer',
                location={'file': str(self.model_path)},
                cwe_id='CWE-502',
                created_at=datetime.utcnow().isoformat() + 'Z'
            ))
        
        # High: Dangerous opcodes (REDUCE, BUILD, etc.)
        dangerous_opcodes = [op for op in self.dangerous_operations 
                            if op.get('type') == 'dangerous_opcode']
        if len(dangerous_opcodes) > 10:
            self.findings.append(SecurityFinding(
                id='PICKLE.OPCODES.EXCESSIVE',
                type='pickle_dangerous_opcodes',
                severity=Severity.HIGH,
                title=f'Excessive dangerous opcodes: {len(dangerous_opcodes)} found',
                description=f'Pickle contains {len(dangerous_opcodes)} dangerous opcodes that enable code execution. '
                           'This is unusually high and may indicate malicious code.',
                recommendation='Thoroughly review this model. Consider using SafeTensors format instead.',
                evidence={
                    'dangerous_opcodes': dangerous_opcodes[:20],
                    'count': len(dangerous_opcodes),
                    'opcodes': list(set(op.get('opcode', '') for op in dangerous_opcodes))
                },
                scanner='advanced_pickle_analyzer',
                location={'file': str(self.model_path)},
                cwe_id='CWE-502',
                created_at=datetime.utcnow().isoformat() + 'Z'
            ))
        elif len(dangerous_opcodes) > 0:
            self.findings.append(SecurityFinding(
                id='PICKLE.OPCODES.PRESENT',
                type='pickle_dangerous_opcodes',
                severity=Severity.MEDIUM,
                title=f'Dangerous opcodes detected: {len(dangerous_opcodes)} found',
                description=f'Pickle contains {len(dangerous_opcodes)} dangerous opcodes (REDUCE, BUILD, etc.) that can execute code. '
                           'This is normal for PyTorch models but presents security risks.',
                recommendation='Load with torch.load(weights_only=True) or convert to SafeTensors format',
                evidence={
                    'dangerous_opcodes': dangerous_opcodes[:10],
                    'count': len(dangerous_opcodes)
                },
                scanner='advanced_pickle_analyzer',
                location={'file': str(self.model_path)},
                cwe_id='CWE-502',
                created_at=datetime.utcnow().isoformat() + 'Z'
            ))
        
        # Critical: Obfuscation detected
        obfuscation = [op for op in self.dangerous_operations if op.get('type') == 'obfuscation']
        if obfuscation:
            self.findings.append(SecurityFinding(
                id='PICKLE.OBFUSCATION.DETECTED',
                type='pickle_obfuscation',
                severity=Severity.CRITICAL,
                title='Pickle obfuscation detected',
                description=f'Pickle uses obfuscation techniques ({len(obfuscation)} instances detected). '
                           'This is a strong indicator of malicious intent.',
                recommendation='BLOCK this model. Report to security team.',
                evidence={'obfuscation_techniques': obfuscation},
                scanner='advanced_pickle_analyzer',
                location={'file': str(self.model_path)},
                cwe_id='CWE-656',
                created_at=datetime.utcnow().isoformat() + 'Z'
            ))
        
        # Critical: Known exploit patterns
        exploit_patterns = [op for op in self.dangerous_operations if op.get('type') == 'exploit_pattern']
        if exploit_patterns:
            for pattern in exploit_patterns:
                self.findings.append(SecurityFinding(
                    id=f'PICKLE.EXPLOIT.{pattern.get("pattern", "UNKNOWN").upper()}',
                    type='pickle_known_exploit',
                    severity=Severity.CRITICAL,
                    title=f'Known exploit pattern detected: {pattern.get("pattern", "unknown")}',
                    description=f'{pattern.get("description", "Unknown exploit pattern detected")}. '
                               f'Confidence: {pattern.get("confidence", 0.0):.0%}',
                    recommendation='DO NOT LOAD THIS MODEL. This is a known attack pattern. Report immediately.',
                    evidence=pattern,
                    scanner='advanced_pickle_analyzer',
                    location={'file': str(self.model_path)},
                    cwe_id='CWE-502',
                    created_at=datetime.utcnow().isoformat() + 'Z'
                ))


class PickleDetector:
    """Main pickle security detector with advanced analysis."""
    
    def __init__(self, model_path: Path, model_format: ModelFormat):
        """
        Initialize pickle detector.
        
        Args:
            model_path: Path to the model file
            model_format: Detected model format
        """
        self.model_path = model_path
        self.model_format = model_format
        self.findings: List[SecurityFinding] = []
    
    def scan(self) -> List[SecurityFinding]:
        """
        Scan model for pickle-based security issues.
        
        Returns:
            List of security findings
        """
        self.findings = []
        
        # Always add format-level warning for pickle-based formats
        if self.model_format == ModelFormat.PYTORCH:
            self._add_format_warning()
        elif self.model_format == ModelFormat.KERAS:
            self._scan_keras_model()
        
        # Perform deep pickle analysis
        if self.model_format in [ModelFormat.PYTORCH, ModelFormat.KERAS]:
            self._perform_advanced_analysis()
        
        return self.findings
    
    def _add_format_warning(self) -> None:
        """Add format-level warning for PyTorch pickle."""
        self.findings.append(SecurityFinding(
            id='PICKLE.PYTORCH.FORMAT',
            type='pickle_format_risk',
            severity=Severity.HIGH,
            title='PyTorch model uses pickle serialization',
            description='PyTorch models use pickle serialization by default, which can execute arbitrary code during torch.load(). '
                       'While this is standard for PyTorch, it presents security risks when loading untrusted models. '
                       'WARNING: Static analysis cannot detect all possible malicious code in pickle files.',
            recommendation='Best practices:\n'
                          '1. Load with torch.load(weights_only=True) if possible\n'
                          '2. Convert to SafeTensors format for production use\n'
                          '3. Only load models from trusted sources\n'
                          '4. Consider this model requires manual review',
            evidence={
                'format': 'pytorch-pickle',
                'file': str(self.model_path),
                'risk_level': 'high'
            },
            scanner='pickle_detector',
            location={'file': str(self.model_path)},
            cwe_id='CWE-502',
            created_at=datetime.utcnow().isoformat() + 'Z'
        ))
    
    def _scan_keras_model(self) -> None:
        """Scan Keras model for Lambda layers."""
        try:
            with open(self.model_path, 'rb') as f:
                content = f.read()
                
                # Look for lambda layer indicators
                if b'lambda' in content.lower() or b'Lambda' in content:
                    self.findings.append(SecurityFinding(
                        id='PICKLE.KERAS.LAMBDA',
                        type='pickle_lambda_layer',
                        severity=Severity.HIGH,
                        title='Keras Lambda layer detected',
                        description='Keras models with Lambda layers use pickle serialization, '
                                   'which can be exploited to execute arbitrary code.',
                        recommendation='Avoid Lambda layers or use custom layers with get_config()/from_config() methods',
                        evidence={
                            'format': 'keras',
                            'file': str(self.model_path),
                            'detected_pattern': 'lambda_layer'
                        },
                        scanner='pickle_detector',
                        location={'file': str(self.model_path)},
                        cwe_id='CWE-502',
                        created_at=datetime.utcnow().isoformat() + 'Z'
                    ))
        except Exception:
            pass  # File reading error, skip
    
    def _perform_advanced_analysis(self) -> None:
        """Perform advanced pickle analysis using AdvancedPickleAnalyzer."""
        try:
            analyzer = AdvancedPickleAnalyzer(self.model_path)
            advanced_findings, metadata = analyzer.analyze()
            
            # Add all advanced findings
            self.findings.extend(advanced_findings)
            
        except Exception as e:
            # If advanced analysis fails, add a warning
                    self.findings.append(SecurityFinding(
                id='PICKLE.ADVANCED.UNAVAILABLE',
                type='pickle_analysis_limited',
                severity=Severity.LOW,
                title='Advanced pickle analysis unavailable',
                description=f'Could not perform deep pickle analysis: {str(e)}. '
                           'Basic pickle security warnings still apply.',
                recommendation='Proceed with caution and only load from trusted sources',
                evidence={'error': str(e)},
                        scanner='pickle_detector',
                        location={'file': str(self.model_path)},
                        created_at=datetime.utcnow().isoformat() + 'Z'
                    ))


def scan_for_pickle(model_path: Path, model_format: ModelFormat) -> List[SecurityFinding]:
    """
    Convenience function to scan for pickle vulnerabilities.
    
    Args:
        model_path: Path to the model file
        model_format: Detected model format
        
    Returns:
        List of security findings
    """
    detector = PickleDetector(model_path, model_format)
    return detector.scan()
