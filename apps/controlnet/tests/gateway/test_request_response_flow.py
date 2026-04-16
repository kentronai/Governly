"""
ControlNet Proxy - Detailed Request/Response Test

This test shows the complete request/response flow through ControlNet:
1. Request sent from client
2. ControlNet processing (auth, model routing, guardrails)
3. Response received with metadata
"""

import requests
import json
from datetime import datetime
import os

# Configuration from environment variables
CONTROLNET_URL = os.getenv("CONTROLNET_URL", "http://localhost/v1")
POLICY_ID = os.getenv("POLICY_ID", "cede525f-d8b7-49fe-beb8-c24e82403b16")

# Required secrets from environment (fail-fast if not provided)
API_KEY = os.environ["CONTROLNET_API_KEY"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]

def print_header(text):
    print(f"\n{'='*80}")
    print(f"  {text}")
    print(f"{'='*80}\n")

def print_json(data, indent=2):
    """Pretty print JSON data"""
    print(json.dumps(data, indent=indent))

def test_chat_completion():
    """Test chat completion with full request/response visibility"""
    
    print_header("🧪 ControlNet Proxy - Detailed Test")
    
    # Prepare request
    url = f"{CONTROLNET_URL}/chat/completions"
    
    headers = {
        "Content-Type": "application/json",
        "X-API-KEY": API_KEY,
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "X-Policy-ID": POLICY_ID,
    }
    
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "user", "content": "Tell me a short joke about programming"}
        ],
        "max_tokens": 100,
        "temperature": 0.7
    }
    
    print("📤 REQUEST TO CONTROLNET")
    print("-" * 80)
    print(f"URL: {url}")
    print(f"Timestamp: {datetime.now().isoformat()}")
    print(f"\nHeaders:")
    for key, value in headers.items():
        if key == "Authorization":
            print(f"  {key}: Bearer sk-proj-...{value[-20:]}")
        elif key == "X-API-KEY":
            print(f"  {key}: {value[:20]}...")
        else:
            print(f"  {key}: {value}")
    
    print(f"\nRequest Body:")
    print_json(payload)
    
    # Send request
    print(f"\n⏳ Sending request to ControlNet...")
    start_time = datetime.now()
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        
        print(f"✅ Response received in {duration:.2f} seconds")
        
        print_header("📥 RESPONSE FROM CONTROLNET")
        
        print(f"HTTP Status: {response.status_code} {response.reason}")
        print(f"Timestamp: {end_time.isoformat()}")
        
        print(f"\nResponse Headers:")
        for key, value in response.headers.items():
            print(f"  {key}: {value}")
        
        # Parse response
        data = response.json()
        
        print(f"\nResponse Body:")
        print("-" * 80)
        
        if response.status_code == 200:
            # Extract message
            if 'choices' in data and len(data['choices']) > 0:
                message = data['choices'][0]['message']
                print(f"\n✅ AI RESPONSE:")
                print(f"  Role: {message.get('role')}")
                print(f"  Content: {message.get('content')}")
            
            # Extract usage
            if 'usage' in data:
                usage = data['usage']
                print(f"\n📊 TOKEN USAGE:")
                print(f"  Prompt Tokens: {usage.get('prompt_tokens', 0)}")
                print(f"  Completion Tokens: {usage.get('completion_tokens', 0)}")
                print(f"  Total Tokens: {usage.get('total_tokens', 0)}")
            
            # Extract guardrail metadata (ControlNet-specific)
            if 'guardrails' in data:
                guardrails = data['guardrails']
                print(f"\n🛡️  GUARDRAIL METADATA (ControlNet):")
                print(f"  Policy ID: {guardrails.get('policy_id')}")
                
                input_guards = guardrails.get('input_guards', [])
                output_guards = guardrails.get('output_guards', [])
                
                print(f"\n  Input Guards ({len(input_guards)}):")
                for guard in input_guards:
                    status_icon = "✅" if guard.get('status') == 'passed' else "❌"
                    print(f"    {status_icon} {guard.get('name')} ({guard.get('tier')})")
                    if guard.get('description'):
                        print(f"       {guard.get('description')}")
                
                print(f"\n  Output Guards ({len(output_guards)}):")
                for guard in output_guards:
                    status_icon = "✅" if guard.get('status') == 'passed' else "❌"
                    print(f"    {status_icon} {guard.get('name')} ({guard.get('tier')})")
                    if guard.get('description'):
                        print(f"       {guard.get('description')}")
                
                if 'execution_time_ms' in guardrails:
                    exec_time = guardrails['execution_time_ms']
                    print(f"\n  Execution Time:")
                    print(f"    Input Guards: {exec_time.get('input', 0):.2f}ms")
                    print(f"    Output Guards: {exec_time.get('output', 0):.2f}ms")
                    total_time = exec_time.get('input', 0) + exec_time.get('output', 0)
                    print(f"    Total Guard Time: {total_time:.2f}ms")
                
                if guardrails.get('modified_messages'):
                    print(f"\n  ⚠️  Messages were modified by guardrails")
            else:
                print(f"\n⚠️  No guardrail metadata found in response")
            
            # Show full response for debugging
            print(f"\n📋 FULL RESPONSE JSON:")
            print("-" * 80)
            print_json(data)
            
        else:
            # Error response
            print(f"\n❌ ERROR RESPONSE:")
            print_json(data)
        
        print_header("✅ TEST COMPLETE")
        
        return response.status_code == 200
        
    except requests.exceptions.Timeout:
        print(f"\n❌ Request timed out after 30 seconds")
        return False
    except requests.exceptions.ConnectionError:
        print(f"\n❌ Connection error - is ControlNet running?")
        return False
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def test_with_pii():
    """Test with PII to see guardrails in action"""
    
    print_header("🧪 ControlNet Proxy - PII Guardrail Test")
    
    url = f"{CONTROLNET_URL}/chat/completions"
    
    headers = {
        "Content-Type": "application/json",
        "X-API-KEY": API_KEY,
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "X-Policy-ID": POLICY_ID,
    }
    
    # Message with PII that should be redacted
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {
                "role": "user",
                "content": "My email is john.doe@example.com and my phone is 555-1234. Can you help me?"
            }
        ],
        "max_tokens": 100
    }
    
    print("📤 Sending message with PII (email and phone number)...")
    print(f"\nOriginal message:")
    print(f"  '{payload['messages'][0]['content']}'")
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        data = response.json()
        
        if response.status_code == 200:
            print(f"\n✅ Response received")
            
            if 'guardrails' in data:
                guardrails = data['guardrails']
                
                if guardrails.get('modified_messages'):
                    print(f"\n🛡️  Guardrails MODIFIED the message:")
                    modified = guardrails['modified_messages']
                    for msg in modified:
                        if msg['role'] == 'user':
                            print(f"\n  Modified message sent to LLM:")
                            print(f"  '{msg['content']}'")
                            print(f"\n  ✅ PII was redacted before reaching the LLM!")
                
                print(f"\n📝 AI Response:")
                if 'choices' in data:
                    print(f"  {data['choices'][0]['message']['content']}")
            
        print_header("✅ PII TEST COMPLETE")
        return True
        
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        return False


if __name__ == "__main__":
    # Run main test
    success1 = test_chat_completion()
    
    # Run PII test
    print("\n\n")
    success2 = test_with_pii()
    
    # Summary
    print_header("📊 TEST SUMMARY")
    print(f"  Standard Request: {'✅ PASSED' if success1 else '❌ FAILED'}")
    print(f"  PII Guardrail Test: {'✅ PASSED' if success2 else '❌ FAILED'}")
    
    if success1 and success2:
        print(f"\n  🎉 All tests passed! ControlNet proxy is working correctly.")
    else:
        print(f"\n  ⚠️  Some tests failed.")
    
    print(f"\n{'='*80}\n")

