"""
Policy Compiler for Composable Guard Algebra (CGA)

Compiles YAML policies into executable guard graphs using the registry
and combinator system.
"""

import asyncio
import json
import logging
import yaml
import ast
import re
import inspect
from typing import Any, Dict, Tuple, Set, Optional, Literal

from .types import Guard, Ctx, GuardParamMapping
from .comb import lens, focus, allOf, seq, anyOf, kOf, unless
from .registry import REGISTRY, get_guard, get_guard_metadata
from .composition import par as parallel_compose
from .scheduler import SmartGuardScheduler


logger = logging.getLogger(__name__)


def compile_policy(yaml_bytes: bytes) -> Tuple[Guard, Dict[str, Any]]:
    """
    Compile a YAML policy into an executable guard graph
    
    Args:
        yaml_bytes: YAML policy content as bytes
        
    Returns:
        Tuple of (compiled_guard, policy_metadata)
        
    Raises:
        ValueError: If policy is invalid
        KeyError: If referenced guards or schemas are not found
        
    Note: Risk categories should be queried from database via risk_category_links
    when the policy is loaded, not during compilation.
    """
    try:
        policy_data = yaml.safe_load(yaml_bytes)
    except yaml.YAMLError as e:
        raise ValueError(f"Invalid YAML policy: {e}")
    
    if not isinstance(policy_data, dict):
        raise ValueError("Policy must be a dictionary")
    
    if "guards" not in policy_data:
        raise ValueError("Policy must contain 'guards' section")
    
    if policy_data["guards"] is None:
        raise ValueError("Policy 'guards' section cannot be None")
    
    if not isinstance(policy_data["guards"], list):
        raise ValueError(f"Policy 'guards' section must be a list, got {type(policy_data['guards'])}")
    
    if "compose" not in policy_data:
        raise ValueError("Policy must contain 'compose' section")
    
    # Build guard steps and organize by tier
    guard_steps = {}
    guards_by_tier: Dict[Literal["T0", "T1", "T2"], Dict[str, Guard]] = {
        "T0": {},
        "T1": {},
        "T2": {}
    }
    
    # Collect guard keys for database risk category lookup
    # We'll query risk categories from database after compilation
    guard_keys = []
    
    # Build guard instances
    for guard_def in policy_data["guards"]:
        if not isinstance(guard_def, dict):
            raise ValueError("Guard definition must be a dictionary")
        
        guard_id = guard_def.get("id")
        if not guard_id:
            raise ValueError("Guard definition must have 'id' field")
        
        # ONNX guards: Add to guard_keys for risk category lookup, but skip compilation
        # ONNX inference runs separately in pipeline (run_onnx_detection step)
        if guard_id.startswith("onnx."):
            logger.info(f"⏭️  Skipping ONNX guard '{guard_id}' compilation - ONNX inference is handled separately")
            guard_keys.append(guard_id)  # ✅ Include in guard_keys for risk category lookup
            continue
        
        target = guard_def.get("target")
        if not target:
            raise ValueError(f"Guard '{guard_id}' must have 'target' field")
        
        # Handle both string and dict format for target
        # YAML generator may produce: target: "path" or target: {path: "path"}
        if isinstance(target, dict):
            target = target.get("path", target.get("jsonpath", "messages[*].content"))
        
        if not isinstance(target, str):
            raise ValueError(f"Guard '{guard_id}' target must be a string or dict with 'path' key, got {type(target)}")
        
        # Get guard factory
        try:
            factory = get_guard(guard_id)
        except KeyError:
            raise KeyError(f"Guard '{guard_id}' not found in registry")
        
        # Get guard metadata for tier information
        guard_meta = get_guard_metadata(guard_id)
        tier = guard_meta.tier if guard_meta and guard_meta.tier else "T1"  # Default to T1
        
        # Store guard key for database risk category lookup
        guard_keys.append(guard_id)
        
        # Build lens for target
        getter, setter = lens(target)
        
        # Get guard parameters
        params = {}
        if "with" in guard_def:
            params = guard_def["with"]
        elif "with_ref" in guard_def:
            # Load parameters from referenced file
            ref_path = guard_def["with_ref"]
            try:
                with open(ref_path, 'r') as f:
                    params = json.load(f)
            except (FileNotFoundError, json.JSONDecodeError) as e:
                raise ValueError(f"Cannot load guard parameters from '{ref_path}': {e}")
        
        # Create guard instance
        try:
            # CRITICAL FIX: Validate and map parameters before factory call
            guard_instance = factory(**params)
        except TypeError as e:
            # Parameter mismatch detected - try to fix it
            error_msg = str(e)
            if "unexpected keyword argument" in error_msg or "got an unexpected" in error_msg:
                # Extract parameter signature from factory function
                sig = inspect.signature(factory)
                valid_params = list(sig.parameters.keys())
                
                # Map database params to valid function params
                mapped_params, unmatched = GuardParamMapping.map_parameters(params, valid_params)
                
                # Log mapping results
                if unmatched:
                    logger.warning(
                        f"Guard '{guard_id}': Remapped parameters. "
                        f"Database params had mismatches: {list(unmatched.keys())}. "
                        f"Using mapped params: {list(mapped_params.keys())}"
                    )
                
                # Try again with mapped parameters
                try:
                    guard_instance = factory(**mapped_params)
                except TypeError as retry_error:
                    raise ValueError(
                        f"Invalid parameters for guard '{guard_id}'. "
                        f"Original error: {e}. "
                        f"Valid parameters are: {valid_params}. "
                        f"Provided: {list(params.keys())}"
                    )
            else:
                raise ValueError(f"Invalid parameters for guard '{guard_id}': {e}")
        
        # Wrap with lens
        focused_guard = focus(getter, setter, guard_instance)
        guard_steps[guard_id] = focused_guard
        
        # Organize by tier for TieredGuardRunner
        guards_by_tier[tier][guard_id] = focused_guard
    
    # Parse composition expressions
    compose_section = policy_data.get("compose", {})
    
    # Build composition context
    composition_context = {
        "allOf": allOf,
        "seq": seq,
        "anyOf": anyOf,
        "kOf": kOf,
        "unless": unless,
        "par": parallel_compose,  # New parallel composition
    }
    
    # Add guard instances to composition context
    for guard_id, guard_instance in guard_steps.items():
        # Replace dots with underscores for valid Python identifiers
        python_id = guard_id.replace(".", "_")
        composition_context[python_id] = guard_instance
    
    # Compile all compositions
    compiled_guards = {}
    
    # First pass: compile all non-root phases
    for phase, compose_expr in compose_section.items():
        if phase == "root" or not compose_expr:
            continue
            
        try:
            # Validate expression safety first
            if not _is_safe_expression(compose_expr, set(composition_context.keys())):
                raise ValueError(f"Unsafe composition expression '{compose_expr}' for phase '{phase}'")
            
            # Evaluate composition expression with restricted environment
            compiled_guard = eval(compose_expr, {"__builtins__": {}}, composition_context)
            
            # If the result is a coroutine, we need to await it
            if asyncio.iscoroutine(compiled_guard):
                # This shouldn't happen in normal usage, but let's handle it
                raise ValueError("Composition expression returned a coroutine - this indicates a bug in the combinator implementation")
                
        except Exception as e:
            raise ValueError(f"Invalid composition expression '{compose_expr}' for phase '{phase}': {e}")
        
        # Validate that result is a Guard
        if not callable(compiled_guard):
            raise ValueError(f"Composition expression for phase '{phase}' must evaluate to a Guard, got {type(compiled_guard)}")
        
        compiled_guards[phase] = compiled_guard
        # Add compiled phase guard to context so root can reference it
        composition_context[phase] = compiled_guard
    
    # Second pass: compile root expression (can now reference phase guards)
    if "root" in compose_section:
        root_expr = compose_section["root"]
        if root_expr:
            try:
                if not _is_safe_expression(root_expr, set(composition_context.keys())):
                    raise ValueError(f"Unsafe composition expression '{root_expr}' for phase 'root'")
                
                compiled_guard = eval(root_expr, {"__builtins__": {}}, composition_context)
                
                if asyncio.iscoroutine(compiled_guard):
                    raise ValueError("Composition expression returned a coroutine - this indicates a bug in the combinator implementation")
                    
            except Exception as e:
                raise ValueError(f"Invalid composition expression '{root_expr}' for phase 'root': {e}")
            
            if not callable(compiled_guard):
                raise ValueError(f"Composition expression for phase 'root' must evaluate to a Guard, got {type(compiled_guard)}")
            
            compiled_guards["root"] = compiled_guard
    
    # Ensure we have at least a root composition
    if "root" not in compiled_guards:
        raise ValueError("Compose section must have 'root' expression")
    
    # Add tier-organized guards to policy metadata for TieredGuardRunner
    policy_data["guards_by_tier"] = guards_by_tier
    policy_data["tier_counts"] = {
        "T0": len(guards_by_tier["T0"]),
        "T1": len(guards_by_tier["T1"]),
        "T2": len(guards_by_tier["T2"])
    }
    
    # Store guard keys for database risk category lookup
    # The cache layer will query risk_category_links to get actual risk categories
    policy_data["guard_keys"] = guard_keys
    
    return compiled_guards, policy_data


