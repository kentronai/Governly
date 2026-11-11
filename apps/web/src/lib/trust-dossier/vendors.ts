import dossiers from "./dossiers.json";

export interface TrustDossierVendor {
  number: number;
  name: string;
  slug: string;
  category: string;
  websites: { label: string; url: string }[];
  privacyPolicyUrl?: string;
  subprocessorsUrl?: string;
  logoUrl: string;
}

export interface TrustDossierCategory {
  name: string;
  description: string;
  vendors: TrustDossierVendor[];
}

// ponytail: verified 2026-11-11; null = not publicly published / not confirmed.
const DOCUMENTS: Record<
  string,
  { privacy: string | null; subprocessors: string | null }
> = {
  coreweave: {
    privacy:
      "https://docs.coreweave.com/policies/terms-of-service/privacy-policy",
    subprocessors: null,
  },
  crusoe: {
    privacy: "https://legal.crusoe.ai/#privacy-policy",
    subprocessors: "https://legal.crusoe.ai/#data-processing-subprocessors",
  },
  lambda: {
    privacy: "https://lambda.com/legal/privacy-policy",
    subprocessors: null,
  },
  fluidstack: {
    privacy: "https://fluidstack.io/legal/privacy-policy",
    subprocessors: null,
  },
  "gmi-cloud": {
    privacy: "https://www.gmicloud.ai/en/privacy-policy",
    subprocessors: null,
  },
  tensorwave: {
    privacy: "https://tensorwave.com/privacy",
    subprocessors: null,
  },
  runpod: {
    privacy: "https://www.runpod.io/legal/privacy-policy",
    subprocessors: "https://trust.runpod.io",
  },
  "lightning-ai-voltage-park": {
    privacy: "https://lightning.ai/legal/privacy",
    subprocessors: "https://lightning.ai/legal/subprocessors",
  },
  vultr: { privacy: null, subprocessors: null },
  whitefiber: {
    privacy: "https://www.whitefiber.com/privacy-policy",
    subprocessors: null,
  },
  boostrun: {
    privacy: "https://docs.boostrun.com/policies/privacy",
    subprocessors: null,
  },
  qumulusai: {
    privacy: "https://www.qumulusai.com/privacy-policy",
    subprocessors: null,
  },
  "cirrascale-cloud-services": {
    privacy: "https://www.cirrascale.com/privacy-policy",
    subprocessors: null,
  },
  "massed-compute": {
    privacy: "https://massedcompute.com/legal/privacy-policy/",
    subprocessors: "https://massedcompute.com/legal/subprocessors/",
  },
  "thunder-compute": {
    privacy: "https://www.thundercompute.com/privacy-policy",
    subprocessors: "https://www.thundercompute.com/sub-processors",
  },
  "hot-aisle": {
    privacy: "https://hotaisle.xyz/policies/privacy-policy",
    subprocessors: null,
  },
  "digitalocean-paperspace": {
    privacy: "https://www.digitalocean.com/legal/privacy-policy",
    subprocessors: "https://www.digitalocean.com/trust/subprocessors",
  },
  "liquid-web": {
    privacy: "https://www.liquidweb.com/policies/privacy-policy/",
    subprocessors: null,
  },
  "rackspace-technology": {
    privacy: "https://www.rackspace.com/information/legal/privacystatement",
    subprocessors: null,
  },
  "soluna-computing": {
    privacy: "https://www.solunacomputing.com/privacy-policy/",
    subprocessors: null,
  },
  "vast-ai": { privacy: "https://vast.ai/privacy", subprocessors: null },
  tensordock: { privacy: "https://docs.tensordock.com/legal-information/tensordock-privacy-policy", subprocessors: null },
  shadeform: {
    privacy: "https://shadeform.com/privacy-policy",
    subprocessors: null,
  },
  hyperbolic: {
    privacy: "https://www.hyperbolic.ai/privacy",
    subprocessors: null,
  },
  "prime-intellect": {
    privacy: "https://www.primeintellect.ai/privacy-policy",
    subprocessors: "https://www.primeintellect.ai/dpa",
  },
  saladcloud: {
    privacy: "https://salad.com/privacy/",
    subprocessors: "https://trust.salad.com",
  },
  exabits: { privacy: null, subprocessors: null },
  nodeshift: {
    privacy: "https://www.nodeshift.com/privacy-policy",
    subprocessors: null,
  },
  qubrid: { privacy: "https://www.qubrid.com/privacy", subprocessors: null },
  valdi: {
    privacy: "https://docs.valdi.ai/legal/privacy-policy/",
    subprocessors: null,
  },
  "together-ai": {
    privacy: "https://www.together.ai/privacy",
    subprocessors: null,
  },
  "fireworks-ai": {
    privacy: "https://fireworks.ai/privacy-policy",
    subprocessors: null,
  },
  modal: {
    privacy: "https://modal.com/legal/privacy-policy",
    subprocessors: null,
  },
  baseten: {
    privacy: "https://www.baseten.co/privacy-policy",
    subprocessors: null,
  },
  deepinfra: { privacy: "https://deepinfra.com/privacy", subprocessors: null },
  fal: { privacy: "https://fal.ai/legal/privacy-policy", subprocessors: null },
  beam: {
    privacy: "https://docs.beam.cloud/v2/security/privacy-policy",
    subprocessors: "https://docs.beam.cloud/v2/security/subprocessor-list",
  },
  anyscale: {
    privacy: "https://www.anyscale.com/privacy-policy",
    subprocessors: "https://trust.anyscale.com",
  },
  "cloudflare-workers-ai": {
    privacy: "https://www.cloudflare.com/privacypolicy/",
    subprocessors:
      "https://www.cloudflare.com/gdpr/subprocessors/cloudflare-services/",
  },
  groq: { privacy: "https://groq.com/privacy-policy", subprocessors: null },
  cerebras: {
    privacy: "https://www.cerebras.ai/privacy-policy",
    subprocessors: null,
  },
  sambanova: {
    privacy: "https://sambanova.ai/privacy-policy",
    subprocessors: null,
  },
  nebius: {
    privacy: "https://docs.nebius.com/legal/privacy",
    subprocessors: "https://docs.nebius.com/legal/sub-processors",
  },
  nscale: {
    privacy: "https://www.nscale.com/policies/privacy-policy",
    subprocessors: "https://www.nscale.com/policies/sub-processors",
  },
  iren: {
    privacy: "https://iren.com/legal/privacy-policy",
    subprocessors: null,
  },
  bitdeer: {
    privacy: "https://www.bitdeer.com/privacy-policy",
    subprocessors: null,
  },
};

