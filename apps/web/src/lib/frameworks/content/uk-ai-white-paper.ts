import type { FrameworkDefinition } from "../types";
import { req } from "../helpers";

// DSIT, "A pro-innovation approach to AI regulation" (CP 815, March 2023), section 3.2.3
// (paras 48-52 and the principle definitions and rationales), and the government
// response (CP 1019, February 2024).
// Guidance text is Governly's own.
export const ukAiWhitePaper: FrameworkDefinition = {
  slug: "uk-ai-white-paper",
  name: "UK AI Regulation Framework (White Paper)",
  navLabel: "UK AI White Paper",
  kind: "framework",
  // Enabled from the Frameworks library (tenant_frameworks), not as a policy.
  policyNames: [],
  description:
    "Organisational controls drawn from the five cross-sectoral principles in the UK government's AI regulation white paper. The principles are non-statutory: existing regulators apply them within their remits through guidance, and the February 2024 government response confirmed this approach, with a possible later duty on regulators to have due regard to them.",
  source: {
    title:
      "GOV.UK — A pro-innovation approach to AI regulation (CP 815, March 2023)",
    url: "https://www.gov.uk/government/publications/ai-regulation-a-pro-innovation-approach/white-paper",
  },
  sections: [
    {
      key: "1",
      title: "Safety, Security and Robustness",
      requirements: [
        req(
          "1.1",
          "Continual Risk Management",
          "Identify, assess and manage AI risks across the life cycle",
          "AI systems should function robustly, securely and safely throughout their life cycle, with risks continually identified, assessed and managed, including the likelihood of safety risks in your sector (see section 3.2.3, safety principle).",
          [
            "Is there a risk assessment for each AI system that is kept up to date?",
            "Have safety risks specific to your sector been considered?",
            "Who reviews risks when the system or its use changes?",
          ],
          [
            "AI risk register",
            "Risk assessments per system",
            "Review meeting records",
          ],
        ),
        req(
          "1.2",
          "Security and Resilience by Design",
          "Anticipate security threats at each life cycle stage",
          "Systems should be technically secure and function reliably as intended and described; developers should understand the security threats at each life cycle stage and build in resilience, and other actors should stay alert to security issues. The paper points to the NCSC principles for securing machine learning (see section 3.2.3, safety principle rationale).",
          [
            "Have threats been assessed for each stage (data, training, deployment, use)?",
            "Are resilience measures built into the system?",
            "Is security guidance such as the NCSC ML principles applied?",
          ],
          [
            "Threat models",
            "Security controls documentation",
            "NCSC principles mapping",
          ],
        ),
        req(
          "1.3",
          "Testing and Due Diligence",
          "Regularly test functioning, resilience and security",
          "Expect regulators to require regular testing or due diligence on a system's functioning, resilience and security, benchmarked where possible against technical standards for safety and robustness (see section 3.2.3, safety principle rationale).",
          [
            "How often is each system tested for performance, resilience and security?",
            "Which technical standards are used as benchmarks?",
            "Is due diligence done on third-party AI components?",
          ],
          [
            "Test plans and results",
            "Standards mapping",
            "Supplier due diligence records",
          ],
        ),
      ],
    },
    {
      key: "2",
      title: "Appropriate Transparency and Explainability",
      requirements: [
        req(
          "2.1",
          "Transparency About AI Use",
          "Tell relevant people how, when and why AI is used",
          "Communicate appropriate information about each AI system, such as how, when and for what purposes it is used, to the people who need it, proportionate to the system's risk (see section 3.2.3, transparency principle).",
          [
            "Do affected people know when an AI system is being used?",
            "Is the purpose of each system described?",
            "Is the level of disclosure proportionate to risk?",
          ],
          [
            "AI use notices",
            "System purpose statements",
            "Disclosure assessments",
          ],
        ),
        req(
          "2.2",
          "Explainability Appropriate to Context",
          "Make decision-making understandable to the right degree",
          "Enable relevant parties to access, interpret and understand how a system reaches decisions, to a level suited to its context, risk and the state of the art (see section 3.2.3, transparency principle and rationale).",
          [
            "Can the system's outputs be explained to users, affected people and regulators?",
            "Is the required level of explainability set by risk?",
            "Where explanation is limited, is that justified and recorded?",
          ],
          [
            "Explainability assessments",
            "Model documentation",
            "Sample explanations",
          ],
        ),
        req(
          "2.3",
          "Information for Regulators and Affected Parties",
          "Be ready to supply information in the form required",
          "Be able to give regulators enough information about systems, inputs and outputs, and give directly affected parties enough to enforce their rights, in the form regulators require, which may include product labelling (see section 3.2.3, transparency principle).",
          [
            "Could you produce system information for a regulator on request?",
            "Can affected people get enough information to exercise their rights?",
            "Have sector regulators issued transparency guidance you must follow?",
          ],
          [
            "System information packs",
            "Product labels or model cards",
            "Regulatory guidance tracker",
          ],
        ),
      ],
    },
    {
      key: "3",
      title: "Fairness",
      requirements: [
        req(
          "3.1",
          "Fairness Definition per System",
          "Decide what fairness means for each use",
          "Consider definitions of fairness suited to each system's use, outcomes and applicable law, so the system does not undermine legal rights, discriminate unfairly or create unfair market outcomes; follow your regulators' descriptions of fairness where published (see section 3.2.3, fairness principle).",
          [
            "Is a fairness definition recorded for each system?",
            "Does it reflect the law and regulator guidance for your sector?",
            "Are high-impact decisions justifiable rather than arbitrary?",
          ],
          [
            "Fairness definitions",
            "Fairness testing results",
            "Regulator guidance mapping",
          ],
        ),
        req(
          "3.2",
          "Equality and Human Rights Compliance",
          "Avoid discriminatory outcomes under UK law",
          "Ensure systems do not produce discriminatory outcomes contrary to the Equality Act 2010 or the Human Rights Act 1998, and that public authorities meet added duties such as the Public Sector Equality Duty (see section 3.2.3, fairness principle rationale).",
          [
            "Have outcomes been tested across protected characteristics?",
            "Is an equality impact assessment done where required?",
            "Do public sector uses meet the Public Sector Equality Duty?",
          ],
          [
            "Equality impact assessments",
            "Bias testing reports",
            "Legal review records",
          ],
        ),
        req(
          "3.3",
          "Data Protection and Consumer Law",
          "Meet UK GDPR, consumer and sector fairness rules",
          "Process personal data in design, training and use in line with UK GDPR and the Data Protection Act 2018, particularly fair processing and solely automated decision-making, and comply with consumer, competition and sector-specific fairness rules such as the FCA Handbook (see section 3.2.3, fairness principle rationale).",
          [
            "Is there a DPIA for systems processing personal data?",
            "Are solely automated decisions identified and handled lawfully?",
            "Which consumer or sector fairness rules apply?",
          ],
          [
            "DPIAs",
            "Automated decision-making register",
            "Sector rule mapping",
          ],
        ),
      ],
    },
    {
      key: "4",
      title: "Accountability and Governance",
      requirements: [
        req(
          "4.1",
          "Clear Lines of Accountability",
          "Assign ownership across the life cycle and supply chain",
          "Establish clear lines of ownership and accountability for each AI system across its life cycle and supply chain, so the right actors carry compliance expectations (see section 3.2.3, accountability principle).",
          [
            "Is an accountable owner named for each AI system?",
            "Are responsibilities split clearly with suppliers and partners?",
            "Do owners cover the full life cycle, from design to retirement?",
          ],
          [
            "RACI or ownership matrix",
            "Supplier contracts",
            "AI system register",
          ],
        ),
        req(
          "4.2",
          "Governance Procedures for the Principles",
          "Build the principles into how AI is run",
          "Take steps to consider, incorporate and adhere to the principles at every life cycle stage, with governance procedures that reliably ensure compliance expectations are met (see section 3.2.3, accountability principle).",
          [
            "Is there an AI policy that reflects the five principles?",
            "Is there a governance body or review gate for AI systems?",
            "How is adherence checked?",
          ],
          [
            "AI governance policy",
            "Review board minutes",
            "Compliance check records",
          ],
        ),
        req(
          "4.3",
          "Documentation, Impact Assessments and Audit",
          "Record key decisions and allow scrutiny",
          "Demonstrate accountability by documenting key decisions through the life cycle, carrying out impact assessments to spot risks early, and allowing audits where appropriate (see section 3.2.3, accountability principle rationale).",
          [
            "Are key design and deployment decisions recorded?",
            "Are impact assessments done before deployment?",
            "Could the system be audited on request?",
          ],
          [
            "Decision logs",
            "Impact assessments",
            "Audit reports",
          ],
        ),
      ],
    },
    {
      key: "5",
      title: "Contestability and Redress",
      requirements: [
        req(
          "5.1",
          "Routes to Contest AI Outcomes",
          "Let people challenge harmful AI decisions",
          "Where appropriate, give users, affected third parties and other life cycle actors clear, easily accessible routes, including informal channels, to contest an AI decision or outcome that is harmful or creates material risk of harm (see section 3.2.3, contestability principle).",
          [
            "Can affected people challenge an AI decision, and do they know how?",
            "Are informal channels available as well as formal ones?",
            "Who reviews challenges, and can they overturn the outcome?",
          ],
          [
            "Complaint and appeal procedures",
            "Contest request log",
            "Outcome review records",
          ],
        ),
        req(
          "5.2",
          "Alignment with Existing Redress Routes",
          "Map AI challenges onto existing legal redress",
          "The framework creates no new rights or routes to redress; regulators are expected to clarify existing ones. Map AI-related complaints onto the redress routes that already apply in your sector and follow regulator guidance on them (see section 3.2.3, contestability principle).",
          [
            "Which existing redress routes (ombudsman, regulator, courts) apply to your AI uses?",
            "Are affected people told about them?",
            "Has regulator guidance on redress been reviewed?",
          ],
          [
            "Redress route mapping",
            "Customer-facing redress information",
            "Regulator guidance tracker",
          ],
        ),
      ],
    },
  ],
};
