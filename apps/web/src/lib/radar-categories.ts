/**
 * Topic taxonomy for global AI policies (the "category" filter on AI Radar).
 * Client-safe. The agent assigns one of these to every policy it creates or
 * backfills; filter options shown to users come from what's actually in the DB.
 */
export const POLICY_CATEGORIES = [
  "AI ethics & principles",
  "Risk-based AI regulation",
  "Data protection & privacy",
  "Employment & hiring",
  "Generative AI & foundation models",
  "Healthcare & life sciences",
  "Financial services",
  "Public sector & government use",
  "Biometrics & surveillance",
  "Standards & frameworks",
  "Other",
] as const;

export type PolicyCategory = (typeof POLICY_CATEGORIES)[number];

/** Status vocabulary the agent uses (matches the colours on the Radar table). */
export const POLICY_STATUSES = [
  "proposed",
  "draft",
  "enacted",
  "active",
  "repealed",
  "expired",
] as const;

// Keyword fallback used when no model is available. First match wins; order matters.
const CATEGORY_RULES: [RegExp, PolicyCategory][] = [
  [/health|medical|clinical|pharma/i, "Healthcare & life sciences"],
  [/financ|bank|credit|insur|securities/i, "Financial services"],
  [/employ|hiring|recruit|worker|labou?r/i, "Employment & hiring"],
  [/biometric|facial|surveillance/i, "Biometrics & surveillance"],
  [/generative|foundation model|general[- ]purpose|chatbot|deepfake/i, "Generative AI & foundation models"],
  [/privacy|data protection|personal (data|information)|gdpr/i, "Data protection & privacy"],
  [/public sector|government use|procurement|public administration/i, "Public sector & government use"],
  [/ethic|principle|trustworth|responsible/i, "AI ethics & principles"],
  [/\b(act|regulat\w*|law|bill|directive|decree|ordinance)\b/i, "Risk-based AI regulation"],
  [/standard|framework|risk management|iso\b|guideline|code of practice/i, "Standards & frameworks"],
];

export const guessCategory = (text: string): PolicyCategory =>
  CATEGORY_RULES.find(([re]) => re.test(text))?.[1] ?? "Other";

/** What kind of instrument an AI Radar update is about (the "Type" column). */
export const INSTRUMENT_TYPES = [
  "Law",
  "Bill",
  "Regulation",
  "Executive order",
  "Guidance",
  "Standard",
  "Strategy / policy",
  "Consultation",
  "Enforcement action",
] as const;

/** Regulation = mandatory (law, bill, order, enforcement); Framework = voluntary (standard, guidance, strategy). */
export const instrumentKind = (u: {
  instrumentType?: string | null;
  category?: string | null;
  title: string;
}): "Regulation" | "Framework" => {
  if (u.instrumentType) return ["Standard", "Guidance", "Strategy / policy", "Consultation"].includes(u.instrumentType) ? "Framework" : "Regulation";
  if (u.category === "Standards & frameworks" || u.category === "AI ethics & principles") return "Framework";
  return /standard|framework|guidance|guideline|code of practice|principles|strategy/i.test(u.title) ? "Framework" : "Regulation";
};

/** Whole sentences up to ~max chars, so table rows stay short but never end mid-thought. */
/** Feeds sometimes leak a CMS byline ("Anonymous (not verified) Mon, 10/19/2026 - 09:37"); drop it. */
export const cleanSummary = (text: string): string =>
  text.replace(/Anonymous \(not verified\)\s*(\w{3},\s*)?\d{1,2}\/\d{1,2}\/\d{4}\s*-\s*\d{1,2}:\d{2}/gi, "").replace(/\s+/g, " ").trim();

export const shortSummary = (text: string, max = 220): string => {
  const t = cleanSummary(text);
  if (t.length <= max) return t;
  let out = "";
  for (const s of t.match(/[^.!?]+[.!?]+(\s|$)/g) ?? []) {
    if ((out + s).length > max) break;
    out += s;
  }
  // ponytail: a single sentence longer than max is cut at a word boundary.
  return out.trim() || t.slice(0, max).replace(/\s+\S*$/, "") + "…";
};
