export const SEVERITIES = ["Minor", "Moderate", "Major", "Catastrophic"] as const;
export const LIKELIHOODS = ["Rare", "Unlikely", "Possible", "Likely"] as const;
export type Severity = (typeof SEVERITIES)[number];
export type Likelihood = (typeof LIKELIHOODS)[number];
export type RiskLevel = "Low" | "Medium" | "High" | "Critical";

/**
 * Risk level = likelihood score x severity score, each 1-4 (score 1-16):
 * 1-3 Low, 4-6 Medium, 8-9 High, 12-16 Critical.
 */
export function calculateRiskLevel(
  severity: string | null | undefined,
  likelihood: string | null | undefined,
): RiskLevel | undefined {
  const s = SEVERITIES.indexOf(severity as Severity) + 1;
  const l = LIKELIHOODS.indexOf(likelihood as Likelihood) + 1;
  if (!s || !l) return undefined;
  const score = s * l;
  if (score >= 12) return "Critical";
  if (score >= 8) return "High";
  if (score >= 4) return "Medium";
  return "Low";
}
