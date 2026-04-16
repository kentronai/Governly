"""
Unit Tests for ONNX Optional Feature

Tests that:
1. Non-ONNX guards work without ONNX installation
2. ONNX guards fail with clear error messages
3. Filtering logic works correctly
4. Compiler handles both cases properly
"""

import pytest
from cga_core.compiler import compile_policy


class TestONNXFiltering:
    """Test ONNX filtering logic"""
    # Note: conftest.py handles guard registration via autouse fixture
    
    def test_non_onnx_policy_compiles(self):
        """Test that policies with only non-ONNX guards compile successfully"""
        policy_yaml = """
policy: test_non_onnx
description: Test with non-ONNX guards only

guards:
  - id: pii.detect
    target: messages[*].content
    with:
      types: [EMAIL, PHONE]
      threshold: 0
      severity: high
  
  - id: toxicity.block
    target: output
    with:
      categories: [profanity, harassment]
      threshold: 0.3
      severity: critical

compose:
  input: pii_detect_pii
  output: toxicity_block
  root: seq(input, output)
"""
        
        try:
            compiled_guards, metadata = compile_policy(policy_yaml.encode())
            
            assert "root" in compiled_guards
            assert "input" in compiled_guards
            assert "output" in compiled_guards
            assert callable(compiled_guards["root"])
            
            print("✅ Non-ONNX policy compiled successfully")
            print(f"   Phases: {list(compiled_guards.keys())}")
            
        except Exception as e:
            pytest.fail(f"Non-ONNX policy should compile: {e}")
    
    def test_multiple_non_onnx_guards(self):
        """Test policy with multiple non-ONNX guards"""
        policy_yaml = """
policy: test_multiple
description: Multiple non-ONNX guards

guards:
  - id: pii.detect_pii
    target: messages[*].content
    with:
      types: [EMAIL, PHONE]
      threshold: 1.0
      anonymize_mode: mask
  
  - id: toxicity.detect
    target: output
    with:
      categories: [profanity, harassment]
      threshold: 0.5
      severity: medium

compose:
  input: allOf(pii_detect_pii)
  output: toxicity_detect
  root: seq(input, output)
"""
        
        try:
            compiled_guards, metadata = compile_policy(policy_yaml.encode())
            
            assert "root" in compiled_guards
            assert callable(compiled_guards["root"])
            
            # Check tier counts
            tier_counts = metadata.get("tier_counts", {})
            assert tier_counts.get("T0", 0) + tier_counts.get("T1", 0) > 0
            
            print("✅ Multiple non-ONNX guards compiled")
            print(f"   Tier distribution: {tier_counts}")
            
        except Exception as e:
            pytest.fail(f"Multiple non-ONNX guards should compile: {e}")
    
    def test_onnx_guard_clear_error(self):
        """Test that ONNX guards fail with clear error message"""
        policy_yaml = """
policy: test_onnx_fail
description: Should fail with clear message

guards:
  - id: onnx.financial
    target: messages[*].content
    with:
      model_id: "financial_advice_model"
      threshold: 0.7

compose:
  root: onnx_financial
"""
        
        try:
            import guard_packs.onnx.guards
        except ImportError:
            pytest.skip("ONNX guards not available")
        
        with pytest.raises(ValueError) as exc_info:
            compile_policy(policy_yaml.encode())
        
        error_msg = str(exc_info.value)
        
        # Check error message is helpful
        assert "ONNX" in error_msg or "onnx" in error_msg, \
            "Error should mention ONNX"
        assert any(word in error_msg.lower() for word in ["not found", "required", "requires", "missing"]), \
            "Error should indicate model is missing or required"
        assert "financial" in error_msg.lower(), \
            "Error should identify the guard"
        
        # Check for helpful suggestions
        helpful_phrases = ["Remove", "install", "To fix", "To use", "either"]
        has_suggestion = any(phrase in error_msg for phrase in helpful_phrases)
        assert has_suggestion, f"Error should provide helpful suggestions. Got: {error_msg}"
        
        print("✅ ONNX guard failed with clear error:")
        print(f"   {error_msg[:200]}...")


