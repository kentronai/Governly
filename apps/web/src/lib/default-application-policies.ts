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
      name: "Standard Policy",
      description: "Default production policy for general AI applications.",
      guards: [
        { key: "pii.detect" },
        { key: "jailbreak.detect" },
        { key: "profanity.detect" },
        { key: "toxicity.detect" },
      ],
      isDefault: true,
      priority: 100,
    },
    {
      profile: "strict",
      name: "Strict Policy",
      description:
        "Enhanced security policy for sensitive or regulated AI applications.",
      guards: [
        {
          key: "pii.detect",
          params: {
            threshold: 1,
            anonymize_mode: "mask",
            severity: "critical",
          },
        },
        {
          key: "jailbreak.detect",
          params: { threshold: 0.25, severity: "critical" },
        },
        {
          key: "profanity.detect",
          params: {
            threshold: 1,
            severity: "high",
            categories: ["moderate", "severe"],
          },
        },
        {
          key: "toxicity.detect",
          params: { threshold: 0.3, severity: "critical" },
        },
      ],
      isDefault: false,
      priority: 50,
    },
    {
      profile: "development",
      name: "Development Policy",
      description:
        "Relaxed policy intended for development, testing, and prompt experimentation.",
      guards: [
        {
          key: "jailbreak.detect",
          params: { threshold: 0.75, severity: "high" },
        },
      ],
      isDefault: false,
      priority: 10,
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
