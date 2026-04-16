"""
Integration tests for multi-tenant web playground flow.

Tests the complete flow:
Browser → /api/playground/chat (Next.js) → ControlNet Gateway → OpenAI

This ensures the Clerk JWT + managed OpenAI key architecture works correctly.
"""

import os
import pytest
import requests
from typing import Dict


# Configuration
CONTROLNET_URL = os.getenv("CONTROLNET_URL", "http://localhost/v1")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
TEST_POLICY_ID = os.getenv("POLICY_ID", "cede525f-d8b7-49fe-beb8-c24e82403b16")
TEST_TENANT_ID = os.getenv("TENANT_ID", "org_33Rq6hGmoYcE9FbsueNNLL8Fpd4")

# Mock Clerk JWT (in real scenario, this comes from Clerk)
MOCK_CLERK_JWT = "Bearer mock-jwt-token-for-testing"

MODEL = "gpt-3.5-turbo"


def test_playground_missing_openai_key():
    """Test that missing OpenAI key returns proper error."""
    url = f"{CONTROLNET_URL}/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "X-Clerk-Auth": MOCK_CLERK_JWT,
        "X-Policy-ID": TEST_POLICY_ID,
        "X-Tenant-ID": TEST_TENANT_ID,
        # Missing Authorization header (OpenAI key)
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


def test_playground_missing_clerk_jwt():
    """Test that missing Clerk JWT returns proper error."""
    if not OPENAI_API_KEY:
        pytest.skip("OPENAI_API_KEY not configured")
    
    url = f"{CONTROLNET_URL}/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "X-Policy-ID": TEST_POLICY_ID,
        "X-Tenant-ID": TEST_TENANT_ID,
        # Missing X-Clerk-Auth header
    }
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": "Hello"}],
        "max_tokens": 50,
    }
    
    response = requests.post(url, headers=headers, json=payload, timeout=10)
    
    # Should fail authentication (no valid auth method)
    assert response.status_code in [401, 400]
    print("✅ Missing Clerk JWT handled correctly")


def test_playground_missing_policy():
    """Test that missing policy ID returns proper error."""
    if not OPENAI_API_KEY:
        pytest.skip("OPENAI_API_KEY not configured")
    
    url = f"{CONTROLNET_URL}/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "X-Clerk-Auth": MOCK_CLERK_JWT,
        "X-Tenant-ID": TEST_TENANT_ID,
        # Missing X-Policy-ID header
    }
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": "Hello"}],
        "max_tokens": 50,
    }
    
    response = requests.post(url, headers=headers, json=payload, timeout=10)
    
    assert response.status_code == 400
    assert "Policy" in response.json().get("detail", "") or "policy" in response.json().get("detail", "").lower()
    print("✅ Missing policy ID handled correctly")


def test_playground_model_not_in_registry():
    """Test that model not in registry returns proper error."""
    if not OPENAI_API_KEY:
        pytest.skip("OPENAI_API_KEY not configured")
    
    url = f"{CONTROLNET_URL}/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "X-Clerk-Auth": MOCK_CLERK_JWT,
        "X-Policy-ID": TEST_POLICY_ID,
        "X-Tenant-ID": TEST_TENANT_ID,
    }
    payload = {
        "model": "nonexistent-model-xyz",
        "messages": [{"role": "user", "content": "Hello"}],
        "max_tokens": 50,
    }
    
    response = requests.post(url, headers=headers, json=payload, timeout=10)
    
    assert response.status_code == 404
    assert "not found" in response.json().get("detail", "").lower()
    print("✅ Invalid model handled correctly")


def test_playground_successful_request():
    """Test successful playground request with all required headers."""
    if not OPENAI_API_KEY:
        pytest.skip("OPENAI_API_KEY not configured")
    
    print("\n" + "="*80)
    print("🧪 Testing successful playground request")
    print("="*80)
    
    url = f"{CONTROLNET_URL}/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "X-Clerk-Auth": MOCK_CLERK_JWT,
        "X-Policy-ID": TEST_POLICY_ID,
        "X-Tenant-ID": TEST_TENANT_ID,
    }
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": "Say hello in 3 words"}],
        "max_tokens": 20,
        "temperature": 0.7,
    }
    
    print(f"📤 Request URL: {url}")
    print(f"📤 Headers: {list(headers.keys())}")
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
            print("\n🎉 Playground integration test PASSED!")
            
        else:
            print(f"❌ Request failed with status {response.status_code}")
            print(f"❌ Error: {response.json()}")
            pytest.fail(f"Request failed: {response.json()}")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Request exception: {e}")
        pytest.fail(f"Request failed: {e}")


if __name__ == "__main__":
    print("\n" + "="*80)
    print("🚀 Multi-Tenant Playground Integration Tests")
    print("="*80 + "\n")
    
    # Run all tests
    test_playground_missing_openai_key()
    test_playground_missing_clerk_jwt()
    test_playground_missing_policy()
    test_playground_model_not_in_registry()
    test_playground_successful_request()
    
    print("\n" + "="*80)
    print("✅ All playground integration tests completed!")
    print("="*80 + "\n")

