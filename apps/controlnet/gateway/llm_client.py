"""
OpenAI-compatible LLM Client

Simple HTTP client for OpenAI API and OpenAI-compatible providers (Groq, Together, etc).
Uses BYOK (Bring Your Own API Key) - API keys are passed from user requests, not stored.
"""

import json
from typing import Dict, Any, AsyncIterator

import httpx

import logging

logger = logging.getLogger(__name__)


class ProviderAPIError(Exception):
    """Safe provider failure that can be returned without leaking credentials."""

    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


def _build_provider_error(response: httpx.Response) -> ProviderAPIError:
    code = "provider_request_failed"
    try:
        payload = response.json()
        provider_error = payload.get("error", {})
        code = provider_error.get("code") or provider_error.get("type") or code
    except (ValueError, AttributeError):
        pass

    if code == "insufficient_quota":
        message = (
            "The configured OpenAI project has insufficient quota. "
            "Add billing/credits or use a project key with available quota."
        )
    elif response.status_code in (401, 403):
        message = "The provider rejected the configured credentials."
    elif response.status_code == 429:
        message = "The provider rate-limited this request. Please retry shortly."
    elif response.status_code >= 500:
        message = "The model provider is temporarily unavailable."
    else:
        message = f"The model provider rejected the request (HTTP {response.status_code})."

    return ProviderAPIError(response.status_code, str(code), message)


class OpenAIClient:
    """
    OpenAI API client for chat completions and embeddings.
    
    Works with:
    - OpenAI API (api.openai.com)
    - OpenAI-compatible providers (Groq, Together, Azure OpenAI, etc.)
    
    Uses BYOK: User provides API key in each request (not stored in config).
    """
    
    def __init__(self, api_key: str, base_url: str = "https://api.openai.com/v1"):
        """
        Initialize OpenAI client with user's API key.
        
        Args:
            api_key: User's provider API key (BYOK - from Authorization header)
            base_url: API endpoint (from model registry, e.g., https://api.openai.com/v1)
        """
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')  # Remove trailing slash
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    
    async def create_completion(self, request_body: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a non-streaming chat completion.
        
        Args:
            request_body: OpenAI-compatible request body
            
        Returns:
            OpenAI-compatible response JSON
            
        Raises:
            httpx.HTTPStatusError: If API request fails
        """
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(45.0),
            http2=True
        ) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers=self.headers,
                json=request_body
            )
            
            if response.status_code != 200:
                error = _build_provider_error(response)
                logger.error(
                    "Provider API request failed: status=%s code=%s",
                    error.status_code,
                    error.code,
                )
                raise error
            
            return response.json()
    
    async def stream_completions(self, request_body: Dict[str, Any]) -> AsyncIterator[Dict[str, Any]]:
        """
        Create a streaming chat completion.
        
        Args:
            request_body: OpenAI-compatible request body
            
        Yields:
            OpenAI-compatible SSE chunks (JSON objects)
            
        Raises:
            httpx.HTTPStatusError: If API request fails
        """
        # Force streaming mode
        request_body["stream"] = True
        
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(45.0),
            http2=True
        ) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/chat/completions",
                headers=self.headers,
                json=request_body
            ) as response:
                if response.status_code != 200:
                    await response.aread()
                    error = _build_provider_error(response)
                    logger.error(
                        "Provider streaming request failed: status=%s code=%s",
                        error.status_code,
                        error.code,
                    )
                    raise error
                
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]  # Remove "data: " prefix
                        
                        if data.strip() == "[DONE]":
                            break
                        
                        try:
                            yield json.loads(data)
                        except json.JSONDecodeError:
                            # Skip malformed chunks
                            continue
    
    async def create_embeddings(self, request_body: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create embeddings for text input.
        
        Args:
            request_body: OpenAI embeddings request body
            
        Returns:
            OpenAI embeddings response JSON
            
        Raises:
            httpx.HTTPStatusError: If API request fails
        """
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(30.0),
            http2=True
        ) as client:
            response = await client.post(
                f"{self.base_url}/embeddings",
                headers=self.headers,
                json=request_body
            )
            response.raise_for_status()
            return response.json()


def create_openai_client(api_key: str, base_url: str = "https://api.openai.com/v1") -> OpenAIClient:
    """
    Factory function to create OpenAI client.
    
    Args:
        api_key: User's provider API key (from Authorization header)
        base_url: API endpoint from model registry
        
    Returns:
        Configured OpenAI client instance
        
    Example:
        >>> from .services.model_registry import resolve_model
        >>> model_target = await resolve_model("gpt-4", tenant_id, db)
        >>> client = create_openai_client(
        ...     api_key=user_api_key,
        ...     base_url=model_target.base_url
        ... )
        >>> response = await client.create_completion(request_body)
    """
    return OpenAIClient(api_key=api_key, base_url=base_url)
