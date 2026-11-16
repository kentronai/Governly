import type { FrameworkDefinition } from "../types";
import { req } from "../helpers";

// UAE Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data (PDPL),
// in force 2 January 2022. Article numbers follow the official Arabic text.
// Guidance text is Governly's own.
export const uaePdpl: FrameworkDefinition = {
  slug: "uae-pdpl",
  name: "UAE Personal Data Protection Law",
  navLabel: "UAE PDPL",
  kind: "regulation",
  policyNames: ["UAE Personal Data Protection Law"],
  description:
    "The UAE federal Personal Data Protection Law (Federal Decree-Law No. 45 of 2021), in force since 2 January 2022: lawful processing, controller and processor duties, data protection officers, data-subject rights including objection to automated decisions, security, breach notification, impact assessments and cross-border transfers. It does not apply to government data, regulated health or banking data, or free zones with their own data protection laws (for example DIFC and ADGM). As of the latest sources checked (October 2026) the executive regulations had not been published, so breach-notification timelines, DPO volume thresholds and transfer conditions are not yet set; under Art. 29, organisations have six months from their issuance to comply.",
  source: {
    title:
      "Federal Decree-Law No. 45 of 2021 Regarding the Protection of Personal Data (u.ae, official Arabic text)",
    url: "https://u.ae/en/about-the-uae/digital-uae/data/data-protection-laws",
  },
  sections: [
    {
      key: "1",
      title: "Lawful Processing",
      requirements: [
        req(
          "1.1",
          "Consent or a Listed Exception",
          "Process personal data only with consent or a listed exception",
          "Processing without the data subject's consent is prohibited unless an Art. 4 exception applies, such as public interest, data the subject made public, legal claims, contract performance, employment or social protection obligations, healthcare, public health, archiving or research, the subject's interests, or another legal obligation (Art. 4).",
          [
            "Is a consent or Art. 4 basis recorded for each processing activity?",
            "Is the chosen exception actually necessary for the purpose?",
            "Are bases reviewed when purposes change?",
          ],
          [
            "Processing register with legal basis",
            "Exception justification memos",
            "Consent records",
          ],
        ),
        req(
          "1.2",
          "Processing Principles",
          "Apply fairness, purpose limitation, minimisation, accuracy and storage limits",
          "Process data fairly, transparently and lawfully; collect it for a specific, clear purpose; keep it adequate and limited to what is necessary; keep it accurate and updated, with measures to erase or correct inaccurate data; keep it secure; and do not retain it once the purpose is exhausted unless the subject is anonymised (Art. 5).",
          [
            "Are purposes defined before collection?",
            "Are retention periods set and enforced?",
            "Is there a process to correct or erase inaccurate data?",
          ],
          [
            "Purpose and retention register",
            "Data minimisation review",
            "Data quality procedure",
          ],
        ),
        req(
          "1.3",
          "Valid and Withdrawable Consent",
          "Be able to prove clear consent and allow easy withdrawal",
          "Where processing relies on consent, the controller must be able to prove it; consent must be clear, simple, unambiguous and accessible (written or electronic), state the right to withdraw, and withdrawal must be easy and available at any time (Art. 6).",
          [
            "Can consent be evidenced for each data subject?",
            "Does the consent text state the right to withdraw?",
            "Is withdrawal as easy as giving consent?",
          ],
          [
            "Consent capture records",
            "Consent wording",
            "Withdrawal mechanism",
          ],
        ),
      ],
    },
    {
      key: "2",
      title: "Controller and Processor Obligations",
      requirements: [
        req(
          "2.1",
          "Protection by Design and by Default",
          "Build in protective measures and limit default processing",
          "Controllers must apply appropriate technical and organisational measures to protect personal data, build compliance measures (including pseudonymisation) into the choice of processing means and the processing itself, and set defaults so processing is limited to the specific purpose in volume, type, storage period and access (Art. 7(1)-(3)).",
          [
            "Are privacy measures assessed when designing new processing?",
            "Do default settings limit data volume, retention and access?",
            "Is pseudonymisation used where appropriate?",
          ],
          [
            "Privacy by design checklist",
            "Default configuration records",
            "Technical design reviews",
          ],
        ),
        req(
          "2.2",
          "Record of Processing",
          "Keep a record of personal data processing and provide it on request",
          "Controllers and processors must each keep a record covering their and the DPO's details, data categories, authorised persons, processing periods, limits and scope, erasure and modification mechanisms, purposes, cross-border movements and security measures, and provide it to the UAE Data Office on request (Arts. 7(4), 8(7)).",
          [
            "Does the record include every required element?",
            "Does it capture cross-border data movements?",
            "Is it kept current and ready for the Data Office?",
          ],
          [
            "Record of processing",
            "Record update log",
            "Cross-border flow map",
          ],
        ),
        req(
          "2.3",
          "Processor Selection",
          "Appoint only processors with adequate safeguards",
          "Controllers must appoint processors that provide sufficient guarantees of technical and organisational measures so processing meets the law and its regulations (Art. 7(5)).",
          [
            "Are processors assessed before appointment?",
            "Are their safeguards documented?",
            "Are processors reassessed periodically?",
          ],
          [
            "Processor due diligence",
            "Security questionnaires",
            "Approved processor list",
          ],
        ),
        req(
          "2.4",
          "Processor Duties",
          "Processors act on instructions and protect, limit and delete data",
          "Processors must process per the controller's instructions and contract, protect data from the design stage, keep to the agreed purpose and period (notifying the controller if exceeded), erase or return data at the end, not disclose data or results, secure processing and devices, prove compliance on request, and have written terms when several processors are involved, otherwise they are jointly liable (Art. 8).",
          [
            "Does each processing contract set scope, purpose, nature, data types and subject categories?",
            "Is data erased or returned when processing ends?",
            "Are roles allocated in writing where several processors are involved?",
          ],
          [
            "Data processing agreements",
            "Deletion or return certificates",
            "Processor compliance evidence",
          ],
        ),
      ],
    },
    {
      key: "3",
      title: "Data Protection Officer",
      requirements: [
        req(
          "3.1",
          "DPO Appointment",
          "Appoint a qualified DPO for high-risk or large-scale sensitive processing",
          "Controllers and processors must appoint a skilled data protection officer where processing creates high risk through new technologies or volume, involves systematic and comprehensive evaluation of sensitive data including profiling and automated processing, or covers a large volume of sensitive data; the DPO may be internal or external, and contact details must be notified to the Data Office (Art. 10).",
          [
            "Does any processing meet an Art. 10 trigger, for example AI profiling?",
            "Does the DPO have adequate expertise?",
            "Have the DPO's contact details been notified to the Data Office?",
          ],
          [
            "DPO appointment letter",
            "DPO trigger assessment",
            "Data Office notification",
          ],
        ),
        req(
          "3.2",
          "DPO Role, Support and Independence",
          "Resource the DPO, involve them early and protect them from conflicts",
          "The DPO verifies compliance, handles requests and complaints, advises on periodic assessments and risk, and liaises with the Data Office; the organisation must involve the DPO in a timely way, provide resources, not penalise them for their duties and avoid conflicting tasks, and data subjects may contact the DPO directly (Arts. 11, 12).",
          [
            "Is the DPO involved in all data protection matters in time?",
            "Does the DPO have resources and freedom from conflicts?",
            "Can data subjects reach the DPO directly?",
          ],
          [
            "DPO job description",
            "DPO reports and advice records",
            "Published DPO contact",
          ],
        ),
      ],
    },
    {
      key: "4",
      title: "Data Subject Rights",
      requirements: [
        req(
          "4.1",
          "Right to Information",
          "Inform subjects before processing and answer information requests free of charge",
          "Before processing, tell data subjects the purposes, the recipients in and outside the UAE and the cross-border safeguards; on free request, also provide the data types processed, automated decisions including profiling, retention criteria, how to correct, erase, restrict or object, breach-handling steps and how to complain to the Data Office (Art. 13).",
          [
            "Do pre-processing notices cover purposes, recipients and transfer safeguards?",
            "Can all Art. 13(1) items be provided on request?",
            "Are refusals limited to the Art. 13(3) grounds?",
          ],
          [
            "Privacy notice",
            "Information request log",
            "Response templates",
          ],
        ),
        req(
          "4.2",
          "Data Portability",
          "Provide data in a machine-readable format and transfer it on request",
          "Where processing is based on consent or contract and carried out by automated means, provide data subjects their data in a structured, machine-readable format and transfer it to another controller where technically feasible (Art. 14).",
          [
            "Which datasets are in scope for portability?",
            "Can they be exported in a structured, machine-readable format?",
            "Can data be transferred directly to another controller?",
          ],
          [
            "Export specification",
            "Sample export",
            "Portability request log",
          ],
        ),
        req(
          "4.3",
          "Rectification and Erasure",
          "Correct inaccurate data promptly and erase it when grounds apply",
          "Correct or complete inaccurate data without undue delay, and erase data when it is no longer needed, consent is withdrawn, the subject objects with no legitimate grounds to continue, or processing was unlawful, subject to the Art. 15(3) exceptions (Art. 15).",
          [
            "Are correction requests handled without undue delay?",
            "Are erasure grounds and exceptions assessed consistently?",
            "Is erasure applied across backups and processors?",
          ],
          [
            "Rectification and erasure procedure",
            "Request log",
            "Erasure confirmations",
          ],
        ),
        req(
          "4.4",
          "Restriction of Processing",
          "Restrict processing when accuracy or lawfulness is disputed",
          "Restrict processing while a subject disputes accuracy, objects to processing beyond agreed purposes or where processing is unlawful; keep data on request for legal claims; and notify the subject before lifting a restriction (Art. 16).",
          [
            "Can processing be restricted for a single subject?",
            "Are the Art. 16(3) grounds for continuing documented?",
            "Is the subject notified when a restriction is lifted?",
          ],
          [
            "Restriction procedure",
            "Restriction flags in systems",
            "Lifting notices",
          ],
        ),
        req(
          "4.5",
          "Objection to Processing",
          "Stop direct marketing, statistical surveys or non-compliant processing on objection",
          "Data subjects may object to and stop processing for direct marketing (including related profiling), statistical surveys unless needed for the public interest, or processing that breaches Art. 5 (Art. 17).",
          [
            "Is there a simple way to object to direct marketing and related profiling?",
            "Are objections applied across all channels and systems?",
            "Are objection outcomes recorded?",
          ],
          ["Opt-out mechanism", "Suppression list", "Objection log"],
        ),
        req(
          "4.6",
          "Automated Decisions and Profiling",
          "Allow objection and human review of significant automated decisions",
          "Data subjects may object to automated decisions, including profiling, with legal or serious effects, except where based on their contract, required by law or with prior consent; in those cases apply safeguards for their rights, and involve a human in reviewing automated decisions on request (Art. 18).",
          [
            "Which automated decisions have legal or serious effects?",
            "Which Art. 18(2) exception applies to each, if any?",
            "Is human review available on request?",
          ],
          [
            "Automated decision inventory",
            "Human review procedure",
            "Review case log",
          ],
        ),
        req(
          "4.7",
          "Channels to Exercise Rights",
          "Give subjects clear ways to contact you and exercise rights",
          "Provide appropriate, clear methods for data subjects to contact the controller and exercise their rights (Art. 19).",
          [
            "Are request channels published and easy to find?",
            "Are requests logged and tracked to completion?",
            "Are staff trained to recognise rights requests?",
          ],
          [
            "Published contact channels",
            "Request handling procedure",
            "Request tracking log",
          ],
        ),
      ],
    },
    {
      key: "5",
      title: "Security and Breach Notification",
      requirements: [
        req(
          "5.1",
          "Information Security",
          "Apply risk-based security in line with international best practice",
          "Controllers and processors must apply technical and organisational measures giving security appropriate to the risk, following international best practice, which may include encryption and pseudonymisation, ongoing confidentiality, integrity and resilience, timely recovery after incidents, and regular testing of measures (Art. 20).",
          [
            "Is security risk assessed per processing activity?",
            "Are encryption, resilience and recovery controls in place?",
            "Are security controls tested and evaluated regularly?",
          ],
          [
            "Security risk assessments",
            "Encryption and backup standards",
            "Control test results",
          ],
        ),
        req(
          "5.2",
          "Breach Notification",
          "Notify the Data Office and affected subjects of breaches",
          "On becoming aware of a breach affecting privacy, confidentiality or security, the controller must report it with the investigation results to the Data Office, describing its nature, causes and scale, DPO details, likely effects, measures taken and remediation, and notify affected data subjects, within the periods set by the executive regulations (Art. 9(1)-(2)).",
          [
            "Is there a breach response plan with Data Office and subject notices?",
            "Do reports contain every Art. 9(1) element?",
            "Are breaches and corrective actions documented?",
          ],
          [
            "Breach response plan",
            "Breach register",
            "Notification records",
          ],
        ),
        req(
          "5.3",
          "Processor Breach Escalation",
          "Processors must tell the controller of breaches immediately",
          "Processors must notify the controller immediately on becoming aware of a personal data breach so the controller can report it (Art. 9(3)).",
          [
            "Do processor contracts require immediate breach notice?",
            "Are processor contacts and escalation paths defined?",
            "Has escalation been tested?",
          ],
          [
            "Contract breach clauses",
            "Escalation contacts",
            "Tabletop exercise records",
          ],
        ),
      ],
    },
    {
      key: "6",
      title: "Data Protection Impact Assessment",
      requirements: [
        req(
          "6.1",
          "DPIA for High-Risk Processing",
          "Assess impact before high-risk processing and review it periodically",
          "Before processing with new technologies likely to create high risk, and always for systematic evaluation via automated processing or profiling with legal or serious effects or large-volume sensitive data, carry out a DPIA describing the processing and purpose, assessing necessity, proportionality and risks, and setting mitigations, coordinating with the DPO and reviewing results periodically (Art. 21).",
          [
            "Which AI or profiling systems require a DPIA?",
            "Does each DPIA cover the four minimum elements?",
            "Was the DPO consulted, and are DPIAs reviewed when risk changes?",
          ],
          ["DPIA template", "Completed DPIAs", "DPIA review records"],
        ),
      ],
    },
    {
      key: "7",
      title: "Cross-Border Transfers",
      requirements: [
        req(
          "7.1",
          "Transfers with Adequate Protection",
          "Transfer abroad only to approved adequate jurisdictions",
          "Personal data may be transferred outside the UAE, as approved by the Data Office, to countries with data protection laws covering key protections, rights and supervisory enforcement, or with which the UAE has data protection agreements (Art. 22).",
          [
            "Which countries receive personal data?",
            "Does each destination meet Art. 22?",
            "Is the transfer basis documented?",
          ],
          [
            "Transfer register",
            "Adequacy assessment per country",
            "Data flow map",
          ],
        ),
        req(
          "7.2",
          "Transfers Without Adequate Protection",
          "Use contracts, express consent or another listed ground",
          "Where no adequate protection exists, transfer only under a contract binding the recipient to the law's requirements and enforcement, with the subject's express consent, or where necessary for legal claims, a contract with or for the subject, international judicial cooperation or the public interest (Art. 23).",
          [
            "Which transfers rely on Art. 23?",
            "Do transfer contracts impose the law's requirements and enforcement?",
            "Is express consent recorded where relied on?",
          ],
          [
            "Transfer contracts",
            "Express consent records",
            "Necessity assessments",
          ],
        ),
      ],
    },
    {
      key: "8",
      title: "Compliance Readiness",
      requirements: [
        req(
          "8.1",
          "Regularisation Period",
          "Track the executive regulations and close gaps within six months",
          "Controllers and processors must bring their operations into line with the law within six months of the executive regulations being issued (extendable by the Cabinet); obligations whose details are deferred to those regulations, such as breach timelines, will need updating once they are published (Art. 29).",
          [
            "Is someone monitoring for the executive regulations and Data Office decisions?",
            "Is there a gap assessment against the law?",
            "Is a remediation plan ready to finish within six months?",
          ],
          [
            "Regulatory watch log",
            "Gap assessment",
            "Remediation plan",
          ],
        ),
      ],
    },
  ],
};
