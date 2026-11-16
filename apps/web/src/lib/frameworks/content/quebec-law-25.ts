import type { FrameworkDefinition } from "../types";
import { req } from "../helpers";

// Québec Law 25: Act to modernize legislative provisions as regards the protection
// of personal information (S.Q. 2021, c. 25), as it amends the Act respecting the
// protection of personal information in the private sector (CQLR c. P-39.1).
// Section numbers below are P-39.1 sections. Guidance text is Governly's own.
export const quebecLaw25: FrameworkDefinition = {
  slug: "quebec-law-25",
  name: "Québec Law 25 (Private Sector Privacy)",
  navLabel: "Québec Law 25",
  kind: "regulation",
  policyNames: ["Quebec Law 25"],
  description:
    "Québec's modernised private-sector privacy law (P-39.1 as amended by Law 25): a person in charge of personal information, governance policies, privacy impact assessments, incident reporting, consent, transparency, automated-decision notices and portability. Phased in on 22 September 2022, 22 September 2023 and 22 September 2024 (portability).",
  source: {
    title:
      "S.Q. 2021, c. 25, Act to modernize legislative provisions as regards the protection of personal information (Publications du Québec)",
    url: "https://www.publicationsduquebec.gouv.qc.ca/fileadmin/Fichiers_client/lois_et_reglements/LoisAnnuelles/en/2021/2021C25A.PDF",
  },
  sections: [
    {
      key: "1",
      title: "Accountability and Governance",
      requirements: [
        req(
          "1.1",
          "Person in Charge of Personal Information",
          "Name the person in charge and publish their title and contact details",
          "The person with the highest authority in the enterprise is the person in charge of the protection of personal information and may delegate the role in writing; publish the role's title and contact information on the website or by other appropriate means (s. 3.1).",
          [
            "Who holds the role, and is any delegation in writing?",
            "Are the title and contact details published?",
            "Does the person in charge have the authority to ensure compliance?",
          ],
          [
            "Written delegation",
            "Website contact page",
            "Role description",
          ],
        ),
        req(
          "1.2",
          "Governance Policies and Practices",
          "Adopt and publish proportionate privacy governance policies",
          "Establish and implement governance policies and practices covering retention and destruction, staff roles across the information life cycle and a complaints process; they must be proportionate, approved by the person in charge, and described in clear language on the website (s. 3.2).",
          [
            "Do policies cover retention and destruction, roles and complaints?",
            "Has the person in charge approved them?",
            "Is detailed information about them published in plain language?",
          ],
          [
            "Governance policy",
            "Approval record",
            "Published policy summary",
          ],
        ),
        req(
          "1.3",
          "Confidentiality Policy for Technological Collection",
          "Publish a plain-language confidentiality policy and notify changes",
          "When personal information is collected through technological means, publish a confidentiality policy in clear and simple language on the website and disseminate notice of any amendment to it (s. 8.2).",
          [
            "Is a confidentiality policy published where personal information is collected online?",
            "Is it written in clear and simple language?",
            "How are people notified of amendments?",
          ],
          [
            "Published confidentiality policy",
            "Policy version history",
            "Amendment notices",
          ],
        ),
      ],
    },
    {
      key: "2",
      title: "Privacy Impact Assessments",
      requirements: [
        req(
          "2.1",
          "PIA for Information System Projects",
          "Assess privacy before acquiring, building or overhauling systems",
          "Conduct a proportionate privacy impact assessment for any project to acquire, develop or overhaul an information system or electronic service delivery system involving personal information, consulting the person in charge from the outset (ss. 3.3, 3.4).",
          [
            "Which projects triggered a PIA?",
            "Was the person in charge consulted from the start?",
            "Is the depth of the PIA proportionate to sensitivity, purpose and volume?",
          ],
          ["PIA template", "Completed PIAs", "Consultation records"],
        ),
        req(
          "2.2",
          "PIA and Agreement Before Communicating Outside Québec",
          "Assess and contract before sending data outside Québec",
          "Before communicating personal information outside Québec, or entrusting its collection, use, communication or keeping to someone outside Québec, conduct a PIA (sensitivity, purposes, protection measures, foreign legal framework); proceed only if protection is adequate, under a written agreement reflecting the assessment (s. 17).",
          [
            "Which data flows leave Québec, and to which jurisdictions?",
            "Does each flow have a PIA concluding protection is adequate?",
            "Is there a written agreement reflecting the PIA's mitigations?",
          ],
          [
            "Cross-border transfer register",
            "Transfer PIAs",
            "Signed data transfer agreements",
          ],
        ),
        req(
          "2.3",
          "Research and Statistics Communications",
          "Assess and contract before sharing identifiable data for research",
          "Personal information may be communicated without consent for study, research or statistics only if a PIA meets the s. 21 criteria and a written agreement with the prescribed safeguards is in place and sent to the Commission, taking effect 30 days after receipt (ss. 21, 21.0.2).",
          [
            "Is identifiable information shared for research or statistics?",
            "Does a PIA establish each s. 21 criterion?",
            "Was the agreement sent to the Commission before communication?",
          ],
          [
            "Research PIA",
            "Research data agreement",
            "Commission filing confirmation",
          ],
        ),
      ],
    },
    {
      key: "3",
      title: "Collection and Transparency",
      requirements: [
        req(
          "3.1",
          "Purpose Determination and Necessity",
          "Set purposes before collecting and collect only what is needed",
          "Determine the purposes of collection before collecting personal information and collect only the information necessary for those purposes (ss. 4, 5).",
          [
            "Are purposes documented before collection starts?",
            "Is each data element justified as necessary?",
            "Are forms and data feeds reviewed for over-collection?",
          ],
          [
            "Purpose register",
            "Data minimisation review",
            "Collection forms",
          ],
        ),
        req(
          "3.2",
          "Notice at Collection",
          "Tell people why and how their information is collected and their rights",
          "When collecting from the person, inform them in clear and simple language of the purposes, the means of collection, their access and rectification rights and their right to withdraw consent, plus any third parties and possible communication outside Québec; on request, give the information held, who has access, retention period and the person in charge's contact details (s. 8).",
          [
            "Do collection notices include every required element?",
            "Do they mention third parties and possible transfers outside Québec?",
            "Can the on-request details be supplied?",
          ],
          [
            "Collection notice templates",
            "Screenshots of notices in context",
            "Request responses",
          ],
        ),
        req(
          "3.3",
          "Identification, Location and Profiling Technology",
          "Disclose tracking and profiling functions before using them",
          "When collecting through technology with functions that can identify, locate or profile the person, first inform them that such technology is used and how to activate those functions (s. 8.1).",
          [
            "Which products include identification, location or profiling functions?",
            "Are people told before collection?",
            "Are those functions off unless the person activates them?",
          ],
          [
            "Profiling and tracking inventory",
            "Disclosure text",
            "Feature settings documentation",
          ],
        ),
        req(
          "3.4",
          "Privacy by Default",
          "Ship public-facing products with the most private settings by default",
          "Technological products or services offered to the public that have privacy settings must provide the highest level of confidentiality by default, without any action by the person; this does not apply to browser cookie settings (s. 9.1).",
          [
            "Which public products have privacy settings?",
            "Are defaults set to the highest confidentiality?",
            "Is this checked before each release?",
          ],
          [
            "Default settings inventory",
            "Release checklist",
            "Product screenshots",
          ],
        ),
        req(
          "3.5",
          "Minors Under 14",
          "Get parental consent before collecting from children under 14",
          "Do not collect personal information from a minor under 14 without consent of the person having parental authority or the tutor, unless the collection is clearly for the minor's benefit; consent for a minor under 14 is given by that person (ss. 4.1, 14).",
          [
            "Could services collect information from children under 14?",
            "How is parental consent obtained and recorded?",
            "Is age determined at collection?",
          ],
          [
            "Age screening flow",
            "Parental consent records",
            "Children's data assessment",
          ],
        ),
      ],
    },
    {
      key: "4",
      title: "Consent, Use and Communication",
      requirements: [
        req(
          "4.1",
          "Valid Consent",
          "Obtain clear, free, informed and purpose-specific consent",
          "Consent must be clear, free and informed, given for specific purposes and requested for each purpose in clear and simple language, separately from other information if in writing; help must be offered on request, and consent lasts only as long as needed for the purposes (s. 14).",
          [
            "Is consent requested separately for each purpose?",
            "Are written consent requests presented apart from other terms?",
            "Is consent refreshed or ended once purposes are achieved?",
          ],
          [
            "Consent request templates",
            "Consent records",
            "Consent lifecycle procedure",
          ],
        ),
        req(
          "4.2",
          "Use Limited to Collection Purposes",
          "Use information only for its purposes unless consent or an exception applies",
          "Use personal information only for its collection purposes unless the person consents (expressly for sensitive information) or a listed exception applies: a consistent purpose, the person's clear benefit, fraud prevention or security, delivering a requested service, or de-identified research or statistics (s. 12).",
          [
            "Are secondary uses identified and assessed against s. 12?",
            "Is express consent obtained for sensitive information?",
            "Is commercial or philanthropic prospection treated as a non-consistent purpose?",
          ],
          [
            "Secondary use assessments",
            "Sensitive data register",
            "Express consent records",
          ],
        ),
        req(
          "4.3",
          "De-identified Information",
          "Limit re-identification risk when using de-identified data",
          "Any enterprise that uses de-identified information must take reasonable measures to limit the risk that someone identifies a natural person from it (s. 12).",
          [
            "Where is de-identified data used, for example in analytics or model training?",
            "What controls prevent re-identification?",
            "Is re-identification risk reviewed periodically?",
          ],
          [
            "De-identification standard",
            "Re-identification risk assessment",
            "Access controls on de-identified datasets",
          ],
        ),
        req(
          "4.4",
          "Communication to Third Parties",
          "Share personal information only with consent or legal authority",
          "Do not communicate personal information to a third party unless the person consents (expressly for sensitive information) or the Act allows it (s. 13).",
          [
            "Which third parties receive personal information?",
            "What consent or legal basis supports each disclosure?",
            "Is express consent obtained for sensitive information?",
          ],
          [
            "Disclosure register",
            "Data sharing agreements",
            "Consent records",
          ],
        ),
        req(
          "4.5",
          "Service Providers and Mandataries",
          "Use written contracts with privacy safeguards for service providers",
          "When communicating information to a mandatary or contractor without consent, entrust the mandate in writing and specify confidentiality measures, use only for the mandate and no retention after it ends; the provider must report actual or attempted breaches to the person in charge and allow verifications (s. 18.3).",
          [
            "Is every provider handling personal information under a written contract?",
            "Do contracts include the s. 18.3 safeguards?",
            "Are providers required to report violations and allow verification?",
          ],
          [
            "Vendor contracts or DPAs",
            "Vendor inventory",
            "Verification or audit records",
          ],
        ),
        req(
          "4.6",
          "Commercial Transactions",
          "Protect personal information shared in mergers, financings and sales",
          "Before communicating personal information for a commercial transaction, enter into an agreement limiting use to the transaction, requiring confidentiality and destruction if it does not close; after closing, the other party must notify affected people within a reasonable time (s. 18.4).",
          [
            "Is personal information shared during due diligence?",
            "Is a s. 18.4 agreement signed first?",
            "Is post-closing notice to individuals planned?",
          ],
          [
            "Transaction data agreement",
            "Data room access log",
            "Post-closing notice",
          ],
        ),
        req(
          "4.7",
          "Commercial or Philanthropic Prospection",
          "Identify yourself and honour opt-outs in marketing",
          "When using personal information for commercial or philanthropic prospection, identify the enterprise and inform the person of their right to withdraw consent; stop such use once consent is withdrawn (s. 22).",
          [
            "Do marketing messages identify the enterprise?",
            "Do they explain how to withdraw consent?",
            "Are withdrawals applied across all channels?",
          ],
          [
            "Marketing templates",
            "Suppression list",
            "Opt-out processing records",
          ],
        ),
        req(
          "4.8",
          "Need-to-Know Internal Access",
          "Limit staff access to what their duties require",
          "Authorized employees or agents may access personal information without consent only where it is needed to perform their duties (s. 20).",
          [
            "Is access to personal information role-based?",
            "Are access rights reviewed regularly?",
            "Are access logs kept for sensitive systems?",
          ],
          [
            "Access control policy",
            "Access review records",
            "Access logs",
          ],
        ),
      ],
    },
    {
      key: "5",
      title: "Automated Decisions",
      requirements: [
        req(
          "5.1",
          "Notice of Exclusively Automated Decisions",
          "Tell people when a decision about them is fully automated",
          "When personal information is used to make a decision based exclusively on automated processing, inform the person no later than when they are told of the decision (s. 12.1).",
          [
            "Which decisions are made solely by automated processing?",
            "Does the decision message say it was automated?",
            "Is this inventory kept current as AI systems change?",
          ],
          [
            "Automated decision inventory",
            "Decision notice templates",
            "Sample notices sent",
          ],
        ),
        req(
          "5.2",
          "Explanation on Request",
          "Explain the data, reasons and main factors behind an automated decision",
          "On request, tell the person what personal information was used, the reasons and principal factors and parameters that led to the decision, and their right to have that information corrected (s. 12.1).",
          [
            "Can the inputs used for a given decision be retrieved?",
            "Can principal factors and parameters be explained in plain language?",
            "Is the correction right communicated?",
          ],
          [
            "Explanation procedure",
            "Model factor documentation",
            "Explanation request log",
          ],
        ),
        req(
          "5.3",
          "Human Review of Observations",
          "Let people submit observations to staff who can review the decision",
          "Give the person the opportunity to submit observations to a staff member who is in a position to review the automated decision (s. 12.1).",
          [
            "Who can review automated decisions, and do they have authority to change them?",
            "How do people submit observations?",
            "Are reviews and outcomes recorded?",
          ],
          [
            "Review procedure",
            "Reviewer assignments",
            "Review case log",
          ],
        ),
        req(
          "5.4",
          "Accuracy and Retention of Decision Data",
          "Keep decision data accurate and retain it at least a year",
          "When personal information is used to make a decision about a person, ensure it is up to date and accurate, and keep the information used for at least one year after the decision (s. 11).",
          [
            "How is accuracy checked before decisions are made?",
            "Is decision input data retained for at least one year?",
            "Can retained data be linked to the decision?",
          ],
          [
            "Data quality controls",
            "Retention schedule",
            "Decision data archive",
          ],
        ),
      ],
    },
    {
      key: "6",
      title: "Security and Confidentiality Incidents",
      requirements: [
        req(
          "6.1",
          "Security Measures",
          "Protect personal information with appropriate security measures",
          "Take the security measures necessary to protect personal information collected, used, communicated, kept or destroyed; failing to do so can attract a monetary administrative penalty (ss. 10, 90.1(4)).",
          [
            "Are security controls proportionate to the sensitivity of the data?",
            "Do they cover the full life cycle, including destruction?",
            "Are controls tested regularly?",
          ],
          [
            "Information security policy",
            "Security assessments",
            "Control test results",
          ],
        ),
        req(
          "6.2",
          "Incident Response and Risk of Serious Injury",
          "Contain incidents and assess the risk of serious injury",
          "When an enterprise has cause to believe a confidentiality incident occurred, take reasonable measures to reduce injury and prevent recurrence, and assess the risk of serious injury (sensitivity, consequences, likelihood of misuse) in consultation with the person in charge (ss. 3.5, 3.6, 3.7).",
          [
            "Is there an incident response procedure for personal information?",
            "Does the risk assessment use the s. 3.7 factors?",
            "Is the person in charge consulted for each incident?",
          ],
          [
            "Incident response plan",
            "Risk of injury assessments",
            "Post-incident reviews",
          ],
        ),
        req(
          "6.3",
          "Incident Notification",
          "Promptly notify the Commission and affected people of serious incidents",
          "If an incident presents a risk of serious injury, promptly notify the Commission d'accès à l'information and the affected persons (notice to individuals may be delayed only to avoid hampering a criminal investigation); others who could reduce the risk may be told, with the communication recorded by the person in charge (s. 3.5).",
          [
            "Who decides on and sends notifications?",
            "Are Commission and individual notice templates ready?",
            "Are communications to third parties recorded?",
          ],
          [
            "Notification templates",
            "Commission notices filed",
            "Notices to individuals",
          ],
        ),
        req(
          "6.4",
          "Incident Register",
          "Keep a register of all confidentiality incidents",
          "Keep a register of confidentiality incidents and send a copy to the Commission on request (s. 3.8).",
          [
            "Are all incidents recorded, including those without serious risk?",
            "Does the register meet the regulatory content requirements?",
            "Can it be produced quickly for the Commission?",
          ],
          ["Incident register", "Register review records"],
        ),
      ],
    },
    {
      key: "7",
      title: "Individual Rights",
      requirements: [
        req(
          "7.1",
          "Access Requests",
          "Answer access requests in writing within 30 days",
          "On request, confirm that personal information exists, communicate it and allow a copy; requests go to the person in charge, who must help identify the information, reply in writing within 30 days and explain any refusal with the legal basis and available remedies (ss. 27, 30, 32, 34).",
          [
            "Is there an intake process routed to the person in charge?",
            "Are replies sent within 30 days?",
            "Do refusals cite the provision and remedies?",
          ],
          [
            "Access request procedure",
            "Request tracking log",
            "Response letters",
          ],
        ),
        req(
          "7.2",
          "Data Portability",
          "Provide collected data in a structured, commonly used format",
          "On request, unless serious practical difficulties arise, communicate computerized personal information collected from the person (not created or inferred) in a structured, commonly used technological format, to them or to an authorized person or body; projects must be designed to allow this (ss. 27, 3.3).",
          [
            "Can systems export collected data in a structured, common format?",
            "Is inferred or derived data distinguished from collected data?",
            "Can data be sent directly to an authorized third party?",
          ],
          [
            "Portability export specification",
            "Sample export",
            "Portability request log",
          ],
        ),
        req(
          "7.3",
          "Rectification",
          "Correct inaccurate, incomplete or unlawfully held information",
          "On request, rectify personal information that is inaccurate, incomplete or equivocal, or whose collection, communication or keeping is not authorized by law (s. 28).",
          [
            "How are rectification requests received and verified?",
            "Are corrections propagated to recipients and downstream systems?",
            "Are responses sent within 30 days?",
          ],
          [
            "Rectification procedure",
            "Correction records",
            "Response letters",
          ],
        ),
        req(
          "7.4",
          "Cessation of Dissemination and De-indexation",
          "Stop disseminating or de-index information when the criteria are met",
          "On request, cease disseminating personal information or de-index hyperlinks to it where dissemination breaches the law or a court order, or where the s. 28.1 serious-injury balancing test is met; the person in charge attests to the outcome in the written reply (s. 28.1).",
          [
            "Does the enterprise publish or index personal information?",
            "Is there a documented method for applying the s. 28.1 criteria?",
            "Are outcomes attested in writing?",
          ],
          [
            "De-indexation procedure",
            "Balancing assessments",
            "Written replies",
          ],
        ),
      ],
    },
    {
      key: "8",
      title: "Retention, Destruction and Anonymization",
      requirements: [
        req(
          "8.1",
          "Destruction or Anonymization After Use",
          "Destroy or properly anonymize information once purposes are achieved",
          "Once the purposes are achieved, destroy the personal information or anonymize it for serious and legitimate purposes, subject to legal retention periods; anonymization must be irreversible and follow generally accepted best practices and regulatory criteria (s. 23).",
          [
            "Are retention periods defined per purpose?",
            "Is destruction or anonymization triggered when purposes end?",
            "Does anonymization follow the regulatory criteria?",
          ],
          [
            "Retention schedule",
            "Destruction certificates",
            "Anonymization method documentation",
          ],
        ),
      ],
    },
  ],
};
