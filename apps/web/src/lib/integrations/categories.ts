// Nango category -> NORIX tab, so every provider in the catalogue lives in a tab.
export const NANGO_TO_TAB: Record<string, string> = {
  ai: "llm_providers",
  mcp: "llm_providers",
  "dev-tools": "developer_tools",
  ticketing: "developer_tools",
  iam: "identity_security",
  communication: "communication",
  video: "communication",
  social: "communication",
  productivity: "productivity",
  "knowledge-base": "productivity",
  storage: "productivity",
  design: "productivity",
  cms: "productivity",
  crm: "crm_sales",
  marketing: "marketing_analytics",
  analytics: "marketing_analytics",
  surveys: "marketing_analytics",
  search: "marketing_analytics",
  support: "customer_support",
  accounting: "finance",
  payment: "finance",
  banking: "finance",
  invoicing: "finance",
  erp: "finance",
  hr: "hr_recruiting",
  ats: "hr_recruiting",
  "e-commerce": "ecommerce",
  legal: "legal",
};
// Nango files warehouses under dev-tools/productivity/analytics, which left the
// Data Platforms tab holding only Databricks Unity Catalog. Override by key.
const DATA_PLATFORM_KEYS = new Set([
  "snowflake",
  "snowflake-jwt",
  "google-bigquery",
  "clickhouse",
  "supabase",
]);
export const tabOf = (nangoCategory: string, key?: string) =>
  key && DATA_PLATFORM_KEYS.has(key)
    ? "data_platforms"
    : (NANGO_TO_TAB[nangoCategory] ?? "other");

/** GitHub providers in Nango (PAT, user OAuth, App, App OAuth) all feed GitHub agent discovery. */
export const isGithubProviderKey = (key?: string | null): boolean =>
  /^github(-pat|-app|-app-oauth)?$/.test(key ?? "");
