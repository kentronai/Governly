import {
  DEFAULT_APPLICATION_POLICIES,
  buildDefaultPolicyYaml,
} from "@/lib/default-application-policies";

describe("default application policies", () => {
  // Applications used to be seeded with Launch + Strict + Development. Only
  // Launch is offered now, so `createApplication` — which just iterates this
  // constant — must produce exactly one policy.
  it("defines only the Launch policy", () => {
    const names = DEFAULT_APPLICATION_POLICIES.map((policy) => policy.name);

    expect(names).toEqual(["Launch"]);
  });

  it("no longer defines the retired Strict or Development profiles", () => {
    const profiles = DEFAULT_APPLICATION_POLICIES.map((policy) => policy.profile);

    expect(profiles).not.toContain("strict");
    expect(profiles).not.toContain("development");
  });

  it("marks the Launch policy as the application default", () => {
    const defaults = DEFAULT_APPLICATION_POLICIES.filter(
      (policy) => policy.isDefault,
    );

    expect(defaults).toHaveLength(1);
    expect(defaults[0].name).toBe("Launch");
  });

  it.each(DEFAULT_APPLICATION_POLICIES)(
    "generates executable ControlNet YAML for $name",
    (definition) => {
      const yaml = buildDefaultPolicyYaml(definition);

      expect(yaml).toContain("guards:");
      expect(yaml).toContain("compose:");
      expect(yaml).toContain("  root: input");

      for (const guard of definition.guards) {
        expect(yaml).toContain(`  - id: ${guard.key}`);
      }
    },
  );

  it("gives every seeded policy at least one guard", () => {
    // An empty composition produces a policy the gateway rejects.
    for (const policy of DEFAULT_APPLICATION_POLICIES) {
      expect(policy.guards.length).toBeGreaterThan(0);
    }
  });

  it("composes Launch from the baseline protection set", () => {
    const byProfile = Object.fromEntries(
      DEFAULT_APPLICATION_POLICIES.map((policy) => [policy.profile, policy]),
    );

    expect(byProfile.standard.guards.map((guard) => guard.key)).toEqual([
      "pii.detect",
      "jailbreak.detect",
      "profanity.detect",
      "toxicity.detect",
      "harmful_instructions.detect",
    ]);

    const harmful = byProfile.standard.guards.find(
      (guard) => guard.key === "harmful_instructions.detect",
    );
    expect(harmful?.params?.threshold).toBe(0.75);
    expect(harmful?.params?.severity).toBe("high");
  });

  it("only composes guards present in the seeded global catalog", () => {
    // Keys seeded as global rows by drizzle/0026. A guard missing from the
    // catalog cannot be linked, so the policy would come up short.
    const seededCatalogKeys = new Set([
      "pii.detect",
      "jailbreak.detect",
      "profanity.detect",
      "toxicity.detect",
      "harmful_instructions.detect",
    ]);

    for (const policy of DEFAULT_APPLICATION_POLICIES) {
      for (const guard of policy.guards) {
        expect(seededCatalogKeys.has(guard.key)).toBe(true);
      }
    }
  });
});
