#!/usr/bin/env python3
"""
Enhanced SDK Demo

Demonstrates all new SDK capabilities:
- ONNX model integration with user choice
- Zero-copy streaming proxy
- T0/T1/T2 tiered execution
- Tool enforcement
- Real-time guard evaluation
"""

import asyncio
import json
from pathlib import Path
import sys

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from cga_sdk import (
    StreamingGuardrailsSDK, SDKConfig, StreamingConfig,
    quick_guard, quick_onnx_guard, quick_stream_guard
)


async def demo_onnx_model_choice():
    """Demo: User choice of ONNX models"""
    print("\n🤖 ONNX Model Choice Demo")
    print("=" * 50)
    
    sdk = StreamingGuardrailsSDK()
    
    # List available models
    models = sdk.list_available_onnx_models()
    print(f"Available ONNX models: {len(models)}")
    
    for model in models[:3]:  # Show first 3
        print(f"  📊 {model['id']}: {model['name']} ({model['category']})")
    
    # Create guards with different models
    print("\n🛡️  Creating guards with user-chosen models:")
    
    try:
        # Financial advice detection
        financial_guard = await sdk.create_onnx_guard(
            model_id="financial_advice_distilbert",
            threshold=0.8,
            target_labels=["financial_advice"]
        )
        print("✅ Financial guard created with DistilBERT model")
        
        # Toxicity detection with ensemble
        toxicity_guard = await sdk.create_onnx_guard(
            model_id="toxicity_detoxify",
            threshold=0.6,
            target_labels=["toxic", "severe_toxic"],
            ensemble_models=["multilingual_toxicity_bert"]
        )
        print("✅ Toxicity guard created with ensemble models")
        
    except Exception as e:
        print(f"⚠️  ONNX guards using fallback: {e}")
    
    await sdk.close()


async def demo_streaming_with_guards():
    """Demo: Streaming with real-time guard evaluation"""
    print("\n🌊 Streaming with Guards Demo")
    print("=" * 50)
    
    # Configure streaming
    streaming_config = StreamingConfig(
        enable_zero_copy=True,
        enable_adaptive_windowing=True,
        enable_guard_streaming=True,
        guard_frequency=3  # Check every 3 chunks
    )
    
    sdk = StreamingGuardrailsSDK(streaming_config=streaming_config)
    
    try:
        # Load policy
        policy_path = "policies/business_onnx_enhanced_v1.yaml"
        if Path(policy_path).exists():
            await sdk.load_policy(policy_path)
            policy_id = "business_onnx_enhanced_v1"
            
            print(f"📋 Loaded policy: {policy_id}")
            
            # Test streaming with guards
            messages = [
                {"role": "user", "content": "What stocks should I buy for maximum profit?"}
            ]
            
            print("\n🔄 Streaming response with real-time guards:")
            chunk_count = 0
            
            async for chunk in sdk.stream_chat_with_guards(
                messages=messages,
                policy_id=policy_id,
                model="gpt-3.5-turbo"
            ):
                chunk_count += 1
                
                if chunk.get("type") == "guard_violation":
                    print(f"🚫 Guard violation detected at chunk {chunk_count}")
                    print(f"   Phase: {chunk.get('phase')}")
                    print(f"   Violations: {len(chunk.get('violations', []))}")
                    break
                
                elif chunk.get("guard_status"):
                    print(f"✅ Chunk {chunk_count}: {chunk.get('guard_status')} (length: {chunk.get('accumulated_length', 0)})")
                
                if chunk_count >= 5:  # Limit for demo
                    break
        
        else:
            print("⚠️  Policy file not found, skipping streaming demo")
    
    except Exception as e:
        print(f"❌ Streaming demo error: {e}")
    
    finally:
        await sdk.close()


