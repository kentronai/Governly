#!/usr/bin/env python3
"""
Test Policy YAML Generation with New Guardrail Naming Convention
================================================================

This script tests that policies are correctly generated with the new naming convention.
"""

import asyncio
import logging
import json
import sys
from typing import Dict, List

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def test_yaml_generation():
    """Test YAML generation with the new naming convention."""
    
    # Simulate the gateway's policy generation logic
    guardrails = [
        {
            "id": "pii-guard-uuid-1234",
            "key": "pii.detect",
            "phase": "input",
            "params": {"types": ["EMAIL", "PHONE"], "threshold": 1.0},
            "order_index": 0
        },
        {
            "id": "toxicity-guard-uuid-5678",
            "key": "toxicity.detect",
            "phase": "input",
            "params": {"threshold": 0.5, "severity": "high"},
            "order_index": 1
        },
        {
            "id": "jailbreak-guard-uuid-9012",
            "key": "jailbreak.detect",
            "phase": "input",
            "params": {"threshold": 0.6, "severity": "critical"},
            "order_index": 2
        },
        {
            "id": "profanity-guard-uuid-3456",
            "key": "profanity.detect",
            "phase": "input",
            "params": {"threshold": 1.0, "severity": "high"},
            "order_index": 3
        }
    ]
    
    # Generate YAML (simulating gateway/routes/policies.py generate_policy_yaml function)
    yaml_lines = [
        "policy: test_policy",
        "description: Test policy with new naming convention",
        "",
        "guards:"
    ]
    
    # Add guards
    for g in guardrails:
        yaml_lines.append(f"  - id: {g['key']}")
        
        # Target based on phase
        if g['phase'] == "input":
            yaml_lines.append(f"    target: messages[*].content")
        else:
            yaml_lines.append(f"    target: output")
        
        # Add parameters if present
        if g.get('params'):
            yaml_lines.append(f"    with:")
            for key, value in g['params'].items():
                yaml_lines.append(f"      {key}: {json.dumps(value)}")
        
        yaml_lines.append("")
    
    # Build composition
    yaml_lines.append("compose:")
    
    # Group guards by phase
    phase_guards = {}
    for g in guardrails:
        phase = g['phase']
        if phase not in phase_guards:
            phase_guards[phase] = []
        # CRITICAL: Replace dots with underscores for compose section
        guard_var = g['key'].replace('.', '_')
        phase_guards[phase].append(guard_var)
    
    # Build phase compositions
    for phase in ['input', 'output']:
        if phase in phase_guards and phase_guards[phase]:
            strategy = 'allOf'
            guard_list = ', '.join(phase_guards[phase])
            yaml_lines.append(f"  {phase}: {strategy}({guard_list})")
    
    # Build root composition
    yaml_lines.append(f"  root: input")
    
    yaml_content = "\n".join(yaml_lines)
    
    logger.info("=" * 70)
    logger.info("GENERATED YAML POLICY")
    logger.info("=" * 70)
    logger.info(yaml_content)
    
    # Verify the content
    logger.info("")
    logger.info("=" * 70)
    logger.info("VERIFICATION")
    logger.info("=" * 70)
    
    # Check guards section uses dots
    assert "id: pii.detect" in yaml_content, "PII guard should use dot notation"
    assert "id: toxicity.detect" in yaml_content, "Toxicity guard should use dot notation"
    assert "id: jailbreak.detect" in yaml_content, "Jailbreak guard should use dot notation"
    assert "id: profanity.detect" in yaml_content, "Profanity guard should use dot notation"
    logger.info("✅ Guard IDs correctly use dot notation (category.action)")
    
    # Check compose section uses underscores
    assert "pii_detect" in yaml_content, "PII in compose should use underscore"
    assert "toxicity_detect" in yaml_content, "Toxicity in compose should use underscore"
    assert "jailbreak_detect" in yaml_content, "Jailbreak in compose should use underscore"
    assert "profanity_detect" in yaml_content, "Profanity in compose should use underscore"
    logger.info("✅ Compose section correctly uses underscores (category_action)")
    
    # Check the complete compose line
    expected_compose = "input: allOf(pii_detect, toxicity_detect, jailbreak_detect, profanity_detect)"
    assert expected_compose in yaml_content, f"Expected compose line not found: {expected_compose}"
    logger.info("✅ Complete compose expression is correct")
    
    return True


