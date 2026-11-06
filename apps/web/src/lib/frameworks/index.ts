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
import { iso42001 } from "./content/iso-42001";
import { nistAiRmf } from "./content/nist-ai-rmf";
import { iso27001 } from "./content/iso-27001";
import { soc2TypeII } from "./content/soc-2-type-ii";
import { gdpr } from "./content/gdpr";
import { ccpa } from "./content/ccpa";
import { dora } from "./content/dora";

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
  gdpr,
  ccpa,
  dora,
  iso42001,
  nistAiRmf,
  iso27001,
  soc2TypeII,
];

export const FRAMEWORK_SLUGS = FRAMEWORKS.map((f) => f.slug);

export const getFramework = (slug: string) =>
  FRAMEWORKS.find((f) => f.slug === slug);

/**
 * Frameworks the tenant has enabled: a policy from the Regulations library
 * (matched by name) or a framework from the Frameworks library (matched by slug).
 */
export const enabledFrameworks = (
  activePolicyNames: string[],
  enabledFrameworkSlugs: string[] = [],
) =>
  FRAMEWORKS.filter(
    (f) =>
      enabledFrameworkSlugs.includes(f.slug) ||
      f.policyNames.some((name) => activePolicyNames.includes(name)),
  );

export const frameworkPath = (slug: string) =>
  `admin/settings/frameworks/${slug}`;
