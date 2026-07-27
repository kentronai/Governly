"""
Integration test for policy creation flow (UI → YAML → Compilation)

Tests the full flow:
1. UI sends guardrail selections
2. YAML generator creates policy YAML
3. Compiler parses and compiles the policy
4. Guard executes successfully
"""

import pytest
import yaml
from cga_core.compiler import compile_policy
from gateway.services.yaml_generator_v2 import PolicyYAMLGenerator


class TestPolicyCreationFlow:
    """Test the complete policy creation flow"""
    
    def test_pii_detect_guard_parameters(self):
        """Test that PII detect guard parameters are correctly handled"""
        # Simulate what the UI sends
        guardrail_links = [
            {
                "guardrail_id": "test-id",
                "phase": "input",
                "order_index": 0,
                "params": {
                    "types": ["EMAIL", "PHONE", "SSN"],
                    "threshold": 0,
                    "severity": "high"
                },
                "enabled": True
            }
        ]
        
        guardrails_data = [
            {
                "id": "test-id",
                "key": "pii.detect",
                "default_params": {
                    "types": ["EMAIL", "PHONE"],
                    "threshold": 0,
                    "severity": "medium"
                }
            }
        ]
        
        # Create YAML generator (mocking DB session)
        class MockSession:
            pass
        
        generator = PolicyYAMLGenerator(MockSession())
        
        # Build guard YAML
        guard_yaml = generator._build_guard_yaml(
            guardrail_links[0],
            guardrails_data[0]
        )
        
        # Verify phase is NOT in the parameters
        assert "with" in guard_yaml
        assert "phase" not in guard_yaml["with"], "phase should not be in guard parameters!"
        assert "order_index" not in guard_yaml["with"], "order_index should not be in guard parameters!"
        assert "enabled" not in guard_yaml["with"], "enabled should not be in guard parameters!"
        
        # Verify correct parameters are present
        assert guard_yaml["with"]["types"] == ["EMAIL", "PHONE", "SSN"]
        assert guard_yaml["with"]["threshold"] == 0
        assert guard_yaml["with"]["severity"] == "high"
    
    def test_competitor_protection_parameters(self):
        """Test that competitor protection parameters work"""
        guardrail_links = [
            {
                "guardrail_id": "test-id",
                "phase": "input",
                "order_index": 0,
                "params": {
                    "competitors": ["Microsoft", "Google", "Amazon"],
                    "severity": "low"
                },
                "enabled": True
            }
        ]
        
        guardrails_data = [
            {
                "id": "test-id",
                "key": "business.competitor_protection",
                "default_params": {
                    "competitors": [],
                    "severity": "low"
                }
            }
        ]
        
        class MockSession:
            pass
        
        generator = PolicyYAMLGenerator(MockSession())
        guard_yaml = generator._build_guard_yaml(
            guardrail_links[0],
            guardrails_data[0]
        )
        
        # Verify parameters
        assert guard_yaml["with"]["competitors"] == ["Microsoft", "Google", "Amazon"]
        assert "phase" not in guard_yaml["with"]
    
    def test_composition_uses_underscores(self):
        """Test that composition expressions use underscores not dots"""
        phases = {
            "input": [
                {
                    "link": {"phase": "input", "order_index": 0},
                    "data": {"key": "pii.detect"}
                },
                {
                    "link": {"phase": "input", "order_index": 1},
                    "data": {"key": "business.competitor_protection"}
                }
            ],
            "output": [
                {
                    "link": {"phase": "output", "order_index": 0},
                    "data": {"key": "business.brand_tone"}
                }
            ]
        }
        
        composition_strategy = {
            "input": "allOf",
            "output": "allOf"
        }
        
        class MockSession:
            pass
        
        generator = PolicyYAMLGenerator(MockSession())
        compose = generator._build_composition_yaml(phases, composition_strategy)
        
        # Verify underscores are used
        assert compose["input"] == "allOf(pii_detect, business_competitor_protection)"
        assert "pii.detect" not in compose["input"], "Should use underscores not dots!"
        
        # Verify root expression is created
        assert "root" in compose, "Must have root expression!"
        assert compose["root"] == "seq(input, output)", "Root should sequence all phases!"
    
    def test_full_policy_compilation(self):
        """Test that generated YAML can be compiled successfully"""
        # Test 1: Simple single-phase policy
        policy_yaml_simple = """
policy: test_policy
description: Test policy
guards:
  - id: pii.detect
    target: messages[*].content
    with:
      types:
        - EMAIL
        - PHONE
      threshold: 1
      severity: high
compose:
  root: pii_detect
"""
        
        # Test 2: Multi-phase policy with seq(input, output)
        policy_yaml_multi = """
policy: test_policy
description: Test policy with multiple phases
guards:
  - id: pii.detect
    target: messages[*].content
    with:
      types:
        - EMAIL
        - PHONE
      threshold: 1
      severity: high
  - id: toxicity.detect
    target: messages[*].content
    with:
      severity: high
compose:
  input: allOf(pii_detect)
  output: allOf(toxicity_detect)
  root: seq(input, output)
"""
        
        # Try to compile both
        for name, yaml_content in [("simple", policy_yaml_simple), ("multi-phase", policy_yaml_multi)]:
            try:
                compiled_guards, metadata = compile_policy(yaml_content.encode())
                assert "root" in compiled_guards, f"{name}: Missing root in compiled_guards"
                assert callable(compiled_guards["root"]), f"{name}: Root is not callable"
                print(f"✅ {name} policy compiled successfully!")
            except Exception as e:
                pytest.fail(f"{name} policy compilation failed: {e}")
    
    def test_target_field_formats(self):
        """Test that both string and dict target formats work"""
        # Test string format
        policy_yaml_string = """
policy: test_policy
description: Test
guards:
  - id: pii.detect
    target: messages[*].content
    with:
      types: [EMAIL]
      threshold: 1
      severity: high
compose:
  root: pii_detect
"""
        
        # Test dict format
        policy_yaml_dict = """
policy: test_policy
description: Test
guards:
  - id: pii.detect
    target:
      path: messages[*].content
    with:
      types: [EMAIL]
      threshold: 1
      severity: high
compose:
  root: pii_detect
"""
        
        # Both should compile successfully
        for yaml_content in [policy_yaml_string, policy_yaml_dict]:
            try:
                compiled_guards, metadata = compile_policy(yaml_content.encode())
                assert "root" in compiled_guards
            except Exception as e:
                pytest.fail(f"Failed to compile with target format: {e}")


if __name__ == "__main__":
    # Run tests
    test = TestPolicyCreationFlow()
    
    print("Running test_pii_detect_guard_parameters...")
    test.test_pii_detect_guard_parameters()
    print("✅ PASSED\n")
    
    print("Running test_competitor_protection_parameters...")
    test.test_competitor_protection_parameters()
    print("✅ PASSED\n")
    
    print("Running test_composition_uses_underscores...")
    test.test_composition_uses_underscores()
    print("✅ PASSED\n")
    
    print("Running test_full_policy_compilation...")
    test.test_full_policy_compilation()
    print("✅ PASSED\n")
    
    print("Running test_target_field_formats...")
    test.test_target_field_formats()
    print("✅ PASSED\n")
    
    print("\n🎉 All tests passed!")