const vendor = (
  number: number,
  name: string,
  slug: string,
  category: string,
  websites: [string, string][],
): TrustDossierVendor => ({
  number,
  name,
  slug,
  category,
  websites: websites.map(([label, url]) => ({ label, url: `https://${url}` })),
  logoUrl: `https://www.google.com/s2/favicons?sz=128&domain=${websites[0][1].split("/")[0]}`,
  privacyPolicyUrl: DOCUMENTS[slug]?.privacy ?? undefined,
  subprocessorsUrl: DOCUMENTS[slug]?.subprocessors ?? undefined,
});

export const TRUST_DOSSIER_CATEGORIES: TrustDossierCategory[] = [
  {
    name: "Neoclouds and GPU-cloud providers",
    description:
      "Dedicated AI-cloud providers and broader cloud and hosting companies with GPU offerings.",
    vendors: [
      vendor(1, "CoreWeave", "coreweave", "Neocloud and GPU cloud", [
        ["coreweave.com", "coreweave.com"],
      ]),
      vendor(2, "Crusoe / Crusoe Cloud", "crusoe", "Neocloud and GPU cloud", [
        ["crusoe.ai", "crusoe.ai"],
      ]),
      vendor(3, "Lambda", "lambda", "Neocloud and GPU cloud", [
        ["lambda.ai", "lambda.ai"],
      ]),
      vendor(4, "Fluidstack", "fluidstack", "Neocloud and GPU cloud", [
        ["fluidstack.io", "fluidstack.io"],
      ]),
      vendor(5, "GMI Cloud", "gmi-cloud", "Neocloud and GPU cloud", [
        ["gmicloud.ai", "gmicloud.ai"],
      ]),
      vendor(6, "TensorWave", "tensorwave", "Neocloud and GPU cloud", [
        ["tensorwave.com", "tensorwave.com"],
      ]),
      vendor(7, "RunPod", "runpod", "Neocloud and GPU cloud", [
        ["runpod.io", "runpod.io"],
      ]),
      vendor(
        8,
        "Lightning AI / Voltage Park",
        "lightning-ai-voltage-park",
        "Neocloud and GPU cloud",
        [
          ["lightning.ai", "lightning.ai"],
          ["voltagepark.com", "voltagepark.com"],
        ],
      ),
      vendor(9, "Vultr", "vultr", "Neocloud and GPU cloud", [
        ["vultr.com", "vultr.com"],
      ]),
      vendor(10, "WhiteFiber", "whitefiber", "Neocloud and GPU cloud", [
        ["whitefiber.com", "whitefiber.com"],
      ]),
      vendor(11, "Boostrun", "boostrun", "Neocloud and GPU cloud", [
        ["boostrun.com", "boostrun.com"],
      ]),
      vendor(12, "QumulusAI", "qumulusai", "Neocloud and GPU cloud", [
        ["qumulusai.com", "qumulusai.com"],
      ]),
      vendor(
        13,
        "Cirrascale Cloud Services",
        "cirrascale-cloud-services",
        "Neocloud and GPU cloud",
        [["cirrascale.com", "cirrascale.com"]],
      ),
      vendor(14, "Massed Compute", "massed-compute", "Neocloud and GPU cloud", [
        ["massedcompute.com", "massedcompute.com"],
      ]),
      vendor(
        15,
        "Thunder Compute",
        "thunder-compute",
        "Neocloud and GPU cloud",
        [["thundercompute.com", "thundercompute.com"]],
      ),
      vendor(16, "Hot Aisle", "hot-aisle", "Neocloud and GPU cloud", [
        ["hotaisle.xyz", "hotaisle.xyz"],
      ]),
      vendor(
        17,
        "DigitalOcean / Paperspace",
        "digitalocean-paperspace",
        "Neocloud and GPU cloud",
        [
          ["digitalocean.com", "digitalocean.com"],
          ["paperspace.com", "paperspace.com"],
        ],
      ),
      vendor(18, "Liquid Web", "liquid-web", "Neocloud and GPU cloud", [
        ["liquidweb.com", "liquidweb.com"],
      ]),
      vendor(
        19,
        "Rackspace Technology",
        "rackspace-technology",
        "Neocloud and GPU cloud",
        [["rackspace.com", "rackspace.com"]],
      ),
      vendor(
        20,
        "Soluna Computing",
        "soluna-computing",
        "Neocloud and GPU cloud",
        [["solunacomputing.com", "solunacomputing.com"]],
      ),
    ],
  },
  {
    name: "GPU marketplaces, aggregators, and distributed platforms",
    description:
      "Platforms that provide or aggregate GPU capacity through marketplace or distributed infrastructure models.",
    vendors: [
      vendor(21, "Vast.ai", "vast-ai", "GPU marketplace", [
        ["vast.ai", "vast.ai"],
      ]),
      vendor(22, "TensorDock", "tensordock", "GPU marketplace", [
        ["tensordock.com", "tensordock.com"],
      ]),
      vendor(23, "Shadeform", "shadeform", "GPU marketplace", [
        ["shadeform.ai", "shadeform.ai"],
      ]),
      vendor(24, "Hyperbolic", "hyperbolic", "GPU marketplace", [
        ["hyperbolic.xyz", "hyperbolic.xyz"],
      ]),
      vendor(25, "Prime Intellect", "prime-intellect", "GPU marketplace", [
        ["primeintellect.ai", "primeintellect.ai"],
      ]),
      vendor(26, "SaladCloud", "saladcloud", "Distributed compute platform", [
        ["salad.com", "salad.com"],
      ]),
      vendor(27, "Exabits", "exabits", "GPU marketplace", [
        ["exabits.ai", "exabits.ai"],
      ]),
      vendor(28, "NodeShift", "nodeshift", "GPU marketplace", [
        ["nodeshift.com", "nodeshift.com"],
      ]),
      vendor(29, "Qubrid", "qubrid", "GPU marketplace", [
        ["qubrid.com", "qubrid.com"],
      ]),
      vendor(30, "VALDI", "valdi", "Distributed compute platform", [
        ["valdi.ai", "valdi.ai"],
      ]),
    ],
  },
  {
    name: "AI inference and serverless-compute platforms",
    description:
      "Companies focused on managed AI execution, inference, or specialized AI computing rather than exclusively renting conventional GPU clusters.",
    vendors: [
      vendor(31, "Together AI", "together-ai", "AI inference", [
        ["together.ai", "together.ai"],
      ]),
      vendor(32, "Fireworks AI", "fireworks-ai", "AI inference", [
        ["fireworks.ai", "fireworks.ai"],
      ]),
      vendor(33, "Modal", "modal", "Serverless compute", [
        ["modal.com", "modal.com"],
      ]),
      vendor(34, "Baseten", "baseten", "AI inference", [
        ["baseten.co", "baseten.co"],
      ]),
      vendor(35, "DeepInfra", "deepinfra", "AI inference", [
        ["deepinfra.com", "deepinfra.com"],
      ]),
      vendor(36, "fal", "fal", "AI inference", [["fal.ai", "fal.ai"]]),
      vendor(37, "Beam", "beam", "Serverless compute", [
        ["beam.cloud", "beam.cloud"],
      ]),
      vendor(38, "Anyscale", "anyscale", "AI inference", [
        ["anyscale.com", "anyscale.com"],
      ]),
      vendor(
        39,
        "Cloudflare Workers AI",
        "cloudflare-workers-ai",
        "AI inference",
        [
          [
            "cloudflare.com/developer-platform/workers-ai",
            "cloudflare.com/developer-platform/workers-ai",
          ],
        ],
      ),
      vendor(40, "Groq", "groq", "AI inference", [["groq.com", "groq.com"]]),
      vendor(41, "Cerebras", "cerebras", "AI inference", [
        ["cerebras.ai", "cerebras.ai"],
      ]),
      vendor(42, "SambaNova", "sambanova", "AI inference", [
        ["sambanova.ai", "sambanova.ai"],
      ]),
    ],
  },
  {
    name: "Foreign-headquartered providers relevant to the U.S. market",
    description:
      "Providers included separately because U.S. infrastructure activity is not the same as U.S. headquarters.",
    vendors: [
      vendor(43, "Nebius", "nebius", "International cloud provider", [
        ["nebius.com", "nebius.com"],
      ]),
      vendor(44, "Nscale", "nscale", "International cloud provider", [
        ["nscale.com", "nscale.com"],
      ]),
      vendor(45, "IREN", "iren", "International cloud provider", [
        ["iren.com", "iren.com"],
      ]),
      vendor(46, "Bitdeer", "bitdeer", "International cloud provider", [
        ["bitdeer.com", "bitdeer.com"],
      ]),
    ],
  },
];

