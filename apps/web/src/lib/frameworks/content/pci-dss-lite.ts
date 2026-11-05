import type { FrameworkDefinition } from "../types";

// Requirement titles follow the PCI DSS principal requirements (numbering kept
// so assessors can map them); guidance text is NORIX's own summary and does
// not reproduce the standard. Flat framework: each requirement is one control.
export const pciDssLite: FrameworkDefinition = {
  slug: "pci-dss-lite",
  name: "PCI DSS Lite",
  navLabel: "PCI DSS Lite",
  policyNames: ["PCI DSS Lite"],
  description:
    "A condensed view of the PCI Data Security Standard for systems — including AI systems — that store, process or transmit payment card data. It does not replace the official standard or a formal assessment.",
  source: {
    title: "PCI Security Standards Council document library",
    url: "https://www.pcisecuritystandards.org/document_library/",
  },
  sections: [
    {
      key: "1",
      title: "Build and Maintain a Secure Network",
      requirements: [
        {
          key: "1.1",
          title: "Req 1: Install and maintain firewall configuration",
          description:
            "Use network security controls to separate the cardholder data environment from untrusted networks, including the networks AI services run on.",
          summary:
            "Control traffic into and out of the cardholder data environment",
          keyQuestions: [
            "Are firewalls or equivalent controls in place at every boundary of the cardholder data environment?",
            "Are rule sets documented, justified and reviewed on a schedule?",
            "Is inbound and outbound traffic limited to what the business needs?",
          ],
          evidenceExamples: [
            "Network diagram with boundaries",
            "Firewall rule set export",
            "Rule review sign-offs",
          ],
          subcontrols: [],
        },
        {
          key: "1.2",
          title: "Req 2: Do not use vendor-supplied defaults",
          description:
            "Replace default passwords, accounts and settings before systems go live and harden every component to an approved baseline.",
          summary: "Remove default credentials and harden configurations",
          keyQuestions: [
            "Are default accounts disabled or their passwords changed before deployment?",
            "Is there a documented hardening baseline for each system type?",
            "Are services, ports and features that are not needed turned off?",
          ],
          evidenceExamples: [
            "Hardening baselines",
            "Configuration scan results",
            "Deployment checklist",
          ],
          subcontrols: [],
        },
      ],
    },
    {
      key: "2",
      title: "Protect Cardholder Data",
      requirements: [
        {
          key: "2.1",
          title: "Req 3: Protect stored cardholder data",
          description:
            "Keep as little card data as possible, render stored card numbers unreadable and never let them flow into AI prompts, logs or training data.",
          summary: "Minimize retention and make stored card data unreadable",
          keyQuestions: [
            "Is a retention policy applied so card data is deleted when no longer needed?",
            "Are stored card numbers encrypted, tokenized or truncated?",
            "Are card numbers masked when displayed and excluded from AI inputs and datasets?",
          ],
          evidenceExamples: [
            "Data retention schedule",
            "Encryption or tokenization design",
            "Data-flow map showing AI exclusions",
          ],
          subcontrols: [],
        },
        {
          key: "2.2",
          title: "Req 4: Encrypt transmission of cardholder data",
          description:
            "Protect card data with strong cryptography whenever it crosses open or public networks, including calls to externally hosted models.",
          summary: "Protect card data in transit",
          keyQuestions: [
            "Is strong, current TLS used for every transmission of card data?",
            "Are certificates valid and weak protocols disabled?",
            "Is sending card numbers over end-user messaging such as email prohibited?",
          ],
          evidenceExamples: [
            "TLS configuration scan",
            "Certificate inventory",
            "Data handling procedure",
          ],
          subcontrols: [],
        },
      ],
    },
    {
      key: "3",
      title: "Maintain a Vulnerability Management Program",
      requirements: [
        {
          key: "3.1",
          title: "Req 5: Use and update anti-virus software",
          description:
            "Protect systems commonly affected by malware and keep detection mechanisms current and active.",
          summary: "Detect and block malicious software",
          keyQuestions: [
            "Is anti-malware deployed on every system that is commonly at risk?",
            "Are signatures and engines updated automatically?",
            "Are scans run regularly and alerts investigated?",
          ],
          evidenceExamples: [
            "Endpoint protection coverage report",
            "Update logs",
            "Alert handling records",
          ],
          subcontrols: [],
        },
        {
          key: "3.2",
          title: "Req 6: Develop and maintain secure systems",
          description:
            "Build software, including AI applications and pipelines, through a secure development process and patch known vulnerabilities promptly.",
          summary: "Build securely and patch quickly",
          keyQuestions: [
            "Are critical security patches applied within a defined timeframe?",
            "Is there a secure development lifecycle with security testing?",
            "Are code changes reviewed before release?",
          ],
          evidenceExamples: [
            "Patch compliance report",
            "SDLC procedure",
            "Code review records",
          ],
          subcontrols: [],
        },
      ],
    },
    {
      key: "4",
      title: "Implement Strong Access Control Measures",
      requirements: [
        {
          key: "4.1",
          title: "Req 7: Restrict access to cardholder data",
          description:
            "Grant access to card data and the systems that handle it — including AI agents and service accounts — only where the role requires it.",
          summary: "Limit access to those who need it",
          keyQuestions: [
            "Is access assigned by job role on a least-privilege basis?",
            "Is every access grant approved and documented?",
            "Are access rights reviewed periodically and removed when no longer needed?",
          ],
          evidenceExamples: [
            "Role and access matrix",
            "Access approval tickets",
            "Access review results",
          ],
          subcontrols: [],
        },
        {
          key: "4.2",
          title: "Req 8: Assign unique ID to each person",
          description:
            "Give each user an individual identity and strong authentication so every action can be traced to one person.",
          summary: "Make every action attributable to one user",
          keyQuestions: [
            "Does every user have a unique account with no shared credentials?",
            "Is multi-factor authentication required for access to the card data environment?",
            "Are password and lockout rules enforced?",
          ],
          evidenceExamples: [
            "User account listing",
            "MFA configuration",
            "Authentication policy",
          ],
          subcontrols: [],
        },
      ],
    },
    {
      key: "5",
      title: "Monitor and Test Networks",
      requirements: [
        {
          key: "5.1",
          title: "Req 10: Track and monitor all access",
          description:
            "Log access to system components and card data, including model endpoints, and review the logs so suspicious activity is caught.",
          summary: "Keep and review audit trails",
          keyQuestions: [
            "Are all access events to card data and critical systems logged?",
            "Are logs protected from tampering and retained for the required period?",
            "Are logs reviewed daily or by automated alerting?",
          ],
          evidenceExamples: [
            "Logging configuration",
            "Log retention settings",
            "Log review records",
          ],
          subcontrols: [],
        },
        {
          key: "5.2",
          title: "Req 11: Test security systems regularly",
          description:
            "Test controls on a schedule — vulnerability scans, penetration tests and change detection — and fix what the tests find.",
          summary: "Prove the controls work through testing",
          keyQuestions: [
            "Are internal and external vulnerability scans run at least quarterly?",
            "Is penetration testing performed at least annually and after major changes?",
            "Are findings tracked to remediation?",
          ],
          evidenceExamples: [
            "Scan reports",
            "Penetration test report",
            "Remediation tracker",
          ],
          subcontrols: [],
        },
      ],
    },
  ],
};
