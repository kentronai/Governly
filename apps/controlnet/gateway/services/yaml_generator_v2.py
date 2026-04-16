"""
YAML Generator Service V2.

Generates policy YAML from structured guardrail selections.
Follows UI_DATABASE_YAML_FLOW.md architecture with dynamic guardrail support.
"""

import logging
from typing import Dict, List, Any, Optional
import yaml
import hashlib
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

logger = logging.getLogger(__name__)


class PolicyYAMLGenerator:
    """
    Generate policy YAML from database records.
    Converts structured guardrail selections into enforcement-ready YAML.
    Now supports dynamic guardrails created by AI.
    """
    
    def __init__(self, db_session: AsyncSession):
        """Initialize with database session."""
        self.db = db_session
    
    async def generate_yaml_from_guardrails(
        self,
        policy_name: str,
        policy_description: str,
        guardrail_links: List[Dict[str, Any]],
        composition_strategy: Dict[str, str],
        guardrails_data: Optional[List[Dict[str, Any]]] = None
    ) -> str:
        """
        Generate YAML from guardrail selections (existing method).
        
        Args:
            policy_name: Name of the policy
            policy_description: Description of the policy
            guardrail_links: List of guardrail links with phase, params, order, etc.
            composition_strategy: Composition strategy per phase (allOf, anyOf, custom)
            guardrails_data: Optional pre-fetched guardrail data
            
        Returns:
            Generated YAML string
            
        Raises:
            ValueError: If guardrails not found or invalid configuration
        """
        logger.info(f"Generating YAML for policy: {policy_name}")
        
        # Fetch guardrail data if not provided
        if guardrails_data is None:
            guardrail_ids = [link["guardrail_id"] for link in guardrail_links]
            guardrails_data = await self._fetch_guardrails_data(guardrail_ids)
        
        # Build guardrails map for quick lookup
        guardrails_map = {g["id"]: g for g in guardrails_data}
        
        # Group guardrails by phase
        phases = {}
        for link in guardrail_links:
            phase = link["phase"]
            if phase not in phases:
                phases[phase] = []
            
            guardrail_data = guardrails_map.get(link["guardrail_id"])
            if not guardrail_data:
                raise ValueError(f"Guardrail not found: {link['guardrail_id']}")
            
            phases[phase].append({
                "link": link,
                "data": guardrail_data
            })
        
        # Sort each phase by order_index
        for phase in phases:
            phases[phase].sort(key=lambda x: x["link"].get("order_index", 0))
        
        # Generate YAML structure
        yaml_dict = {
            "policy": policy_name,
            "description": policy_description,
            "guards": []
        }
        
        # Add guards from all phases
        for phase_name in ["input", "output", "tool_args", "tool_result"]:
            if phase_name in phases:
                for item in phases[phase_name]:
                    guard_yaml = self._build_guard_yaml(item["link"], item["data"])
                    yaml_dict["guards"].append(guard_yaml)
        
        # Add composition
        if composition_strategy:
            yaml_dict["compose"] = self._build_composition_yaml(phases, composition_strategy)
        
        # Convert to YAML string
        yaml_string = yaml.dump(yaml_dict, default_flow_style=False, sort_keys=False)
        
        logger.info(f"✅ Generated YAML with {len(yaml_dict['guards'])} guards")
        return yaml_string
    
    async def generate_yaml_with_dynamic_guardrails(
        self,
        policy_name: str,
        policy_description: str,
        all_guardrails: List[Dict[str, Any]],  # Mix of existing + dynamic
        composition_strategy: Dict[str, str],
        guardrails_data: Optional[List[Dict[str, Any]]] = None
    ) -> str:
        """
        Generate YAML with both database guardrails and dynamic AI-created guardrails.
        
        Args:
            policy_name: Name of the policy
            policy_description: Description of the policy
            all_guardrails: List of all guardrails (existing + dynamic)
            composition_strategy: Composition strategy per phase
            guardrails_data: Optional pre-fetched guardrail data (for existing guardrails only)
            
        Returns:
            Generated YAML string with both existing and dynamic guardrails
        """
        logger.info(f"Generating YAML with dynamic guardrails for policy: {policy_name}")
        
        # Separate existing and dynamic guardrails
        existing_guardrails = [g for g in all_guardrails if g.get("source") == "database"]
        dynamic_guardrails = [g for g in all_guardrails if g.get("source") == "dynamic"]
        
        logger.info(f"Processing {len(existing_guardrails)} existing + {len(dynamic_guardrails)} dynamic guardrails")
        
        # Fetch data for existing guardrails if not provided
        guardrails_map = {}
        if existing_guardrails and guardrails_data is None:
            guardrail_ids = [g["guardrail_id"] for g in existing_guardrails]
            guardrails_data = await self._fetch_guardrails_data(guardrail_ids)
            guardrails_map = {g["id"]: g for g in guardrails_data}
        elif guardrails_data:
            guardrails_map = {g["id"]: g for g in guardrails_data}
        
        # Group all guardrails by phase
        phases = {}
        
        # Process existing guardrails
        for guardrail in existing_guardrails:
            phase = guardrail["phase"]
            if phase not in phases:
                phases[phase] = []
            
            guardrail_data = guardrails_map.get(guardrail["guardrail_id"])
            if not guardrail_data:
                logger.warning(f"Guardrail data not found for: {guardrail['guardrail_id']}")
                continue
            
            phases[phase].append({
                "type": "existing",
                "link": guardrail,
                "data": guardrail_data
            })
        
        # Process dynamic guardrails
        for guardrail in dynamic_guardrails:
            phase = guardrail["phase"]
            if phase not in phases:
                phases[phase] = []
            
            phases[phase].append({
                "type": "dynamic",
                "guardrail": guardrail
            })
        
        # Sort each phase by order_index
        for phase in phases:
            phases[phase].sort(key=lambda x: 
                x.get("link", {}).get("order_index", 0) if x["type"] == "existing" 
                else x.get("guardrail", {}).get("order_index", 0)
            )
        
        # Generate YAML structure
        yaml_dict = {
            "policy": policy_name,
            "description": policy_description,
            "guards": []
        }
        
        # Add guards from all phases
        for phase_name in ["input", "output", "tool_args", "tool_result"]:
            if phase_name in phases:
                for item in phases[phase_name]:
                    if item["type"] == "existing":
                        # Existing guardrail from database
                        guard_yaml = self._build_guard_yaml(item["link"], item["data"])
                    else:
                        # Dynamic guardrail created by AI
                        guard_yaml = self._build_dynamic_guard_yaml(item["guardrail"])
                    
                    yaml_dict["guards"].append(guard_yaml)
        
        # Add composition
        if composition_strategy:
            yaml_dict["compose"] = self._build_composition_yaml_with_dynamic(phases, composition_strategy)
        
        # Convert to YAML string
        yaml_string = yaml.dump(yaml_dict, default_flow_style=False, sort_keys=False)
        
        logger.info(f"✅ Generated YAML with {len(yaml_dict['guards'])} total guards ({len(existing_guardrails)} existing + {len(dynamic_guardrails)} dynamic)")
        return yaml_string
    
    def _build_guard_yaml(self, link: Dict[str, Any], guardrail_data: Dict[str, Any]) -> Dict[str, Any]:
        """Build YAML structure for an existing guardrail."""
        guard_yaml = {
            "id": guardrail_data["key"],
            "target": link.get("target", "messages[*].content")
        }
        
        # Merge default params with link-specific params
        params = guardrail_data.get("default_params", {}).copy()
        if link.get("params"):
            # Filter out non-guard parameters (phase, order_index, etc.)
            guard_params = {k: v for k, v in link["params"].items() 
                          if k not in ["phase", "order_index", "enabled", "guardrail_id"]}
            params.update(guard_params)
        
        if params:
            guard_yaml["with"] = params
        
        # Add threshold if specified
        if link.get("threshold") is not None:
            guard_yaml["threshold"] = float(link["threshold"])
        
        return guard_yaml
    
    def _build_dynamic_guard_yaml(self, dynamic_guardrail: Dict[str, Any]) -> Dict[str, Any]:
        """Build YAML structure for a dynamic AI-created guardrail."""
        guard_yaml = {
            "id": dynamic_guardrail["key"],
            "target": dynamic_guardrail.get("target", "messages[*].content")
        }
        
        # Add parameters if specified
        params = dynamic_guardrail.get("params", {})
        if params:
            guard_yaml["with"] = params
        
        return guard_yaml
    
    def _build_composition_yaml(self, phases: Dict[str, List], composition_strategy: Dict[str, str]) -> Dict[str, str]:
        """Build composition YAML for existing guardrails."""
        compose = {}
        phase_expressions = []
        
        for phase_name, strategy in composition_strategy.items():
            if phase_name in phases and phases[phase_name]:
                guard_names = []
                for item in phases[phase_name]:
                    guard_key = item["data"]["key"]
                    # Convert dots to underscores for Python identifiers (e.g., "pii.redact" -> "pii_redact")
                    # The compiler does the same conversion when building the composition context
                    python_id = guard_key.replace(".", "_")
                    guard_names.append(python_id)
                
                if guard_names:
                    if strategy == "allOf":
                        compose[phase_name] = f"allOf({', '.join(guard_names)})"
                    elif strategy == "anyOf":
                        compose[phase_name] = f"anyOf({', '.join(guard_names)})"
                    else:
                        compose[phase_name] = strategy
                    
                    # Track phase for root composition
                    phase_expressions.append(phase_name)
        
        # Create root expression that sequences all phases
        if phase_expressions:
            if len(phase_expressions) == 1:
                compose["root"] = phase_expressions[0]
            else:
                compose["root"] = f"seq({', '.join(phase_expressions)})"
        
        return compose
    
    def _build_composition_yaml_with_dynamic(self, phases: Dict[str, List], composition_strategy: Dict[str, str]) -> Dict[str, str]:
        """Build composition YAML for both existing and dynamic guardrails."""
        compose = {}
        phase_expressions = []
        
        for phase_name, strategy in composition_strategy.items():
            if phase_name in phases and phases[phase_name]:
                guard_names = []
                for item in phases[phase_name]:
                    if item["type"] == "existing":
                        guard_key = item["data"]["key"]
                    else:
                        guard_key = item["guardrail"]["key"]
                    
                    # Convert dots to underscores for Python identifiers (e.g., "pii.redact" -> "pii_redact")
                    # The compiler does the same conversion when building the composition context
                    python_id = guard_key.replace(".", "_")
                    guard_names.append(python_id)
                
                if guard_names:
                    if strategy == "allOf":
                        compose[phase_name] = f"allOf({', '.join(guard_names)})"
                    elif strategy == "anyOf":
                        compose[phase_name] = f"anyOf({', '.join(guard_names)})"
                    else:
                        compose[phase_name] = strategy
                    
                    # Track phase for root composition
                    phase_expressions.append(phase_name)
        
        # Create root expression that sequences all phases
        if phase_expressions:
            if len(phase_expressions) == 1:
                compose["root"] = phase_expressions[0]
            else:
                compose["root"] = f"seq({', '.join(phase_expressions)})"
        
        return compose
    
    async def _fetch_guardrails_data(self, guardrail_ids: List[str]) -> List[Dict[str, Any]]:
        """Fetch guardrail data from database."""
        if not guardrail_ids:
            return []
        
        query = text("""
            SELECT id, key, version, default_params, pack_name, function_name,
                   requires_onnx, onnx_model_id, metadata
            FROM guardrails
            WHERE id = ANY(:ids) AND deleted_at IS NULL
        """)
        
        result = await self.db.execute(query, {"ids": guardrail_ids})
        rows = result.fetchall()
        
        guardrails = []
        for row in rows:
            guardrails.append({
                "id": str(row.id),
                "key": row.key,
                "version": row.version,
                "pack_name": row.pack_name,
                "function_name": row.function_name,
                "default_params": row.default_params or {},
                "requires_onnx": row.requires_onnx,
                "onnx_model_id": row.onnx_model_id,
                "metadata": row.metadata or {}
            })
        
        return guardrails
    
    @staticmethod
    def calculate_yaml_hash(yaml_string: str) -> str:
        """Calculate SHA256 hash of YAML for change detection."""
        return hashlib.sha256(yaml_string.encode('utf-8')).hexdigest()
    
    @staticmethod
    def validate_yaml_syntax(yaml_string: str) -> tuple[bool, Optional[str]]:
        """
        Validate YAML syntax.
        
        Returns:
            (is_valid, error_message)
        """
        try:
            yaml.safe_load(yaml_string)
            return True, None
        except yaml.YAMLError as e:
            return False, str(e)


def generate_policy_yaml(
    policy_name: str,
    description: str,
    guardrails: List[Dict[str, Any]],
    composition: Dict[str, str]
) -> str:
    """
    Legacy function for backward compatibility.
    Generate policy YAML from guardrail configurations.
    """
    yaml_dict = {
        "policy": policy_name,
        "description": description,
        "guards": []
    }
    
    # Add guards
    for guardrail in guardrails:
        guard_yaml = {
            "id": guardrail["key"],
            "target": guardrail.get("target", "messages[*].content")
        }
        
        if guardrail.get("params"):
            guard_yaml["with"] = guardrail["params"]
        
        yaml_dict["guards"].append(guard_yaml)
    
    # Add composition
    if composition:
        yaml_dict["compose"] = composition
    
    return yaml.dump(yaml_dict, default_flow_style=False, sort_keys=False)