export const TRUST_DOSSIER_VENDORS = TRUST_DOSSIER_CATEGORIES.flatMap(
  ({ vendors }) => vendors,
);

export const getTrustDossierVendor = (slug: string) =>
  TRUST_DOSSIER_VENDORS.find((item) => item.slug === slug);

export interface TrustDossierDetails {
  summary: string;
  policyLastUpdated: string;
  privacy: {
    dataCollected: string[];
    howUsed: string[];
    trainsOnCustomerData: string;
    dataSharing: string[];
    retention: string;
    dataLocations: string;
    userRights: string[];
    certifications: string[];
    contact: string;
  };
  subprocessors: { name: string; purpose: string; location: string }[];
  subprocessorsNote: string;
  sourcesChecked: string[];
  company?: string;
  checks?: Record<string, CheckStatus>;
  highlights?: { title: string; text: string }[];
}

// ponytail: static JSON extracted from each vendor's published policies (2026-11-11);
// move to a DB table if admins need to edit it.
export const getTrustDossierDetails = (slug: string) =>
  (dossiers as Record<string, TrustDossierDetails>)[slug];

export type CheckStatus = "Disclosed" | "Partial" | "Silent" | "Not applicable";

export const TRUST_DOSSIER_RUBRIC = [
  {
    id: "collection",
    name: "Data collection",
    items: [
      {
        id: "enumerates_data",
        label: "Enumerates the categories of data it collects",
      },
      {
        id: "minimisation",
        label: "Commits to collecting only the data it needs",
      },
      {
        id: "cookies_tracking",
        label: "Explains cookies and tracking technologies",
      },
    ],
  },
  {
    id: "ai_training",
    name: "AI and model training",
    items: [
      {
        id: "training_stance",
        label: "States whether customer data is used to train models",
      },
      {
        id: "no_training_or_optout",
        label: "Commits not to train on customer content, or offers opt-out",
      },
      {
        id: "workload_isolation",
        label: "States it does not access customer workloads or content",
      },
    ],
  },
  {
    id: "rights",
    name: "User rights",
    items: [
      {
        id: "right_access",
        label: "Grants a right to access your data",
      },
      {
        id: "right_delete",
        label: "Grants a right to delete your data",
      },
      {
        id: "right_correct",
        label: "Grants a right to correct your data",
      },
      {
        id: "right_object",
        label: "Grants a way to object to or opt out of processing",
      },
    ],
  },
  {
    id: "retention",
    name: "Retention and deletion",
    items: [
      {
        id: "retention_period",
        label: "States a retention period for your data",
      },
      {
        id: "deletion_timeline",
        label: "States a deletion timeline after closure or request",
      },
    ],
  },
  {
    id: "sharing",
    name: "Third-party sharing",
    items: [
      {
        id: "third_party_categories",
        label: "Lists the categories of third parties it shares with",
      },
      {
        id: "subprocessor_reference",
        label: "References a sub-processor list or data processing agreement",
      },
      {
        id: "no_sale",
        label: "Does not sell or share data for advertising, or offers opt-out",
      },
      {
        id: "intl_transfers",
        label: "Names a safeguard for international data transfers",
      },
      {
        id: "gov_access",
        label: "States a standard for government and law-enforcement access",
      },
    ],
  },
  {
    id: "security",
    name: "Security",
    items: [
      {
        id: "security_measures",
        label: "Describes security measures protecting your data",
      },
      {
        id: "certifications",
        label: "States independent certifications (SOC 2, ISO 27001, etc.)",
      },
      {
        id: "breach_notice",
        label: "Commits to notifying users of a security breach",
      },
    ],
  },
  {
    id: "transparency",
    name: "Transparency",
    items: [
      {
        id: "legal_bases",
        label: "Maps processing purposes to legal bases",
      },
      {
        id: "versioned",
        label: "Is versioned and dated, with change notice",
      },
      {
        id: "contact",
        label: "Provides a privacy contact or DPO",
      },
    ],
  },
  {
    id: "sensitive",
    name: "Sensitive data and children",
    items: [
      {
        id: "special_category",
        label: "Limits the use of special-category data",
      },
      {
        id: "children",
        label: "Addresses children's data",
      },
    ],
  },
];

