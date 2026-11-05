import type { FrameworkDefinition } from "../types";
import { req } from "../helpers";

// NORIX baseline, conceptually aligned with NIST AI RMF 1.0 and ISO/IEC 42001.
// Guidance text is NORIX's own.
export const aiEthicsGovernance: FrameworkDefinition = {
  slug: "ai-ethics-governance",
  name: "AI Ethics & Governance Framework",
  navLabel: "AI Ethics & Governance Framework",
  policyNames: ["AI Ethics & Governance Framework"],
  description:
    "NORIX's general-purpose baseline for responsible AI. It covers fairness, transparency, accountability, human oversight, privacy and security, and maps conceptually to the NIST AI RMF and ISO/IEC 42001.",
  source: {
    title:
      "NORIX AI Ethics & Governance baseline (aligned with NIST AI RMF 1.0 and ISO/IEC 42001)",
    url: "https://www.nist.gov/itl/ai-risk-management-framework",
  },
  sections: [
    {
      key: "1",
      title: "Fairness and non-discrimination",
      requirements: [
        req(
          "1.1",
          "Define fairness goals per use case",
          "Set what fair means for each system",
          "For every AI system, identify the people and groups its outputs affect and document the fairness metrics and thresholds that apply.",
          [
            "Which individuals and groups are affected by this system's outputs?",
            "Which fairness metrics fit this use case, and why were they chosen?",
            "What thresholds count as acceptable, and who approved them?",
            "Are fairness goals revisited when the use case changes?",
          ],
          [
            "Impact assessment listing affected groups",
            "Fairness metric selection rationale",
            "Approved threshold sign-off",
            "Use-case change log",
          ],
        ),
        req(
          "1.2",
          "Test models for bias",
          "Measure group-level performance before release",
          "Test models for performance differences across relevant groups before release and after significant changes, and check that training data is representative.",
          [
            "Are bias tests run before every release and major model change?",
            "Are results broken down by the groups identified for this system?",
            "Has training data been reviewed for gaps and skews?",
            "Are mitigations planned for any data or performance gaps found?",
          ],
          [
            "Pre-release bias test reports",
            "Group-level performance breakdowns",
            "Training data representativeness review",
            "Mitigation plans for documented gaps",
          ],
        ),
        req(
          "1.3",
          "Remediate and monitor unfair outcomes",
          "Fix bias and watch for drift",
          "Track every bias finding to closure with an owner and decision, and recompute fairness metrics on production data on a regular schedule.",
          [
            "Does each bias finding have an owner, a due date and a resolution?",
            "Are accepted risks formally documented and approved?",
            "How often are fairness metrics recomputed on live data?",
            "What happens when production metrics cross a threshold?",
          ],
          [
            "Bias findings tracker",
            "Risk acceptance records",
            "Production fairness monitoring dashboards",
            "Drift alert and response records",
          ],
        ),
      ],
    },
    {
      key: "2",
      title: "Transparency and explainability",
      requirements: [
        req(
          "2.1",
          "Tell people when AI is involved",
          "Disclose AI use in plain language",
          "Make it clear to users when they are interacting with AI or viewing AI output, and publish plain-language notices on what each system does and its limits.",
          [
            "Can users tell when they are interacting with an AI system?",
            "Is AI-generated content labelled as such?",
            "Do notices explain the system's purpose and main limitations?",
            "Are notices written so a non-expert can understand them?",
          ],
          [
            "Screenshots of AI disclosures in the product",
            "Content labelling standard",
            "Published AI use notices",
            "Readability review of notices",
          ],
        ),
        req(
          "2.2",
          "Explain consequential decisions",
          "Give reasons for impactful outcomes",
          "Let people significantly affected by an AI-assisted decision learn its main factors, using explanation methods that have been checked against actual model behaviour.",
          [
            "Can affected people request an explanation of an outcome?",
            "Do explanations identify the main factors behind the decision?",
            "Have explanation methods been validated for accuracy?",
            "How quickly are explanation requests answered?",
          ],
          [
            "Explanation request procedure",
            "Sample decision explanations",
            "Explanation method validation report",
            "Request response time log",
          ],
        ),
        req(
          "2.3",
          "Document models and data",
          "Keep model and data records current",
          "Maintain up-to-date documentation of each model's purpose, metrics and limitations, plus the sources, licences and processing steps of its training data.",
          [
            "Does every production model have a current model card?",
            "Are known limitations and failure modes recorded?",
            "Are training data sources and licences documented?",
            "Is data lineage traceable through processing steps?",
          ],
          [
            "Model cards",
            "Dataset documentation",
            "Data licence records",
            "Data lineage diagrams",
          ],
        ),
      ],
    },
    {
      key: "3",
      title: "Accountability and governance",
      requirements: [
        req(
          "3.1",
          "Assign AI ownership and roles",
          "Name accountable owners and oversight",
          "Record a named owner for every AI system and establish a governance body or role that reviews high-risk systems and policy exceptions.",
          [
            "Does every AI system in the inventory have a named owner?",
            "Are ownership records kept current when people change roles?",
            "Is there a committee or role that oversees AI risk?",
            "How are policy exceptions reviewed and approved?",
          ],
          [
            "AI inventory with owners",
            "Governance committee charter",
            "Committee meeting minutes",
            "Policy exception register",
          ],
        ),
        req(
          "3.2",
          "Assess and approve AI risk",
          "Tier systems and gate high-risk launches",
          "Keep an inventory of all AI systems, including third-party ones, classify each by risk tier, and require a documented impact assessment and sign-off before high-risk deployment.",
          [
            "Does the inventory include third-party and embedded AI?",
            "Is each system assigned a risk tier with a rationale?",
            "Are impact assessments completed before high-risk launches?",
            "Who signs off, and is approval recorded?",
          ],
          [
            "AI system inventory with risk tiers",
            "Risk classification criteria",
            "Completed impact assessments",
            "Deployment approval records",
          ],
        ),
        req(
          "3.3",
          "Manage third-party AI and incidents",
          "Vet vendors and handle AI incidents",
          "Assess AI vendors for data use, security and model risk before adoption, and record, investigate and learn from AI incidents through a defined process.",
          [
            "Are AI vendors assessed before contracts are signed?",
            "Does due diligence cover data use, security and model risk?",
            "Is there a defined process for logging AI incidents?",
            "Do incident lessons feed back into controls?",
          ],
          [
            "Vendor AI due diligence questionnaires",
            "Vendor contract AI clauses",
            "AI incident log",
            "Post-incident review reports",
          ],
        ),
      ],
    },
    {
      key: "4",
      title: "Human oversight",
      requirements: [
        req(
          "4.1",
          "Define human review points",
          "Set where people review or approve",
          "Document for each system whether humans are in, on or out of the loop based on risk, and require qualified human approval for high-impact decisions.",
          [
            "Is the oversight level documented and justified per system?",
            "Which decisions require human approval before taking effect?",
            "Are approvers qualified for the decisions they confirm?",
            "Is oversight revisited when a system's risk changes?",
          ],
          [
            "Oversight level register",
            "Human approval workflow design",
            "Approver qualification records",
            "Approval audit trails",
          ],
        ),
        req(
          "4.2",
          "Enable override and shutdown",
          "Let operators correct or stop AI",
          "Give operators a logged way to override outputs within the workflow and a tested kill switch or rollback for every production system.",
          [
            "Can operators override AI outputs within the workflow?",
            "Are overrides logged and reviewed?",
            "Does each production system have a kill switch or rollback?",
            "When was the shutdown mechanism last tested?",
          ],
          [
            "Override logs",
            "Override trend reviews",
            "Kill switch and rollback runbooks",
            "Shutdown test records",
          ],
        ),
        req(
          "4.3",
          "Prepare reviewers and offer recourse",
          "Train reviewers and allow appeals",
          "Train reviewers on system limits and automation bias, and give affected people a path to contest AI-assisted outcomes before a human reviewer.",
          [
            "Are reviewers trained on known failure modes?",
            "Does training address over-reliance on AI outputs?",
            "Can affected people appeal an AI-assisted decision?",
            "Are appeals routed to a human and resolved on time?",
          ],
          [
            "Reviewer training materials",
            "Training completion records",
            "Appeal procedure",
            "Appeal case log with outcomes",
          ],
        ),
      ],
    },
    {
      key: "5",
      title: "Privacy and security",
      requirements: [
        req(
          "5.1",
          "Protect personal data in AI",
          "Minimise data and honour rights",
          "Remove or mask unneeded personal data in training and prompts, complete a privacy review covering purpose, lawful basis and retention, and extend access and deletion requests to AI data where feasible.",
          [
            "Is unneeded personal data removed or masked before use?",
            "Has a privacy review been completed for each AI system?",
            "Are purpose, lawful basis and retention documented?",
            "Do access and deletion requests reach AI datasets and logs?",
          ],
          [
            "Data minimisation procedures",
            "Privacy impact assessments",
            "Retention schedules",
            "Data subject request records",
          ],
        ),
        req(
          "5.2",
          "Secure AI systems against attack",
          "Defend models, data and pipelines",
          "Red-team systems for prompt injection and misuse before release and periodically, and restrict and monitor access to model weights, training data and keys.",
          [
            "Is adversarial testing done before release?",
            "Is red-teaming repeated on a regular schedule?",
            "Who can access model weights, training data and keys?",
            "Is access to AI assets monitored and reviewed?",
          ],
          [
            "Red-team and adversarial test reports",
            "Remediation tickets for findings",
            "Access control lists for AI assets",
            "Access review records",
          ],
        ),
      ],
    },
  ],
};