def compile_policy_from_file(file_path: str) -> Tuple[Guard, Dict[str, Any]]:
    """
    Compile a policy from a YAML file
    
    Args:
        file_path: Path to YAML policy file
        
    Returns:
        Tuple of (compiled_guard, policy_metadata)
    """
    try:
        with open(file_path, 'rb') as f:
            return compile_policy(f.read())
    except FileNotFoundError:
        raise ValueError(f"Policy file not found: {file_path}")
    except Exception as e:
        raise ValueError(f"Error loading policy from '{file_path}': {e}")


def validate_policy_structure(policy_data: Dict[str, Any]) -> None:
    """
    Validate policy structure without compiling
    
    Args:
        policy_data: Parsed policy data
        
    Raises:
        ValueError: If policy structure is invalid
    """
    required_sections = ["guards", "compose"]
    for section in required_sections:
        if section not in policy_data:
            raise ValueError(f"Policy must contain '{section}' section")
    
    # Validate guards section
    guards = policy_data["guards"]
    if not isinstance(guards, list):
        raise ValueError("'guards' must be a list")
    
    for i, guard_def in enumerate(guards):
        if not isinstance(guard_def, dict):
            raise ValueError(f"Guard definition at index {i} must be a dictionary")
        
        required_fields = ["id", "target"]
        for field in required_fields:
            if field not in guard_def:
                raise ValueError(f"Guard at index {i} must have '{field}' field")
        
        guard_id = guard_def["id"]
        if not isinstance(guard_id, str):
            raise ValueError(f"Guard ID at index {i} must be a string")
        
        # Check if guard is registered
        if guard_id not in REGISTRY:
            raise ValueError(f"Guard '{guard_id}' at index {i} is not registered")
    
    # Validate compose section
    compose = policy_data["compose"]
    if not isinstance(compose, dict):
        raise ValueError("'compose' must be a dictionary")
    
    if "root" not in compose:
        raise ValueError("'compose' must have 'root' expression")
    
    root_expr = compose["root"]
    if not isinstance(root_expr, str):
        raise ValueError("'root' expression must be a string")


