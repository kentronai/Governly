/**
 * Canonical policy profiles attached to every newly-created AI application.
 *
 * Keep these definitions independent of the UI so application creation can
 * persist them atomically with the application itself.
 */

export const DEFAULT_APPLICATION_POLICY_VERSION = "v1";

export type DefaultApplicationPolicyProfile =
  "standard" | "strict" | "development";

export interface DefaultPolicyGuard {
  key: string;
  params?: Record<string, unknown>;
}

export interface DefaultApplicationPolicyDefinition {
  profile: DefaultApplicationPolicyProfile;
  name: string;
  description: string;
  guards: DefaultPolicyGuard[];
  isDefault: boolean;
  priority: number;
}

export const DEFAULT_APPLICATION_POLICIES: readonly DefaultApplicationPolicyDefinition[] =
  [
    {
      profile: "standard",
      name: "Launch",
      description:
        "Kickstart your AI security with the Launch — a ready-to-deploy " +
        "protection layer that automatically blocks Jailbreak attempts, PII " +
        "exposure, Profanity, and Toxic content. Designed for instant " +
        "activation, it ensures your AI applications stay compliant, safe, and " +
        "user-friendly from day one.",
      guards: [
        { key: "pii.detect" },
        { key: "jailbreak.detect" },
        { key: "profanity.detect" },
        { key: "toxicity.detect" },
        {
          key: "harmful_instructions.detect",
          params: { threshold: 0.75, severity: "high" },
        },
      ],
      isDefault: true,
      priority: 100,
    },
  ];

/**
 * Generate the same YAML shape consumed by ControlNet's CGA policy compiler.
 * JSON values are valid YAML and safely preserve strings, arrays, and numbers.
 */
export function buildDefaultPolicyYaml(
  definition: DefaultApplicationPolicyDefinition,
): string {
  const lines = [
    `policy: ${definition.profile}_policy`,
    `description: ${JSON.stringify(definition.description)}`,
    "",
    "guards:",
  ];

  for (const guard of definition.guards) {
    lines.push(`  - id: ${guard.key}`);
    lines.push("    target: messages[*].content");

    if (guard.params && Object.keys(guard.params).length > 0) {
      lines.push("    with:");
      for (const [key, value] of Object.entries(guard.params)) {
        lines.push(`      ${key}: ${JSON.stringify(value)}`);
      }
    }

    lines.push("");
  }

  const guardNames = definition.guards
    .map((guard) => guard.key.replaceAll(".", "_"))
    .join(", ");

  lines.push("compose:");
  lines.push(`  input: allOf(${guardNames})`);
  lines.push("  root: input");

  return lines.join("\n");
}
