#!/usr/bin/env python3
"""
Verification Script for Default Guardrails
==========================================

This script verifies that the default guardrails are properly registered
and can be used in policies.

Run this before starting the server to ensure everything is set up correctly.

Usage:
    python verify_default_guardrails.py
"""

import sys
import logging
from typing import Dict, List

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def verify_guard_registration() -> bool:
    """
    Verify that all default guardrails are registered in the CGA registry.
    
    Returns:
        True if all guards are registered, False otherwise
    """
    logger.info("=" * 70)
    logger.info("VERIFYING DEFAULT GUARDRAILS REGISTRATION")
    logger.info("=" * 70)
    
    try:
        # Import cga_core which triggers guard registration
        from cga_core import get_registry, get_guard_metadata
        
        registry = get_registry()
        
        # Expected default guardrails (new naming convention)
        expected_guards = [
            "profanity.detect",
            "jailbreak.detect",
            "toxicity.detect",
            "pii.detect",
        ]
        
        # Check each guard
        all_registered = True
        for guard_id in expected_guards:
            if guard_id in registry:
                metadata = get_guard_metadata(guard_id)
                logger.info(f"✅ {guard_id} - Registered")
                logger.info(f"   Tier: {metadata.tier}")
                logger.info(f"   Budget: {metadata.performance_budget_ms}ms")
                logger.info(f"   Description: {metadata.description}")
            else:
                logger.error(f"❌ {guard_id} - NOT REGISTERED")
                all_registered = False
        
        logger.info("")
        logger.info(f"Total guards in registry: {len(registry)}")
        logger.info(f"PII guards: {sum(1 for g in registry if g.startswith('pii.'))}/1")
        logger.info(f"Toxicity guards: {sum(1 for g in registry if g.startswith('toxicity.'))}/1")
        logger.info(f"Jailbreak guards: {sum(1 for g in registry if g.startswith('jailbreak.'))}/1")
        logger.info(f"Profanity guards: {sum(1 for g in registry if g.startswith('profanity.'))}/1")
        
        return all_registered
        
    except Exception as e:
        logger.error(f"❌ Failed to import cga_core: {e}")
        return False


def test_guard_instantiation() -> bool:
    """
    Test that guards can be instantiated with parameters.
    
    Returns:
        True if all guards can be instantiated, False otherwise
    """
    logger.info("")
    logger.info("=" * 70)
    logger.info("TESTING GUARD INSTANTIATION")
    logger.info("=" * 70)
    
    try:
        from cga_core import get_guard
        
        # Test profanity
        logger.info("Testing profanity.detect...")
        profanity_factory = get_guard("profanity.detect")
        profanity_guard = profanity_factory(threshold=1.0, severity="high")
        logger.info("✅ Profanity guard instantiated successfully")
        
        # Test jailbreak
        logger.info("Testing jailbreak.detect...")
        jailbreak_factory = get_guard("jailbreak.detect")
        jailbreak_guard = jailbreak_factory(threshold=0.7, severity="critical")
        logger.info("✅ Jailbreak guard instantiated successfully")
        
        # Test toxicity
        logger.info("Testing toxicity.detect...")
        toxicity_factory = get_guard("toxicity.detect")
        toxicity_guard = toxicity_factory(threshold=0.6, severity="high")
        logger.info("✅ Toxicity guard instantiated successfully")
        
        # Test PII
        logger.info("Testing pii.detect...")
        pii_factory = get_guard("pii.detect")
        pii_guard = pii_factory(types=["EMAIL", "PHONE"], threshold=1.0, anonymize_mode="mask")
        logger.info("✅ PII guard instantiated successfully")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to instantiate guards: {e}")
        import traceback
        traceback.print_exc()
        return False


def generate_example_policy() -> None:
    """Generate an example policy YAML that uses default guardrails."""
    logger.info("")
    logger.info("=" * 70)
    logger.info("EXAMPLE POLICY YAML")
    logger.info("=" * 70)
    
    policy_yaml = """
policy: safe_chat_policy
description: Production-ready policy with profanity, jailbreak, toxicity, and PII detection

guards:
  - id: profanity.detect
    target: messages[*].content
    with:
      threshold: 1.0
      severity: high
      categories: ["moderate", "severe"]
      
  - id: jailbreak.detect
    target: messages[*].content
    with:
      threshold: 0.7
      severity: critical
      
  - id: toxicity.detect
    target: messages[*].content
    with:
      threshold: 0.6
      severity: high
      categories: ["harassment", "hate_speech", "threats"]
      
  - id: pii.detect
    target: messages[*].content
    with:
      types: ["EMAIL", "PHONE", "SSN", "CREDIT_CARD"]
      threshold: 1.0
      anonymize_mode: mask
      severity: high

compose:
  input: allOf(profanity_detect, jailbreak_detect, toxicity_detect, pii_detect)
  output: allOf(profanity_detect, toxicity_detect, pii_detect)
  root: seq(input, output)
"""
    
    logger.info(policy_yaml)
    
    logger.info("")
    logger.info("To use this policy:")
    logger.info("1. Save it as a .yaml file")
    logger.info("2. Create policy via API: POST /v1/policies")
    logger.info("3. Use it in chat: Header X-Policy-ID: <policy_id>")


def generate_sql_verification() -> None:
    """Generate SQL to verify guardrails in database."""
    logger.info("")
    logger.info("=" * 70)
    logger.info("DATABASE VERIFICATION")
    logger.info("=" * 70)
    
    sql = """
-- Verify default guardrails are registered in database
SELECT 
    key,
    name,
    tier,
    category,
    is_enabled,
    pack_name
FROM guardrails
WHERE key IN ('pii.detect', 'toxicity.detect', 'jailbreak.detect', 'profanity.detect')
ORDER BY key;

-- Expected output:
-- jailbreak.detect  | Jailbreak Detection | T1 | security        | true | jailbreak
-- pii.detect       | PII Detection       | T0 | privacy         | true | pii
-- profanity.detect | Profanity Detection | T0 | content_safety  | true | profanity
-- toxicity.detect  | Toxicity Detection  | T1 | content_safety  | true | toxicity
"""
    
    logger.info(sql)
    logger.info("")
    logger.info("Run this SQL after executing INSERT_DEFAULT_GUARDRAILS.sql")


def main() -> int:
    """
    Main verification function.
    
    Returns:
        0 if all checks pass, 1 otherwise
    """
    checks_passed = True
    
    # Check 1: Registration
    if not verify_guard_registration():
        checks_passed = False
    
    # Check 2: Instantiation
    if not test_guard_instantiation():
        checks_passed = False
    
    # Provide examples
    generate_example_policy()
    generate_sql_verification()
    
    logger.info("")
    logger.info("=" * 70)
    if checks_passed:
        logger.info("✅ ALL VERIFICATION CHECKS PASSED")
        logger.info("")
        logger.info("Next steps:")
        logger.info("1. Execute INSERT_DEFAULT_GUARDRAILS.sql in your database")
        logger.info("2. Start the ControlNet server")
        logger.info("3. Create a policy using the example YAML above")
        logger.info("4. Test in playground or via API")
    else:
        logger.error("❌ SOME VERIFICATION CHECKS FAILED")
        logger.error("")
        logger.error("Please fix the issues above before proceeding")
    logger.info("=" * 70)
    
    return 0 if checks_passed else 1


if __name__ == "__main__":
    sys.exit(main())

