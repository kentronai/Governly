/**
 * Frameworks a tenant can enable from Admin Center → Frameworks. Enabled
 * entries get a sidebar tab; requirement tracking is added per framework later.
 */
export interface CatalogFramework {
  slug: string;
  name: string;
  description: string;
  /** Short plain-language summary shown in the framework info dialog. */
  about: string;
  /** Short badge text and colour, same style as the Regulations library. */
  icon: string;
  color: string;
  region: string;
}

export const FRAMEWORK_CATALOG: CatalogFramework[] = [
  {
    slug: "iso-42001",
    name: "ISO/IEC 42001",
    description: "AI management system standard",
    about:
      "ISO/IEC 42001 is the first international standard for an AI management system (AIMS). It sets requirements for governing AI responsibly across its lifecycle: policy, risk and impact assessment, controls, monitoring and continual improvement. Organizations can be certified against it, making it a common way to prove AI governance to customers and regulators.",
    icon: "ISO",
    color: "bg-blue-700",
    region: "International",
  },
  {
    slug: "nist-ai-rmf",
    name: "NIST AI RMF",
    description: "NIST framework for managing AI risks",
    about:
      "The NIST AI Risk Management Framework is a voluntary framework from the National Institute of Standards and Technology to help organizations identify, assess, and manage AI-related risk. It is the primary reference point for AI governance in the US. While not a legal requirement for most organizations, boards, enterprise customers, and regulators increasingly use it to benchmark AI governance maturity.",
    icon: "NIST",
    color: "bg-slate-700",
    region: "United States",
  },
  {
    slug: "soc-2-type-ii",
    name: "SOC 2 Type II",
    description: "AICPA Trust Services Criteria for service organizations",
    about:
      "SOC 2 Type II is an AICPA attestation report on how a service organization's controls for security, availability, processing integrity, confidentiality and privacy operate over a period of time (typically 6-12 months). It is voluntary, but widely requested by enterprise customers as proof of trustworthy operations.",
    icon: "SOC2",
    color: "bg-indigo-700",
    region: "United States",
  },
  {
    slug: "gdpr",
    name: "GDPR",
    description: "EU General Data Protection Regulation",
    about:
      "The General Data Protection Regulation is the EU law governing how personal data of people in the EU is collected, used and protected. It requires a lawful basis, data-subject rights, security, breach notification and accountability, and applies to AI systems that process personal data. Fines reach up to 4% of global annual turnover.",
    icon: "GDPR",
    color: "bg-blue-800",
    region: "European Union",
  },
  {
    slug: "ccpa",
    name: "CCPA",
    description: "California Consumer Privacy Act",
    about:
      "The California Consumer Privacy Act (as amended by CPRA) gives California residents rights to know, delete, correct and opt out of the sale or sharing of their personal data. It applies to qualifying businesses and includes rules on automated decision-making and risk assessments that affect AI use.",
    icon: "CCPA",
    color: "bg-amber-700",
    region: "United States · California",
  },
  {
    slug: "dora",
    name: "DORA",
    description: "EU Digital Operational Resilience Act",
    about:
      "The Digital Operational Resilience Act is an EU regulation that requires financial entities and their critical ICT providers to manage ICT risk, report incidents, test resilience and oversee third-party providers. It applies to AI systems that are part of financial services' ICT estate.",
    icon: "DORA",
    color: "bg-sky-700",
    region: "European Union",
  },
  {
    slug: "cis-controls-v8",
    name: "CIS Controls v8",
    description: "CIS Critical Security Controls, version 8",
    about:
      "The CIS Critical Security Controls v8 are a prioritized set of 18 practical safeguards from the Center for Internet Security to defend against common cyber attacks. They are voluntary, grouped into implementation tiers, and widely used as a baseline for security programs.",
    icon: "CIS",
    color: "bg-cyan-800",
    region: "International",
  },
  {
    slug: "data-governance",
    name: "Data Governance Framework",
    description: "Enterprise data governance practices",
    about:
      "A data governance framework defines how an organization manages data ownership, quality, classification, access, retention and lifecycle. Strong data governance is a prerequisite for trustworthy AI, since model quality and compliance depend on the data behind it.",
    icon: "DG",
    color: "bg-emerald-700",
    region: "International",
  },
  {
    slug: "uae-pdpl",
    name: "UAE Personal Data Protection Law",
    description: "UAE PDPL and related AI guidance",
    about:
      "The UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021) regulates processing of personal data in the UAE. It sets consent, transparency, data-subject rights, security and cross-border transfer rules, and is complemented by national AI guidance.",
    icon: "UAE",
    color: "bg-red-700",
    region: "United Arab Emirates",
  },
  {
    slug: "saudi-pdpl",
    name: "Saudi Arabia Personal Data Protection Law",
    description: "Saudi PDPL and SDAIA AI principles",
    about:
      "Saudi Arabia's Personal Data Protection Law, enforced by SDAIA, governs the collection and processing of personal data, including consent, individual rights and cross-border transfers. SDAIA also publishes AI ethics principles that apply to AI systems.",
    icon: "KSA",
    color: "bg-green-700",
    region: "Saudi Arabia",
  },
  {
    slug: "qatar-pdpl",
    name: "Qatar Personal Data Privacy Law",
    description: "Qatar Law No. 13 of 2016 and national AI policy",
    about:
      "Qatar Law No. 13 of 2016 regulates personal data privacy, setting rules for consent, purpose limitation, security and breach notification. It operates alongside Qatar's national AI policy for responsible AI use.",
    icon: "QA",
    color: "bg-rose-800",
    region: "Qatar",
  },
  {
    slug: "bahrain-pdpl",
    name: "Bahrain Personal Data Protection Law",
    description: "Bahrain PDPL and AI guidance",
    about:
      "Bahrain's Personal Data Protection Law (Law No. 30 of 2018) sets rules for lawful processing, data-subject rights, security and international transfers of personal data, and is supported by regulator guidance relevant to AI.",
    icon: "BH",
    color: "bg-red-800",
    region: "Bahrain",
  },
  {
    slug: "quebec-law-25",
    name: "Quebec Law 25",
    description: "Quebec's modernized private-sector privacy law",
    about:
      "Quebec's Law 25 modernizes its private-sector privacy law. It requires privacy impact assessments, consent, breach reporting, and transparency when decisions are made solely by automated processing, which directly affects AI systems using personal information.",
    icon: "QC",
    color: "bg-blue-600",
    region: "Canada · Quebec",
  },
  {
    slug: "nist-csf",
    name: "NIST Cybersecurity Framework",
    description: "NIST framework for managing cybersecurity risk",
    about:
      "The NIST Cybersecurity Framework is a voluntary framework for managing cybersecurity risk, organized around the functions Govern, Identify, Protect, Detect, Respond and Recover. It is widely used by organizations of all sizes to assess and communicate their security posture.",
    icon: "CSF",
    color: "bg-violet-700",
    region: "United States",
  },
  {
    slug: "iso-27001",
    name: "ISO/IEC 27001",
    description: "Information security management system standard",
    about:
      "ISO/IEC 27001 is the international standard for an information security management system (ISMS). It requires a risk-based set of security controls, ongoing monitoring and continual improvement, and organizations can be independently certified against it.",
    icon: "ISO",
    color: "bg-teal-700",
    region: "International",
  },
];

export const getCatalogFramework = (slug: string) =>
  FRAMEWORK_CATALOG.find((f) => f.slug === slug);

export const catalogFrameworkPath = (slug: string) =>
  `admin/settings/frameworks/catalog/${slug}`;
