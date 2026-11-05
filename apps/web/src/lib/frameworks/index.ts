import type { FrameworkDefinition } from "./types";
import { euAiAct } from "./content/eu-ai-act";
import { coloradoAiAct } from "./content/colorado-ai-act";
import { texasTraiga } from "./content/texas-traiga";
import { nycLl144 } from "./content/nyc-ll-144";
import { ftcAi } from "./content/ftc-ai";
import { hipaaSecurity } from "./content/hipaa-security";
import { oecdAiPrinciples } from "./content/oecd-ai-principles";
import { altai } from "./content/altai";
import { pciDssLite } from "./content/pci-dss-lite";
import { aiEthicsGovernance } from "./content/ai-ethics-governance";

export type * from "./types";

/** Every framework with a requirements tracker, in sidebar order. */
export const FRAMEWORKS: FrameworkDefinition[] = [
  euAiAct,
  coloradoAiAct,
  texasTraiga,
  nycLl144,
  ftcAi,
  hipaaSecurity,
  oecdAiPrinciples,
  altai,
  pciDssLite,
  aiEthicsGovernance,
];

export const FRAMEWORK_SLUGS = FRAMEWORKS.map((f) => f.slug);

export const getFramework = (slug: string) =>
  FRAMEWORKS.find((f) => f.slug === slug);

/** Frameworks whose policy is enabled, given the tenant's active policy names. */
export const enabledFrameworks = (activePolicyNames: string[]) =>
  FRAMEWORKS.filter((f) =>
    f.policyNames.some((name) => activePolicyNames.includes(name)),
  );

export const frameworkPath = (slug: string) =>
  `admin/settings/frameworks/${slug}`;
