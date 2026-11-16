import type { FrameworkDefinition } from "../types";
import { req } from "../helpers";

// Colorado SB21-169, C.R.S. § 10-3-1104.9, and Colorado Division of Insurance
// Regulation 10-1-1 (3 CCR 702-10, amended effective 15 October 2025).
// Guidance text is Governly's own.
export const coSb21169: FrameworkDefinition = {
  slug: "co-sb21-169",
  name: "Colorado SB21-169 (Insurers' Use of External Data and Models)",
  navLabel: "Colorado SB21-169",
  kind: "regulation",
  policyNames: ["Colorado SB21-169"],
  description:
    "Colorado's ban on unfair discrimination by insurers using external consumer data and information sources (ECDIS), algorithms and predictive models (C.R.S. 10-3-1104.9), with the governance, risk management and reporting rules of Regulation 10-1-1 for individual life, private passenger auto and health benefit plan insurers. Life insurers have had to comply since 1 December 2024; auto and health insurers by 1 July 2026. The Division's quantitative testing regulation is still a draft.",
  source: {
    title:
      "3 CCR 702-10, Regulation 10-1-1 (Colorado Secretary of State, Code of Colorado Regulations)",
    url: "https://www.sos.state.co.us/CCR/GenerateRulePdf.do?ruleVersionId=12182&fileName=3+CCR+702-10",
  },
  sections: [
    {
      key: "1",
      title: "Unfair Discrimination",
      requirements: [
        req(
          "1.1",
          "No Unfair Discrimination from ECDIS and Models",
          "Make sure data and models do not discriminate unfairly against protected classes",
          "Do not use ECDIS, or algorithms and predictive models that use ECDIS, in any insurance practice (marketing, underwriting, pricing, utilization management, reimbursement, claims) in a way that unfairly discriminates based on race, colour, national or ethnic origin, religion, sex, sexual orientation, disability, gender identity or gender expression (C.R.S. 10-3-1104.9(1), (8)(c)).",
          [
            "Which insurance practices use ECDIS or models built on ECDIS?",
            "Has each use been assessed for disproportionately negative outcomes for protected classes?",
            "Is the line of business excluded (title, surety, most commercial policies) under 10-3-1104.9(6)?",
          ],
          [
            "Map of insurance practices using ECDIS",
            "Unfair discrimination assessment per model",
            "Scope and exclusion analysis",
          ],
        ),
        req(
          "1.2",
          "Remediation of Unfair Discrimination",
          "Fix discriminatory outcomes when testing finds them",
          "The framework must detect whether ECDIS, algorithms and predictive models may cause unfair discrimination with respect to race and remediate it when found through the Division's quantitative testing requirements; the statute allows a reasonable period to remedy an unfairly discriminatory impact (Reg. 10-1-1 s. 5.A; C.R.S. 10-3-1104.9(3)(c)(I)).",
          [
            "Is there a defined process to remediate a model once unfair discrimination is detected?",
            "Who approves remediation actions and timelines?",
            "Are remediated models retested before returning to use?",
          ],
          [
            "Remediation procedure",
            "Remediation tickets and approvals",
            "Post-remediation test results",
          ],
        ),
      ],
    },
    {
      key: "2",
      title: "Governance and Accountability",
      requirements: [
        req(
          "2.1",
          "Documented Governing Principles",
          "Write down the values and objectives that guide ECDIS and model use",
          "Document governing principles that set the insurer's values and objectives so that ECDIS and models using ECDIS are designed, developed, used and monitored with effective oversight and are reasonably designed to prevent unfair discrimination (Reg. 10-1-1 s. 5.A.1).",
          [
            "Are governing principles formally documented and approved?",
            "Do they address both oversight and prevention of unfair discrimination?",
            "Are they communicated to the teams that build and use models?",
          ],
          [
            "Governing principles document",
            "Approval record",
            "Communication or training record",
          ],
        ),
        req(
          "2.2",
          "Board Oversight",
          "Have the board or a board committee oversee the framework",
          "Ensure the governance structure and risk management framework for ECDIS, algorithms and predictive models is overseen by the board of directors or a board committee (Reg. 10-1-1 s. 5.A.2).",
          [
            "Which board body has oversight responsibility?",
            "How often does it receive reports on the framework?",
            "Is oversight recorded in board or committee minutes?",
          ],
          [
            "Board or committee charter",
            "Board minutes",
            "Board reporting pack",
          ],
        ),
        req(
          "2.3",
          "Senior Management Accountability",
          "Make senior management own strategy, direction and reporting",
          "Assign senior management responsibility for setting and monitoring strategy on ECDIS and models, with clear lines of communication, delegated decision-making authority and regular reporting on their performance and risks (Reg. 10-1-1 s. 5.A.3).",
          [
            "Which senior managers are accountable for ECDIS and model use?",
            "Are decision-making authorities delegated in writing?",
            "Does senior management receive regular performance and risk reports?",
          ],
          [
            "RACI or delegation of authority",
            "Management reports",
            "Escalation procedure",
          ],
        ),
        req(
          "2.4",
          "Cross-Functional Governance Group",
          "Run a documented cross-functional model governance group",
          "Establish and document a cross-functional ECDIS, algorithm and predictive model governance group with representatives from legal, compliance, risk management, product development, underwriting, actuarial, data science, marketing and customer service, as applicable (Reg. 10-1-1 s. 5.A.4).",
          [
            "Is the group's membership and mandate documented?",
            "Are all applicable functions represented?",
            "Are meetings and decisions recorded?",
          ],
          [
            "Group charter and membership list",
            "Meeting minutes",
            "Decision log",
          ],
        ),
        req(
          "2.5",
          "Provider Responsibility for Health Authorization Decisions",
          "Health insurers: keep a provider responsible for prior-authorization decisions",
          "Health benefit plan insurers must ensure that a provider acting for the insurer is ultimately responsible for decisions to modify or deny prior or concurrent authorization requests when ECDIS or models using ECDIS inform those decisions (Reg. 10-1-1 s. 5.A.5).",
          [
            "Which authorization workflows use ECDIS or models?",
            "Does a provider make or sign off every modification or denial?",
            "Can the responsible provider be identified for each decision?",
          ],
          [
            "Utilization management workflow",
            "Provider review records",
            "Decision audit trail",
          ],
        ),
      ],
    },
    {
      key: "3",
      title: "Policies, Risk Assessment and Consumer Protection",
      requirements: [
        req(
          "3.1",
          "Lifecycle Policies, Data Quality and Training",
          "Govern the full model lifecycle and train staff",
          "Document policies, processes and roles for the design, development, testing, deployment, use and monitoring of ECDIS and models, ensure ECDIS is credible, relevant and fit for its intended purpose, and run ongoing supervision and training for relevant staff (Reg. 10-1-1 s. 5.A.6).",
          [
            "Do policies cover every lifecycle stage with assigned roles?",
            "How is each ECDIS shown to be credible, relevant and appropriate?",
            "Do relevant staff complete training on compliant use?",
          ],
          [
            "Model lifecycle policy",
            "Data source suitability assessments",
            "Training records",
          ],
        ),
        req(
          "3.2",
          "Consumer Complaints and Adverse Decisions",
          "Handle consumer questions and support action after adverse decisions",
          "Document processes for complaints and inquiries from applicants, policyholders, beneficiaries or covered persons about ECDIS and model use, giving them the information needed to take meaningful action after an adverse decision; existing grievance and appeal procedures may be used (Reg. 10-1-1 s. 5.A.7).",
          [
            "Can consumers ask about ECDIS or model use through a defined channel?",
            "What information is given after an adverse decision based on ECDIS or models?",
            "Are complaints tracked and analysed?",
          ],
          [
            "Complaint and inquiry procedure",
            "Adverse decision notice templates",
            "Complaint log",
          ],
        ),
        req(
          "3.3",
          "Risk Assessment and Prioritisation",
          "Assess and rank the risks of each ECDIS and model deployment",
          "Document how risks from deploying ECDIS and models in insurance practices are assessed and prioritised, giving reasonable consideration to impacts on applicants, policyholders, beneficiaries and covered persons (Reg. 10-1-1 s. 5.A.8).",
          [
            "Is there a documented risk assessment method for ECDIS and models?",
            "Does it weigh impacts on consumers?",
            "Are higher-risk uses given more scrutiny?",
          ],
          [
            "Risk assessment methodology",
            "Completed risk assessments",
            "Risk register",
          ],
        ),
      ],
    },
    {
      key: "4",
      title: "Inventory, Testing and Monitoring",
      requirements: [
        req(
          "4.1",
          "ECDIS and Model Inventory",
          "Keep an up-to-date, version-controlled inventory",
          "Maintain a documented, current inventory with version control of every ECDIS and every algorithm and predictive model that uses ECDIS, describing each one, its stated purpose and the outputs it generates (Reg. 10-1-1 s. 5.A.9).",
          [
            "Does the inventory cover all ECDIS and models in use?",
            "Are versions tracked?",
            "Are purpose and outputs described for each entry?",
          ],
          [
            "Model and data source inventory",
            "Version history",
            "Inventory review sign-off",
          ],
        ),
        req(
          "4.2",
          "Material Change Documentation",
          "Explain material changes to the inventory",
          "Document any material change to the inventory of ECDIS and models and the rationale for it (Reg. 10-1-1 s. 5.A.10).",
          [
            "What counts as a material change?",
            "Is the rationale recorded for each change?",
            "Are changes approved before deployment?",
          ],
          ["Change log", "Change rationale records", "Change approvals"],
        ),
        req(
          "4.3",
          "Quantitative Testing Documentation",
          "Document testing for unfair discrimination",
          "Document the quantitative testing done under the Division's requirements to detect unfair discrimination from ECDIS and models, including methodology, assumptions, results and steps taken to address unfairly discriminatory outcomes (Reg. 10-1-1 s. 5.A.11; C.R.S. 10-3-1104.9(3)(a)).",
          [
            "Which testing methodology and assumptions are used?",
            "Are results recorded for each model and data source?",
            "Are steps taken on adverse results documented?",
          ],
          [
            "Testing methodology",
            "Test results reports",
            "Remediation records",
          ],
        ),
        req(
          "4.4",
          "Ongoing Performance Monitoring",
          "Monitor model performance and drift",
          "Document ongoing monitoring of the performance of algorithms and predictive models that use ECDIS, including how model drift is accounted for (Reg. 10-1-1 s. 5.A.12).",
          [
            "Which performance metrics are monitored and how often?",
            "How is drift detected?",
            "What happens when thresholds are breached?",
          ],
          [
            "Monitoring plan",
            "Monitoring dashboards or reports",
            "Drift alerts and responses",
          ],
        ),
      ],
    },
    {
      key: "5",
      title: "Third-Party Vendors",
      requirements: [
        req(
          "5.1",
          "Vendor Selection and Oversight",
          "Select and oversee vendors of ECDIS and models; stay responsible",
          "Document how external resources and vendors supplying ECDIS, algorithms or predictive models are selected and overseen, including intended use. The insurer stays responsible for meeting every s. 5.A requirement and for producing information the Division asks for, though vendors may send it to the Division directly (Reg. 10-1-1 ss. 5.A.13, 5.B).",
          [
            "Is there a documented vendor selection process for ECDIS and models?",
            "Do contracts let the insurer obtain what the Division may request?",
            "How is vendor performance and compliance overseen?",
          ],
          [
            "Vendor selection procedure",
            "Vendor contracts and data-sharing terms",
            "Vendor oversight reviews",
          ],
        ),
      ],
    },
    {
      key: "6",
      title: "Review, Reporting and Attestation",
      requirements: [
        req(
          "6.1",
          "Annual Framework Review",
          "Review the framework every year",
          "Conduct and document a comprehensive annual review of the governance structure and risk management framework and update the required documentation so it stays accurate and relevant (Reg. 10-1-1 s. 5.A.14).",
          [
            "When was the last comprehensive review?",
            "Were findings and updates documented?",
            "Who approved the review?",
          ],
          [
            "Annual review report",
            "Updated framework documents",
            "Approval record",
          ],
        ),
        req(
          "6.2",
          "Framework Available to the Division",
          "Be ready to produce the framework on request",
          "Have every component of the framework available on request by the Division: life insurers from 1 December 2024 and annually after, auto and health benefit plan insurers from 1 July 2026 and annually after. The Commissioner may examine and investigate ECDIS use and insurers must cooperate (Reg. 10-1-1 s. 5.C; C.R.S. 10-3-1104.9(4)).",
          [
            "Could all framework components be produced promptly?",
            "Is there an owner for regulator requests?",
            "Are vendor-held materials retrievable?",
          ],
          [
            "Framework document index",
            "Regulator request procedure",
            "Prior examination responses",
          ],
        ),
        req(
          "6.3",
          "Annual Compliance Report and Officer Attestation",
          "File the annual compliance report signed by an officer",
          "Insurers using ECDIS must file an annual report (life from 1 December 2024; auto and health from 1 July 2026) summarising compliance with s. 5 and the title and qualifications of each responsible individual and their s. 5 duties, signed by an officer attesting to compliance, or with a corrective action plan if unable to attest. Max 10 pages, filed in SERFF as an Annual Report per insurer (Reg. 10-1-1 ss. 6.B-6.D, 6.G; C.R.S. 10-3-1104.9(3)(b)(V)).",
          [
            "Is the report filed on time for each insurer in the group?",
            "Are responsible individuals and their duties identified?",
            "Has an officer attested, or is a corrective action plan filed?",
          ],
          [
            "Filed SERFF annual report",
            "Signed officer attestation",
            "Corrective action plan (if any)",
          ],
        ),
        req(
          "6.4",
          "Non-Use Attestation and Pre-Use Report",
          "Attest to non-use yearly, and report before starting to use ECDIS",
          "Insurers that do not use ECDIS or models using ECDIS must file an officer-signed attestation of non-use by 1 December each year; if they later plan to use them, they must file the s. 6.B report before use (Reg. 10-1-1 ss. 6.E-6.F).",
          [
            "Has ECDIS non-use been verified across all insurance practices?",
            "Was the non-use attestation filed by 1 December?",
            "Is there a trigger to file the report before ECDIS is first used?",
          ],
          [
            "Signed non-use attestation",
            "SERFF filing confirmation",
            "New-use approval checklist",
          ],
        ),
      ],
    },
  ],
};
