import {
  DEFAULT_APPLICATION_POLICIES,
  buildDefaultPolicyYaml,
} from "@/lib/default-application-policies";

describe("default application policies", () => {
  it("defines exactly one copy of the three required policies", () => {
    const names = DEFAULT_APPLICATION_POLICIES.map((policy) => policy.name);

    expect(names).toEqual([
      "Standard Policy",
      "Strict Policy",
      "Development Policy",
    ]);
    expect(new Set(names).size).toBe(3);
  });

  it("marks only Standard Policy as the application default", () => {
    const defaults = DEFAULT_APPLICATION_POLICIES.filter(
      (policy) => policy.isDefault,
    );

    expect(defaults).toHaveLength(1);
    expect(defaults[0].name).toBe("Standard Policy");
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
});
