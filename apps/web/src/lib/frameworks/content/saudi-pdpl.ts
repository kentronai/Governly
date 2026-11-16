import type { FrameworkDefinition } from "../types";
import { req } from "../helpers";

// Saudi Arabia Personal Data Protection Law, Royal Decree No. M/19 of 9/2/1443H as amended by
// Royal Decree No. M/148 of 5/9/1444H; its Implementing Regulation ("IR"); and the Regulation on
// Personal Data Transfer outside the Kingdom ("TR"). Read from SDAIA's official English texts on
// dgp.sdaia.gov.sa. "Art." alone means the Law.
// Guidance text is Governly's own.
export const saudiPdpl: FrameworkDefinition = {
  slug: "saudi-pdpl",
  name: "Saudi Arabia Personal Data Protection Law",
  navLabel: "Saudi PDPL",
  kind: "regulation",
  policyNames: ["Saudi Arabia Personal Data Protection Law"],
  description:
    "Saudi Arabia's PDPL with its Implementing Regulation and Transfer Regulation: lawful processing, notice and data subject rights, security, breach notification, impact assessments, cross-border transfers and accountability records.",
  source: {
    title: "SDAIA: Personal Data Protection Law and Regulations (official English text)",
    url: "https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter",
  },
  sections: [
    {
      key: "1",
      title: "Lawful Processing and Data Quality",
      requirements: [
        req(
          "1.1",
          "Consent and Legal Basis",
          "Have a valid basis for every processing purpose",
          "Process personal data, or change a processing purpose, only with the data subject's consent unless a statutory exception applies; do not make consent a condition of a service that does not need the processing; obtain consent freely, separately per purpose, verifiably documented, explicit for sensitive or credit data and solely automated decisions, and make withdrawal as easy as giving it (Arts. 5-7; IR Arts. 11-12).",
          [
            "Is a legal basis recorded for each processing purpose?",
            "Is consent captured per purpose, documented and explicit where the Regulation requires it?",
            "Does withdrawal stop processing without undue delay and reach recipients?",
          ],
          [
            "Legal basis register",
            "Consent records and consent wording",
            "Consent withdrawal procedure",
          ],
        ),
        req(
          "1.2",
          "Legitimate Interest Assessment",
          "Document a balancing test before relying on legitimate interest",
          "Before relying on legitimate interest, complete a documented assessment showing the interest is lawful, within data subjects' reasonable expectations and not overridden by their rights; it may not be used for sensitive data or by public entities, and failed assessments require changing the processing or the basis (Art. 6; IR Art. 16).",
          [
            "Which processing relies on legitimate interest?",
            "Was an assessment documented before processing began?",
            "Are sensitive data and public-entity processing excluded from this basis?",
          ],
          [
            "Legitimate interest assessments",
            "Approval records",
            "Reassessment log",
          ],
        ),
        req(
          "1.3",
          "Purpose Limitation and Minimisation",
          "Collect only what each purpose needs",
          "Collect data directly from the data subject where required, for a purpose directly related to the controller's activity, by lawful and non-deceptive means, limited to the minimum needed, and map data to purposes; use it only for the original purpose unless an exception applies and the new purpose is defined and recorded (Arts. 10-11; IR Arts. 18-19).",
          [
            "Is every data field mapped to a defined purpose?",
            "Is indirect collection or further use covered by a listed exception?",
            "Are minimisation reviews done when forms or systems change?",
          ],
          [
            "Data maps / data inventory",
            "Minimisation review records",
            "Further-purpose assessments",
          ],
        ),
        req(
          "1.4",
          "Accuracy and Correction",
          "Keep data accurate and tell recipients of corrections",
          "Take reasonable steps to verify that data is accurate, complete, current and relevant before processing, correct or update it, review accuracy periodically, suspend processing where inaccuracy may cause harm, and notify previous recipients of corrections (Arts. 14, 17; IR Art. 22).",
          [
            "How is accuracy verified at collection?",
            "Is there a periodic accuracy review?",
            "Are recipients notified when data is corrected?",
          ],
          [
            "Data quality procedure",
            "Accuracy review records",
            "Recipient correction notices",
          ],
        ),
        req(
          "1.5",
          "Retention, Destruction and Anonymisation",
          "Destroy data once its purpose ends",
          "Destroy personal data without undue delay once it is no longer needed, on request, on withdrawal of sole-basis consent or where processing was unlawful, including copies and backups, unless a legal retention period or pending case applies; where anonymising instead, assess and test re-identification risk (Art. 18; IR Arts. 8-9).",
          [
            "Is there a retention schedule per data category?",
            "Does destruction reach copies, backups and recipients?",
            "How is anonymisation tested against re-identification?",
          ],
          [
            "Retention schedule",
            "Destruction logs and certificates",
            "Anonymisation risk assessments",
          ],
        ),
      ],
    },
    {
      key: "2",
      title: "Transparency and Data Subject Rights",
      requirements: [
        req(
          "2.1",
          "Privacy Policy",
          "Publish a privacy policy before collection",
          "Adopt a privacy policy and make it available to data subjects before collecting their data, stating the purpose of collection, the data collected, the means of collection, processing, storage and destruction, and the data subject's rights and how to exercise them (Art. 12).",
          [
            "Is the policy available before any data is collected?",
            "Does it cover purpose, data, collection, processing, storage, destruction and rights?",
            "Is it reviewed when processing changes?",
          ],
          [
            "Published privacy policy",
            "Policy version history",
            "Screenshots of collection points showing the policy",
          ],
        ),
        req(
          "2.2",
          "Notice at Collection",
          "Tell data subjects what they need to know when collecting",
          "At or before direct collection, inform the data subject of the controller's identity and contacts, DPO contact, legal basis and purpose, whether providing data is mandatory, recipients, any transfer outside the Kingdom, retention, rights and how to withdraw consent; for indirect collection, inform within 30 days including the source (Art. 13; IR Art. 4).",
          [
            "Do collection notices contain every required element?",
            "Are indirectly collected data subjects informed within 30 days?",
            "Are data subjects told before data is used for a new purpose?",
          ],
          [
            "Collection notices",
            "Indirect-collection notification records",
            "Notice content checklist",
          ],
        ),
        req(
          "2.3",
          "Data Subject Rights",
          "Support information, access, copy, correction and destruction rights",
          "Enable data subjects to be informed, access their data, obtain a copy in a readable, commonly used format, request correction, and request destruction of data no longer needed, without disclosing other people's data (Art. 4; IR Arts. 5-8).",
          [
            "Can each right be fulfilled end to end?",
            "Can a copy be produced in a commonly used electronic format?",
            "Are third-party details redacted from access responses?",
          ],
          [
            "Rights procedures",
            "Sample access and copy responses",
            "Destruction request records",
          ],
        ),
        req(
          "2.4",
          "Request Handling Timelines",
          "Answer requests within 30 days",
          "Provide suitable channels for requests, verify identity, record every request including oral ones, and respond within 30 days, extendable by up to 30 more days only with advance reasoned notice; refusals of repetitive, unfounded or disproportionate requests must be notified (Art. 21; IR Arts. 3, 10).",
          [
            "Which channels can data subjects use to submit requests?",
            "Is each request logged with its due date?",
            "Are extensions and refusals notified with reasons?",
          ],
          [
            "Request log with response dates",
            "Identity verification procedure",
            "Extension and refusal notices",
          ],
        ),
      ],
    },
    {
      key: "3",
      title: "Processors and Disclosure",
      requirements: [
        req(
          "3.1",
          "Processor Selection and Contracts",
          "Use processors with sufficient guarantees under contract",
          "Choose processors that give sufficient guarantees, assess them periodically, and put contracts in place covering purpose, data categories, duration, prompt breach notice, disclosure obligations and sub-processing with prior notice and a right to object (Art. 8; IR Art. 17).",
          [
            "Is each processor assessed before onboarding and periodically?",
            "Do contracts include the clauses the Regulation lists?",
            "Is the controller notified of and able to object to sub-processors?",
          ],
          [
            "Processor inventory",
            "Data processing agreements",
            "Processor assessment reports",
          ],
        ),
        req(
          "3.2",
          "Controlled Disclosure",
          "Disclose data only in permitted cases",
          "Disclose personal data only in the cases the Law allows, limited to the minimum data for a specific purpose, not where it threatens security, a person's safety or other listed interests, and record each disclosure with its date, method and purpose (Arts. 15-16; IR Art. 20).",
          [
            "Which permitted case supports each disclosure?",
            "Is the disclosed data limited to the minimum?",
            "Is every disclosure recorded?",
          ],
          [
            "Disclosure register",
            "Disclosure approval records",
            "Authority request files",
          ],
        ),
      ],
    },
    {
      key: "4",
      title: "Security, Breaches and Impact Assessment",
      requirements: [
        req(
          "4.1",
          "Security Measures",
          "Protect data with organisational, administrative and technical controls",
          "Implement organisational, administrative and technical measures that protect personal data, including during transfer, following National Cybersecurity Authority controls or recognised best practice where those do not apply (Art. 19; IR Art. 23).",
          [
            "Which NCA controls or standards are applied?",
            "Is data protected in transit and at rest?",
            "Are controls reviewed against current risks?",
          ],
          [
            "Information security policy",
            "NCA controls compliance assessment",
            "Encryption and access control configuration",
          ],
        ),
        req(
          "4.2",
          "Breach Notification",
          "Notify SDAIA within 72 hours and affected individuals without undue delay",
          "Notify the competent authority within 72 hours of becoming aware of a breach that may harm data subjects, with its description, data categories, numbers affected, risks and measures, and notify affected data subjects without undue delay in clear language with protective steps; keep copies of reports (Art. 20; IR Art. 24).",
          [
            "Is there a breach response procedure that tracks the 72-hour clock?",
            "Who decides whether a breach may cause harm?",
            "Are notifications to data subjects written in clear language with recommended steps?",
          ],
          [
            "Breach response plan",
            "Breach register",
            "Copies of authority and data subject notifications",
          ],
        ),
        req(
          "4.3",
          "Personal Data Impact Assessment",
          "Assess impact before high-risk processing",
          "Assess the impact of processing for any product or service, and in particular for sensitive data, combined datasets, large-scale or continuous monitoring, new technologies, automated decisions or processing likely to cause serious harm, covering purpose, necessity, risks and mitigations, and redo it when harm is identified (Art. 22; IR Art. 25).",
          [
            "Which processing activities meet the Regulation's triggers?",
            "Does each assessment cover necessity, risks and mitigations?",
            "Are AI or automated-decision systems assessed before launch?",
          ],
          [
            "Impact assessment reports",
            "Screening checklist",
            "Mitigation tracking",
          ],
        ),
      ],
    },
    {
      key: "5",
      title: "Specific Processing",
      requirements: [
        req(
          "5.1",
          "Health Data",
          "Apply extra controls to health data",
          "Apply additional controls to health data, including separated access levels limited to the minimum staff needed, documented processing stages and sector-specific requirements (Art. 23; IR Art. 26).",
          [
            "Is health data access limited to the minimum necessary staff?",
            "Are processing stages documented?",
            "Are sector regulator requirements applied?",
          ],
          [
            "Health data access matrix",
            "Processing stage documentation",
            "Access review records",
          ],
        ),
        req(
          "5.2",
          "Credit Data",
          "Apply extra controls to credit data",
          "Apply additional controls to credit data, including Saudi Central Bank requirements, verified explicit consent and notifying the data subject when a request to disclose their credit data is received (Art. 24; IR Art. 27).",
          [
            "Is explicit consent verified before processing credit data?",
            "Are data subjects notified of disclosure requests?",
            "Are SAMA controls applied?",
          ],
          [
            "Credit data consent records",
            "Disclosure request notifications",
            "SAMA compliance evidence",
          ],
        ),
        req(
          "5.3",
          "Marketing and Advertising",
          "Get consent and offer an easy opt-out",
          "Send advertising, awareness or direct marketing material through personal channels only with prior consent, identify the sender, provide a free and easy opt-out, stop immediately on request and keep evidence of consent (Arts. 25-26; IR Arts. 28-29).",
          [
            "Is consent recorded before marketing is sent?",
            "Does every message identify the sender and offer an opt-out?",
            "Are opt-outs honoured immediately across channels?",
          ],
          [
            "Marketing consent records",
            "Message templates",
            "Opt-out processing logs",
          ],
        ),
        req(
          "5.4",
          "Research and Statistics",
          "Use data for research without consent only under the Law's conditions",
          "Process data for scientific, research or statistical purposes without consent only where the Law's conditions are met, recording the purposes, collecting the minimum data, pseudonymising where possible and avoiding negative impact on data subjects (Art. 27; IR Art. 30).",
          [
            "Which condition of the Law supports the research use?",
            "Is data pseudonymised or de-identified where purposes allow?",
            "Are research purposes recorded?",
          ],
          [
            "Research processing register",
            "Pseudonymisation procedure",
            "Research approvals",
          ],
        ),
        req(
          "5.5",
          "Copies of Official Documents",
          "Copy identity documents only when required",
          "Copy or photograph official documents that identify individuals only when required by law or requested by a competent public authority, protect the copies and destroy them once the purpose ends (Art. 28; IR Art. 31).",
          [
            "Where are copies of identity documents taken, and why?",
            "Is a legal requirement documented for each case?",
            "Are copies destroyed when no longer needed?",
          ],
          [
            "Document copy register",
            "Legal requirement references",
            "Destruction records",
          ],
        ),
      ],
    },
    {
      key: "6",
      title: "Transfers outside the Kingdom",
      requirements: [
        req(
          "6.1",
          "Transfer Conditions",
          "Transfer only for permitted purposes and with adequate protection",
          "Transfer or disclose personal data outside the Kingdom only for a permitted purpose, without harming national security or vital interests, to a destination on SDAIA's adequacy list or with appropriate safeguards, and limited to the minimum data needed (Art. 29; TR Arts. 2-3).",
          [
            "Which transfers leave the Kingdom and for what purpose?",
            "Is each destination on the adequacy list or covered by safeguards?",
            "Is transferred data limited to the minimum necessary?",
          ],
          [
            "Cross-border transfer register",
            "Adequacy list checks",
            "Data flow diagrams",
          ],
        ),
        req(
          "6.2",
          "Appropriate Safeguards and Exemptions",
          "Use SCCs, binding common rules or certification",
          "Where relying on safeguards, use SDAIA's standard contractual clauses, binding common rules or an accreditation certificate; apply the exemption-specific safeguards for intra-group, limited, service or research transfers, and stop transfers and notify recipients if safeguards fail or are found inadequate (TR Arts. 4-6).",
          [
            "Which safeguard covers each non-adequate transfer?",
            "Are onward transfers bound by the same protections?",
            "Is there a process to halt transfers if safeguards fail?",
          ],
          [
            "Executed standard contractual clauses",
            "Binding common rules approval",
            "Transfer suspension procedure",
          ],
        ),
        req(
          "6.3",
          "Transfer Risk Assessment",
          "Assess risk before exempt or large sensitive transfers",
          "Carry out a documented risk assessment before transferring under an exemption or when continuously or widely transferring sensitive data abroad, covering purpose and legal basis, scope, safeguards, minimisation, likely harms and mitigating controls (TR Art. 7).",
          [
            "Which transfers need a risk assessment?",
            "Does each assessment cover all required elements?",
            "Are assessments updated when transfers change?",
          ],
          [
            "Transfer risk assessments",
            "Approval records",
            "Review schedule",
          ],
        ),
      ],
    },
    {
      key: "7",
      title: "Accountability",
      requirements: [
        req(
          "7.1",
          "Data Protection Officer",
          "Appoint a DPO where required",
          "Appoint a personal data protection officer where the controller is a public entity processing at large scale, or its core activities involve regular and systematic monitoring or sensitive data; the DPO handles authority contact, assessments, requests, breaches and complaints (Art. 30; IR Art. 32).",
          [
            "Do any of the Regulation's DPO triggers apply?",
            "Is the DPO's role, independence and reporting line documented?",
            "Is the DPO contact published in notices?",
          ],
          [
            "DPO appointment letter",
            "DPO role description",
            "Published DPO contact details",
          ],
        ),
        req(
          "7.2",
          "Records of Processing Activities",
          "Keep processing records for the activity's life plus five years",
          "Keep accurate, written records of processing activities covering controller and DPO details, purposes, data and data subject categories, retention, recipients, transfers outside the Kingdom and security measures, kept for the processing period plus five years and provided to SDAIA on request (Art. 31; IR Art. 33).",
          [
            "Does every processing activity have a record?",
            "Do records contain all required fields?",
            "Are records kept for five years after processing ends?",
          ],
          [
            "Records of processing activities",
            "Record review log",
            "Retention of archived records",
          ],
        ),
        req(
          "7.3",
          "National Register of Controllers",
          "Register with SDAIA where the rules require it",
          "Determine whether the controller must register in SDAIA's national register of controllers under the rules SDAIA issues, and register and keep the entry current if so (Art. 30; IR Art. 34).",
          [
            "Has registration applicability been assessed against SDAIA's rules?",
            "Is the registration current?",
            "Who maintains the entry?",
          ],
          [
            "Applicability assessment",
            "Registration confirmation",
            "Update records",
          ],
        ),
      ],
    },
  ],
};
