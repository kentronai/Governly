"""
OpenAI-compatible LLM Client

Simple HTTP client for OpenAI API and OpenAI-compatible providers (Groq, Together, etc).
Uses BYOK (Bring Your Own API Key) - API keys are passed from user requests, not stored.
"""

import json
import re
from typing import Dict, Any, AsyncIterator, Optional

import httpx

import logging

logger = logging.getLogger(__name__)

# Providers echo credentials back in some error strings ("Incorrect API key
# provided: sk-..."). Redact before the text is stored or returned.
_SECRET_PATTERN = re.compile(r"\b(sk|sk-proj|sk-live|sk_live|sk_test|AIza)[-_A-Za-z0-9]{8,}")

# Provider errors are diagnostics, not payloads.
_MAX_PROVIDER_MESSAGE = 500


def _redact(text: str) -> str:
    return _SECRET_PATTERN.sub("[redacted]", text)


class ProviderAPIError(Exception):
    """Safe provider failure that can be returned without leaking credentials."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        provider_message: Optional[str] = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        # What the provider itself said. Summarising this away left operators
        # with "the provider rejected the request (HTTP 400)" and no way to tell
        # a wrong model from a wrong key from a wrong endpoint.
        self.provider_message = provider_message


def _unwrap_payload(payload: Any) -> Any:
    """Google's OpenAI-compatible endpoint wraps its error in a JSON array.

    Verified live: an invalid key to
    generativelanguage.googleapis.com/v1beta/openai returns
    `[{"error": {"code": 400, "message": "Please pass a valid API key", ...}}]`
    with HTTP 400 — not 401. Without unwrapping, the error object is invisible
    and every Gemini failure degrades to a bare "provider_request_failed".
    """
    if isinstance(payload, list) and len(payload) == 1:
        return payload[0]
    return payload


def _extract_provider_message(response: httpx.Response) -> Optional[str]:
    """Pull the provider's own explanation out of whatever shape it used."""
    try:
        payload = _unwrap_payload(response.json())
    except (ValueError, AttributeError):
        body = (response.text or "").strip()
        return _redact(body[:_MAX_PROVIDER_MESSAGE]) if body else None

    candidates = []
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            candidates.extend([error.get("message"), error.get("status")])
        elif isinstance(error, str):
            candidates.append(error)
        candidates.append(payload.get("message"))

    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return _redact(candidate.strip()[:_MAX_PROVIDER_MESSAGE])

    # Unrecognised shape — a truncated body still beats no information at all.
    try:
        return _redact(json.dumps(payload)[:_MAX_PROVIDER_MESSAGE])
    except (TypeError, ValueError):
        return None


def _build_provider_error(response: httpx.Response) -> ProviderAPIError:
    code = "provider_request_failed"
    try:
        payload = _unwrap_payload(response.json())
        provider_error = payload.get("error", {})
        if isinstance(provider_error, dict):
            code = provider_error.get("code") or provider_error.get("type") or code
    except (ValueError, AttributeError):
        pass

    provider_message = _extract_provider_message(response)

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

    # `message` stays caller-safe: the provider body can echo credentials and
    # internal endpoints, so it is carried separately for the gateway log and
    # the (authenticated) observability row rather than returned to the caller.
    return ProviderAPIError(
        response.status_code, str(code), message, provider_message
    )


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
                # base_url and model are what actually determine which provider
                # was called; without them a 400 here is undiagnosable.
                logger.error(
                    "Provider API request failed: status=%s code=%s base_url=%s model=%s provider_message=%s",
                    error.status_code,
                    error.code,
                    self.base_url,
                    request_body.get("model"),
                    error.provider_message,
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
                        "Provider streaming request failed: status=%s code=%s base_url=%s model=%s provider_message=%s",
                        error.status_code,
                        error.code,
                        self.base_url,
                        request_body.get("model"),
                        error.provider_message,
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
