import type { FrameworkDefinition } from "../types";
import { req } from "../helpers";

// Qatar Law No. 13 of 2016 on Protecting Personal Data Privacy (PDPPL), issued 3 November 2016,
// Official Gazette No. 15 of 2016. Qatar issues no official English text: the binding version is
// the Arabic one on almeezan.qa. Read from the English translation published by the Compliance and
// Data Protection Department (compliance.qcert.org, marked "not official"), cross-checked against
// NCSA's official PDPPL Guidelines for Regulated Entities (v2.0, 2022), which quote the articles.
// Guidance text is Governly's own.
export const qatarPdppl: FrameworkDefinition = {
  slug: "qatar-pdppl",
  name: "Qatar Personal Data Privacy Law",
  navLabel: "Qatar PDPPL",
  kind: "regulation",
  policyNames: ["Qatar Personal Data Privacy Law"],
  description:
    "Qatar's Personal Data Privacy Protection Law (Law No. 13 of 2016): lawful processing, notice and individual rights, controller and processor duties, security and breach notification, special-nature data, children and direct marketing.",
  source: {
    title: "NCSA: Personal Data Privacy Protection Law (Law No. 13 of 2016)",
    url: "https://ncsa.gov.qa/en/pages/personal-data-privacy-personal-data-privacy-protection-law",
  },
  sections: [
    {
      key: "1",
      title: "Lawful Processing and Principles",
      requirements: [
        req(
          "1.1",
          "Transparent, Honest and Fair Processing",
          "Process data transparently, honestly and with respect for dignity",
          "Process personal data honestly and legitimately, only within a framework of transparency, honesty, respect for human dignity and acceptable practices (Arts. 3, 8(1)).",
          [
            "Are processing activities described openly to individuals?",
            "Is each activity consistent with acceptable practices set by the regulator?",
            "Has any processing been identified as unfair or deceptive?",
          ],
          [
            "Data protection policy",
            "Processing inventory",
            "Fairness review records",
          ],
        ),
        req(
          "1.2",
          "Consent or Lawful Purpose",
          "Have consent or a lawful purpose for all processing",
          "Process personal data only after obtaining the individual's consent, unless the processing is necessary to achieve a lawful purpose of the controller or the recipient (Art. 4).",
          [
            "Is consent or a lawful purpose recorded for each activity?",
            "How is consent obtained and evidenced?",
            "Is the lawful purpose genuinely necessary for the processing?",
          ],
          [
            "Lawful basis register",
            "Consent records",
            "Lawful purpose assessments",
          ],
        ),
        req(
          "1.3",
          "Relevance, Accuracy and Retention",
          "Collect relevant data, keep it accurate and do not keep it too long",
          "Verify that data collected by or for the controller is relevant and adequate for the lawful purposes, ensure it is accurate, complete and up to date, and keep it no longer than needed for those purposes (Art. 10).",
          [
            "Is each data field justified by a lawful purpose?",
            "How is data kept accurate and current?",
            "Is there a retention schedule that is enforced?",
          ],
          [
            "Data minimisation review",
            "Retention schedule",
            "Deletion logs",
          ],
        ),
        req(
          "1.4",
          "Lawful Disclosure and Transfer to Processors",
          "Check lawfulness before disclosing data",
          "When disclosing personal data or passing it to a processor, ensure the disclosure is consistent with the lawful purposes and that the data will be processed in line with the Law (Art. 12).",
          [
            "Is each disclosure checked against the original lawful purpose?",
            "Is processing by the recipient bound to the Law's requirements?",
            "Are disclosures logged?",
          ],
          [
            "Disclosure register",
            "Data sharing agreements",
            "Disclosure approval records",
          ],
        ),
      ],
    },
    {
      key: "2",
      title: "Transparency and Individual Rights",
      requirements: [
        req(
          "2.1",
          "Privacy Notice before Processing",
          "Inform individuals before processing starts",
          "Before processing any personal data, inform the individual of the controller's details and any party processing for it, the lawful purposes, a comprehensive and accurate description of the processing and disclosure, and any other information needed for lawful processing (Art. 9).",
          [
            "Is a notice given before processing begins?",
            "Does it contain all four required elements?",
            "Is it written clearly for the target audience?",
          ],
          [
            "Privacy notices",
            "Notice placement screenshots",
            "Notice review records",
          ],
        ),
        req(
          "2.2",
          "Withdrawal, Objection, Erasure and Correction",
          "Honour withdrawal, objection, erasure and correction requests",
          "Allow individuals at any time to withdraw consent, object to processing that is unnecessary, excessive, discriminatory, unfair or illegal, request erasure in those cases or when the purpose ends, and request correction with proof of accuracy (Art. 5).",
          [
            "Can individuals withdraw consent as easily as they gave it?",
            "How are objection and erasure requests assessed and executed?",
            "How is proof of accuracy checked for corrections?",
          ],
          [
            "Rights request procedure",
            "Request log",
            "Erasure and correction records",
          ],
        ),
        req(
          "2.3",
          "Access, Notification and Copies",
          "Let individuals access and obtain a copy of their data",
          "Allow individuals to access and review their data, be told of its processing and purposes, be notified of any disclosure of inaccurate data, and obtain a copy for no more than the service charge (Art. 6).",
          [
            "Can the controller locate all data held on an individual?",
            "Are recipients of inaccurate data identified and the individual told?",
            "Is any fee for copies limited to the service charge?",
          ],
          [
            "Access request responses",
            "Inaccurate disclosure notices",
            "Fee schedule",
          ],
        ),
        req(
          "2.4",
          "Complaint and Request Systems",
          "Provide systems for requests and complaints",
          "Develop internal systems, available to individuals, to receive and investigate complaints and access, erasure and correction requests, and use appropriate technology so individuals can directly access, review and correct their data (Art. 11(4), (6)).",
          [
            "How do individuals submit requests and complaints?",
            "Are complaints investigated and closed with a record?",
            "Can individuals view or correct their data directly?",
          ],
          [
            "Complaint handling procedure",
            "Complaint and request register",
            "Self-service portal documentation",
          ],
        ),
      ],
    },
    {
      key: "3",
      title: "Controller Accountability",
      requirements: [
        req(
          "3.1",
          "Privacy by Design and Pre-Processing Review",
          "Review privacy measures before new processing",
          "Apply privacy controls when designing, changing or developing products, systems and services, and review privacy protection measures before starting any new processing operation (Arts. 8(2), 11(1)).",
          [
            "Is a privacy review required before new systems or AI models go live?",
            "Are design changes assessed for privacy impact?",
            "Who signs off the review?",
          ],
          [
            "Privacy impact or design reviews",
            "Change management records",
            "Sign-off approvals",
          ],
        ),
        req(
          "3.2",
          "Personal Data Management System",
          "Run an internal system to manage personal data",
          "Develop internal systems for the effective management of personal data and for reporting breaches of protective measures, and follow the privacy policies set by the competent department (Arts. 8(4), 11(5)).",
          [
            "Are policies, roles and procedures for personal data documented?",
            "Is there an internal channel to report breaches of protective measures?",
            "Are regulator-issued privacy policies reflected internally?",
          ],
          [
            "Personal data management system documentation",
            "Roles and responsibilities matrix",
            "Internal breach reporting procedure",
          ],
        ),
        req(
          "3.3",
          "Compliance Audits",
          "Audit compliance with data protection requirements",
          "Conduct comprehensive audits and reviews of the extent of compliance with personal data protection requirements (Art. 11(7)).",
          [
            "Is there an audit plan covering data protection?",
            "Are findings tracked to closure?",
            "How often are reviews performed?",
          ],
          [
            "Audit plan",
            "Audit reports",
            "Remediation tracker",
          ],
        ),
        req(
          "3.4",
          "Processor Identification, Training and Oversight",
          "Identify, train and monitor processors",
          "Identify the processors responsible for protecting personal data, train them and raise their awareness, and verify and continuously monitor that they follow instructions and take appropriate precautions (Art. 11(2), (3), (8)).",
          [
            "Is there a complete list of processors?",
            "Have processors received data protection training or awareness?",
            "How is processor compliance verified on an ongoing basis?",
          ],
          [
            "Processor inventory",
            "Processor contracts with instructions",
            "Processor audit or assessment reports",
          ],
        ),
      ],
    },
    {
      key: "4",
      title: "Security and Breach Notification",
      requirements: [
        req(
          "4.1",
          "Protective Precautions",
          "Protect personal data with proportionate controls",
          "Take administrative, technical and financial precautions, proportionate to the nature and importance of the data, to protect it against loss, damage, change, disclosure, access or inadvertent or illegal use; this duty applies to controllers and processors (Arts. 8(3), 13).",
          [
            "Are controls scaled to the sensitivity of the data?",
            "Do processors apply equivalent precautions?",
            "Are controls tested regularly?",
          ],
          [
            "Information security policy",
            "Risk assessment",
            "Security testing reports",
          ],
        ),
        req(
          "4.2",
          "Processor Breach Notice to Controller",
          "Processors must tell the controller at once",
          "Ensure processors notify the controller immediately of any breach of protective precautions or any risk threatening personal data (Art. 13).",
          [
            "Do processor contracts require immediate breach notice?",
            "Is there a contact point to receive processor notices?",
            "Have processor notices been received and handled?",
          ],
          [
            "Contract breach clauses",
            "Processor incident notices",
            "Incident tickets",
          ],
        ),
        req(
          "4.3",
          "Breach Notification",
          "Notify the regulator and individuals of serious breaches",
          "Inform the competent department and affected individuals of any breach of protective precautions that may cause serious damage to personal data or privacy; NCSA's breach guideline expects notice within 72 hours of becoming aware (Art. 14).",
          [
            "How is the seriousness of a breach assessed?",
            "Can notices be issued within 72 hours of awareness?",
            "Are all breaches recorded, including those not notified?",
          ],
          [
            "Breach response plan",
            "Breach register",
            "Copies of notifications",
          ],
        ),
      ],
    },
    {
      key: "5",
      title: "Special-Nature Data and Children",
      requirements: [
        req(
          "5.1",
          "Special-Nature Personal Data",
          "Get permission before processing special-nature data",
          "Process data on ethnic origin, children, health, physical or psychological condition, religious beliefs, marital relations or criminal offences only after obtaining permission from the competent department and applying the controls and extra precautions it sets (Art. 16).",
          [
            "Which processing involves special-nature data?",
            "Has permission been obtained for each such activity?",
            "Are the additional precautions applied?",
          ],
          [
            "Special-nature data inventory",
            "Regulator permissions",
            "Enhanced control documentation",
          ],
        ),
        req(
          "5.2",
          "Websites Addressing Children",
          "Protect children's data on child-directed websites",
          "On websites addressing children, post a notice on children's data use and disclosure, obtain the guardian's explicit consent, give verified guardians a description and copy of the data on request, delete or stop processing on request, and do not require more data than needed to join an activity (Art. 17).",
          [
            "Is guardian consent obtained before collecting a child's data?",
            "Can guardian requests for copies and deletion be fulfilled?",
            "Are games or promotions free of excessive data requirements?",
          ],
          [
            "Child-directed privacy notice",
            "Guardian consent records",
            "Guardian request log",
          ],
        ),
      ],
    },
    {
      key: "6",
      title: "Cross-Border Data Flows",
      requirements: [
        req(
          "6.1",
          "Cross-Border Data Flows",
          "Restrict cross-border flows only for lawful reasons",
          "Do not limit cross-border data flows except where the processing breaches the Law or may seriously harm personal data or privacy, while still meeting all controller obligations for data sent abroad (Art. 15).",
          [
            "Which data flows leave Qatar?",
            "Has each flow been assessed for compliance and serious harm?",
            "Do overseas recipients protect the data as the Law requires?",
          ],
          [
            "Cross-border data flow register",
            "Transfer assessments",
            "Recipient contracts",
          ],
        ),
      ],
    },
    {
      key: "7",
      title: "Direct Marketing",
      requirements: [
        req(
          "7.1",
          "Electronic Direct Marketing",
          "Send marketing only with prior consent and an opt-out",
          "Send electronic communications for direct marketing only with the individual's prior consent; each message must identify the sender, state that it is marketing and give a valid address to stop messages or withdraw consent (Art. 22).",
          [
            "Is prior consent recorded for every marketing recipient?",
            "Do messages identify the sender and state their marketing purpose?",
            "Are stop requests honoured promptly?",
          ],
          [
            "Marketing consent records",
            "Message templates",
            "Unsubscribe logs",
          ],
        ),
      ],
    },
  ],
};
