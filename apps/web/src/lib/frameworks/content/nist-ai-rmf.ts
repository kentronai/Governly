import type { FrameworkDefinition, FrameworkRequirement } from "../types";

// NIST AI RMF 1.0 subcategory: a flat requirement with its text as the description.
const item = (
  key: string,
  title: string,
  description: string,
): FrameworkRequirement => ({ key, title, description, subcontrols: [] });

// Only the GOVERN function is included so far; MAP, MEASURE and MANAGE follow.
export const nistAiRmf: FrameworkDefinition = {
  slug: "nist-ai-rmf",
  name: "NIST AI RMF",
  navLabel: "NIST AI RMF",
  kind: "framework",
  // Enabled from the Frameworks library (tenant_frameworks), not as a policy.
  policyNames: [],
  description:
    "NIST AI Risk Management Framework 1.0 - Govern categories: policies, accountability, workforce, culture, engagement with AI actors and third-party risk.",
  source: {
    title: "NIST AI Risk Management Framework (AI RMF 1.0)",
    url: "https://www.nist.gov/itl/ai-risk-management-framework",
  },
  sections: [
    {
      key: "1",
      title:
        "GOVERN 1: Policies, processes, procedures, and practices across the organization related to the mapping, measuring, and managing of AI risks are in place, transparent, and implemented effectively.",
      requirements: [
        item(
          "1.1",
          "GOVERN 1.1",
          "Legal and regulatory requirements involving AI are understood, managed, and documented.",
        ),
        item(
          "1.2",
          "GOVERN 1.2",
          "The characteristics of trustworthy AI are integrated into organizational policies, processes, procedures, and practices.",
        ),
        item(
          "1.3",
          "GOVERN 1.3",
          "Processes, procedures, and practices are in place to determine the needed level of risk management activities based on the organization's risk tolerance.",
        ),
        item(
          "1.4",
          "GOVERN 1.4",
          "The risk management process and its outcomes are established through transparent policies, procedures, and other controls based on organizational risk priorities.",
        ),
        item(
          "1.5",
          "GOVERN 1.5",
          "Ongoing monitoring and periodic review of the risk management process and its outcomes are planned and organizational roles and responsibilities clearly defined, including determining the frequency of periodic review.",
        ),
        item(
          "1.6",
          "GOVERN 1.6",
          "Mechanisms are in place to inventory AI systems and are resourced according to organizational risk priorities.",
        ),
        item(
          "1.7",
          "GOVERN 1.7",
          "Processes and procedures are in place for decommissioning and phasing out AI systems safely and in a manner that does not increase risks or decrease the organization's trustworthiness.",
        ),
      ],
    },
    {
      key: "2",
      title:
        "GOVERN 2: Accountability structures are in place so that the appropriate teams and individuals are empowered, responsible, and trained for mapping, measuring, and managing AI risks.",
      requirements: [
        item(
          "2.1",
          "GOVERN 2.1",
          "Roles and responsibilities and lines of communication related to mapping, measuring, and managing AI risks are documented and are clear to individuals and teams throughout the organization.",
        ),
        item(
          "2.2",
          "GOVERN 2.2",
          "The organization's personnel and partners receive AI risk management training to enable them to perform their duties and responsibilities consistent with related policies, procedures, and agreements.",
        ),
        item(
          "2.3",
          "GOVERN 2.3",
          "Executive leadership of the organization takes responsibility for decisions about risks associated with AI system development and deployment.",
        ),
      ],
    },
    {
      key: "3",
      title:
        "GOVERN 3: Workforce diversity, equity, inclusion, and accessibility processes are prioritized in the mapping, measuring, and managing of AI risks throughout the lifecycle.",
      requirements: [
        item(
          "3.1",
          "GOVERN 3.1",
          "Decision-making related to mapping, measuring, and managing AI risks throughout the lifecycle is informed by a diverse team (e.g., diversity of demographics, disciplines, experience, expertise, and backgrounds).",
        ),
        item(
          "3.2",
          "GOVERN 3.2",
          "Policies and procedures are in place to define and differentiate roles and responsibilities for human-AI configurations and oversight of AI systems.",
        ),
      ],
    },
    {
      key: "4",
      title:
        "GOVERN 4: Organizational teams are committed to a culture that considers and communicates AI risk.",
      requirements: [
        item(
          "4.1",
          "GOVERN 4.1",
          "Organizational policies and practices are in place to foster a critical thinking and safety-first mindset in the design, development, deployment, and uses of AI systems to minimize potential negative impacts.",
        ),
        item(
          "4.2",
          "GOVERN 4.2",
          "Organizational teams document the risks and potential impacts of the AI technology they design, develop, deploy, evaluate, and use, and they communicate about the impacts more broadly.",
        ),
        item(
          "4.3",
          "GOVERN 4.3",
          "Organizational practices are in place to enable AI testing, identification of incidents, and information sharing.",
        ),
      ],
    },
    {
      key: "5",
      title:
        "GOVERN 5: Processes are in place for robust engagement with relevant AI actors.",
      requirements: [
        item(
          "5.1",
          "GOVERN 5.1",
          "Organizational policies and practices are in place to collect, consider, prioritize, and integrate feedback from those external to the team that developed or deployed the AI system regarding the potential individual and societal impacts related to AI risks.",
        ),
        item(
          "5.2",
          "GOVERN 5.2",
          "Mechanisms are established to enable the team that developed or deployed AI systems to regularly incorporate adjudicated feedback from relevant AI actors into system design and implementation.",
        ),
      ],
    },
    {
      key: "6",
      title:
        "GOVERN 6: Policies and procedures are in place to address AI risks and benefits arising from third-party software and data and other supply chain issues.",
      requirements: [
        item(
          "6.1",
          "GOVERN 6.1",
          "Policies and procedures are in place that address AI risks associated with third-party entities, including risks of infringement of a third-party's intellectual property or other rights.",
        ),
        item(
          "6.2",
          "GOVERN 6.2",
          "Contingency processes are in place to handle failures or incidents in third-party data or AI systems deemed to be high-risk.",
        ),
      ],
    },
  ],
};
