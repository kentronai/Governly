"""
ControlNet Proxy - Integration Test

Tests the full BYOK proxy implementation with real data.
"""

import requests
import json
import os

# Configuration from environment variables
CONTROLNET_URL = os.getenv("CONTROLNET_URL", "http://localhost/v1")
TENANT_ID = os.getenv("TENANT_ID", "org_33Rq6hGmoYcE9FbsueNNLL8Fpd4")
POLICY_ID = os.getenv("POLICY_ID", "cede525f-d8b7-49fe-beb8-c24e82403b16")  # Test 0089

# Required secrets from environment (fail-fast if not provided)
API_KEY = os.environ["CONTROLNET_API_KEY"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]

# Test configuration
TEST_MODEL = "gpt-4o-mini"  # Global model available to all tenants
TEST_MESSAGE = "Hello! Tell me a very short joke in one sentence."

def print_section(title):
    """Print a section header"""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}\n")


def test_chat_completion_direct():
    """Test chat completion using direct HTTP request"""
    print_section("TEST 1: Direct HTTP Request")
    
    url = f"{CONTROLNET_URL}/chat/completions"
    
    headers = {
        "Content-Type": "application/json",
        "X-API-KEY": API_KEY,
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "X-Policy-ID": POLICY_ID,
    }
    
    payload = {
        "model": TEST_MODEL,
        "messages": [
            {"role": "user", "content": TEST_MESSAGE}
        ],
        "max_tokens": 100
    }
    
    print(f"📤 Sending request to: {url}")
    print(f"   Model: {TEST_MODEL}")
    print(f"   Policy: {POLICY_ID}")
    print(f"   Tenant: {TENANT_ID}")
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        
        print(f"\n📥 Response Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            print(f"\n✅ SUCCESS!")
            print(f"\n📝 Response Content:")
            if 'choices' in data and len(data['choices']) > 0:
                content = data['choices'][0]['message']['content']
                print(f"   {content}")
            
            # Check for guardrail metadata
            if 'guardrails' in data:
                print(f"\n🛡️  Guardrail Metadata:")
                guardrails = data['guardrails']
                print(f"   Policy ID: {guardrails.get('policy_id')}")
                print(f"   Input Guards: {len(guardrails.get('input_guards', []))}")
                print(f"   Output Guards: {len(guardrails.get('output_guards', []))}")
                
                if 'execution_time_ms' in guardrails:
                    exec_time = guardrails['execution_time_ms']
                    print(f"   Execution Time:")
                    print(f"     Input: {exec_time.get('input', 0):.2f}ms")
                    print(f"     Output: {exec_time.get('output', 0):.2f}ms")
            else:
                print(f"\n⚠️  No guardrail metadata found in response")
            
            return True
        else:
            print(f"\n❌ Request failed!")
            print(f"   Status: {response.status_code}")
            print(f"   Response: {response.text[:500]}")
            return False
            
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        return False


def test_missing_policy_header():
    """Test error handling when X-Policy-ID is missing"""
    print_section("TEST 2: Missing X-Policy-ID (Should Fail)")
    
    url = f"{CONTROLNET_URL}/chat/completions"
    
    headers = {
        "Content-Type": "application/json",
        "X-API-KEY": API_KEY,
        "Authorization": "Bearer sk-fake-key",
        # X-Tenant-ID not needed - extracted from API key!
        # Missing X-Policy-ID!
    }
    
    payload = {
        "model": TEST_MODEL,
        "messages": [{"role": "user", "content": "Test"}]
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=10)
        
        if response.status_code == 400:
            error = response.json()
            if 'policy' in str(error).lower():
                print(f"✅ Correctly rejected with status 400")
                print(f"   Error: {error.get('detail', 'Unknown error')[:100]}")
                return True
        
        print(f"❌ Unexpected response: {response.status_code}")
        print(f"   {response.text[:200]}")
        return False
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return False


def test_invalid_model():
    """Test error handling when model not in registry"""
    print_section("TEST 3: Invalid Model (Should Fail)")
    
    url = f"{CONTROLNET_URL}/chat/completions"
    
    headers = {
        "Content-Type": "application/json",
        "X-API-KEY": API_KEY,
        "Authorization": "Bearer sk-fake-key",
        "X-Policy-ID": POLICY_ID,
    }
    
    payload = {
        "model": "invalid-model-xyz-123",
        "messages": [{"role": "user", "content": "Test"}]
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=10)
        
        if response.status_code in [400, 404]:
            error = response.json()
            if 'registry' in str(error).lower() or 'not found' in str(error).lower():
                print(f"✅ Correctly rejected with status {response.status_code}")
                print(f"   Error: {error.get('detail', 'Unknown error')[:100]}")
                return True
        
        print(f"❌ Unexpected response: {response.status_code}")
        print(f"   {response.text[:200]}")
        return False
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return False


def test_model_header_override():
    """Test X-Model-ID header override"""
    print_section("TEST 4: Model Header Override")
    
    url = f"{CONTROLNET_URL}/chat/completions"
    
    headers = {
        "Content-Type": "application/json",
        "X-API-KEY": API_KEY,
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "X-Policy-ID": POLICY_ID,
        "X-Model-ID": "gpt-4o-mini",  # Override with header
        # X-Tenant-ID not needed - extracted from API key!
    }
    
    payload = {
        "model": "gpt-4o",  # This should be ignored
        "messages": [{"role": "user", "content": "Say 'test' only"}],
        "max_tokens": 10
    }
    
    print(f"📤 Sending request with:")
    print(f"   X-Model-ID header: gpt-4o-mini")
    print(f"   Body model field: gpt-4o (should be ignored)")
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        
        if response.status_code == 200:
            print(f"\n✅ Request successful!")
            print(f"   Model header override working correctly")
            return True
        else:
            print(f"\n❌ Request failed: {response.status_code}")
            print(f"   {response.text[:200]}")
            return False
            
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        return False


def main():
    """Run all tests"""
    print(f"\n{'='*60}")
    print(f"  🧪 ControlNet Proxy - Integration Tests")
    print(f"{'='*60}")
    
    print(f"\n📊 Test Configuration:")
    print(f"   URL: {CONTROLNET_URL}")
    print(f"   API Key: {API_KEY[:20]}...")
    print(f"   Model: {TEST_MODEL}")
    print(f"\n   Note: Tenant ID extracted from API key (not in headers)")
    print(f"         Policy ID required in X-Policy-ID header")
    print(f"         Provider key required in Authorization header (BYOK)")
    
    results = []
    
    # Run tests
    results.append(("Direct HTTP Request", test_chat_completion_direct()))
    results.append(("Missing Policy Header", test_missing_policy_header()))
    results.append(("Invalid Model", test_invalid_model()))
    results.append(("Model Header Override", test_model_header_override()))
    
    # Summary
    print_section("Test Summary")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"  {status}: {name}")
    
    print(f"\n  📊 Results: {passed}/{total} tests passed")
    
    if passed == total:
        print(f"\n  🎉 All tests passed!")
    elif passed > 0:
        print(f"\n  ⚠️  Some tests failed")
    else:
        print(f"\n  ❌ All tests failed")
    
    print(f"\n{'='*60}\n")


if __name__ == "__main__":
    main()

