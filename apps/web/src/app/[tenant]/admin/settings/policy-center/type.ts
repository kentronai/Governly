export interface PolicyPack {
  id: string;
  name: string;
  description: string;
  category: string;
  country: string;
  state?: string; // Optional for future state/province support
  projectsCompliant: number;
  totalProjects: number;
  isActive: boolean;
  tags: string[];
  icon: string;
  color: string;
  type?: "Mandatory" | "Voluntary" | ""; // Added policy type
  fullDescription?: string | null;
  purpose?: string | null;
  scope?: string | null;
  requirements?: string[];
  riskCategories?: string[];
  industriesAffected?: string[];
  governingAuthority?: string | null;
  effectiveDate?: string | null;
  version?: string | null;
  legalStatus?: string | null;
  officialUrl?: string | null;
  references?: { title: string; url: string }[];
  controlMappings?: { key: string; title: string; required?: boolean }[];
  applicabilityRules?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown> | null;
  docsRequired?: boolean;
  disable?: boolean;
}

export interface Connector {
  id: string;
  name: string;
  status: "Add Credentials" | "Revoke Connection";
  icon: string;
}
