"""
Guard class for CGA SDK

Inspired by Guardrails AI's Guard API - simple, composable validation.
"""

from typing import Dict, List, Any, Optional, Callable, Awaitable
import httpx

from .types import (
    SDKConfig,
    ValidationResult,
    ValidationError,
    OnFailAction,
    Violation
)
from .http_client import (
    create_client,
    validate_content,
    list_guards,
    load_policy_from_gateway
)


class Guard:
    """
    Guard for validating content
    
    Similar to Guardrails AI's Guard class - can be used standalone
    or with a gateway backend.
    
    Example:
        # Create guard
        guard = Guard(config=SDKConfig(gateway_url="http://localhost:8000"))
        
        # Use specific guards
        result = await guard.use(["toxicity.block", "pii.detect"]).validate("Hello")
        
        # Use policy
        result = await guard.use_policy("enterprise_v1").validate("Hello")
    """
    
    def __init__(self, config: Optional[SDKConfig] = None):
        if config is None:
            raise ValueError("SDKConfig is required")
        
        self.config = config
        self._guards: List[str] = []
        self._policy_id: Optional[str] = None
        self._on_fail: OnFailAction = OnFailAction.EXCEPTION
        self._metadata: Dict[str, Any] = {}
    
    def use(self, guard_ids: List[str]) -> "Guard":
        """
        Use specific guards
        
        Returns new Guard instance (immutable pattern)
        """
        new_guard = Guard(self.config)
        new_guard._guards = guard_ids
        new_guard._on_fail = self._on_fail
        new_guard._metadata = self._metadata.copy()
        return new_guard
    
    def use_policy(self, policy_id: str) -> "Guard":
        """
        Use a policy (collection of guards)
        
        Returns new Guard instance (immutable pattern)
        """
        new_guard = Guard(self.config)
        new_guard._policy_id = policy_id
        new_guard._on_fail = self._on_fail
        new_guard._metadata = self._metadata.copy()
        return new_guard
    
    def on_fail(self, action: OnFailAction) -> "Guard":
        """
        Set failure action
        
        Returns new Guard instance (immutable pattern)
        """
        new_guard = Guard(self.config)
        new_guard._guards = self._guards.copy()
        new_guard._policy_id = self._policy_id
        new_guard._on_fail = action
        new_guard._metadata = self._metadata.copy()
        return new_guard
    
    def with_metadata(self, metadata: Dict[str, Any]) -> "Guard":
        """
        Add metadata to validation
        
        Returns new Guard instance (immutable pattern)
        """
        new_guard = Guard(self.config)
        new_guard._guards = self._guards.copy()
        new_guard._policy_id = self._policy_id
        new_guard._on_fail = self._on_fail
        new_guard._metadata = {**self._metadata, **metadata}
        return new_guard
    
    async def validate(
        self,
        content: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> ValidationResult:
        """
        Validate content using configured guards
        
        Fails fast based on on_fail action
        
        Args:
            content: Content to validate
            metadata: Additional metadata
            
        Returns:
            ValidationResult
            
        Raises:
            ValidationError: If validation fails and on_fail is EXCEPTION
        """
        client = await create_client(self.config)
        
        try:
            merged_metadata = {**self._metadata, **(metadata or {})}
            
            result = await validate_content(
                client,
                content,
                policy_id=self._policy_id,
                guards=self._guards if self._guards else None,
                metadata=merged_metadata
            )
            
            if not result.valid and self._on_fail == OnFailAction.EXCEPTION:
                raise ValidationError(result.violations)
            
            return result
            
        finally:
            await client.aclose()
    
    async def validate_messages(
        self,
        messages: List[Dict[str, str]],
        metadata: Optional[Dict[str, Any]] = None
    ) -> ValidationResult:
        """
        Validate chat messages
        
        Extracts content from messages and validates
        """
        # Combine message content
        content = "\n".join(
            msg.get("content", "") for msg in messages if msg.get("content")
        )
        
        msg_metadata = {
            "message_count": len(messages),
            "roles": [msg.get("role") for msg in messages]
        }
        
        merged_metadata = {**self._metadata, **msg_metadata, **(metadata or {})}
        
        return await self.validate(content, merged_metadata)
    
    async def list_available_guards(self) -> List[Dict[str, Any]]:
        """List all available guards from gateway"""
        client = await create_client(self.config)
        
        try:
            return await list_guards(client)
        finally:
            await client.aclose()
    
    async def get_policy_info(self, policy_id: str) -> Dict[str, Any]:
        """Get policy information from gateway"""
        client = await create_client(self.config)
        
        try:
            return await load_policy_from_gateway(client, policy_id)
        finally:
            await client.aclose()


async def wrap_llm_call(
    guard: Guard,
    llm_call: Callable[..., Awaitable[Any]]
) -> Callable[..., Awaitable[Any]]:
    """
    Wrap an LLM call with guard validation
    
    Similar to Guardrails AI's wrap approach
    
    Example:
        async def my_llm_call(messages):
            return await openai.chat.completions.create(...)
        
        guard = Guard(...).use(["toxicity.block"])
        guarded_call = await wrap_llm_call(guard, my_llm_call)
        response = await guarded_call(messages)
    """
    async def guarded_call(*args, **kwargs):
        # Extract messages from args/kwargs
        messages = args[0] if args else kwargs.get("messages", [])
        
        # Validate input
        await guard.validate_messages(messages, metadata={"phase": "input"})
        
        # Call LLM
        response = await llm_call(*args, **kwargs)
        
        # Validate output
        output_content = extract_content_from_response(response)
        if output_content:
            await guard.validate(output_content, metadata={"phase": "output"})
        
        return response
    
    return guarded_call


def extract_content_from_response(response: Any) -> Optional[str]:
    """
    Extract content from LLM response
    
    Pure function that handles different response formats
    """
    # OpenAI format
    if hasattr(response, "choices") and response.choices:
        if hasattr(response.choices[0], "message"):
            return response.choices[0].message.content
        if hasattr(response.choices[0], "text"):
            return response.choices[0].text
    
    # Dict format
    if isinstance(response, dict):
        if "choices" in response and response["choices"]:
            choice = response["choices"][0]
            if "message" in choice:
                return choice["message"].get("content")
            if "text" in choice:
                return choice["text"]
    
    return None

