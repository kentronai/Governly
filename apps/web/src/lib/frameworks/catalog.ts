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
    slug: "ai-ethics-governance",
    name: "AI Ethics & Governance Framework",
    description: "NORIX baseline for ethical, accountable AI",
    about:
      "NORIX's general-purpose baseline for responsible AI. It covers fairness, transparency, accountability, human oversight, privacy and security, robustness and monitoring, third-party AI and incident management, and maps conceptually to the NIST AI RMF and ISO/IEC 42001. It comes with a requirements tracker you fill in under its own tab.",
    icon: "AIEG",
    color: "bg-violet-700",
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
  {
    slug: "iso-23894",
    name: "ISO/IEC 23894",
    description: "Guidance on AI risk management",
    about:
      "ISO/IEC 23894 is international guidance on managing risks specific to AI. It adapts the ISO 31000 risk management process to the AI lifecycle and is voluntary, but pairs naturally with ISO/IEC 42001 as the risk-assessment backbone of an AI management system.",
    icon: "ISO",
    color: "bg-blue-800",
    region: "International",
  },
  {
    slug: "oecd-ai-principles",
    name: "OECD AI Principles",
    description: "Values-based principles for trustworthy AI",
    about:
      "The OECD AI Principles are the first intergovernmental standard for AI. They set five values-based principles (inclusive growth, human rights and fairness, transparency, robustness and safety, accountability) and are voluntary, but underpin many national AI strategies and laws.",
    icon: "OECD",
    color: "bg-sky-800",
    region: "International",
  },
  {
    slug: "unesco-ai-ethics",
    name: "UNESCO AI Ethics Recommendation",
    description: "UNESCO Recommendation on the Ethics of AI",
    about:
      "The UNESCO Recommendation on the Ethics of Artificial Intelligence is a global, voluntary instrument adopted by 193 member states. It sets values and policy actions for human rights, fairness, transparency, accountability and environmental sustainability in AI.",
    icon: "UN",
    color: "bg-cyan-700",
    region: "International",
  },
  {
    slug: "eeoc-ada-ai",
    name: "EEOC Guidance on ADA and AI",
    description: "EEOC technical assistance on AI in employment",
    about:
      "The US Equal Employment Opportunity Commission's technical assistance explains how the Americans with Disabilities Act applies to AI and algorithmic tools used in hiring and employment. It is agency guidance, not a new law, but shows how existing law is enforced.",
    icon: "EEOC",
    color: "bg-slate-700",
    region: "United States",
  },
  {
    slug: "ftc-ai",
    name: "FTC AI Guidance",
    description: "FTC business guidance on AI under consumer-protection law",
    about:
      "The US Federal Trade Commission's business guidance explains how it expects companies to market, build and operate AI fairly and truthfully under existing consumer-protection law. It is guidance rather than a statute, but the FTC enforces the underlying law.",
    icon: "FTC",
    color: "bg-indigo-800",
    region: "United States",
  },
  {
    slug: "uk-ai-white-paper",
    name: "UK AI Regulation Framework",
    description: "UK pro-innovation, principles-based approach to AI",
    about:
      "The UK AI regulation white paper sets five cross-sector principles (safety, transparency, fairness, accountability, contestability) that existing regulators apply to AI in their sectors. It is a voluntary, principles-based framework rather than a single AI law.",
    icon: "UK",
    color: "bg-blue-900",
    region: "United Kingdom",
  },
  {
    slug: "australia-ai-ethics-principles",
    name: "Australian AI Ethics Principles",
    description: "Australia's 8 voluntary AI ethics principles",
    about:
      "Australia's AI Ethics Principles are eight voluntary principles, including human wellbeing, fairness, privacy, reliability, transparency, contestability and accountability, to guide the design, development and use of AI systems.",
    icon: "AU",
    color: "bg-emerald-800",
    region: "Australia",
  },
  {
    slug: "ai-verify",
    name: "AI Verify Framework",
    description: "Singapore's AI governance testing framework",
    about:
      "AI Verify is Singapore's voluntary AI governance testing framework and toolkit. It lets organizations check AI systems against internationally recognized principles using standardized tests and process checks, and report the results to stakeholders.",
    icon: "AIV",
    color: "bg-rose-700",
    region: "Singapore",
  },
  {
    slug: "altai",
    name: "Assessment List for Trustworthy AI (ALTAI)",
    description: "EU self-assessment checklist for trustworthy AI",
    about:
      "ALTAI is the European Commission High-Level Expert Group's self-assessment checklist for trustworthy AI. It turns the seven EU requirements (human agency, robustness, privacy, transparency, fairness, societal wellbeing, accountability) into practical questions. It is voluntary.",
    icon: "ALTAI",
    color: "bg-teal-700",
    region: "European Union",
  },
  {
    slug: "pci-dss-lite",
    name: "PCI DSS Lite",
    description: "Condensed view of the PCI Data Security Standard",
    about:
      "A condensed view of the PCI Data Security Standard for systems, including AI systems, that store, process or transmit payment card data. PCI DSS is an industry standard set by the card brands, not a law, and this view does not replace the official standard or a formal assessment.",
    icon: "PCI",
    color: "bg-orange-700",
    region: "International",
  },
];

export const getCatalogFramework = (slug: string) =>
  FRAMEWORK_CATALOG.find((f) => f.slug === slug);

export const catalogFrameworkPath = (slug: string) =>
  `admin/settings/frameworks/catalog/${slug}`;
