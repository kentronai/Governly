import {
  BUILTIN_GUARDRAIL_KEYS,
  isBuiltinGuardrail,
} from "./builtin-guardrails";
import { DEFAULT_APPLICATION_POLICIES } from "./default-application-policies";

describe("BUILTIN_GUARDRAIL_KEYS", () => {
  it("ships exactly the five baseline guardrails", () => {
    expect([...BUILTIN_GUARDRAIL_KEYS].sort()).toEqual([
      "harmful_instructions.detect",
      "jailbreak.detect",
      "pii.detect",
      "profanity.detect",
      "toxicity.detect",
    ]);
  });

  it("covers every guard the default Launch policy composes", () => {
    // Launch is created for every application and must never reference a
    // guardrail that requires installing something first.
    for (const policy of DEFAULT_APPLICATION_POLICIES) {
      for (const guard of policy.guards) {
        expect(isBuiltinGuardrail(guard.key)).toBe(true);
      }
    }
  });

  it("does not classify marketplace guardrails as built-in", () => {
    // These require an explicit install before they can be composed.
    const marketplaceKeys = [
      "pii.redact",
      "business.brand_tone",
      "business.competitor_protection",
      "tools.allowlist",
      "tools.denylist",
      "formatting.json",
      "formatting.url",
      "validation.contains_string",
      "validation.regex_match",
    ];

    for (const key of marketplaceKeys) {
      expect(isBuiltinGuardrail(key)).toBe(false);
    }
  });

  it("returns false for unknown keys", () => {
    expect(isBuiltinGuardrail("")).toBe(false);
    expect(isBuiltinGuardrail("not.a.guardrail")).toBe(false);
  });

  it("holds no duplicates", () => {
    expect(new Set(BUILTIN_GUARDRAIL_KEYS).size).toBe(
      BUILTIN_GUARDRAIL_KEYS.length,
    );
  });
});
