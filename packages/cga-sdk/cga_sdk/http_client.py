"""
HTTP client for CGA Gateway

Pure HTTP operations for communicating with the gateway.
"""

import httpx
from typing import Dict, List, Any, Optional

from .types import SDKConfig, ValidationResult, Violation, PolicyError


async def create_client(config: SDKConfig) -> httpx.AsyncClient:
    """Create HTTP client with configuration"""
    headers = {"Content-Type": "application/json"}
    
    if config.api_key:
        headers["Authorization"] = f"Bearer {config.api_key}"
    
    return httpx.AsyncClient(
        base_url=config.gateway_url,
        timeout=config.timeout,
        headers=headers
    )


def build_validation_payload(
    content: str,
    policy_id: Optional[str] = None,
    guards: Optional[List[str]] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Build validation request payload
    
    Pure function
    """
    payload = {"content": content}
    
    if policy_id:
        payload["policy_id"] = policy_id
    
    if guards:
        payload["guards"] = guards
    
    if metadata:
        payload["metadata"] = metadata
    
    return payload


def parse_violations(violations_data: List[Dict[str, Any]]) -> List[Violation]:
    """
    Parse violations from API response
    
    Pure function
    """
    return [
        Violation(
            rule_id=v.get("rule_id", "unknown"),
            message=v.get("message", "Validation failed"),
            severity=v.get("severity", "medium"),
            field=v.get("field"),
            fix_value=v.get("fix_value")
        )
        for v in violations_data
    ]


def parse_validation_result(response_data: Dict[str, Any]) -> ValidationResult:
    """
    Parse validation result from API response
    
    Pure function - fails fast on missing required fields
    """
    if "valid" not in response_data:
        raise PolicyError("Invalid response from gateway: missing 'valid' field")
    
    violations_data = response_data.get("violations", [])
    violations = parse_violations(violations_data)
    
    return ValidationResult(
        valid=response_data["valid"],
        violations=violations,
        validated_output=response_data.get("validated_output"),
        metadata=response_data.get("metadata")
    )


async def validate_content(
    client: httpx.AsyncClient,
    content: str,
    policy_id: Optional[str] = None,
    guards: Optional[List[str]] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> ValidationResult:
    """
    Validate content via gateway
    
    Fails fast on errors
    """
    payload = build_validation_payload(content, policy_id, guards, metadata)
    
    response = await client.post("/validate", json=payload)
    
    if response.status_code != 200:
        raise PolicyError(
            f"Gateway error {response.status_code}: {response.text}"
        )
    
    return parse_validation_result(response.json())


async def list_guards(client: httpx.AsyncClient) -> List[Dict[str, Any]]:
    """
    List available guards from gateway
    
    Fails fast on errors
    """
    response = await client.get("/guards")
    
    if response.status_code != 200:
        raise PolicyError(
            f"Gateway error {response.status_code}: {response.text}"
        )
    
    return response.json().get("guards", [])


async def load_policy_from_gateway(
    client: httpx.AsyncClient,
    policy_id: str
) -> Dict[str, Any]:
    """
    Load policy metadata from gateway
    
    Fails fast on errors
    """
    response = await client.get(f"/policies/{policy_id}")
    
    if response.status_code == 404:
        raise PolicyError(f"Policy not found: {policy_id}")
    
    if response.status_code != 200:
        raise PolicyError(
            f"Gateway error {response.status_code}: {response.text}"
        )
    
    return response.json()