class TestGuardParameters:
    """Test that guard parameters work correctly"""
    # Note: conftest.py handles guard registration
    
    def test_pii_detect_with_custom_types(self):
        """Test PII detect with custom entity types"""
        policy_yaml = """
policy: test_pii_custom
description: PII detection with custom types

guards:
  - id: pii.detect_pii
    target: messages[*].content
    with:
      types:
        - EMAIL
        - PHONE
        - SSN
        - CREDIT_CARD
      threshold: 1.0
      anonymize_mode: mask

compose:
  root: pii_detect_pii
"""
        
        try:
            compiled_guards, metadata = compile_policy(policy_yaml.encode())
            assert "root" in compiled_guards
            print("✅ PII detect with custom types compiled")
            
        except Exception as e:
            pytest.fail(f"PII detect should work with custom types: {e}")
    
    def test_toxicity_with_threshold(self):
        """Test toxicity detection with custom threshold"""
        policy_yaml = """
policy: test_toxicity_threshold
description: Toxicity with custom threshold

guards:
  - id: toxicity.block
    target: output
    with:
      categories:
        - profanity
        - harassment
        - discriminatory
      threshold: 0.2
      severity: critical

compose:
  root: toxicity_block
"""
        
        try:
            compiled_guards, metadata = compile_policy(policy_yaml.encode())
            assert "root" in compiled_guards
            print("✅ Toxicity with custom threshold compiled")
            
        except Exception as e:
            pytest.fail(f"Toxicity should work with custom threshold: {e}")


class TestCompositionStrategies:
    """Test different composition strategies with non-ONNX guards"""
    # Note: conftest.py handles guard registration
    
    def test_allof_composition(self):
        """Test allOf composition with non-ONNX guards"""
        policy_yaml = """
policy: test_allof
description: AllOf composition

guards:
  - id: pii.detect_pii
    target: messages[*].content
    with:
      types: [EMAIL]
      threshold: 1.0
      anonymize_mode: mask
  
  - id: toxicity.detect
    target: messages[*].content
    with:
      categories: [profanity, harassment]
      threshold: 0.5
      severity: high

compose:
  root: allOf(pii_detect_pii, toxicity_detect)
"""
        
        compiled_guards, metadata = compile_policy(policy_yaml.encode())
        assert "root" in compiled_guards
        print("✅ allOf composition works")
    
    def test_seq_composition(self):
        """Test sequential composition"""
        policy_yaml = """
policy: test_seq
description: Sequential composition

guards:
  - id: pii.detect_pii
    target: messages[*].content
    with:
      types: [EMAIL]
      threshold: 1.0
      anonymize_mode: mask
  
  - id: toxicity.block
    target: output
    with:
      threshold: 0.3
      severity: high

compose:
  input: pii_detect_pii
  output: toxicity_block
  root: seq(input, output)
"""
        
        compiled_guards, metadata = compile_policy(policy_yaml.encode())
        assert "root" in compiled_guards
        assert "input" in compiled_guards
        assert "output" in compiled_guards
        print("✅ seq composition works")
    
    def test_anyof_composition(self):
        """Test anyOf composition"""
        policy_yaml = """
policy: test_anyof
description: AnyOf composition

guards:
  - id: pii.detect_pii
    target: messages[*].content
    with:
      types: [EMAIL]
      threshold: 1.0
      anonymize_mode: mask
  
  - id: toxicity.detect
    target: messages[*].content
    with:
      threshold: 0.5
      severity: medium

compose:
  root: anyOf(pii_detect_pii, toxicity_detect)
"""
        
        compiled_guards, metadata = compile_policy(policy_yaml.encode())
        assert "root" in compiled_guards
        print("✅ anyOf composition works")


class TestTierDistribution:
    """Test that tier distribution is calculated correctly"""
    # Note: conftest.py handles guard registration
    # pii.guards = T0, toxicity.guards = T1
    
    def test_tier_counts(self):
        """Test that tier counts are correctly calculated"""
        policy_yaml = """
policy: test_tiers
description: Test tier distribution

guards:
  - id: pii.detect_pii
    target: messages[*].content
    with:
      types: [EMAIL]
      threshold: 1.0
      anonymize_mode: mask
  
  - id: toxicity.detect
    target: output
    with:
      threshold: 0.5
      severity: medium
  
  - id: toxicity.block
    target: output
    with:
      threshold: 0.3
      severity: high

compose:
  input: allOf(pii_detect_pii)
  output: allOf(toxicity_detect, toxicity_block)
  root: seq(input, output)
"""
        
        compiled_guards, metadata = compile_policy(policy_yaml.encode())
        
        tier_counts = metadata.get("tier_counts", {})
        
        # pii.detect_pii is T0
        # toxicity.detect and toxicity.block are T1
        assert tier_counts.get("T0", 0) == 1, "Should have 1 T0 guard (pii.detect_pii)"
        assert tier_counts.get("T1", 0) == 2, "Should have 2 T1 guards"
        assert tier_counts.get("T2", 0) == 0, "Should have 0 T2 guards (no ONNX)"
        
        print("✅ Tier distribution calculated correctly:")
        print(f"   T0: {tier_counts.get('T0', 0)}")
        print(f"   T1: {tier_counts.get('T1', 0)}")
        print(f"   T2: {tier_counts.get('T2', 0)}")


if __name__ == "__main__":
    # Run tests with pytest
    pytest.main([__file__, "-v", "-s"])