export const GRADE_SCALE = [
  { grade: "A", min: 70, max: 100 },
  { grade: "B", min: 60, max: 69 },
  { grade: "C", min: 48, max: 59 },
  { grade: "D", min: 35, max: 47 },
  { grade: "F", min: 0, max: 34 },
] as const;

const POINTS: Record<CheckStatus, number | null> = {
  Disclosed: 1,
  Partial: 0.5,
  Silent: 0,
  "Not applicable": null,
};

/** Score 0-100: Disclosed = 1, Partial = 0.5, Silent = 0; "Not applicable" excluded. */
export function scoreChecks(checks: Record<string, CheckStatus> = {}) {
  const points = TRUST_DOSSIER_RUBRIC.flatMap((section) =>
    section.items.map((item) => POINTS[checks[item.id] ?? "Silent"]),
  ).filter((value): value is number => value !== null);
  if (!points.length) return 0;
  return Math.round((points.reduce((a, b) => a + b, 0) / points.length) * 100);
}

export const gradeFor = (score: number) =>
  GRADE_SCALE.find((band) => score >= band.min)!.grade;

export function getTrustDossierScorecard(slug: string) {
  const ranked = TRUST_DOSSIER_VENDORS.map((v) => ({
    slug: v.slug,
    category: v.category,
    score: scoreChecks(getTrustDossierDetails(v.slug)?.checks),
  })).sort((a, b) => b.score - a.score);
  const me = ranked.find((r) => r.slug === slug);
  if (!me) return undefined;
  const peers = ranked.filter((r) => r.category === me.category);
  const categoryAverage = Math.round(
    peers.reduce((sum, r) => sum + r.score, 0) / peers.length,
  );
  return {
    score: me.score,
    grade: gradeFor(me.score),
    rank: ranked.findIndex((r) => r.slug === slug) + 1,
    total: ranked.length,
    categoryAverage,
    vsCategory: me.score - categoryAverage,
  };
}

export const GRADE_CLASSES: Record<string, string> = {
  A: "border-emerald-300 bg-emerald-50 text-emerald-700",
  B: "border-sky-300 bg-sky-50 text-sky-700",
  C: "border-amber-300 bg-amber-50 text-amber-700",
  D: "border-orange-300 bg-orange-50 text-orange-700",
  F: "border-red-300 bg-red-50 text-red-700",
};
