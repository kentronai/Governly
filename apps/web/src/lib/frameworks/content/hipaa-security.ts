import type { FrameworkDefinition } from "../types";
import { req, spec } from "../helpers";

// Standards and implementation specifications follow 45 CFR Part 164 Subpart C.
// Guidance text is NORIX's own.
export const hipaaSecurity: FrameworkDefinition = {
  slug: "hipaa-security",
  name: "HIPAA Security Rule",
  navLabel: "HIPAA Security Rule",
  kind: "regulation",
  policyNames: ["HIPAA Security Rule"],
  description:
    "Security standards for protecting electronic protected health information (ePHI) under 45 CFR Part 164 Subpart C, covering administrative, physical and technical safeguards plus organizational and documentation requirements. Applies to covered entities and business associates, including AI systems that create, receive, maintain or transmit ePHI.",
  source: {
    title:
      "45 CFR Part 164 Subpart C — Security Standards for the Protection of ePHI (eCFR)",
    url: "https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C",
  },
  sections: [
    {
      key: "1",
      title: "Administrative Safeguards",
      requirements: [
        req(
          "1.1",
          "Security Management Process",
          "Run a security management program for ePHI",
          "Put policies and procedures in place to prevent, detect, contain and correct security violations.",
          [
            "Is there a documented security management process?",
            "Are security policies reviewed and updated on a schedule?",
          ],
          ["Security policies", "Risk management program"],
        ),
        spec(
          "1.1.1",
          "Risk Analysis (Required)",
          "Assess risks and vulnerabilities to the confidentiality, integrity and availability of ePHI, including AI systems.",
        ),
        spec(
          "1.1.2",
          "Risk Management (Required)",
          "Apply security measures that reduce identified risks to a reasonable and appropriate level.",
        ),
        spec(
          "1.1.3",
          "Sanction Policy (Required)",
          "Apply sanctions to workforce members who fail to follow security policies.",
        ),
        spec(
          "1.1.4",
          "Information System Activity Review (Required)",
          "Regularly review audit logs, access reports and security incident tracking.",
        ),
        req(
          "1.2",
          "Assigned Security Responsibility",
          "Name the person responsible for security",
          "Identify the security official responsible for developing and implementing security policies.",
          [
            "Who is the designated security official?",
            "Are their responsibilities written down?",
          ],
          ["Security official appointment", "Role description"],
        ),
        req(
          "1.3",
          "Workforce Security",
          "Give workforce members only the ePHI access they need",
          "Ensure appropriate workforce access to ePHI and prevent access by those who should not have it.",
          [
            "How is workforce access to ePHI decided?",
            "Are staff screened before receiving access?",
          ],
          ["Access authorization policy", "Screening records"],
        ),
        spec(
          "1.3.1",
          "Authorization and/or Supervision (Addressable)",
          "Authorize or supervise workforce members who work with ePHI or where it is accessible.",
        ),
        spec(
          "1.3.2",
          "Workforce Clearance Procedure (Addressable)",
          "Decide whether a workforce member's access to ePHI is appropriate.",
        ),
        spec(
          "1.3.3",
          "Termination Procedures (Addressable)",
          "End access to ePHI when employment or the need for access ends.",
        ),
        req(
          "1.4",
          "Security Awareness and Training",
          "Train the workforce on security",
          "Run a security awareness and training program for all workforce members, including management.",
          [
            "Do all staff receive security training?",
            "How often is the training refreshed?",
          ],
          ["Training materials", "Completion records"],
        ),
        spec(
          "1.4.1",
          "Security Reminders (Addressable)",
          "Send periodic security updates and reminders.",
        ),
        spec(
          "1.4.2",
          "Protection from Malicious Software (Addressable)",
          "Guard against, detect and report malicious software.",
        ),
        spec(
          "1.4.3",
          "Log-in Monitoring (Addressable)",
          "Monitor log-in attempts and report discrepancies.",
        ),
        spec(
          "1.4.4",
          "Password Management (Addressable)",
          "Create, change and safeguard passwords.",
        ),
      ],
    },
    {
      key: "2",
      title: "Physical Safeguards",
      requirements: [
        req(
          "2.1",
          "Facility Access Controls",
          "Limit physical access to systems holding ePHI",
          "Limit physical access to information systems and facilities while allowing authorized access.",
          [
            "How is physical access to facilities controlled?",
            "Are access logs kept?",
          ],
          ["Facility access policy", "Access logs"],
        ),
        spec(
          "2.1.1",
          "Contingency Operations (Addressable)",
          "Allow facility access to restore lost data during an emergency.",
        ),
        spec(
          "2.1.2",
          "Facility Security Plan (Addressable)",
          "Protect the facility and equipment from unauthorized access, tampering and theft.",
        ),
        spec(
          "2.1.3",
          "Access Control and Validation (Addressable)",
          "Control and validate a person's facility access based on role, including visitors.",
        ),
        spec(
          "2.1.4",
          "Maintenance Records (Addressable)",
          "Record repairs and changes to the physical security components of a facility.",
        ),
        req(
          "2.2",
          "Workstation Use",
          "Set rules for workstations that access ePHI",
          "Specify how workstations that access ePHI are used and the physical surroundings they are in.",
          [
            "Are workstation use rules written down?",
            "Is physical access to workstations controlled?",
          ],
          ["Workstation use policy", "Physical security measures"],
        ),
        req(
          "2.3",
          "Device and Media Controls",
          "Track devices and media that hold ePHI",
          "Govern how hardware and electronic media holding ePHI are received, moved and removed.",
          [
            "How are devices and media tracked?",
            "How is media with ePHI disposed of?",
          ],
          ["Asset inventory", "Media disposal records"],
        ),
        spec(
          "2.3.1",
          "Disposal (Required)",
          "Dispose of ePHI and the hardware or media it is stored on securely.",
        ),
        spec(
          "2.3.2",
          "Media Re-use (Required)",
          "Remove ePHI from electronic media before it is reused.",
        ),
        spec(
          "2.3.3",
          "Accountability (Addressable)",
          "Record movements of hardware and media and who is responsible for them.",
        ),
        spec(
          "2.3.4",
          "Data Backup and Storage (Addressable)",
          "Create a retrievable copy of ePHI before equipment is moved.",
        ),
      ],
    },
    {
      key: "3",
      title: "Technical Safeguards",
      requirements: [
        req(
          "3.1",
          "Access Control",
          "Control technical access to ePHI",
          "Allow access to ePHI systems only for authorized people and software.",
          [
            "How is system access controlled?",
            "Does each user have a unique ID?",
          ],
          ["Access control configuration", "User account list"],
        ),
        spec(
          "3.1.1",
          "Unique User Identification (Required)",
          "Assign a unique name or number to identify and track each user.",
        ),
        spec(
          "3.1.2",
          "Emergency Access Procedure (Required)",
          "Have a way to get necessary ePHI during an emergency.",
        ),
        spec(
          "3.1.3",
          "Automatic Logoff (Addressable)",
          "End sessions automatically after a set period of inactivity.",
        ),
        spec(
          "3.1.4",
          "Encryption and Decryption (Addressable)",
          "Encrypt and decrypt ePHI at rest.",
        ),
        req(
          "3.2",
          "Audit Controls",
          "Record and review activity on ePHI systems",
          "Use mechanisms that record and examine activity in systems containing ePHI.",
          [
            "Are audit logs kept for ePHI systems?",
            "How often are logs reviewed?",
          ],
          ["Audit log configuration", "Log review records"],
        ),
        req(
          "3.3",
          "Transmission Security",
          "Protect ePHI in transit",
          "Guard against unauthorized access to ePHI sent over electronic networks.",
          [
            "Is ePHI encrypted in transit?",
            "How is transmission integrity checked?",
          ],
          ["Encryption configuration", "Network security documentation"],
        ),
        spec(
          "3.3.1",
          "Integrity Controls (Addressable)",
          "Ensure transmitted ePHI is not changed without detection.",
        ),
        spec(
          "3.3.2",
          "Encryption (Addressable)",
          "Encrypt ePHI whenever appropriate during transmission.",
        ),
      ],
    },
  ],
};
