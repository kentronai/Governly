import type { FrameworkDefinition } from "../types";
import { clause } from "../helpers";

// Management system clauses 4-10 of ISO/IEC 42001:2023. Annex A controls are not included yet.
export const iso42001: FrameworkDefinition = {
  slug: "iso-42001",
  name: "ISO/IEC 42001",
  navLabel: "ISO/IEC 42001",
  kind: "framework",
  // Enabled from the Frameworks library (tenant_frameworks), not as a policy.
  policyNames: [],
  description:
    "The core requirements from Clauses 4-10 that define what your AI management system (AIMS) must include.",
  source: {
    title: "ISO/IEC 42001:2023 — Artificial intelligence management system",
    url: "https://www.iso.org/standard/81230.html",
  },
  sections: [
    {
      key: "4",
      title: "Clause 4: Context of the Organization",
      requirements: [
        clause(
          "4.1",
          "Understanding the organization and its context",
          "Determine external and internal issues relevant to the organization's purpose and its AIMS, including AI principles/values and strategic direction.",
          [
            "What internal factors (culture, resources, knowledge) influence our AIMS?",
            "What external factors (legal, ethical, market, social, technological) influence our AIMS?",
            "How does our use/development of AI align with our business strategy?",
            "What are our organization's guiding principles or values related to AI?",
          ],
          [
            "Context analysis document (PESTLE, SWOT focused on AI)",
            "Documentation of internal/external issues",
            "Strategic planning documents referencing AI",
            "Documented AI Principles/Ethics Statement",
          ],
        ),
        clause(
          "4.2",
          "Understanding the needs and expectations of interested parties",
          "Identify interested parties relevant to the AIMS and their requirements/expectations concerning AI.",
          [
            "Who are the interested parties for our AI systems (customers, users, regulators, employees, public, partners)?",
            "What are their relevant needs, expectations, and requirements (legal, ethical, contractual) regarding our AI?",
            "How do we capture and review these requirements?",
          ],
          [
            "Stakeholder analysis matrix/register",
            "List of applicable legal/regulatory requirements for AI",
            "Records of communication with stakeholders",
            "Contractual requirements related to AI",
          ],
        ),
        clause(
          "4.3",
          "Determining the scope of the AI Management System",
          "Define the boundaries and applicability of the AIMS within the organization.",
          [
            "What organizational units, processes, locations are included in the AIMS?",
            "Which specific AI systems or applications are covered by the AIMS?",
            "What stages of the AI lifecycle are included?",
            "Are there any exclusions, and what is the justification?",
          ],
          ["Documented AIMS Scope Statement"],
        ),
        clause(
          "4.4",
          "AI Management System",
          "Establish, implement, maintain, and continually improve the AIMS in accordance with ISO 42001 requirements.",
          [
            "Do we have the necessary processes and documentation established for the AIMS?",
            "Are these processes being followed (implemented)?",
            "Are there mechanisms for maintaining and updating the AIMS?",
            "Is there a process for continual improvement of the AIMS?",
          ],
          [
            "The AIMS documentation itself (policies, procedures)",
            "Records of implementation activities",
            "Management review records",
            "Audit results",
          ],
        ),
      ],
    },
    {
      key: "5",
      title: "Clause 5: Leadership",
      requirements: [
        clause(
          "5.1",
          "Leadership and commitment",
          "Top management must demonstrate leadership by ensuring policy/objectives alignment, resource availability, integration, communication, and promoting improvement.",
          [
            "How does top management show active involvement and support for the AIMS?",
            "Are AIMS objectives aligned with strategic goals?",
            "Are sufficient resources allocated?",
            "Is the importance of AI governance communicated effectively?",
            "How are ethical considerations promoted by leadership?",
          ],
          [
            "Management meeting minutes discussing AIMS",
            "Resource allocation records (budget, staffing)",
            "Internal communications from leadership",
            "Published AI Policy signed by management",
          ],
        ),
        clause(
          "5.2",
          "Policy",
          "Establish, communicate, and maintain an AI Policy appropriate to the organization's context.",
          [
            "Is there a documented AI Policy?",
            "Does it include commitments to requirements and continual improvement?",
            "Does it align with organizational AI principles/ethics?",
            "Is it communicated and understood by relevant personnel?",
            "Is it available to relevant interested parties?",
          ],
          [
            "The documented AI Policy",
            "Communication records (emails, intranet posts)",
            "Training materials covering the policy",
          ],
        ),
        clause(
          "5.3",
          "Organizational roles, responsibilities, and authorities",
          "Assign and communicate responsibilities and authorities for roles relevant to the AIMS.",
          [
            "Who is ultimately accountable for the AIMS?",
            "Who is responsible for specific AIMS tasks (risk assessment, control implementation, audits, reporting)?",
            "Are these roles, responsibilities, and authorities documented and communicated?",
          ],
          [
            "Organization chart showing AIMS roles",
            "Documented role descriptions",
            "Responsibility Assignment Matrix (RACI)",
          ],
        ),
      ],
    },
    {
      key: "6",
      title: "Clause 6: Planning",
      requirements: [
        clause(
          "6.1.1",
          "General — actions to address risks and opportunities",
          "When planning for the AIMS, consider the issues from 4.1, requirements from 4.2, and determine risks and opportunities that need to be addressed to ensure the AIMS can achieve its intended outcomes, prevent or reduce undesired effects, and achieve continual improvement.",
          [
            "Have we identified risks and opportunities considering the context (4.1) and interested parties (4.2)?",
            "Do our planned actions integrate into AIMS processes?",
            "How do we evaluate the effectiveness of these actions?",
          ],
          [
            "Risk and opportunity register linked to context analysis",
            "Planning records showing integration into AIMS processes",
            "Effectiveness evaluation records",
          ],
        ),
        clause(
          "6.1.2",
          "AI risk assessment",
          "Define and apply an AI risk assessment process that establishes risk criteria, identifies risks to individuals, groups, and societies from AI systems, analyzes and evaluates those risks, and selects treatment options.",
          [
            "Is there a documented AI risk assessment methodology with defined risk criteria?",
            "Are risks to individuals, groups, and societies from AI systems systematically identified?",
            "How are identified risks analyzed (likelihood, severity, affected parties)?",
            "How are risks evaluated against acceptance criteria?",
          ],
          [
            "AI risk assessment methodology document",
            "Risk criteria definitions (likelihood scales, impact scales, acceptance thresholds)",
            "AI risk assessment reports per system",
            "Risk register with analysis and evaluation results",
          ],
        ),
        clause(
          "6.1.3",
          "AI risk treatment",
          "Define and apply an AI risk treatment process to select appropriate treatment options, determine controls (referencing Annex A), produce a Statement of Applicability, and formulate a risk treatment plan.",
          [
            "How are risk treatment options selected for each identified AI risk?",
            "Is there a Statement of Applicability (SoA) documenting which Annex A controls apply and which are excluded with justification?",
            "Is there a documented risk treatment plan with owners, timelines, and resources?",
            "Have risk owners approved the risk treatment plan and accepted residual risks?",
          ],
          [
            "AI risk treatment plan",
            "Statement of Applicability (SoA)",
            "Risk owner approval records",
            "Residual risk acceptance documentation",
          ],
        ),
        clause(
          "6.1.4",
          "AI system impact assessment",
          "Define and apply an AI system impact assessment process to assess potential consequences — positive and negative — of AI systems on individuals, groups, and societies, considering the AI system lifecycle.",
          [
            "Is there a documented impact assessment methodology for AI systems?",
            "Are both positive and negative impacts on individuals, groups, and societies assessed?",
            "At which lifecycle stages are impact assessments conducted or updated?",
            "How are impact assessment results fed into risk treatment and system design decisions?",
          ],
          [
            "AI impact assessment methodology",
            "Completed impact assessment reports per AI system",
            "Records linking impact findings to design or treatment decisions",
          ],
        ),
        clause(
          "6.2",
          "AI objectives and planning to achieve them",
          "Establish measurable AIMS objectives aligned with the AI policy and plan how to achieve them.",
          [
            "What are the specific, measurable objectives for our AIMS?",
            "Are they consistent with the AI policy and organizational goals?",
            "What actions, resources, responsibilities, and timelines are defined to achieve these objectives?",
            "How will the achievement of objectives be evaluated?",
          ],
          [
            "Documented AIMS Objectives",
            "Action plans linked to objectives",
            "Performance indicators (KPIs) for objectives",
            "Management review records discussing objectives progress",
          ],
        ),
        clause(
          "6.3",
          "Planning of changes",
          "When the organization determines the need for changes to the AIMS, the changes shall be carried out in a planned manner.",
          [
            "Is there a defined process for planning changes to the AIMS?",
            "Are changes assessed for their impact on AIMS integrity, AI risk assessments, and the Statement of Applicability before implementation?",
            "Are responsibilities, timelines, and resources for changes documented?",
          ],
          [
            "Change management procedure for the AIMS",
            "Change request and impact assessment records",
            "Approval records for AIMS changes",
            "Post-change review records",
          ],
        ),
      ],
    },
    {
      key: "7",
      title: "Clause 7: Support",
      requirements: [
        clause(
          "7.1",
          "Resources",
          "Determine and provide the resources needed for the AIMS.",
          [
            "What resources (human, financial, technological, infrastructure) are needed?",
            "Have these resources been identified and allocated?",
          ],
          [
            "Budget approvals",
            "Staffing plans",
            "Technology acquisition records",
            "Facility plans",
          ],
        ),
        clause(
          "7.2",
          "Competence",
          "Ensure personnel involved in the AIMS are competent based on education, training, or experience.",
          [
            "What competencies are required for different AIMS roles?",
            "How do we ensure individuals possess these competencies?",
            "Are training needs identified and addressed?",
            "Is competence maintained and documented?",
          ],
          [
            "Job descriptions with competency requirements",
            "Competency matrix",
            "Training plans and records",
            "Performance reviews",
            "Certifications",
          ],
        ),
        clause(
          "7.3",
          "Awareness",
          "Ensure relevant personnel are aware of the AI policy, their contribution, and the implications of non-conformance.",
          [
            "Are staff aware of the AI Policy?",
            "Do they understand how their work contributes to the AIMS and AI ethics?",
            "Are they aware of the benefits of effective AI governance and risks of failure?",
            "How is this awareness created and maintained?",
          ],
          [
            "Awareness training materials and attendance logs",
            "Internal communications (newsletters, posters)",
            "Onboarding materials",
          ],
        ),
        clause(
          "7.4",
          "Communication",
          "Determine and implement internal and external communications relevant to the AIMS.",
          [
            "What needs to be communicated about the AIMS?",
            "When, how, and with whom does communication occur (internal & external)?",
            "Who is responsible for communication?",
          ],
          [
            "Communication plan/matrix",
            "Records of communications (meeting minutes, emails, public statements)",
          ],
        ),
        clause(
          "7.5",
          "Documented information",
          "Manage documented information required by the standard and necessary for AIMS effectiveness (creation, update, control, availability, protection).",
          [
            "What documentation is required by ISO 42001?",
            "What other documentation do we need for our AIMS to be effective?",
            "How do we ensure documents are properly identified, formatted, reviewed, approved, version controlled, available, and protected?",
          ],
          [
            "Document control procedure",
            "Master document list / Document register",
            "Version history in documents",
            "Access control records",
            "Backup procedures",
          ],
        ),
      ],
    },
    {
      key: "8",
      title: "Clause 8: Operation",
      requirements: [
        clause(
          "8.1",
          "Operational planning and control",
          "Plan, implement, and control processes to meet requirements, implement actions from Clause 6, manage changes, and control outsourced processes.",
          [
            "How are operational processes (related to AI development/deployment/use) planned and controlled?",
            "How are changes to these processes or AI systems managed?",
            "How do we control processes outsourced to third parties that affect the AIMS?",
          ],
          [
            "Standard Operating Procedures (SOPs) for AI lifecycle stages",
            "Change management procedures and records",
            "Supplier contracts and oversight procedures",
          ],
        ),
        clause(
          "8.2",
          "AI risk assessment (Operational)",
          "Perform AI risk assessments operationally (at planned intervals or upon significant changes).",
          [
            "How often are AI risk assessments reviewed and updated?",
            "What triggers an ad-hoc risk assessment (e.g., new system, major change, incident)?",
          ],
          [
            "Schedule/plan for risk assessment reviews",
            "Updated risk assessment reports",
          ],
        ),
        clause(
          "8.3",
          "AI risk treatment (Operational)",
          "Implement the AI risk treatment plan.",
          [
            "Are the controls defined in the risk treatment plan actually implemented?",
            "Is there evidence of control operation?",
          ],
          [
            "Records of control implementation (configuration settings, logs, procedure execution records)",
            "Completed checklists",
            "Training records related to specific controls",
          ],
        ),
        clause(
          "8.4",
          "AI system lifecycle",
          "Define and implement processes for managing the entire AI system lifecycle consistent with policy, objectives, and impact assessments.",
          [
            "Do we have documented processes for each stage (requirements, design, data handling, model building, V&V, deployment, operation, monitoring, retirement)?",
            "How are AI principles (fairness, transparency etc.) embedded in these processes?",
            "How is documentation managed throughout the lifecycle?",
            "How are results from impact assessments considered during the lifecycle?",
          ],
          [
            "Documented AI system lifecycle process description",
            "Project plans",
            "Requirements specifications",
            "Design documents",
            "Data processing procedures",
            "Model training logs",
            "Verification & Validation reports",
            "Deployment procedures",
            "Monitoring procedures and logs",
            "Retirement plans",
          ],
        ),
      ],
    },
    {
      key: "9",
      title: "Clause 9: Performance Evaluation",
      requirements: [
        clause(
          "9.1",
          "Monitoring, measurement, analysis, and evaluation",
          "Determine what needs monitoring/measuring, the methods, frequency, and how results are analyzed/evaluated.",
          [
            "What aspects of the AIMS and AI systems are monitored/measured?",
            "What methods are used?",
            "How often is data collected and analyzed?",
            "Who analyzes/evaluates?",
            "How are results used?",
          ],
          [
            "Monitoring procedure",
            "Defined metrics/KPIs",
            "Monitoring logs/reports",
            "Performance dashboards",
            "Analysis reports",
          ],
        ),
        clause(
          "9.2",
          "Internal audit",
          "Conduct internal audits at planned intervals to ensure the AIMS conforms to requirements and is effectively implemented.",
          [
            "Is there an audit program?",
            "Are audits conducted by objective auditors?",
            "Are criteria/scope defined?",
            "Are results reported?",
            "Are nonconformities addressed?",
          ],
          [
            "Internal audit procedure",
            "Audit programme/schedule",
            "Audit plans/reports",
            "Auditor competence records",
            "Nonconformity reports",
          ],
        ),
        clause(
          "9.3",
          "Management review",
          "Top management must review the AIMS at planned intervals to ensure its continuing suitability, adequacy, and effectiveness.",
          [
            "Are reviews conducted regularly?",
            "Does review cover required inputs?",
            "Are decisions made regarding improvements/changes?",
            "Are minutes documented?",
          ],
          [
            "Management review procedure",
            "Review schedule/agendas/minutes",
            "Action items tracker",
          ],
        ),
      ],
    },
    {
      key: "10",
      title: "Clause 10: Improvement",
      requirements: [
        clause(
          "10.1",
          "Nonconformity and corrective action",
          "React to nonconformities, evaluate need for action, implement corrective actions, review effectiveness, and update AIMS if needed.",
          [
            "Is there a process for nonconformities?",
            "How is correction handled?",
            "Is root cause analysis performed?",
            "How are corrective actions tracked and verified?",
            "Are changes made to AIMS?",
          ],
          [
            "Corrective action procedure",
            "Nonconformity register",
            "Root cause analysis records",
            "Corrective action plans/verification",
          ],
        ),
        clause(
          "10.2",
          "Continual improvement",
          "Continually improve the suitability, adequacy, and effectiveness of the AIMS.",
          [
            "How does the organization use results to drive improvement?",
            "Is there evidence of ongoing efforts?",
          ],
          [
            "Management review outputs",
            "Updated policies/procedures",
            "Improvement project records",
            "Trend analysis",
          ],
        ),
      ],
    },
  ],
};