async def demo_zero_copy_performance():
    """Demo: Zero-copy streaming performance"""
    print("\n⚡ Zero-Copy Performance Demo")
    print("=" * 50)
    
    # Configure for maximum performance
    config = SDKConfig(
        streaming_enabled=True,
        use_streaming_proxy=True,
        performance_budget_ms=50.0
    )
    
    streaming_config = StreamingConfig(
        enable_zero_copy=True,
        buffer_size=16384,
        performance_budget_ms=50.0
    )
    
    sdk = StreamingGuardrailsSDK(config=config, streaming_config=streaming_config)
    
    try:
        # Check streaming capabilities
        stats = await sdk.get_streaming_stats()
        print("🔧 Streaming Configuration:")
        for key, value in stats.items():
            print(f"   {key}: {value}")
        
        # Test zero-copy streaming
        messages = [{"role": "user", "content": "Hello, how are you?"}]
        
        print("\n🚀 Zero-copy streaming test:")
        start_time = asyncio.get_event_loop().time()
        chunk_count = 0
        
        async for chunk in sdk.stream_with_zero_copy(
            messages=messages,
            model="gpt-3.5-turbo"
        ):
            chunk_count += 1
            if chunk_count >= 3:  # Limit for demo
                break
        
        elapsed = (asyncio.get_event_loop().time() - start_time) * 1000
        print(f"✅ Processed {chunk_count} chunks in {elapsed:.2f}ms")
        
    except Exception as e:
        print(f"⚠️  Zero-copy demo (using fallback): {e}")
    
    finally:
        await sdk.close()


async def demo_tiered_execution():
    """Demo: T0/T1/T2 tiered execution"""
    print("\n🏗️  T0/T1/T2 Tiered Execution Demo")
    print("=" * 50)
    
    # Configure tiered execution
    config = SDKConfig(
        tiered_execution=True,
        performance_budget_ms=200.0
    )
    
    sdk = StreamingGuardrailsSDK(config=config)
    
    try:
        # Load policy with tiered guards
        policy_path = "policies/business_onnx_enhanced_v1.yaml"
        if Path(policy_path).exists():
            policy_info = await sdk.load_policy(policy_path)
            
            print("📊 Policy Tier Information:")
            tiers = policy_info.get("tiers", {})
            for tier, guards in tiers.items():
                print(f"   {tier}: {len(guards)} guards")
            
            # Test tiered execution with different complexity inputs
            test_cases = [
                "Hello world",  # Simple - should pass T0
                "What stocks should I buy?",  # Financial - may trigger T1/T2
                "You are such an idiot",  # Toxic - should be caught early
            ]
            
            for i, test_input in enumerate(test_cases, 1):
                print(f"\n🧪 Test {i}: '{test_input}'")
                
                try:
                    # Simulate LLM function
                    async def mock_llm(**kwargs):
                        return f"Response to: {test_input}"
                    
                    result = await sdk.wrap_llm(
                        mock_llm,
                        "business_onnx_enhanced_v1",
                        messages=[{"role": "user", "content": test_input}]
                    )
                    
                    print(f"   ✅ Passed: {result[:50]}...")
                    
                except Exception as e:
                    print(f"   🚫 Blocked: {e}")
        
        else:
            print("⚠️  Policy file not found, skipping tiered demo")
    
    except Exception as e:
        print(f"❌ Tiered execution demo error: {e}")
    
    finally:
        await sdk.close()


async def demo_tool_enforcement():
    """Demo: Tool enforcement with SDK"""
    print("\n🔧 Tool Enforcement Demo")
    print("=" * 50)
    
    sdk = StreamingGuardrailsSDK()
    
    try:
        # Load tool enforcement policy
        policy_path = "policies/enterprise_tools_v1.yaml"
        if Path(policy_path).exists():
            await sdk.load_policy(policy_path)
            
            # Define test tools
            async def get_weather(location: str) -> str:
                return f"Weather in {location}: Sunny, 72°F"
            
            async def unauthorized_tool(secret_data: str) -> str:
                return f"Secret: {secret_data}"
            
            # Test allowed tool
            print("🔧 Testing allowed tool:")
            try:
                result = await sdk.guard_tool(
                    get_weather,
                    "enterprise_tools_v1",
                    location="San Francisco"
                )
                print(f"   ✅ Allowed: {result}")
            except Exception as e:
                print(f"   🚫 Blocked: {e}")
            
            # Test unauthorized tool
            print("\n🔧 Testing unauthorized tool:")
            try:
                result = await sdk.guard_tool(
                    unauthorized_tool,
                    "enterprise_tools_v1",
                    secret_data="classified"
                )
                print(f"   ❌ Should have been blocked: {result}")
            except Exception as e:
                print(f"   ✅ Correctly blocked: {e}")
        
        else:
            print("⚠️  Tool policy not found, skipping tool demo")
    
    except Exception as e:
        print(f"❌ Tool enforcement demo error: {e}")
    
    finally:
        await sdk.close()


