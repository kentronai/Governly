/**
 * Compliance policy names that code needs to recognise.
 *
 * Policies are stored in `policy_center` by display name. The EU AI Act policy
 * was renamed in migration 0042; keep the legacy name here so rows that have
 * not been migrated yet (e.g. code deployed ahead of the migration) still match.
 */
export const EU_AI_ACT_POLICY_NAME = "EU AI Act";
export const LEGACY_EU_AI_ACT_POLICY_NAME = "EU AI Act (Regulation 2024/1689)";

export const ISO_42001_POLICY_NAME = "ISO/IEC 42001";

export const isEuAiActPolicyName = (name: string | null | undefined) =>
  name === EU_AI_ACT_POLICY_NAME || name === LEGACY_EU_AI_ACT_POLICY_NAME;
