#!/usr/bin/env python3
"""
Custom Guard Creation Examples

Shows how to create your own guards following the CGA pattern
"""

import asyncio
import re
from typing import List, Dict, Any

from cga_core import guard, Violation, Left_, Right_, is_left


# Example 1: Simple content filter
@guard("example.profanity_filter")
def profanity_filter(blocked_words: List[str], severity: str = "high"):
    """
    Simple profanity filter guard
    
    Args:
        blocked_words: List of words to block
        severity: Violation severity level
    """
    async def run(ctx):
        # Get the text to check (could be from messages or output)
        text = ""
        if "messages" in ctx:
            # Input phase - check message content
            text = " ".join(msg.get("content", "") for msg in ctx["messages"])
        elif "output" in ctx:
            # Output phase - check response content
            text = str(ctx["output"])
        
        # Check for blocked words (case insensitive)
        violations = []
        for word in blocked_words:
            if re.search(rf'\b{re.escape(word)}\b', text, re.IGNORECASE):
                violations.append(Violation(
                    rule_id="example.profanity_filter",
                    severity=severity,
                    message=f"Blocked word detected: {word}",
                    score=1.0
                ))
        
        if violations:
            return Left_(violations)
        else:
            return Right_(ctx)
    
    return run


# Example 2: Content length limiter
@guard("example.length_limiter")
def length_limiter(max_length: int, target: str = "output"):
    """
    Limit content length
    
    Args:
        max_length: Maximum allowed character length
        target: What to check ("output" or "input")
    """
    async def run(ctx):
        text = ""
        
        if target == "input" and "messages" in ctx:
            text = " ".join(msg.get("content", "") for msg in ctx["messages"])
        elif target == "output" and "output" in ctx:
            text = str(ctx["output"])
        
        if len(text) > max_length:
            return Left_([Violation(
                rule_id="example.length_limiter",
                severity="medium",
                message=f"Content too long: {len(text)} > {max_length} characters",
                score=len(text) / max_length
            )])
        
        return Right_(ctx)
    
    return run


# Example 3: URL detector and blocker
@guard("example.url_blocker")
def url_blocker(allow_domains: List[str] = None, block_all: bool = False):
    """
    Block or filter URLs in content
    
    Args:
        allow_domains: List of allowed domains (if provided, only these are allowed)
        block_all: If True, block all URLs
    """
    url_pattern = re.compile(
        r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+'
    )
    
    async def run(ctx):
        # Get text from context
        text = ""
        if "messages" in ctx:
            text = " ".join(msg.get("content", "") for msg in ctx["messages"])
        elif "output" in ctx:
            text = str(ctx["output"])
        
        # Find URLs
        urls = url_pattern.findall(text)
        
        if not urls:
            return Right_(ctx)
        
        violations = []
        
        if block_all:
            violations.append(Violation(
                rule_id="example.url_blocker",
                severity="high",
                message=f"URLs not allowed: {len(urls)} found",
                score=1.0
            ))
        elif allow_domains:
            for url in urls:
                domain_allowed = any(domain in url for domain in allow_domains)
                if not domain_allowed:
                    violations.append(Violation(
                        rule_id="example.url_blocker", 
                        severity="medium",
                        message=f"Disallowed URL: {url}",
                        score=0.8
                    ))
        
        if violations:
            return Left_(violations)
        else:
            return Right_(ctx)
    
    return run


# Example 4: Data redactor (like PII but for custom patterns)
@guard("example.data_redactor")
def data_redactor(patterns: Dict[str, str], replacement: str = "[REDACTED]"):
    """
    Redact custom data patterns
    
    Args:
        patterns: Dict of {name: regex_pattern}
        replacement: What to replace matches with
    """
    compiled_patterns = {name: re.compile(pattern, re.IGNORECASE) 
                        for name, pattern in patterns.items()}
    
    async def run(ctx):
        # This guard modifies content (like PII redaction)
        modified = False
        
        if "messages" in ctx:
            # Redact from messages
            for msg in ctx["messages"]:
                if "content" in msg:
                    original = msg["content"]
                    for name, pattern in compiled_patterns.items():
                        msg["content"] = pattern.sub(replacement, msg["content"])
                    if msg["content"] != original:
                        modified = True
        
        if "output" in ctx:
            # Redact from output
            original = str(ctx["output"])
            for name, pattern in compiled_patterns.items():
                ctx["output"] = pattern.sub(replacement, str(ctx["output"]))
            if str(ctx["output"]) != original:
                modified = True
        
        # Always return Right_ for redaction guards (they modify, don't block)
        return Right_(ctx)
    
    return run