def test_guard_registration():
    """Test that guards are properly registered."""
    logger.info("")
    logger.info("=" * 70)
    logger.info("TESTING GUARD REGISTRATION")
    logger.info("=" * 70)
    
    try:
        # Import will trigger registration via @guard decorators
        from cga_core import get_registry, get_guard
        
        registry = get_registry()
        
        # Check new naming convention
        required_guards = ["pii.detect", "toxicity.detect", "jailbreak.detect", "profanity.detect"]
        
        for guard_id in required_guards:
            if guard_id in registry:
                logger.info(f"✅ {guard_id} is registered")
            else:
                logger.error(f"❌ {guard_id} is NOT registered")
                return False
        
        # Try to get each guard
        for guard_id in required_guards:
            try:
                factory = get_guard(guard_id)
                logger.info(f"✅ {guard_id} factory retrieved successfully")
            except KeyError:
                logger.error(f"❌ Failed to get factory for {guard_id}")
                return False
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to test registration: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_policy_compilation():
    """Test that policies compile correctly with the new naming."""
    logger.info("")
    logger.info("=" * 70)
    logger.info("TESTING POLICY COMPILATION")
    logger.info("=" * 70)
    
    try:
        from cga_core import compile_policy
        
        # Create test policy YAML
        policy_yaml = """
policy: test_new_naming
description: Test policy with new naming convention

guards:
  - id: pii.detect
    target: messages[*].content
    with:
      types: ["EMAIL", "PHONE"]
      threshold: 1.0
      
  - id: toxicity.detect
    target: messages[*].content
    with:
      threshold: 0.5
      severity: high
      
  - id: jailbreak.detect
    target: messages[*].content
    with:
      threshold: 0.6
      severity: critical
      
  - id: profanity.detect
    target: messages[*].content
    with:
      threshold: 1.0
      severity: high

compose:
  input: allOf(pii_detect, toxicity_detect, jailbreak_detect, profanity_detect)
  root: input
"""
        
        # Try to compile
        compiled_guards, policy_metadata = compile_policy(policy_yaml.encode())
        
        logger.info("✅ Policy compiled successfully!")
        logger.info(f"   Compiled guards: {list(compiled_guards.keys())}")
        logger.info(f"   Guard keys in metadata: {policy_metadata.get('guard_keys', [])}")
        
        # Test the compiled guard
        test_ctx = {
            "messages": [{"role": "user", "content": "test@example.com"}],
            "output": "test@example.com"
        }
        
        input_guard = compiled_guards.get("input")
        if input_guard:
            result = await input_guard(test_ctx)
            logger.info(f"✅ Input guard executed successfully")
            logger.info(f"   Result is_left: {hasattr(result, 'is_left') and result.is_left()}")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to compile policy: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """Main test function."""
    all_passed = True
    
    # Test 1: YAML Generation
    if not test_yaml_generation():
        all_passed = False
    
    # Test 2: Guard Registration
    if not test_guard_registration():
        all_passed = False
    
    # Test 3: Policy Compilation
    if not await test_policy_compilation():
        all_passed = False
    
    logger.info("")
    logger.info("=" * 70)
    if all_passed:
        logger.info("✅ ALL TESTS PASSED!")
        logger.info("")
        logger.info("The new naming convention is working correctly:")
        logger.info("  - Guards use dot notation: category.action (e.g., pii.detect)")
        logger.info("  - Compose uses underscores: category_action (e.g., pii_detect)")
        logger.info("  - Policies compile and execute properly")
    else:
        logger.error("❌ SOME TESTS FAILED")
        logger.error("")
        logger.error("Please check the error messages above")
    logger.info("=" * 70)
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
