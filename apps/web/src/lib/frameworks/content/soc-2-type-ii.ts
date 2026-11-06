import type { FrameworkDefinition } from "../types";
import { clause } from "../helpers";

export const soc2TypeII: FrameworkDefinition = {
  slug: "soc-2-type-ii",
  name: "SOC 2 Type II Framework",
  navLabel: "SOC 2 Type II",
  kind: "framework",
  // Enabled from the Frameworks library (tenant_frameworks), not as a policy.
  policyNames: [],
  description:
    "AICPA Trust Services Criteria for service organizations: common criteria controls for the control environment, communication, risk assessment, access and system operations.",
  source: {
    title: "AICPA SOC 2 — Trust Services Criteria",
    url: "https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2",
  },
  sections: [
    {
      key: "1",
      title: "CC1: Control Environment",
      requirements: [
        clause(
          "1.1",
          "CC1.1 - Commitment to Integrity and Ethics",
          "Establish and communicate ethical standards",
          [
            "Is there a code of conduct?",
            "How are ethical standards communicated?",
            "How are violations handled?",
          ],
          ["Code of conduct", "Ethics training records", "Disciplinary action records"],
        ),
        clause(
          "1.2",
          "CC1.2 - Board Independence and Oversight",
          "Ensure board provides effective oversight",
          [
            "Does the board have independent members?",
            "How often does the board meet?",
            "What is the scope of board oversight?",
          ],
          ["Board charter", "Board meeting minutes", "Independence declarations"],
        ),
        clause(
          "1.3",
          "CC1.3 - Management Structure and Authority",
          "Define clear organizational structure",
          [
            "Is the org structure documented?",
            "Are roles and responsibilities clear?",
            "Are reporting lines defined?",
          ],
          ["Organization chart", "Job descriptions", "RACI matrix"],
        ),
      ],
    },
    {
      key: "2",
      title: "CC2: Communication and Information",
      requirements: [
        clause(
          "2.1",
          "CC2.1 - Internal Communication",
          "Ensure effective internal communication",
          [
            "How is control information communicated internally?",
            "Are policies accessible to employees?",
            "Is there a process for reporting issues?",
          ],
          [
            "Internal communication records",
            "Policy distribution logs",
            "Whistleblower program",
          ],
        ),
        clause(
          "2.2",
          "CC2.2 - External Communication",
          "Manage external communications effectively",
          [
            "How are commitments communicated to customers?",
            "Is there external reporting on controls?",
            "How are third parties informed of requirements?",
          ],
          ["Customer contracts", "Service level agreements", "External audit reports"],
        ),
      ],
    },
    {
      key: "3",
      title: "CC3: Risk Assessment",
      requirements: [
        clause(
          "3.1",
          "CC3.1 - Risk Identification",
          "Identify risks that could impact objectives",
          [
            "Is there a formal risk assessment process?",
            "How often are risks reassessed?",
            "Are emerging risks considered?",
          ],
          ["Risk assessment methodology", "Risk register", "Risk assessment reports"],
        ),
        clause(
          "3.2",
          "CC3.2 - Fraud Risk Assessment",
          "Assess and address fraud risks",
          [
            "Is fraud risk specifically assessed?",
            "Are fraud scenarios documented?",
            "What anti-fraud controls exist?",
          ],
          ["Fraud risk assessment", "Anti-fraud policy", "Fraud detection controls"],
        ),
        clause(
          "3.3",
          "CC3.3 - Change Management Risk",
          "Manage risks from organizational changes",
          [
            "How are changes assessed for risk?",
            "Is there a change management process?",
            "Are control impacts evaluated?",
          ],
          [
            "Change management policy",
            "Change risk assessments",
            "Change approval records",
          ],
        ),
      ],
    },
    {
      key: "4",
      title: "CC6: Logical and Physical Access Controls",
      requirements: [
        clause(
          "4.1",
          "CC6.1 - Logical Access Security",
          "Control access to systems and data",
          [
            "Is access based on least privilege?",
            "Is multi-factor authentication used?",
            "How is access provisioned and revoked?",
          ],
          [
            "Access control policy",
            "MFA configuration",
            "Access provisioning procedures",
          ],
        ),
        clause(
          "4.2",
          "CC6.2 - Access Registration and Authorization",
          "Ensure proper access authorization",
          [
            "Is there an access request process?",
            "Who approves access requests?",
            "Is access reviewed periodically?",
          ],
          ["Access request forms", "Access approval records", "Access review reports"],
        ),
        clause(
          "4.3",
          "CC6.3 - Access Removal",
          "Timely removal of access",
          [
            "Is access removed upon termination?",
            "How quickly is access revoked?",
            "Is there a process for role changes?",
          ],
          [
            "Termination checklist",
            "Access removal logs",
            "Role change procedures",
          ],
        ),
      ],
    },
    {
      key: "5",
      title: "CC7: System Operations",
      requirements: [
        clause(
          "5.1",
          "CC7.1 - Vulnerability Management",
          "Identify and address system vulnerabilities",
          [
            "Are vulnerability scans performed regularly?",
            "How are vulnerabilities prioritized?",
            "What is the remediation timeline?",
          ],
          [
            "Vulnerability scan reports",
            "Remediation tracking",
            "Patch management records",
          ],
        ),
        clause(
          "5.2",
          "CC7.2 - Security Monitoring",
          "Monitor for security incidents",
          [
            "Is there continuous monitoring?",
            "What events trigger alerts?",
            "How are alerts investigated?",
          ],
          ["SIEM configuration", "Alert rules", "Incident logs"],
        ),
        clause(
          "5.3",
          "CC7.3 - Incident Response",
          "Effectively respond to security incidents",
          [
            "Is there an incident response plan?",
            "Are roles defined for incident response?",
            "Are incidents documented and reviewed?",
          ],
          ["Incident response plan", "Incident reports", "Post-incident reviews"],
        ),
      ],
    },
  ],
};