async def demo_quick_functions():
    """Demo: Quick convenience functions"""
    print("\n⚡ Quick Functions Demo")
    print("=" * 50)
    
    # Quick guard test
    print("🛡️  Quick guard test:")
    result = await quick_guard(
        text="What stocks should I buy?",
        policy_path="policies/business_financial_v1.yaml"
    )
    print(f"   Status: {result['status']}")
    if result['status'] == 'blocked':
        print(f"   Violations: {len(result.get('violations', []))}")
    
    # Quick ONNX guard test
    print("\n🤖 Quick ONNX guard test:")
    result = await quick_onnx_guard(
        text="You are such an idiot",
        model_id="toxicity_detoxify",
        threshold=0.5
    )
    print(f"   Status: {result['status']}")
    if result['status'] == 'blocked':
        print(f"   Violations: {len(result.get('violations', []))}")


async def demo_health_and_monitoring():
    """Demo: Health checks and monitoring"""
    print("\n🏥 Health & Monitoring Demo")
    print("=" * 50)
    
    sdk = StreamingGuardrailsSDK()
    
    try:
        # Health check
        health = await sdk.health_check()
        print("🏥 SDK Health Status:")
        for key, value in health.items():
            print(f"   {key}: {value}")
        
        # Policy information
        policies = sdk.list_loaded_policies()
        print(f"\n📋 Loaded Policies: {len(policies)}")
        for policy_id in policies:
            info = sdk.get_policy_info(policy_id)
            print(f"   📄 {policy_id}: {len(info.get('onnx_models', []))} ONNX models")
        
        # Streaming stats
        if hasattr(sdk, 'get_streaming_stats'):
            stats = await sdk.get_streaming_stats()
            print(f"\n🌊 Streaming Stats:")
            for key, value in stats.items():
                print(f"   {key}: {value}")
    
    except Exception as e:
        print(f"❌ Health check error: {e}")
    
    finally:
        await sdk.close()


async def main():
    """Run all SDK demos"""
    print("🚀 Enhanced Guardrails SDK Demo")
    print("=" * 60)
    print("Demonstrating all new features:")
    print("- ONNX model integration with user choice")
    print("- Zero-copy streaming proxy")
    print("- T0/T1/T2 tiered execution")
    print("- Tool enforcement")
    print("- Real-time guard evaluation")
    print("- Performance optimization")
    
    demos = [
        demo_onnx_model_choice,
        demo_streaming_with_guards,
        demo_zero_copy_performance,
        demo_tiered_execution,
        demo_tool_enforcement,
        demo_quick_functions,
        demo_health_and_monitoring
    ]
    
    for demo in demos:
        try:
            await demo()
        except Exception as e:
            print(f"❌ Demo {demo.__name__} failed: {e}")
        
        print()  # Add spacing between demos
    
    print("🎉 Enhanced SDK Demo Complete!")
    print("\nThe SDK now supports:")
    print("✅ User choice of ONNX models")
    print("✅ Zero-copy streaming proxy by default")
    print("✅ T0/T1/T2 tiered execution")
    print("✅ Real-time guard evaluation")
    print("✅ Tool enforcement")
    print("✅ Performance optimization")
    print("✅ Comprehensive monitoring")


if __name__ == "__main__":
    asyncio.run(main())
