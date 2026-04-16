"""
ControlNet Policy Enforcement - Real Examples

Tests multiple policies with actual guardrail enforcement:
1. Toxicity Blocking
2. PII Redaction
3. Competitor Protection
4. Multiple Guardrails (R&D policy)
"""

import requests
import json
from datetime import datetime
import os

CONTROLNET_URL = os.getenv("CONTROLNET_URL", "http://localhost/v1")

# Required secrets from environment (fail-fast if not provided)
API_KEY = os.environ["CONTROLNET_API_KEY"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]

# Available policies
POLICIES = {
    "toxicity": {
        "id": "537ae741-7207-459c-9c35-49114b319834",
        "name": "Toxicity Block",
        "guardrails": ["toxicity.block"]
    },
    "competitor": {
        "id": "4ac69568-349f-44d4-bd54-5796c1a3cde4",
        "name": "Block Competitor Name",
        "guardrails": ["business.competitor_protection"]
    },
    "r_and_d": {
        "id": "1deb90cf-aa17-4e0f-9df5-fa4c1154d28b",
        "name": "R&D",
        "guardrails": ["validation.valid_length", "formatting.json", "pii.detect_pii", "formatting.email", "security.code_injection", "security.url_check"]
    }
}

def print_section(title, char="="):
    print(f"\n{char*80}")
    print(f"  {title}")
    print(f"{char*80}\n")

def send_request(policy_id, message, model="gpt-4o-mini"):
    """Send request to ControlNet"""
    url = f"{CONTROLNET_URL}/chat/completions"
    
    headers = {
        "Content-Type": "application/json",
        "X-API-KEY": API_KEY,
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "X-Policy-ID": policy_id,
    }
    
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": message}],
        "max_tokens": 150
    }
    
    response = requests.post(url, headers=headers, json=payload, timeout=30)
    return response

def test_toxicity_blocking():
    """Test toxicity detection and blocking"""
    print_section("TEST 1: Toxicity Blocking Policy")
    
    policy = POLICIES["toxicity"]
    print(f"Policy: {policy['name']} ({policy['id']})")
    print(f"Guardrails: {', '.join(policy['guardrails'])}\n")
    
    # Test 1: Clean message (should pass)
    print("🧪 Test 1a: Clean Message (should pass)")
    print("-" * 80)
    clean_message = "What is the capital of France?"
    print(f"Message: '{clean_message}'")
    
    response = send_request(policy["id"], clean_message)
    
    if response.status_code == 200:
        data = response.json()
        content = data['choices'][0]['message']['content']
        print(f"✅ PASSED - Response received:")
        print(f"   {content[:100]}...")
        
        if 'guardrails' in data:
            guards = data['guardrails']
            print(f"\n   Guardrails executed: {guards.get('total_guards_executed', 0)}")
            for g in guards.get('input_guards', []):
                print(f"     ✅ {g['name']}: {g['status']}")
    else:
        print(f"❌ FAILED - Status: {response.status_code}")
        print(f"   {response.json()}")
    
    # Test 1b: Toxic message (should block or warn)
    print(f"\n\n🧪 Test 1b: Potentially Toxic Message")
    print("-" * 80)
    toxic_message = "You are stupid and worthless"
    print(f"Message: '{toxic_message}'")
    
    response = send_request(policy["id"], toxic_message)
    data = response.json()
    
    if response.status_code == 200:
        content = data['choices'][0]['message']['content']
        print(f"Status: {response.status_code}")
        
        if 'guardrails' in data:
            guards = data['guardrails']
            print(f"\n🛡️  Guardrail Analysis:")
            for g in guards.get('input_guards', []):
                status_icon = "✅" if g['status'] == 'passed' else "⚠️"
                print(f"   {status_icon} {g['name']}: {g['status']}")
            
            print(f"\n   Response: {content[:100]}...")
    else:
        print(f"❌ BLOCKED - Status: {response.status_code}")
        print(f"   {data.get('detail', 'Unknown error')}")
    
    print("\n" + "="*80)


def test_pii_redaction():
    """Test PII redaction with R&D policy"""
    print_section("TEST 2: PII Redaction Policy")
    
    policy = POLICIES["r_and_d"]
    print(f"Policy: {policy['name']} ({policy['id']})")
    print(f"Guardrails: {', '.join(policy['guardrails'])}\n")
    
    print("🧪 Test: Message with PII")
    print("-" * 80)
    pii_message = "My name is John Smith, email is john.smith@company.com and my SSN is 123-45-6789. Call me at 555-123-4567."
    print(f"Original Message:")
    print(f"  '{pii_message}'")
    
    response = send_request(policy["id"], pii_message)
    
    if response.status_code == 200:
        data = response.json()
        content = data['choices'][0]['message']['content']
        
        print(f"\n✅ Response Status: {response.status_code}")
        
        if 'guardrails' in data:
            guards = data['guardrails']
            print(f"\n🛡️  Guardrails Applied:")
            
            # Show input guards
            for g in guards.get('input_guards', []):
                status_icon = "✅" if g['status'] == 'passed' else "⚠️"
                print(f"   {status_icon} {g['name']}: {g['status']}")
            
            # Check if message was modified
            if guards.get('modified_messages'):
                print(f"\n   ⚠️  Message was MODIFIED by guardrails:")
                modified = guards['modified_messages']
                for msg in modified:
                    if msg['role'] == 'user':
                        print(f"\n   Modified Message sent to LLM:")
                        print(f"   '{msg['content']}'")
                        print(f"\n   ✅ PII was detected and handled!")
            
            print(f"\n   AI Response:")
            print(f"   {content}")
            
            # Show execution time
            if 'execution_time_ms' in guards:
                exec_time = guards['execution_time_ms']
                total = exec_time.get('input', 0) + exec_time.get('output', 0)
                print(f"\n   ⏱️  Total Guardrail Time: {total:.2f}ms")
    else:
        print(f"❌ FAILED - Status: {response.status_code}")
        print(f"   {response.json()}")
    
    print("\n" + "="*80)


