import type { FrameworkDefinition } from "../types";
import { clause } from "../helpers";

export const gdpr: FrameworkDefinition = {
  slug: "gdpr",
  name: "GDPR Compliance Framework",
  navLabel: "GDPR",
  kind: "regulation",
  policyNames: ["GDPR"],
  description:
    "Key articles of the EU General Data Protection Regulation: processing principles, data-subject rights, and controller and processor obligations.",
  source: {
    title: "Regulation (EU) 2016/679 (EUR-Lex)",
    url: "https://eur-lex.europa.eu/eli/reg/2016/679/oj",
  },
  sections: [
    {
      key: "1",
      title: "Chapter 2: Principles",
      requirements: [
        clause(
          "1.1",
          "Art. 5 - Principles relating to processing",
          "Core data protection principles including lawfulness, fairness, transparency, purpose limitation, data minimization, accuracy, storage limitation, integrity and confidentiality",
          [
            "What is the lawful basis for processing?",
            "How is transparency ensured?",
            "Is data collection minimized to what is necessary?",
          ],
          [
            "Privacy policy documentation",
            "Data processing register",
            "Lawful basis assessment",
          ],
        ),
        clause(
          "1.2",
          "Art. 6 - Lawfulness of processing",
          "Establish lawful basis for all processing activities",
          [
            "Which lawful basis applies to each processing activity?",
            "Is consent freely given, specific, informed and unambiguous?",
            "Are legitimate interests documented and balanced?",
          ],
          [
            "Consent records",
            "Legitimate interest assessments",
            "Contract documentation",
          ],
        ),
        clause(
          "1.3",
          "Art. 7 - Conditions for consent",
          "Ensure consent meets GDPR requirements",
          [
            "Can consent be demonstrated?",
            "Is consent request clearly distinguishable?",
            "Can consent be easily withdrawn?",
          ],
          [
            "Consent management system",
            "Consent forms",
            "Withdrawal mechanism documentation",
          ],
        ),
      ],
    },
    {
      key: "2",
      title: "Chapter 3: Rights of the Data Subject",
      requirements: [
        clause(
          "2.1",
          "Art. 12 - Transparent communication",
          "Provide clear, accessible information about data processing",
          [
            "Is information provided in clear and plain language?",
            "Are requests responded to within one month?",
            "Is information provided free of charge?",
          ],
          [
            "Privacy notices",
            "Response time logs",
            "Communication templates",
          ],
        ),
        clause(
          "2.2",
          "Art. 15 - Right of access",
          "Enable data subjects to access their personal data",
          [
            "Can data subjects request access to their data?",
            "Is a copy of data provided in electronic format?",
            "Are all required details included in the response?",
          ],
          [
            "Subject access request procedure",
            "SAR response templates",
            "Access request logs",
          ],
        ),
        clause(
          "2.3",
          "Art. 17 - Right to erasure",
          "Enable deletion of personal data when requested",
          [
            "Can data be erased upon request?",
            "Are third parties notified of erasure?",
            "Are exceptions properly documented?",
          ],
          [
            "Erasure procedure",
            "Deletion logs",
            "Third-party notification records",
          ],
        ),
      ],
    },
    {
      key: "3",
      title: "Chapter 4: Controller and Processor",
      requirements: [
        clause(
          "3.1",
          "Art. 25 - Data protection by design and default",
          "Build privacy into systems and processes from the start",
          [
            "Are privacy considerations part of the design process?",
            "Is data minimization applied by default?",
            "Are privacy-enhancing technologies used?",
          ],
          [
            "Privacy impact assessments",
            "System design documentation",
            "Default settings documentation",
          ],
        ),
        clause(
          "3.2",
          "Art. 30 - Records of processing activities",
          "Document all data processing activities",
          [
            "Is a processing register maintained?",
            "Does it include all required information?",
            "Is it kept up to date?",
          ],
          [
            "Records of processing activities (ROPA)",
            "Data flow diagrams",
            "Processing activity updates",
          ],
        ),
        clause(
          "3.3",
          "Art. 32 - Security of processing",
          "Ensure appropriate security for personal data",
          [
            "Is encryption used where appropriate?",
            "Are systems regularly tested?",
            "Is there a process for restoring data availability?",
          ],
          [
            "Security policy",
            "Penetration test results",
            "Backup and recovery procedures",
          ],
        ),
        clause(
          "3.4",
          "Art. 33 - Notification of personal data breach",
          "Establish breach notification procedures",
          [
            "Is there a breach detection process?",
            "Can notification be made within 72 hours?",
            "Is there a breach register?",
          ],
          [
            "Breach response procedure",
            "Breach notification templates",
            "Breach register",
          ],
        ),
      ],
    },
  ],
};