async def test_custom_guards():
    """Test the custom guards"""
    print("🧪 Testing Custom Guards")
    print("=" * 40)
    
    # Test 1: Profanity filter
    print("\n🚫 Test 1: Profanity Filter")
    profanity_guard = profanity_filter(["badword", "terrible"], "high")
    
    # Safe content
    ctx1 = {"output": "This is a nice message"}
    result1 = await profanity_guard(ctx1)
    print(f"   Safe content: {'✅ PASS' if not is_left(result1) else '❌ FAIL'}")
    
    # Blocked content
    ctx2 = {"output": "This is a terrible message"}
    result2 = await profanity_guard(ctx2)
    print(f"   Blocked content: {'✅ PASS' if is_left(result2) else '❌ FAIL'}")
    
    # Test 2: Length limiter
    print("\n📏 Test 2: Length Limiter")
    length_guard = length_limiter(max_length=20, target="output")
    
    # Short content
    ctx3 = {"output": "Short"}
    result3 = await length_guard(ctx3)
    print(f"   Short content: {'✅ PASS' if not is_left(result3) else '❌ FAIL'}")
    
    # Long content
    ctx4 = {"output": "This is a very long message that exceeds the limit"}
    result4 = await length_guard(ctx4)
    print(f"   Long content: {'✅ PASS' if is_left(result4) else '❌ FAIL'}")
    
    # Test 3: URL blocker
    print("\n🔗 Test 3: URL Blocker")
    url_guard = url_blocker(allow_domains=["example.com"], block_all=False)
    
    # Allowed URL
    ctx5 = {"output": "Check out https://example.com/page"}
    result5 = await url_guard(ctx5)
    print(f"   Allowed URL: {'✅ PASS' if not is_left(result5) else '❌ FAIL'}")
    
    # Blocked URL
    ctx6 = {"output": "Visit https://malicious.com/bad"}
    result6 = await url_guard(ctx6)
    print(f"   Blocked URL: {'✅ PASS' if is_left(result6) else '❌ FAIL'}")
    
    # Test 4: Data redactor
    print("\n🔒 Test 4: Data Redactor")
    redactor_guard = data_redactor({
        "api_key": r"api_key_[a-zA-Z0-9]+",
        "secret": r"secret_[a-zA-Z0-9]+"
    }, "[HIDDEN]")
    
    ctx7 = {"output": "Your api_key_abc123 and secret_xyz789 are here"}
    result7 = await redactor_guard(ctx7)
    print(f"   Redaction applied: {'✅ PASS' if '[HIDDEN]' in ctx7['output'] else '❌ FAIL'}")
    print(f"   Redacted content: {ctx7['output']}")


async def test_with_policy():
    """Test custom guards with a policy"""
    print("\n📋 Testing Custom Guards with Policy")
    
    # Create a simple policy YAML content
    policy_yaml = """
policy: custom_example
description: Example policy with custom guards

guards:
  - id: example.profanity_filter
    target: messages[*].content
    with:
      blocked_words: ["spam", "scam"]
      severity: "high"
  
  - id: example.length_limiter  
    target: output
    with:
      max_length: 100
      target: "output"

compose:
  input: example_profanity_filter
  output: example_length_limiter
  root: allOf(example_profanity_filter, example_length_limiter)
"""
    
    # Save temporary policy
    with open("policies/custom_example.yaml", "w") as f:
        f.write(policy_yaml)
    
    try:
        from cga_sdk import load_policy, wrap_llm
        
        # Load the custom policy
        policy = load_policy("policies/custom_example.yaml")
        print(f"   ✅ Loaded custom policy: {policy.id}")
        
        # Create a mock LLM
        async def mock_llm(messages, **kwargs):
            class MockChoice:
                def __init__(self, content):
                    self.message = type('obj', (object,), {'content': content})()
            
            class MockResponse:
                def __init__(self, content):
                    self.choices = [MockChoice(content)]
            
            return MockResponse("This is a response from the LLM that might be long or short depending on the request.")
        
        # Wrap with custom policy
        guarded_llm = await wrap_llm(mock_llm, policy)
        
        # Test with blocked input
        print("   🚫 Testing blocked input...")
        try:
            result = await guarded_llm([{"role": "user", "content": "This is spam content"}])
            print("   ❌ FAIL: Should have been blocked")
        except Exception as e:
            print(f"   ✅ PASS: Correctly blocked ({type(e).__name__})")
        
        # Test with safe input
        print("   ✅ Testing safe input...")
        try:
            result = await guarded_llm([{"role": "user", "content": "Hello, how are you?"}])
            print(f"   ✅ PASS: Response received")
        except Exception as e:
            print(f"   ❌ FAIL: {e}")
            
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    finally:
        # Clean up
        import os
        try:
            os.remove("policies/custom_example.yaml")
        except:
            pass


async def main():
    """Run all custom guard examples"""
    print("🚀 Custom Guard Creation Examples")
    print("=" * 50)
    
    await test_custom_guards()
    await test_with_policy()
    
    print("\n🎉 Custom guard examples completed!")
    print("\n📚 Key Takeaways:")
    print("   - Use @guard('your.guard.id') decorator")
    print("   - Return Left_(violations) to block")
    print("   - Return Right_(ctx) to allow/continue")
    print("   - Modify ctx for redaction-style guards")
    print("   - Guards can target input, output, or both")
    print("   - Compose guards in YAML policies")


if __name__ == "__main__":
    asyncio.run(main())
