import type { FrameworkDefinition } from "../types";
import { clause } from "../helpers";

// Management system clauses 4-10 of ISO/IEC 27001. Annex A controls are not included yet.
export const iso27001: FrameworkDefinition = {
  slug: "iso-27001",
  name: "ISO/IEC 27001",
  navLabel: "ISO/IEC 27001",
  kind: "framework",
  // Enabled from the Frameworks library (tenant_frameworks), not as a policy.
  policyNames: [],
  description:
    "The core requirements from Clauses 4-10 that define what your information security management system (ISMS) must include.",
  source: {
    title: "ISO/IEC 27001 — Information security management systems",
    url: "https://www.iso.org/standard/27001",
  },
  sections: [
    {
      key: "4",
      title: "Context of the organization",
      requirements: [
        clause(
          "4.1",
          "Understanding the organization and its context",
          "Identify what internal and external factors affect how your company manages information security.",
          [
            "What business goals or challenges impact our information security?",
            "Which external factors, such as laws, suppliers, or technology trends, change how we protect data?",
            "Do these factors affect decisions about risk and security measures?",
          ],
          [
            "Context analysis document",
            "SWOT or PESTLE analysis",
            "Meeting notes or planning documents",
          ],
        ),
        clause(
          "4.2",
          "Understanding the needs and expectations of interested parties",
          "List all people and organizations who care about how we manage information security and note their requirements.",
          [
            "Who are our stakeholders, such as customers, regulators, partners, and suppliers?",
            "What specific security requirements or expectations do they have?",
          ],
          [
            "Stakeholder list",
            "Contracts or SLAs mentioning security",
            "Customer requirement tracking sheet",
          ],
        ),
        clause(
          "4.3",
          "Determining the scope of the ISMS",
          "Define exactly what parts of the company are covered by ISO 27001 and why others might be excluded.",
          [
            "What systems, locations, and processes are included in our ISMS scope?",
            "Are exclusions documented and justified?",
          ],
          [
            "Scope statement",
            "ISMS boundaries document",
            "Exclusion list with rationale",
          ],
        ),
        clause(
          "4.4",
          "Information Security Management System",
          "Create and maintain a structured approach to managing information security across the organization.",
          [
            "Do we have a defined ISMS process?",
            "Does it include continuous improvement steps?",
          ],
          [
            "ISMS process documentation",
            "Improvement plans",
            "Tracking reports for ISMS activities",
          ],
        ),
      ],
    },
    {
      key: "5",
      title: "Leadership",
      requirements: [
        clause(
          "5.1",
          "Leadership and commitment",
          "Ensure company leaders actively support and drive information security initiatives.",
          [
            "Are managers setting priorities for security?",
            "Do they allocate enough resources to security?",
          ],
          [
            "Meeting minutes showing leadership involvement",
            "Budget and resource allocation documents",
          ],
        ),
        clause(
          "5.2",
          "Information security policy",
          "Create a clear, approved policy outlining your information security goals and rules.",
          [
            "Do we have a signed and approved security policy?",
            "Has the policy been communicated to all relevant staff?",
          ],
          ["Policy document", "Communication records or intranet posts"],
        ),
        clause(
          "5.3",
          "Organizational roles, responsibilities, and authorities",
          "Make sure all employees know their security responsibilities and who is accountable for key decisions.",
          [
            "Are security roles and responsibilities defined in job descriptions?",
            "Do staff know whom to contact for security issues?",
          ],
          [
            "Organizational chart",
            "Responsibility matrix",
            "Job description documents",
          ],
        ),
      ],
    },
    {
      key: "6",
      title: "Planning",
      requirements: [
        clause(
          "6.1.1",
          "General — actions to address risks and opportunities",
          "When planning for the ISMS, consider the issues from 4.1 and requirements from 4.2 to determine risks and opportunities that need to be addressed to ensure the ISMS achieves its intended outcomes.",
          [],
          [],
        ),
        clause(
          "6.1.2",
          "Information security risk assessment",
          "Have a clear method to identify, assess, and prioritize information security risks regularly.",
          [
            "Do we follow a documented process for spotting risks?",
            "Are risk levels (high, medium, low) defined clearly?",
            "Do we update the risk register regularly?",
          ],
          [
            "Risk assessment methodology",
            "Risk register",
            "Recent risk assessment reports",
          ],
        ),
        clause(
          "6.1.3",
          "Information security risk treatment",
          "Develop and track actions to manage risks with appropriate controls and treatments.",
          [
            "Do we have treatment plans for significant risks?",
            "Are chosen controls linked to risk priorities and documented?",
          ],
          [
            "Risk treatment plans",
            "Control selection documents",
            "Approval records",
          ],
        ),
        clause(
          "6.2",
          "Information security objectives",
          "Define measurable security goals and plan actions to achieve them.",
          [
            "Are our information security objectives written down?",
            "Are they reviewed and updated periodically?",
          ],
          [
            "Objectives document",
            "Review meeting notes",
            "Progress reports",
          ],
        ),
        clause(
          "6.3",
          "Planning of changes",
          "When the organization determines the need for changes to the ISMS, the changes shall be carried out in a planned manner.",
          [],
          [],
        ),
      ],
    },
    {
      key: "7",
      title: "Support",
      requirements: [
        clause(
          "7.1",
          "Resources",
          "Make sure enough staff, tools, and funding are available to maintain the ISMS.",
          [
            "Do we have sufficient resources allocated to ISMS tasks?",
            "Are tools and infrastructure adequate for security requirements?",
          ],
          [
            "Resource allocation plan",
            "Budget approvals",
            "Tool purchase records",
          ],
        ),
        clause(
          "7.2",
          "Competence",
          "Ensure employees have the necessary skills and training for their security-related tasks.",
          [
            "Have we identified required competencies for security roles?",
            "Do we offer relevant training or certifications?",
          ],
          [
            "Training matrix",
            "Employee certifications",
            "Skill assessment records",
          ],
        ),
        clause(
          "7.3",
          "Awareness",
          "Employees must understand security policies and their responsibilities in protecting information.",
          [
            "Have all employees received security awareness training?",
            "Do they know how to report incidents?",
          ],
          ["Training attendance records", "Awareness posters or guides"],
        ),
        clause(
          "7.4",
          "Communication",
          "Share security-related information effectively inside and outside the company.",
          [
            "Do we have a communication plan for security messages?",
            "Do we inform stakeholders about incidents promptly?",
          ],
          [
            "Communication plan",
            "Incident notification logs",
            "Emails to stakeholders",
          ],
        ),
        clause(
          "7.5",
          "Documented information",
          "Keep necessary ISMS documents and records under control and easily accessible.",
          [
            "Do we version-control security documents?",
            "Are sensitive records protected properly?",
          ],
          ["Document register", "Access-controlled folders", "Record logs"],
        ),
      ],
    },
    {
      key: "8",
      title: "Operation",
      requirements: [
        clause(
          "8.1",
          "Operational planning and control",
          "Plan and manage day-to-day operations to meet security goals and apply risk treatments effectively.",
          [
            "Do we have documented procedures for operational tasks?",
            "Are controls applied consistently?",
          ],
          [
            "Operational plans",
            "Checklists or logs of daily security checks",
          ],
        ),
        clause(
          "8.2",
          "Risk assessment during operations",
          "Review risks when projects change, new systems are introduced, or major updates occur.",
          [
            "Do we assess risks for all major changes?",
            "Are decisions documented based on updated risk findings?",
          ],
          ["Change risk logs", "Updated risk register entries"],
        ),
        clause(
          "8.3",
          "Risk treatment during operations",
          "Implement planned risk treatment actions and verify they are effective.",
          [
            "Do we track results of risk treatments?",
            "Are failed treatments escalated quickly?",
          ],
          ["Risk treatment reports", "Incident follow-up records"],
        ),
      ],
    },
    {
      key: "9",
      title: "Performance evaluation",
      requirements: [
        clause(
          "9.1",
          "Monitoring, measurement, analysis, and evaluation",
          "Track and measure the performance of ISMS processes and security controls.",
          [
            "Do we have defined KPIs for security?",
            "Are results reviewed periodically?",
          ],
          ["Monitoring reports", "Performance dashboards"],
        ),
        clause(
          "9.2",
          "Internal audit",
          "Check regularly that ISMS is effective and meets ISO 27001 requirements.",
          [
            "Is there a documented audit plan?",
            "Are findings recorded and resolved promptly?",
          ],
          [
            "Audit schedules",
            "Audit reports",
            "Corrective action tracking logs",
          ],
        ),
        clause(
          "9.3",
          "Management review",
          "Have top management review ISMS performance and plan necessary improvements.",
          [
            "Are reviews held regularly with documented outputs?",
            "Are improvement decisions tracked and implemented?",
          ],
          ["Meeting minutes", "Improvement action logs"],
        ),
      ],
    },
    {
      key: "10",
      title: "Improvement",
      requirements: [
        clause(
          "10.1",
          "Nonconformity and corrective action",
          "Record, investigate, and fix problems, ensuring they do not recur.",
          [
            "Do we track nonconformities in a register?",
            "Are corrective actions tested and verified?",
          ],
          [
            "Nonconformity logs",
            "Corrective action plans",
            "Verification records",
          ],
        ),
        clause(
          "10.2",
          "Continual improvement",
          "Identify and act on opportunities to make the ISMS more effective over time.",
          [
            "Do we have a process for suggesting and implementing improvements?",
            "Are improvements reviewed by leadership?",
          ],
          [
            "Improvement plan document",
            "Lessons learned reports",
            "Approval records",
          ],
        ),
      ],
    },
  ],
};
