import catalog from "./catalog.json";
import type { CollectionId } from "./grades";

export type CheckStatus = "Disclosed" | "Partial" | "Silent" | "Not applicable";

export interface TrustDossierVendor {
  collection: CollectionId;
  number: number;
  slug: string;
  name: string;
  company?: string;
  group: string;
  category: string;
  websites: { label: string; url: string }[];
  logoUrl: string;
  privacyPolicyUrl?: string;
  subprocessorsUrl?: string;
  score: number;
  grade: string;
  summary: string;
  highlights: { title: string; text: string }[];
  sections: { name: string; items: { label: string; status: CheckStatus }[] }[];
  subprocessors: { name: string; purpose: string; location: string }[];
  subprocessorsNote?: string;
  policyLastUpdated?: string;
  trainsOnCustomerData?: string;
  certifications?: string[];
  audience?: string;
  confidence?: string;
  modalities?: string[];
  redFlags: string[];
  scoreHistory: { date: string; grade: string; score: number }[];
  lastChecked?: string;
  sourcesChecked: string[];
}

// ponytail: static catalog (46 researched providers + VerifyWise AI Trust Index export,
// 2026-11-11). Server-only: ~1.5 MB, never import from a client component.
export const TRUST_DOSSIER_VENDORS = catalog as TrustDossierVendor[];

export const getTrustDossierVendor = (slug: string) =>
  TRUST_DOSSIER_VENDORS.find((v) => v.slug === slug);

const ranked = [...TRUST_DOSSIER_VENDORS].sort((a, b) => b.score - a.score);

/** Rank is within the vendor's collection; average is within its category. */
export function getTrustDossierScorecard(slug: string) {
  const me = getTrustDossierVendor(slug);
  if (!me) return undefined;
  const pool = ranked.filter((v) => v.collection === me.collection);
  const peers = pool.filter((v) => v.category === me.category);
  const categoryAverage = Math.round(
    peers.reduce((sum, v) => sum + v.score, 0) / peers.length,
  );
  return {
    rank: pool.findIndex((v) => v.score === me.score) + 1,
    total: pool.length,
    categoryAverage,
    vsCategory: me.score - categoryAverage,
  };
}
