import type { FrameworkDefinition } from "../types";
import { req } from "../helpers";

// Section and requirement names follow the European Commission HLEG's ALTAI
// (CC BY 4.0). Summaries, questions and evidence are NORIX's own wording.
// Flat framework: each requirement is one control.

export const altai: FrameworkDefinition = {
  slug: "altai",
  name: "Assessment List for Trustworthy AI",
  navLabel: "Assessment List for Trustworthy AI",
  policyNames: ["Assessment List for Trustworthy AI"],
  description:
    "Self-assessment of AI systems against the European Commission's seven requirements for trustworthy AI.",
  source: {
    title:
      "European Commission HLEG — Assessment List for Trustworthy AI (2020), CC BY 4.0",
    url: "https://digital-strategy.ec.europa.eu/en/library/assessment-list-trustworthy-artificial-intelligence-altai-self-assessment",
  },
  sections: [
    {
      key: "1",
      title: "Human Agency and Oversight",
      requirements: [
        req(
          "1.1",
          "Human Agency and Autonomy",
          "Keep people in charge of their own decisions",
          "Assess whether the system could steer, manipulate or replace human decision-making, and design it to support people instead.",
          [
            "Does the system make or shape decisions that affect users or other people?",
            "Could it nudge or manipulate users in ways they would not knowingly accept?",
            "Could users come to rely on it too much or form an attachment to it?",
            "Do users know when a decision or output comes from AI?",
          ],
          [
            "Autonomy impact assessment",
            "UX review for manipulative patterns",
            "Over-reliance mitigations",
            "AI disclosure wording",
          ],
        ),
        req(
          "1.2",
          "Human Oversight",
          "Ensure humans can supervise and intervene",
          "Define how people oversee the system, and make sure they can override, pause or stop it.",
          [
            "Which oversight model applies: human-in-the-loop, on-the-loop or in-command?",
            "Can an operator override or reverse an output?",
            "Is there a safe way to stop the system?",
            "Are overseers trained for the role?",
          ],
          [
            "Oversight procedure",
            "Override and stop mechanism",
            "Operator training records",
            "Escalation path",
          ],
        ),
      ],
    },
    {
      key: "2",
      title: "Technical Robustness and Safety",
      requirements: [
        req(
          "2.1",
          "Resilience to Attack and Security",
          "Protect the system against attacks",
          "Identify AI-specific threats and put controls in place to protect the model, data and infrastructure.",
          [
            "Have threats such as data poisoning, evasion, model extraction and prompt injection been assessed?",
            "Are models, data and pipelines access-controlled and integrity-checked?",
            "Is security tested and monitored on an ongoing basis?",
          ],
          [
            "AI threat model",
            "Security test or red-team report",
            "Integrity controls",
            "Security monitoring setup",
          ],
        ),
        req(
          "2.2",
          "General Safety",
          "Prevent the system from causing harm",
          "Define what safe operation means for the system, assess the risks of failure and misuse, and put safeguards around them.",
          [
            "Have safety risks and acceptable risk levels been defined?",
            "Has foreseeable misuse been considered?",
            "Are safeguards in place to stop identified risks from occurring?",
          ],
          [
            "Safety risk assessment",
            "Misuse analysis",
            "Safeguard documentation",
          ],
        ),
        req(
          "2.3",
          "Accuracy",
          "Meet and maintain the accuracy the use case needs",
          "Set the accuracy the purpose requires, measure it on representative data and keep tracking it after release.",
          [
            "What level of accuracy does this use case require, and why?",
            "How is accuracy measured, and on which data?",
            "Are users told about the system's expected accuracy and limits?",
            "How is accuracy tracked over time?",
          ],
          [
            "Accuracy targets",
            "Evaluation results",
            "User-facing limitations note",
            "Performance dashboard",
          ],
        ),
        req(
          "2.4",
          "Reliability and Reproducibility",
          "Behave consistently and reproducibly",
          "Check that the system behaves consistently across conditions and that results can be reproduced.",
          [
            "Does the system perform consistently across inputs, users and environments?",
            "Can results be reproduced from versioned code, data and configuration?",
            "How are low-confidence outputs handled?",
          ],
          [
            "Reliability test results",
            "Versioning records",
            "Confidence-threshold handling",
          ],
        ),
        req(
          "2.5",
          "Fallback Plans",
          "Fail safely",
          "Prepare fallback behaviour so that failures or unexpected inputs do not cause harm.",
          [
            "What happens when the system fails or is unavailable?",
            "Can it degrade gracefully or hand over to a person?",
            "Are fallback procedures tested?",
          ],
          [
            "Fallback procedure",
            "Graceful degradation design",
            "Fallback test results",
          ],
        ),
      ],
    },
    {
      key: "3",
      title: "Privacy and Data Governance",
      requirements: [
        req(
          "3.1",
          "Privacy and Data Protection",
          "Protect personal data throughout the lifecycle",
          "Apply privacy by design, assess privacy impacts and respect data-subject rights for personal data the system uses.",
          [
            "Has a data protection impact assessment been carried out where required?",
            "Are data minimization and anonymization or pseudonymization applied?",
            "Can people exercise their rights over data the system uses?",
          ],
          [
            "DPIA",
            "Data minimization record",
            "Data-subject request procedure",
          ],
        ),
        req(
          "3.2",
          "Quality and Integrity of Data",
          "Use data that is fit for purpose",
          "Check training and input data for quality, representativeness and bias, and keep track of where it came from.",
          [
            "Is data quality checked before use?",
            "Is the data representative of the people and conditions the system serves?",
            "Are data sources and lineage recorded?",
          ],
          ["Data quality report", "Dataset documentation", "Lineage records"],
        ),
        req(
          "3.3",
          "Access to Data",
          "Control who can access data",
          "Define who may access data used by the system, under what conditions, and keep a record of that access.",
          [
            "Are there rules for who can access the data and why?",
            "Is access logged and reviewed?",
            "Are third parties given access only under agreements?",
          ],
          ["Data access policy", "Access logs", "Data sharing agreements"],
        ),
      ],
    },
    {
      key: "4",
      title: "Transparency",
      requirements: [
        req(
          "4.1",
          "Traceability",
          "Be able to trace how outputs were produced",
          "Record the data, models and processes behind the system so that outputs can be traced back.",
          [
            "Are the datasets and processes that produce outputs documented?",
            "Are model versions and changes tracked?",
            "Can a specific output be traced to the model and inputs that produced it?",
          ],
          ["Model and data registry", "Change log", "Inference logging"],
        ),
        req(
          "4.2",
          "Explainability",
          "Explain decisions in a way people understand",
          "Provide explanations suited to each audience, and weigh explainability against other goals such as accuracy.",
          [
            "Can the system's behaviour be explained to the people affected?",
            "Are explanations tailored to the audience?",
            "Has the trade-off between explainability and performance been considered?",
          ],
          [
            "Explainability approach",
            "Sample explanations",
            "Trade-off rationale",
          ],
        ),
        req(
          "4.3",
          "Communication",
          "Tell people what the system is and what it can do",
          "Tell users they are dealing with AI, and describe its purpose, capabilities and limitations.",
          [
            "Are users told when they interact with an AI system?",
            "Are purpose, capabilities and limitations communicated clearly?",
            "Is there a channel for questions or complaints?",
          ],
          [
            "AI disclosure notice",
            "Capability and limitation statement",
            "Contact channel",
          ],
        ),
      ],
    },
    {
      key: "5",
      title: "Diversity, Non-discrimination and Fairness",
      requirements: [
        req(
          "5.1",
          "Avoidance of Unfair Bias",
          "Find and reduce unfair bias",
          "Test for bias across relevant groups, set fairness criteria, and fix disparities found in data or outcomes.",
          [
            "Which groups could be treated unfairly by the system?",
            "What fairness criteria have been chosen, and why?",
            "Is bias tested before release and monitored afterwards?",
          ],
          ["Bias assessment", "Fairness metrics", "Mitigation actions"],
        ),
        req(
          "5.2",
          "Accessibility and Universal Design",
          "Make the system usable by everyone",
          "Design the system to be usable by people of different abilities, following recognized accessibility standards.",
          [
            "Can people with disabilities use the system?",
            "Were accessibility standards applied in design?",
            "Are alternatives available for people who cannot use the main interface?",
          ],
          [
            "Accessibility review",
            "Standards conformance notes",
            "Alternative access options",
          ],
        ),
        req(
          "5.3",
          "Stakeholder Participation",
          "Involve the people affected",
          "Consult the people affected by the system during design and use, and act on their feedback.",
          [
            "Were affected stakeholders consulted during development?",
            "Is there ongoing feedback from users and affected communities?",
            "How is feedback acted on?",
          ],
          ["Consultation records", "Feedback log", "Resulting changes"],
        ),
      ],
    },
    {
      key: "6",
      title: "Societal and Environmental Well-being",
      requirements: [
        req(
          "6.1",
          "Environmental Well-being",
          "Understand and reduce environmental impact",
          "Estimate the energy use and environmental footprint of training and running the system, and reduce them where you can.",
          [
            "Has the environmental impact of training and inference been estimated?",
            "Are steps taken to reduce energy and resource use?",
          ],
          ["Energy or carbon estimate", "Efficiency measures"],
        ),
        req(
          "6.2",
          "Impact on Work and Skills",
          "Consider effects on workers",
          "Assess how the system changes work and skills, and support the people affected.",
          [
            "How does the system change jobs, tasks or required skills?",
            "Were affected workers informed and consulted?",
            "Is training or reskilling offered where needed?",
          ],
          [
            "Workforce impact assessment",
            "Consultation records",
            "Training plan",
          ],
        ),
        req(
          "6.3",
          "Impact on Society at Large and Democracy",
          "Guard against wider societal harm",
          "Consider broader effects on society, public discourse and democratic processes, and guard against misuse.",
          [
            "Could the system affect public opinion, elections or access to information?",
            "Are safeguards in place against large-scale misuse?",
          ],
          ["Societal impact assessment", "Misuse safeguards"],
        ),
      ],
    },
    {
      key: "7",
      title: "Accountability",
      requirements: [
        req(
          "7.1",
          "Auditability",
          "Make the system auditable",
          "Keep enough documentation and logs that internal or independent auditors can assess the system.",
          [
            "Can the system be audited internally and by independent parties?",
            "Are design, data and decisions documented for audit?",
            "Are audit trails retained?",
          ],
          [
            "Audit documentation pack",
            "Audit trail retention",
            "Audit reports",
          ],
        ),
        req(
          "7.2",
          "Minimizing and Reporting Negative Impacts",
          "Spot, report and limit harm",
          "Give people ways to raise concerns and report harms, and act on them.",
          [
            "How can staff and users report concerns or harms?",
            "Are incidents recorded and investigated?",
            "Are reporters protected from retaliation?",
          ],
          [
            "Reporting channel",
            "Incident register",
            "Whistleblower protection policy",
          ],
        ),
        req(
          "7.3",
          "Documenting Trade-offs",
          "Make trade-offs explicit",
          "Record trade-offs between requirements, who made them, and why.",
          [
            "Which trade-offs between requirements were made?",
            "Who approved them and on what basis?",
          ],
          ["Trade-off log", "Approval records"],
        ),
        req(
          "7.4",
          "Ability to Redress",
          "Put things right when harm occurs",
          "Provide accessible ways for affected people to challenge outcomes and obtain a remedy.",
          [
            "Can affected people challenge an outcome?",
            "Is there a process to correct errors and provide remedies?",
          ],
          ["Redress procedure", "Appeal and outcome records"],
        ),
      ],
    },
  ],
};
