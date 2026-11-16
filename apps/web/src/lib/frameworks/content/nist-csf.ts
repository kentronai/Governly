// NIST Cybersecurity Framework (CSF) 2.0, NIST CSWP 29 (February 26, 2024), Appendix A "CSF Core":
// https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf (US-government work, public domain).
// Structure and identifiers follow the official Core (6 Functions, 22 Categories, 106 Subcategories).
// Guidance text is Governly's own.
import type { FrameworkDefinition, FrameworkRequirement } from "../types";

// A Category with its Subcategories as subcontrols ("1.1" -> "1.1.1", "1.1.2", ...).
const category = (
  key: string,
  title: string,
  summary: string,
  keyQuestions: string[],
  evidenceExamples: string[],
  subs: [id: string, title: string, description: string][],
): FrameworkRequirement => ({
  key,
  title,
  summary,
  description: summary,
  keyQuestions,
  evidenceExamples,
  subcontrols: subs.map(([id, t, description], i) => ({
    key: `${key}.${i + 1}`,
    title: `${id}: ${t}`,
    description,
  })),
});

export const nistCsf: FrameworkDefinition = {
  slug: "nist-csf",
  name: "NIST Cybersecurity Framework 2.0",
  navLabel: "NIST CSF 2.0",
  kind: "framework",
  // Enabled from the Frameworks library (tenant_frameworks), not as a policy.
  policyNames: [],
  description:
    "The CSF 2.0 Core: outcomes across Govern, Identify, Protect, Detect, Respond and Recover for managing cybersecurity risk.",
  source: {
    title: "NIST Cybersecurity Framework (CSF) 2.0 — NIST CSWP 29",
    url: "https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf",
  },
  sections: [
    {
      key: "1",
      title: "GOVERN (GV): Set, communicate and monitor the cybersecurity risk strategy, expectations and policy",
      requirements: [
        category(
          "1.1",
          "GV.OC: Organizational Context",
          "Understand the circumstances behind cybersecurity risk decisions: the mission, what stakeholders expect, what you depend on, and the legal, regulatory and contractual requirements that apply.",
          [
            "How does our mission shape which cybersecurity risks matter most?",
            "Which legal, regulatory and contractual cybersecurity and privacy obligations apply to us?",
            "Which services do others rely on from us, and which do we rely on from others?",
          ],
          [
            "Mission statement mapped to cybersecurity priorities",
            "Register of legal, regulatory and contractual obligations",
            "Dependency map of critical inbound and outbound services",
          ],
          [
            ["GV.OC-01", "Mission informs risk management", "Make sure the organization's mission is understood and used to guide cybersecurity risk management."],
            ["GV.OC-02", "Stakeholder needs understood", "Identify internal and external stakeholders and take their cybersecurity risk management needs and expectations into account."],
            ["GV.OC-03", "Legal and contractual requirements managed", "Understand and manage the legal, regulatory and contractual cybersecurity requirements, including privacy and civil liberties obligations."],
            ["GV.OC-04", "What others depend on from us", "Understand and communicate the critical objectives, capabilities and services that external stakeholders rely on or expect from the organization."],
            ["GV.OC-05", "What we depend on", "Understand and communicate the outcomes, capabilities and services the organization itself relies on."],
          ],
        ),
        category(
          "1.2",
          "GV.RM: Risk Management Strategy",
          "Establish and communicate priorities, constraints, risk appetite and tolerance, and assumptions, and use them to support operational risk decisions.",
          [
            "Have risk appetite and tolerance statements been agreed and communicated?",
            "Is cybersecurity risk part of enterprise risk management?",
            "Do we have one standard method for scoring and prioritizing cybersecurity risks?",
          ],
          [
            "Approved risk appetite and tolerance statements",
            "Risk management methodology document",
            "Enterprise risk register including cybersecurity risks",
          ],
          [
            ["GV.RM-01", "Risk management objectives agreed", "Set risk management objectives and get organizational stakeholders to agree to them."],
            ["GV.RM-02", "Risk appetite and tolerance", "Establish, communicate and keep current statements of risk appetite and risk tolerance."],
            ["GV.RM-03", "Part of enterprise risk management", "Include cybersecurity risk management activities and outcomes in enterprise risk management processes."],
            ["GV.RM-04", "Risk response direction", "Set and communicate strategic direction describing which risk response options are appropriate."],
            ["GV.RM-05", "Lines of communication", "Establish communication lines across the organization for cybersecurity risks, including those from suppliers and other third parties."],
            ["GV.RM-06", "Standard risk method", "Establish and communicate a standard way to calculate, document, categorize and prioritize cybersecurity risks."],
            ["GV.RM-07", "Positive risks considered", "Characterize strategic opportunities (positive risks) and include them in cybersecurity risk discussions."],
          ],
        ),
        category(
          "1.3",
          "GV.RR: Roles, Responsibilities, and Authorities",
          "Define and communicate cybersecurity roles, responsibilities and authorities so there is accountability, performance assessment and continuous improvement.",
          [
            "Is leadership clearly accountable for cybersecurity risk?",
            "Are cybersecurity roles documented, communicated and enforced?",
            "Are resources sufficient for the cybersecurity strategy and roles?",
          ],
          [
            "RACI matrix for cybersecurity responsibilities",
            "Board or executive minutes on cybersecurity risk",
            "Security budget and staffing plan",
          ],
          [
            ["GV.RR-01", "Leadership accountability", "Organizational leadership takes responsibility and accountability for cybersecurity risk and promotes a risk-aware, ethical, continually improving culture."],
            ["GV.RR-02", "Roles defined and enforced", "Establish, communicate, ensure understanding of, and enforce roles, responsibilities and authorities for cybersecurity risk management."],
            ["GV.RR-03", "Adequate resources", "Allocate resources in proportion to the cybersecurity risk strategy, roles, responsibilities and policies."],
            ["GV.RR-04", "Cybersecurity in HR practices", "Build cybersecurity into human resources practices."],
          ],
        ),
        category(
          "1.4",
          "GV.PO: Policy",
          "Establish, communicate and enforce organizational cybersecurity policy.",
          [
            "Is there an approved cybersecurity policy based on our context and strategy?",
            "How often is the policy reviewed and what triggers an update?",
            "How do we confirm staff know and follow the policy?",
          ],
          [
            "Approved cybersecurity policy with version history",
            "Policy review log",
            "Policy acknowledgement records",
          ],
          [
            ["GV.PO-01", "Policy established", "Set a policy for managing cybersecurity risks based on organizational context, strategy and priorities, and communicate and enforce it."],
            ["GV.PO-02", "Policy kept current", "Review and update the policy, then communicate and enforce it, as requirements, threats, technology and mission change."],
          ],
        ),
        category(
          "1.5",
          "GV.OV: Oversight",
          "Use the results of organization-wide cybersecurity risk management activities and performance to inform, improve and adjust the risk management strategy.",
          [
            "Do we review whether the risk strategy is achieving its outcomes?",
            "Does the strategy still cover all organizational requirements and risks?",
            "How is cybersecurity risk management performance measured?",
          ],
          [
            "Periodic strategy review reports",
            "Cybersecurity metrics or KPI dashboard",
            "Records of strategy adjustments and their rationale",
          ],
          [
            ["GV.OV-01", "Outcomes reviewed", "Review the outcomes of the cybersecurity risk management strategy to inform and adjust strategy and direction."],
            ["GV.OV-02", "Strategy coverage reviewed", "Review and adjust the strategy so it covers organizational requirements and risks."],
            ["GV.OV-03", "Performance evaluated", "Evaluate and review cybersecurity risk management performance to find needed adjustments."],
          ],
        ),
        category(
          "1.6",
          "GV.SC: Cybersecurity Supply Chain Risk Management",
          "Identify, establish, manage, monitor and improve processes for managing cyber supply chain risk with organizational stakeholders.",
          [
            "Do we have a supply chain risk management program and know our critical suppliers?",
            "Are cybersecurity requirements written into supplier contracts?",
            "How are supplier risks monitored during and after the relationship?",
          ],
          [
            "Supplier inventory ranked by criticality",
            "Contract clauses with security requirements",
            "Supplier due diligence and ongoing assessment records",
          ],
          [
            ["GV.SC-01", "Supply chain program", "Establish a cyber supply chain risk management program, strategy, objectives, policies and processes agreed by stakeholders."],
            ["GV.SC-02", "Third-party roles", "Establish, communicate and coordinate cybersecurity roles and responsibilities for suppliers, customers and partners, internally and externally."],
            ["GV.SC-03", "Integrated with risk management", "Integrate cyber supply chain risk management into cybersecurity and enterprise risk management, risk assessment and improvement processes."],
            ["GV.SC-04", "Suppliers known and prioritized", "Know who your suppliers are and prioritize them by criticality."],
            ["GV.SC-05", "Requirements in contracts", "Set and prioritize requirements for supply chain cybersecurity risk and build them into contracts and agreements with suppliers and relevant third parties."],
            ["GV.SC-06", "Due diligence before engagement", "Plan and perform due diligence to reduce risk before entering formal supplier or third-party relationships."],
            ["GV.SC-07", "Supplier risk managed over time", "Understand, record, prioritize, assess, respond to and monitor risks from suppliers, their products and services, and other third parties throughout the relationship."],
            ["GV.SC-08", "Suppliers in incident activities", "Include relevant suppliers and third parties in incident planning, response and recovery."],
            ["GV.SC-09", "Supply chain practices monitored", "Integrate supply chain security practices into cybersecurity and enterprise risk programs and monitor their performance across the product and service life cycle."],
            ["GV.SC-10", "Post-relationship provisions", "Make supply chain risk plans cover activities that happen after a partnership or service agreement ends."],
          ],
        ),
      ],
    },
    {
      key: "2",
      title: "IDENTIFY (ID): Understand the organization's current cybersecurity risks",
      requirements: [
        category(
          "2.1",
          "ID.AM: Asset Management",
          "Identify and manage the assets (data, hardware, software, systems, facilities, services, people) that support business purposes, in line with their importance and the risk strategy.",
          [
            "Do we keep current inventories of hardware, software, services and data?",
            "Are network data flows documented?",
            "How are assets prioritized and managed across their life cycle?",
          ],
          [
            "Hardware and software asset inventories",
            "Network and data flow diagrams",
            "Data inventory with classification",
          ],
          [
            ["ID.AM-01", "Hardware inventory", "Maintain inventories of hardware the organization manages."],
            ["ID.AM-02", "Software, services and systems inventory", "Maintain inventories of software, services and systems the organization manages."],
            ["ID.AM-03", "Network and data flows", "Maintain representations of authorized network communication and internal and external network data flows."],
            ["ID.AM-04", "Supplier services inventory", "Maintain inventories of services provided by suppliers."],
            ["ID.AM-05", "Asset prioritization", "Prioritize assets by classification, criticality, resources and impact on the mission."],
            ["ID.AM-07", "Data inventory", "Maintain inventories of data and related metadata for designated data types."],
            ["ID.AM-08", "Life cycle management", "Manage systems, hardware, software, services and data throughout their life cycles."],
          ],
        ),
        category(
          "2.2",
          "ID.RA: Risk Assessment",
          "Understand the cybersecurity risk to the organization, its assets and individuals.",
          [
            "How are vulnerabilities and threats identified and recorded?",
            "How do we decide and track risk responses?",
            "Do we assess suppliers and the integrity of hardware and software before acquiring them?",
          ],
          [
            "Risk assessment reports and risk register",
            "Vulnerability scan results and threat intelligence feeds",
            "Vulnerability disclosure policy",
          ],
          [
            ["ID.RA-01", "Vulnerabilities identified", "Identify, validate and record vulnerabilities in assets."],
            ["ID.RA-02", "Threat intelligence received", "Receive cyber threat intelligence from information-sharing forums and sources."],
            ["ID.RA-03", "Threats identified", "Identify and record internal and external threats to the organization."],
            ["ID.RA-04", "Impact and likelihood", "Identify and record the potential impact and likelihood of threats exploiting vulnerabilities."],
            ["ID.RA-05", "Inherent risk understood", "Use threats, vulnerabilities, likelihoods and impacts to understand inherent risk and prioritize risk responses."],
            ["ID.RA-06", "Risk responses managed", "Choose, prioritize, plan, track and communicate risk responses."],
            ["ID.RA-07", "Changes and exceptions", "Manage changes and exceptions, assess their risk impact, and record and track them."],
            ["ID.RA-08", "Vulnerability disclosures", "Set up processes to receive, analyze and respond to vulnerability disclosures."],
            ["ID.RA-09", "Hardware and software integrity", "Assess the authenticity and integrity of hardware and software before acquiring and using them."],
            ["ID.RA-10", "Critical suppliers assessed", "Assess critical suppliers before acquisition."],
          ],
        ),
        category(
          "2.3",
          "ID.IM: Improvement",
          "Identify improvements to cybersecurity risk management processes, procedures and activities across all CSF Functions.",
          [
            "Where do improvement actions come from: evaluations, tests, exercises, operations?",
            "Are suppliers and third parties included in tests and exercises?",
            "Are incident response and other operational plans maintained and improved?",
          ],
          [
            "Lessons-learned and improvement action log",
            "Exercise and penetration test reports",
            "Incident response plan with revision history",
          ],
          [
            ["ID.IM-01", "Improvements from evaluations", "Identify improvements from evaluations."],
            ["ID.IM-02", "Improvements from tests and exercises", "Identify improvements from security tests and exercises, including those run with suppliers and relevant third parties."],
            ["ID.IM-03", "Improvements from operations", "Identify improvements from carrying out operational processes, procedures and activities."],
            ["ID.IM-04", "Plans maintained and improved", "Establish, communicate, maintain and improve incident response plans and other cybersecurity plans that affect operations."],
          ],
        ),
      ],
    },
    {
      key: "3",
      title: "PROTECT (PR): Use safeguards to manage the organization's cybersecurity risks",
      requirements: [
        category(
          "3.1",
          "PR.AA: Identity Management, Authentication, and Access Control",
          "Limit physical and logical access to authorized users, services and hardware, managed in proportion to the assessed risk of unauthorized access.",
          [
            "How are identities and credentials issued, managed and revoked?",
            "Is access based on least privilege and separation of duties, and reviewed?",
            "How is physical access to assets controlled and monitored?",
          ],
          [
            "Identity and access management policy",
            "Access review records",
            "MFA configuration and physical access logs",
          ],
          [
            ["PR.AA-01", "Identities and credentials managed", "Manage identities and credentials for authorized users, services and hardware."],
            ["PR.AA-02", "Identity proofing", "Proof identities and bind them to credentials based on the context of interactions."],
            ["PR.AA-03", "Authentication", "Authenticate users, services and hardware."],
            ["PR.AA-04", "Identity assertions protected", "Protect, convey and verify identity assertions."],
            ["PR.AA-05", "Access permissions", "Define access permissions, entitlements and authorizations in policy; manage, enforce and review them using least privilege and separation of duties."],
            ["PR.AA-06", "Physical access", "Manage, monitor and enforce physical access to assets in proportion to risk."],
          ],
        ),
        category(
          "3.2",
          "PR.AT: Awareness and Training",
          "Give personnel cybersecurity awareness and training so they can perform their cybersecurity-related tasks.",
          [
            "Does all staff receive cybersecurity awareness training?",
            "Do people in specialized roles get role-specific training?",
            "How do we measure training completion and effectiveness?",
          ],
          [
            "Training curriculum and completion records",
            "Role-based training plans",
            "Phishing simulation results",
          ],
          [
            ["PR.AT-01", "General awareness and training", "Train personnel so they have the knowledge and skills to do general tasks with cybersecurity risks in mind."],
            ["PR.AT-02", "Specialized role training", "Train people in specialized roles so they have the knowledge and skills to do their tasks with cybersecurity risks in mind."],
          ],
        ),
        category(
          "3.3",
          "PR.DS: Data Security",
          "Manage data in line with the risk strategy to protect the confidentiality, integrity and availability of information.",
          [
            "How is data protected at rest, in transit and in use?",
            "Are backups created, protected and tested?",
            "Are protections matched to data classification?",
          ],
          [
            "Encryption standards and key management records",
            "Backup schedules and restore test results",
            "Data loss prevention configuration",
          ],
          [
            ["PR.DS-01", "Data at rest", "Protect the confidentiality, integrity and availability of data at rest."],
            ["PR.DS-02", "Data in transit", "Protect the confidentiality, integrity and availability of data in transit."],
            ["PR.DS-10", "Data in use", "Protect the confidentiality, integrity and availability of data in use."],
            ["PR.DS-11", "Backups", "Create, protect, maintain and test backups of data."],
          ],
        ),
        category(
          "3.4",
          "PR.PS: Platform Security",
          "Manage the hardware, software (firmware, operating systems, applications) and services of physical and virtual platforms in line with the risk strategy.",
          [
            "Are secure configuration baselines defined and applied?",
            "Are logs generated and available for monitoring?",
            "Is secure development built into the software life cycle?",
          ],
          [
            "Configuration baselines and hardening standards",
            "Patch management and end-of-life records",
            "Secure SDLC policy and code review records",
          ],
          [
            ["PR.PS-01", "Configuration management", "Establish and apply configuration management practices."],
            ["PR.PS-02", "Software maintenance", "Maintain, replace and remove software in proportion to risk."],
            ["PR.PS-03", "Hardware maintenance", "Maintain, replace and remove hardware in proportion to risk."],
            ["PR.PS-04", "Logging", "Generate log records and make them available for continuous monitoring."],
            ["PR.PS-05", "Unauthorized software prevented", "Prevent installation and execution of unauthorized software."],
            ["PR.PS-06", "Secure software development", "Integrate secure software development practices and monitor their performance throughout the development life cycle."],
          ],
        ),
        category(
          "3.5",
          "PR.IR: Technology Infrastructure Resilience",
          "Manage security architectures in line with the risk strategy to protect assets and keep the organization resilient.",
          [
            "How are networks and environments segmented and protected from unauthorized access?",
            "Are resilience requirements defined and met in normal and adverse conditions?",
            "Is capacity monitored to keep services available?",
          ],
          [
            "Network architecture and segmentation diagrams",
            "Business continuity and redundancy design",
            "Capacity monitoring reports",
          ],
          [
            ["PR.IR-01", "Network protection", "Protect networks and environments from unauthorized logical access and use."],
            ["PR.IR-02", "Environmental threats", "Protect technology assets from environmental threats."],
            ["PR.IR-03", "Resilience mechanisms", "Implement mechanisms that meet resilience requirements in normal and adverse situations."],
            ["PR.IR-04", "Capacity", "Maintain enough resource capacity to keep services available."],
          ],
        ),
      ],
    },
    {
      key: "4",
      title: "DETECT (DE): Find and analyze possible cybersecurity attacks and compromises",
      requirements: [
        category(
          "4.1",
          "DE.CM: Continuous Monitoring",
          "Monitor assets to find anomalies, indicators of compromise and other potentially adverse events.",
          [
            "Which networks, systems and environments are monitored?",
            "Are personnel activity and external provider activity monitored?",
            "Is the physical environment monitored?",
          ],
          [
            "SIEM or monitoring tool coverage list",
            "Alert rules and use cases",
            "Third-party service monitoring reports",
          ],
          [
            ["DE.CM-01", "Network monitoring", "Monitor networks and network services for potentially adverse events."],
            ["DE.CM-02", "Physical monitoring", "Monitor the physical environment for potentially adverse events."],
            ["DE.CM-03", "Personnel and usage monitoring", "Monitor personnel activity and technology use for potentially adverse events."],
            ["DE.CM-06", "Service provider monitoring", "Monitor external service provider activities and services for potentially adverse events."],
            ["DE.CM-09", "Computing and runtime monitoring", "Monitor computing hardware and software, runtime environments and their data for potentially adverse events."],
          ],
        ),
        category(
          "4.2",
          "DE.AE: Adverse Event Analysis",
          "Analyze anomalies, indicators of compromise and other potentially adverse events to characterize them and detect incidents.",
          [
            "How are alerts analyzed and correlated across sources?",
            "Is threat intelligence used during analysis?",
            "What criteria are used to declare an incident?",
          ],
          [
            "Alert triage procedures",
            "Documented incident declaration criteria",
            "Event analysis tickets and correlation rules",
          ],
          [
            ["DE.AE-02", "Events analyzed", "Analyze potentially adverse events to better understand the related activity."],
            ["DE.AE-03", "Correlation", "Correlate information from multiple sources."],
            ["DE.AE-04", "Impact and scope estimated", "Understand the estimated impact and scope of adverse events."],
            ["DE.AE-06", "Information shared", "Give information on adverse events to authorized staff and tools."],
            ["DE.AE-07", "Threat intelligence in analysis", "Integrate cyber threat intelligence and other context into the analysis."],
            ["DE.AE-08", "Incidents declared", "Declare incidents when adverse events meet defined incident criteria."],
          ],
        ),
      ],
    },
    {
      key: "5",
      title: "RESPOND (RS): Take action on detected cybersecurity incidents",
      requirements: [
        category(
          "5.1",
          "RS.MA: Incident Management",
          "Manage responses to detected cybersecurity incidents.",
          [
            "Is the incident response plan executed with relevant third parties once an incident is declared?",
            "How are incidents triaged, categorized, prioritized and escalated?",
            "When do recovery criteria kick in?",
          ],
          [
            "Incident response plan and playbooks",
            "Incident tickets showing triage and prioritization",
            "Escalation matrix",
          ],
          [
            ["RS.MA-01", "Plan executed", "Execute the incident response plan, coordinating with relevant third parties, once an incident is declared."],
            ["RS.MA-02", "Triage and validation", "Triage and validate incident reports."],
            ["RS.MA-03", "Categorization and prioritization", "Categorize and prioritize incidents."],
            ["RS.MA-04", "Escalation", "Escalate or elevate incidents as needed."],
            ["RS.MA-05", "Recovery criteria applied", "Apply the criteria for starting incident recovery."],
          ],
        ),
        category(
          "5.2",
          "RS.AN: Incident Analysis",
          "Investigate incidents to support an effective response, forensics and recovery.",
          [
            "Do we determine what happened and the root cause?",
            "Are investigation actions and incident data recorded with integrity and provenance preserved?",
            "How is an incident's magnitude estimated and validated?",
          ],
          [
            "Root cause analysis reports",
            "Forensic evidence and chain-of-custody records",
            "Investigation logs",
          ],
          [
            ["RS.AN-03", "Root cause analysis", "Analyze what happened during an incident and its root cause."],
            ["RS.AN-06", "Investigation actions recorded", "Record actions taken during an investigation and preserve the records' integrity and provenance."],
            ["RS.AN-07", "Incident data collected", "Collect incident data and metadata and preserve their integrity and provenance."],
            ["RS.AN-08", "Magnitude estimated", "Estimate and validate the magnitude of an incident."],
          ],
        ),
        category(
          "5.3",
          "RS.CO: Incident Response Reporting and Communication",
          "Coordinate response activities with internal and external stakeholders as laws, regulations or policies require.",
          [
            "Who must be notified of incidents, and within what timeframes?",
            "Are notification templates and contacts kept up to date?",
            "What information is shared with designated stakeholders?",
          ],
          [
            "Incident communication plan and contact list",
            "Regulatory and customer notification records",
            "Information-sharing records",
          ],
          [
            ["RS.CO-02", "Stakeholders notified", "Notify internal and external stakeholders of incidents."],
            ["RS.CO-03", "Information shared", "Share information with designated internal and external stakeholders."],
          ],
        ),
        category(
          "5.4",
          "RS.MI: Incident Mitigation",
          "Act to stop an event from spreading and mitigate its effects.",
          [
            "How are incidents contained?",
            "How do we confirm a threat has been eradicated?",
            "Are containment and eradication steps documented in playbooks?",
          ],
          [
            "Containment and eradication playbooks",
            "Incident tickets with containment actions",
            "Post-eradication verification records",
          ],
          [
            ["RS.MI-01", "Containment", "Contain incidents."],
            ["RS.MI-02", "Eradication", "Eradicate incidents."],
          ],
        ),
      ],
    },
    {
      key: "6",
      title: "RECOVER (RC): Restore assets and operations affected by a cybersecurity incident",
      requirements: [
        category(
          "6.1",
          "RC.RP: Incident Recovery Plan Execution",
          "Restore systems and services affected by cybersecurity incidents so they are operationally available.",
          [
            "Is the recovery part of the incident response plan executed when triggered?",
            "Are backups and restored assets verified for integrity?",
            "What criteria declare recovery complete?",
          ],
          [
            "Recovery plan and runbooks",
            "Backup integrity checks and restore records",
            "Recovery completion sign-off",
          ],
          [
            ["RC.RP-01", "Recovery plan executed", "Execute the recovery portion of the incident response plan once the response process initiates it."],
            ["RC.RP-02", "Recovery actions", "Select, scope, prioritize and perform recovery actions."],
            ["RC.RP-03", "Backup integrity verified", "Verify the integrity of backups and other restoration assets before using them."],
            ["RC.RP-04", "Post-incident norms", "Consider critical mission functions and cybersecurity risk management when setting post-incident operational norms."],
            ["RC.RP-05", "Restoration confirmed", "Verify the integrity of restored assets, restore systems and services, and confirm normal operating status."],
            ["RC.RP-06", "Recovery closed", "Declare the end of recovery based on criteria and complete incident documentation."],
          ],
        ),
        category(
          "6.2",
          "RC.CO: Incident Recovery Communication",
          "Coordinate restoration activities with internal and external parties.",
          [
            "Who receives updates on recovery progress?",
            "Who approves public messaging about recovery?",
            "Through which channels are recovery updates shared?",
          ],
          [
            "Recovery communication plan",
            "Stakeholder status updates",
            "Approved public statements",
          ],
          [
            ["RC.CO-03", "Recovery progress communicated", "Communicate recovery activities and progress to designated internal and external stakeholders."],
            ["RC.CO-04", "Public updates", "Share public updates on recovery using approved methods and messaging."],
          ],
        ),
      ],
    },
  ],
};