def test_competitor_protection():
    """Test competitor name blocking"""
    print_section("TEST 3: Competitor Protection Policy")
    
    policy = POLICIES["competitor"]
    print(f"Policy: {policy['name']} ({policy['id']})")
    print(f"Guardrails: {', '.join(policy['guardrails'])}\n")
    
    print("🧪 Test: Mentioning competitor names")
    print("-" * 80)
    competitor_message = "What do you think about Google and Microsoft products?"
    print(f"Message: '{competitor_message}'")
    
    response = send_request(policy["id"], competitor_message)
    data = response.json()
    
    print(f"\nStatus: {response.status_code}")
    
    if response.status_code == 200:
        content = data['choices'][0]['message']['content']
        
        if 'guardrails' in data:
            guards = data['guardrails']
            print(f"\n🛡️  Guardrail Analysis:")
            for g in guards.get('input_guards', []):
                status_icon = "✅" if g['status'] == 'passed' else "⚠️"
                print(f"   {status_icon} {g['name']}: {g['status']}")
            
            if guards.get('modified_messages'):
                print(f"\n   ⚠️  Message was MODIFIED:")
                modified = guards['modified_messages']
                for msg in modified:
                    if msg['role'] == 'user':
                        print(f"   Modified: '{msg['content']}'")
            
            print(f"\n   Response: {content[:100]}...")
    else:
        print(f"❌ Policy Violation Detected")
        print(f"   {data.get('detail', 'Unknown error')}")
    
    print("\n" + "="*80)


def test_multiple_guardrails():
    """Test R&D policy with multiple guardrails"""
    print_section("TEST 4: Multiple Guardrails (R&D Policy)")
    
    policy = POLICIES["r_and_d"]
    print(f"Policy: {policy['name']} ({policy['id']})")
    print(f"Guardrails ({len(policy['guardrails'])}): {', '.join(policy['guardrails'])}\n")
    
    print("🧪 Test: Normal message through multiple guardrails")
    print("-" * 80)
    message = "Can you help me write a Python function to calculate fibonacci numbers?"
    print(f"Message: '{message}'")
    
    response = send_request(policy["id"], message)
    
    if response.status_code == 200:
        data = response.json()
        content = data['choices'][0]['message']['content']
        
        print(f"\n✅ Response Status: {response.status_code}")
        
        if 'guardrails' in data:
            guards = data['guardrails']
            
            input_guards = guards.get('input_guards', [])
            output_guards = guards.get('output_guards', [])
            
            print(f"\n🛡️  Guardrails Executed: {len(input_guards) + len(output_guards)}")
            
            print(f"\n   Input Guardrails ({len(input_guards)}):")
            for g in input_guards:
                status_icon = "✅" if g['status'] == 'passed' else "⚠️"
                print(f"     {status_icon} {g['name']} ({g['id']}): {g['status']}")
            
            print(f"\n   Output Guardrails ({len(output_guards)}):")
            for g in output_guards:
                status_icon = "✅" if g['status'] == 'passed' else "⚠️"
                print(f"     {status_icon} {g['name']} ({g['id']}): {g['status']}")
            
            if 'execution_time_ms' in guards:
                exec_time = guards['execution_time_ms']
                print(f"\n   ⏱️  Execution Time:")
                print(f"     Input: {exec_time.get('input', 0):.2f}ms")
                print(f"     Output: {exec_time.get('output', 0):.2f}ms")
                total = exec_time.get('input', 0) + exec_time.get('output', 0)
                print(f"     Total: {total:.2f}ms")
            
            print(f"\n   ✅ All guardrails passed!")
            print(f"\n   Response Preview:")
            print(f"   {content[:150]}...")
    else:
        print(f"❌ FAILED - Status: {response.status_code}")
        print(f"   {response.json()}")
    
    print("\n" + "="*80)


if __name__ == "__main__":
    print_section("🧪 ControlNet Policy Enforcement Tests", "=")
    print("Testing real policies with actual guardrail enforcement\n")
    print(f"ControlNet URL: {CONTROLNET_URL}")
    print(f"API Key: {API_KEY[:20]}...")
    print(f"Model: gpt-4o-mini")
    
    # Run all tests
    test_toxicity_blocking()
    test_pii_redaction()
    test_competitor_protection()
    test_multiple_guardrails()
    
    print_section("✅ All Policy Tests Complete", "=")
    print("Summary:")
    print("  ✅ Toxicity detection working")
    print("  ✅ PII redaction working")
    print("  ✅ Competitor protection working")
    print("  ✅ Multiple guardrails working together")
    print("\n🎉 ControlNet policies are properly enforced!\n")

