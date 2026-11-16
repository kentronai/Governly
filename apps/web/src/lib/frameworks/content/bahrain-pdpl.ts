import type { FrameworkDefinition } from "../types";
import { req } from "../helpers";

// Bahrain Law No. 30 of 2018 with respect to Personal Data Protection (PDPL), promulgated
// 12 July 2018, in force 1 August 2019. Read from the English translation published by the
// Legislation & Legal Opinion Commission (lloc.gov.bh, updated May 2024); the Arabic text in the
// Official Gazette is authoritative.
// Guidance text is Governly's own.
export const bahrainPdpl: FrameworkDefinition = {
  slug: "bahrain-pdpl",
  name: "Bahrain Personal Data Protection Law",
  navLabel: "Bahrain PDPL",
  kind: "regulation",
  policyNames: ["Bahrain Personal Data Protection Law"],
  description:
    "Bahrain's Personal Data Protection Law (Law No. 30 of 2018): processing principles and legal bases, security and confidentiality, data protection guardians, transfers, notifications and prior authorisations, and data subject rights.",
  source: {
    title: "Legislation & Legal Opinion Commission: Law No. 30 of 2018 (English translation)",
    url: "https://www.lloc.gov.bh/FullEn/K3018.docx",
  },
  sections: [
    {
      key: "1",
      title: "Lawful Processing",
      requirements: [
        req(
          "1.1",
          "Data Quality Principles",
          "Process fairly, for set purposes, minimally, accurately and not for too long",
          "Process personal data fairly and lawfully, for specific, explicit and legitimate purposes, limited to what is adequate and relevant, accurate and up to date, and do not keep it identifiable once the purpose is met; data kept for historical, statistical or scientific use must be anonymised or, if not possible, encrypted (Art. 3).",
          [
            "Is each processing purpose specific and documented?",
            "Is data reviewed for relevance and accuracy?",
            "Is data anonymised or deleted when its purpose ends?",
          ],
          [
            "Processing purpose register",
            "Retention schedule",
            "Anonymisation and deletion records",
          ],
        ),
        req(
          "1.2",
          "Consent or Legal Basis",
          "Process only with consent or a listed basis",
          "Process personal data only with the data subject's consent unless it is necessary for a contract with the data subject or steps towards one, a legal obligation or court or prosecution order, the data subject's vital interests, or legitimate interests that do not conflict with the data subject's fundamental rights (Art. 4).",
          [
            "Is a basis recorded for each processing activity?",
            "Is legitimate interest balanced against data subjects' rights?",
            "Are contractual and legal bases genuinely necessary?",
          ],
          [
            "Legal basis register",
            "Legitimate interest assessments",
            "Contract and legal obligation references",
          ],
        ),
        req(
          "1.3",
          "Valid Consent",
          "Get written, explicit, informed and withdrawable consent",
          "Where relying on consent, obtain it from a person with full legal capacity (or their legal guardian), in writing, explicit, clear and specific to the data, freely given after being told the purposes and the consequences of refusing, and allow it to be withdrawn at any time (Art. 24).",
          [
            "Is consent written, explicit and specific to the data?",
            "Are guardians used for people without full legal capacity?",
            "Can consent be withdrawn at any time?",
          ],
          [
            "Consent forms and records",
            "Guardian consent procedure",
            "Withdrawal records",
          ],
        ),
        req(
          "1.4",
          "Sensitive Personal Data",
          "Process sensitive data only with consent or a listed exception",
          "Process data on race, ethnic origin, political or philosophical opinions, religious beliefs, union membership, criminal record, health or sexual life only with consent or under a listed exception such as employment law duties, legal claims, healthcare under a duty of confidentiality or data made public by the data subject (Art. 5).",
          [
            "Where is sensitive data processed?",
            "Which consent or exception covers each use?",
            "Are extra safeguards applied to sensitive data?",
          ],
          [
            "Sensitive data inventory",
            "Exception analysis",
            "Explicit consent records",
          ],
        ),
        req(
          "1.5",
          "Criminal Proceedings Data",
          "Restrict processing of criminal case and judgment data",
          "Process data about criminal proceedings or judgments only in the permitted cases (for example legal duties, objectives set by law, the controller's own litigation, legal representation, journalism or research) and keep it confidential as the law requires (Art. 7).",
          [
            "Is criminal record or proceedings data processed?",
            "Which permitted case applies?",
            "How is confidentiality protected?",
          ],
          [
            "Criminal data processing assessment",
            "Access restrictions",
            "Confidentiality procedures",
          ],
        ),
      ],
    },
    {
      key: "2",
      title: "Security and Confidentiality",
      requirements: [
        req(
          "2.1",
          "Technical and Organisational Security",
          "Protect data with recorded, risk-based measures",
          "Implement technical and organisational measures that protect data against accidental or unauthorised destruction, loss, alteration, disclosure or access, appropriate to current technology, cost, the nature of the data and the risks, and keep those measures recorded (Art. 8(1)).",
          [
            "Are security measures based on a risk assessment?",
            "Are the measures documented?",
            "Are they updated as technology and threats change?",
          ],
          [
            "Information security policy",
            "Documented security measures",
            "Risk assessment",
          ],
        ),
        req(
          "2.2",
          "Processor Selection and Written Contract",
          "Use capable processors under a written contract",
          "Choose processors that give sufficient security safeguards, take reasonable steps to check their compliance, and use a written contract requiring the processor to act only on the controller's instructions and meet equivalent security and confidentiality obligations (Art. 8(3)).",
          [
            "Is each processor assessed before use?",
            "Does every processor have a written contract with the required terms?",
            "How is processor compliance checked?",
          ],
          [
            "Processor inventory",
            "Data processing agreements",
            "Processor assessments",
          ],
        ),
        req(
          "2.3",
          "Confidentiality and Disclosure",
          "Disclose data only with consent or a judicial order",
          "Do not disclose personal data without the data subject's consent or a judicial order, and ensure staff and others with access process it only with the controller's consent or under such an order and never for personal benefit, including after their employment or contract ends (Art. 9).",
          [
            "Is every disclosure backed by consent or an order?",
            "Do staff and contractors sign confidentiality obligations?",
            "Is access removed and confidentiality reaffirmed at exit?",
          ],
          [
            "Disclosure register",
            "Confidentiality agreements",
            "Leaver access-removal records",
          ],
        ),
      ],
    },
    {
      key: "3",
      title: "Governance",
      requirements: [
        req(
          "3.1",
          "Data Protection Guardian",
          "Appoint a guardian where required and notify the Authority",
          "Appoint a registered Data Protection Guardian where the Board requires it (or voluntarily), notify the Authority within three working days, and let the guardian work independently to monitor compliance and keep the processing register, which the controller keeps itself if no guardian is appointed (Art. 10).",
          [
            "Is the controller in a category required to appoint a guardian?",
            "Was the Authority notified within three working days?",
            "Who maintains the processing register?",
          ],
          [
            "Guardian appointment letter",
            "Authority notification",
            "Processing register",
          ],
        ),
        req(
          "3.2",
          "Local Representative",
          "Foreign controllers using means in Bahrain must appoint a representative",
          "A legal person without a place of business in Bahrain that processes data using means located there must appoint an authorised representative in the Kingdom and notify the Authority immediately of the appointment and any changes (Art. 2(3)).",
          [
            "Does the organisation process data using means in Bahrain without a local establishment?",
            "Is a representative appointed and authorised?",
            "Was the Authority notified?",
          ],
          [
            "Representative appointment",
            "Authority notification",
            "Scope assessment",
          ],
        ),
      ],
    },
    {
      key: "4",
      title: "Transfers outside the Kingdom",
      requirements: [
        req(
          "4.1",
          "Adequate Destinations or Authorisation",
          "Transfer only to listed countries or with Authority approval",
          "Transfer personal data outside Bahrain only to countries on the Authority's adequacy list or with the Authority's case-by-case authorisation, which may be conditional or time-limited (Art. 12).",
          [
            "Which transfers leave Bahrain?",
            "Is each destination on the Authority's list?",
            "Is authorisation held for other destinations?",
          ],
          [
            "Transfer register",
            "Adequacy list checks",
            "Authority authorisations",
          ],
        ),
        req(
          "4.2",
          "Transfer Exemptions and Safeguards",
          "Use only the listed exemptions or approved safeguards",
          "Transfer to non-adequate countries only with consent, from a public register, where necessary for listed contract, vital interest, legal or legal-claim purposes, or with Authority authorisation based on adequate safeguards such as contractual terms (Art. 13).",
          [
            "Which exemption covers each non-adequate transfer?",
            "Are contractual safeguards in place where relied on?",
            "Is the Authority's authorisation held where required?",
          ],
          [
            "Transfer exemption analysis",
            "Transfer contracts",
            "Authorisation decisions",
          ],
        ),
      ],
    },
    {
      key: "5",
      title: "Notifications and Prior Authorisation",
      requirements: [
        req(
          "5.1",
          "Prior Notification of Processing",
          "Notify the Authority before automated processing",
          "Give the Authority prior notice of wholly or partly automated processing (unless exempt, for example where a Data Protection Guardian is appointed or for necessary employee data), including the controller, purpose, data, recipients, foreign transfers and security, and notify changes within 30 days (Art. 14).",
          [
            "Which processing operations require notification?",
            "Does an exemption apply, and is it documented?",
            "Are changes notified within 30 days?",
          ],
          [
            "Notification submissions",
            "Exemption assessment",
            "Change notification records",
          ],
        ),
        req(
          "5.2",
          "Prior Authorisation for High-Risk Processing",
          "Get written approval before high-risk processing",
          "Obtain the Authority's prior written authorisation before automated processing of sensitive data to protect someone legally unable to consent (Art. 5), biometric identification data, genetic data (outside licensed medical care), linking data files of two or more controllers held for different purposes, or visual recording used for surveillance (Art. 15).",
          [
            "Does any processing, such as CCTV or biometrics, need authorisation?",
            "Was authorisation obtained before processing began?",
            "Are authorisation conditions tracked?",
          ],
          [
            "Authorisation applications",
            "Authority decisions",
            "Condition compliance records",
          ],
        ),
      ],
    },
    {
      key: "6",
      title: "Data Subject Rights",
      requirements: [
        req(
          "6.1",
          "Information to Data Subjects",
          "Tell data subjects who you are and why you process",
          "Tell data subjects, when data is collected from them, the controller's identity and address, the purposes and other information needed for fair processing such as recipients, whether answers are mandatory, their rights and any direct marketing use; for data from other sources, provide this within five days of recording it (Art. 17).",
          [
            "Do collection notices include all required information?",
            "Are data subjects informed within five days when data comes from elsewhere?",
            "Are exemptions documented where relied on?",
          ],
          [
            "Privacy notices",
            "Indirect collection notices",
            "Notice review records",
          ],
        ),
        req(
          "6.2",
          "Access Requests",
          "Respond to access requests within 15 working days",
          "On a verified request, free of charge, tell data subjects within 15 working days whether their data is processed and, if so, the data, its source, purposes, recipients and, for solely data-based decisions affecting them, the logic used (Art. 18).",
          [
            "Is identity verified before responding?",
            "Are responses sent within 15 working days?",
            "Are rejections reasoned and recorded?",
          ],
          [
            "Access request log",
            "Response templates",
            "Rejection decisions",
          ],
        ),
        req(
          "6.3",
          "Direct Marketing Objection",
          "Inform of and honour the right to object to direct marketing",
          "Inform data subjects of their free right to object to direct marketing, and on a verified request stop or not begin such processing and reply within 10 working days (Arts. 19-20).",
          [
            "Are data subjects told about the right to object?",
            "Is marketing stopped within 10 working days of a request?",
            "Is the outcome communicated to the data subject?",
          ],
          [
            "Marketing notices",
            "Objection log",
            "Suppression lists",
          ],
        ),
        req(
          "6.4",
          "Objection to Damaging Processing",
          "Stop processing that causes unwarranted substantial damage",
          "On a reasoned, verified request, stop or not begin processing that causes or is likely to cause unwarranted substantial material or moral damage to the data subject or others, within 10 working days, unless an exception applies (Art. 21).",
          [
            "How are damage-based objections assessed?",
            "Are decisions made within 10 working days?",
            "Are exceptions documented?",
          ],
          [
            "Objection procedure",
            "Objection decisions",
            "Request log",
          ],
        ),
        req(
          "6.5",
          "Automated Decisions",
          "Offer human reconsideration of solely automated decisions",
          "Where a decision about work performance, financial standing, creditworthiness, reliability or conduct is based solely on automated processing, reconsider it free of charge in a way that is not solely automated on request, unless it is taken for a contract with suitable safeguards such as hearing the data subject (Art. 22).",
          [
            "Which AI or automated systems make such decisions?",
            "Is there a route to request human reconsideration?",
            "What safeguards apply to contract-related automated decisions?",
          ],
          [
            "Automated decision inventory",
            "Human review procedure",
            "Reconsideration records",
          ],
        ),
        req(
          "6.6",
          "Rectification, Blocking and Erasure",
          "Correct, block or erase unlawfully processed data",
          "Respond free of charge within 10 working days to verified requests to rectify, block or erase data that is inaccurate, incomplete, outdated or unlawfully processed, and within 15 days of responding notify third parties who received it, unless impossible (Art. 23).",
          [
            "Are requests handled within 10 working days?",
            "Is blocked data excluded from further processing?",
            "Are recipients notified within 15 days?",
          ],
          [
            "Rectification and erasure log",
            "Blocking procedure",
            "Recipient notification records",
          ],
        ),
      ],
    },
  ],
};