def _is_safe_expression(expr: str, allowed_names: Set[str]) -> bool:
    """
    Validate that a composition expression is safe to evaluate
    
    Uses AST parsing to ensure only allowed operations and names are used.
    
    Args:
        expr: The expression to validate
        allowed_names: Set of allowed variable names
        
    Returns:
        True if the expression is safe, False otherwise
    """
    try:
        # Parse the expression into an AST
        tree = ast.parse(expr, mode='eval')
        
        # Walk the AST and check for unsafe operations
        for node in ast.walk(tree):
            if isinstance(node, ast.Name):
                # Check if the name is allowed
                if node.id not in allowed_names:
                    return False
            elif isinstance(node, (ast.Import, ast.ImportFrom)):
                # No imports allowed
                return False
            elif isinstance(node, ast.Attribute):
                # No attribute access (prevents module.function calls)
                return False
            elif isinstance(node, ast.Call):
                # Only allow calls to known functions
                if isinstance(node.func, ast.Name):
                    if node.func.id not in allowed_names:
                        return False
                else:
                    # Complex function calls not allowed
                    return False
            elif isinstance(node, (ast.Lambda, ast.FunctionDef, ast.AsyncFunctionDef)):
                # No function definitions
                return False
            elif isinstance(node, (ast.ListComp, ast.DictComp, ast.SetComp, ast.GeneratorExp)):
                # No comprehensions (could be used for side effects)
                return False
            # Note: ast.Exec and ast.Eval were removed in Python 3.8+
            # They're handled by checking for 'exec' and 'eval' as function names
        
        return True
        
    except SyntaxError:
        # Invalid syntax
        return False


def _custom_ast_interpreter(expr: str, context: Dict[str, Any]) -> Optional[Guard]:
    """
    Custom AST interpreter for composition expressions
    
    Provides a safer alternative to eval() by directly interpreting AST nodes
    and constructing guard compositions without code execution.
    """
    try:
        tree = ast.parse(expr, mode='eval')
        return _interpret_ast_node(tree.body, context)
    except Exception:
        # Fall back to None if AST interpretation fails
        return None


def _interpret_ast_node(node: ast.AST, context: Dict[str, Any]) -> Any:
    """
    Interpret a single AST node and return the corresponding value
    
    Args:
        node: AST node to interpret
        context: Available variables and functions
        
    Returns:
        The interpreted value (guard, combinator result, etc.)
    """
    if isinstance(node, ast.Name):
        # Variable lookup
        if node.id in context:
            return context[node.id]
        raise NameError(f"Name '{node.id}' is not defined")
    
    elif isinstance(node, ast.Call):
        # Function call
        func = _interpret_ast_node(node.func, context)
        args = [_interpret_ast_node(arg, context) for arg in node.args]
        kwargs = {
            kw.arg: _interpret_ast_node(kw.value, context) 
            for kw in node.keywords
        }
        return func(*args, **kwargs)
    
    elif isinstance(node, ast.Attribute):
        # Attribute access (e.g., obj.attr)
        value = _interpret_ast_node(node.value, context)
        return getattr(value, node.attr)
    
    elif isinstance(node, ast.Constant):
        # Literal values (strings, numbers, etc.)
        return node.value
    
    elif isinstance(node, ast.List):
        # List literals
        return [_interpret_ast_node(elt, context) for elt in node.elts]
    
    elif isinstance(node, ast.Dict):
        # Dictionary literals
        return {
            _interpret_ast_node(k, context): _interpret_ast_node(v, context)
            for k, v in zip(node.keys, node.values)
        }
    
    else:
        raise TypeError(f"Unsupported AST node type: {type(node).__name__}")
