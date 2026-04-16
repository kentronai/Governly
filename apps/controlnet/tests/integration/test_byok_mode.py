"""
Integration tests for BYOK (Bring Your Own Key) mode.

Tests the external client flow:
Client → ControlNet Gateway (with X-API-KEY + Authorization) → OpenAI

This ensures the API key authentication + user's OpenAI key works correctly.
"""

import os
import pytest
import requests


# Configuration
CONTROLNET_URL = os.getenv("CONTROLNET_URL", "http://localhost/v1")
TEST_POLICY_ID = os.getenv("POLICY_ID", "cede525f-d8b7-49fe-beb8-c24e82403b16")

# Required secrets from environment (fail-fast if not provided)
CONTROLNET_API_KEY = os.environ["CONTROLNET_API_KEY"]
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")  # Optional for some tests

MODEL = "gpt-3.5-turbo"


def test_byok_missing_controlnet_api_key():
    """Test that missing ControlNet API key returns 401."""
    if not OPENAI_API_KEY:
        pytest.skip("OPENAI_API_KEY not configured")
    
    url = f"{CONTROLNET_URL}/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "X-Policy-ID": TEST_POLICY_ID,
        # Missing X-API-KEY
    }
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": "Hello"}],
        "max_tokens": 50,
    }
    
    response = requests.post(url, headers=headers, json=payload, timeout=10)
    
    assert response.status_code == 401
    print("✅ Missing ControlNet API key handled correctly")


def test_byok_missing_openai_key():
    """Test that missing OpenAI API key returns 400."""
    url = f"{CONTROLNET_URL}/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "X-API-KEY": CONTROLNET_API_KEY,
        "X-Policy-ID": TEST_POLICY_ID,
        # Missing Authorization (OpenAI key)
    }
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": "Hello"}],
        "max_tokens": 50,
    }
    
    response = requests.post(url, headers=headers, json=payload, timeout=10)
    
    assert response.status_code == 400
    assert "Authorization" in response.json().get("detail", "")
    print("✅ Missing OpenAI key handled correctly")


def test_byok_invalid_controlnet_api_key():
    """Test that invalid ControlNet API key returns 401."""
    if not OPENAI_API_KEY:
        pytest.skip("OPENAI_API_KEY not configured")
    
    url = f"{CONTROLNET_URL}/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "X-API-KEY": "sk_test_invalid_key_123",
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "X-Policy-ID": TEST_POLICY_ID,
    }
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": "Hello"}],
        "max_tokens": 50,
    }
    
    response = requests.post(url, headers=headers, json=payload, timeout=10)
    
    assert response.status_code == 401
    print("✅ Invalid ControlNet API key handled correctly")


def test_byok_successful_request():
    """Test successful BYOK request with valid keys."""
    if not OPENAI_API_KEY:
        pytest.skip("OPENAI_API_KEY not configured")
    
    print("\n" + "="*80)
    print("🧪 Testing successful BYOK request")
    print("="*80)
    
    url = f"{CONTROLNET_URL}/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "X-API-KEY": CONTROLNET_API_KEY,
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "X-Policy-ID": TEST_POLICY_ID,
    }
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": "Say hello in 3 words"}],
        "max_tokens": 20,
        "temperature": 0.7,
    }
    
    print(f"📤 Request URL: {url}")
    print(f"📤 Headers: X-API-KEY, Authorization, X-Policy-ID")
    print(f"📤 Model: {MODEL}")
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        
        print(f"\n📥 Response Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            # Validate response structure
            assert "choices" in data
            assert len(data["choices"]) > 0
            assert "message" in data["choices"][0]
            assert "content" in data["choices"][0]["message"]
            
            # Validate guardrails metadata
            assert "guardrails" in data
            guardrails = data["guardrails"]
            assert "policy_id" in guardrails
            assert guardrails["policy_id"] == TEST_POLICY_ID
            
            print(f"✅ AI Response: {data['choices'][0]['message']['content']}")
            print(f"✅ Guardrails Applied: {guardrails.get('total_guards_executed', 0)} guards")
            print(f"✅ Policy ID: {guardrails['policy_id']}")
            print("\n🎉 BYOK integration test PASSED!")
            
        else:
            print(f"❌ Request failed with status {response.status_code}")
            print(f"❌ Error: {response.json()}")
            pytest.fail(f"Request failed: {response.json()}")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Request exception: {e}")
        pytest.fail(f"Request failed: {e}")


def test_byok_with_streaming():
    """Test BYOK with streaming enabled."""
    if not OPENAI_API_KEY:
        pytest.skip("OPENAI_API_KEY not configured")
    
    print("\n" + "="*80)
    print("🧪 Testing BYOK with streaming")
    print("="*80)
    
    url = f"{CONTROLNET_URL}/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "X-API-KEY": CONTROLNET_API_KEY,
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "X-Policy-ID": TEST_POLICY_ID,
    }
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": "Count from 1 to 3"}],
        "max_tokens": 50,
        "temperature": 0.7,
        "stream": True,
    }
    
    print(f"📤 Streaming request to {url}")
    
    try:
        response = requests.post(url, headers=headers, json=payload, stream=True, timeout=30)
        
        print(f"📥 Response Status: {response.status_code}")
        
        if response.status_code == 200:
            chunks_received = 0
            for line in response.iter_lines():
                if line:
                    chunks_received += 1
                    if chunks_received <= 3:  # Print first few chunks
                        print(f"  Chunk: {line.decode('utf-8')[:80]}...")
            
            print(f"✅ Received {chunks_received} streaming chunks")
            print("🎉 BYOK streaming test PASSED!")
        else:
            print(f"❌ Streaming failed: {response.status_code}")
            pytest.fail(f"Streaming failed: {response.json()}")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Request exception: {e}")
        pytest.fail(f"Request failed: {e}")


if __name__ == "__main__":
    print("\n" + "="*80)
    print("🚀 BYOK Mode Integration Tests")
    print("="*80 + "\n")
    
    # Run all tests
    test_byok_missing_controlnet_api_key()
    test_byok_missing_openai_key()
    test_byok_invalid_controlnet_api_key()
    test_byok_successful_request()
    test_byok_with_streaming()
    
    print("\n" + "="*80)
    print("✅ All BYOK integration tests completed!")
    print("="*80 + "\n")

