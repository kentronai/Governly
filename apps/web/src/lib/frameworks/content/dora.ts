import type { FrameworkDefinition } from "../types";
import { clause } from "../helpers";

export const dora: FrameworkDefinition = {
  slug: "dora",
  name: "DORA Compliance Framework",
  navLabel: "DORA",
  kind: "regulation",
  policyNames: ["DORA"],
  description:
    "Digital operational resilience requirements for financial entities: ICT risk management, incident management, resilience testing, third-party ICT risk and information sharing.",
  source: {
    title: "Regulation (EU) 2022/2554 (EUR-Lex)",
    url: "https://eur-lex.europa.eu/eli/reg/2022/2554/oj",
  },
  sections: [
    {
      key: "1",
      title: "ICT Risk Management",
      requirements: [
        clause(
          "1.1",
          "ICT Risk Management Framework",
          "Establish ICT risk management governance",
          [
            "Is there an ICT risk management policy?",
            "Is ICT risk integrated into enterprise risk management?",
            "Are ICT risks reported to the management body?",
          ],
          ["ICT risk policy", "ERM integration", "Board reports"],
        ),
        clause(
          "1.2",
          "ICT Asset Management",
          "Maintain ICT asset inventory",
          [
            "Are all ICT assets inventoried?",
            "Are dependencies mapped?",
            "Are critical assets identified?",
          ],
          ["Asset inventory", "Dependency mapping", "Criticality assessment"],
        ),
        clause(
          "1.3",
          "ICT Business Continuity",
          "Plan for ICT continuity",
          [
            "Is there an ICT BCP?",
            "Are recovery objectives defined?",
            "Are plans tested annually?",
          ],
          ["BCP documentation", "RTO/RPO definitions", "Test results"],
        ),
      ],
    },
    {
      key: "2",
      title: "ICT Incident Management",
      requirements: [
        clause(
          "2.1",
          "Incident Detection",
          "Detect ICT incidents promptly",
          [
            "Are monitoring systems in place?",
            "Are anomalies detected automatically?",
            "Is 24/7 monitoring available for critical systems?",
          ],
          ["Monitoring tools", "Alert configuration", "Coverage documentation"],
        ),
        clause(
          "2.2",
          "Incident Classification",
          "Classify incidents consistently",
          [
            "Is there an incident classification scheme?",
            "Are major incidents clearly defined?",
            "Is classification aligned with regulatory requirements?",
          ],
          [
            "Classification criteria",
            "Major incident definition",
            "Regulatory mapping",
          ],
        ),
        clause(
          "2.3",
          "Incident Reporting",
          "Report incidents to regulators",
          [
            "Is there a regulatory reporting process?",
            "Are reporting timelines met?",
            "Are root cause analyses performed?",
          ],
          ["Reporting procedures", "Submission records", "RCA reports"],
        ),
      ],
    },
    {
      key: "3",
      title: "Digital Operational Resilience Testing",
      requirements: [
        clause(
          "3.1",
          "Vulnerability Assessments",
          "Assess vulnerabilities regularly",
          [
            "Are vulnerability scans performed?",
            "Are findings remediated?",
            "Is scanning scope comprehensive?",
          ],
          ["Scan reports", "Remediation tracking", "Scope documentation"],
        ),
        clause(
          "3.2",
          "Penetration Testing",
          "Test security through penetration testing",
          [
            "Is penetration testing performed?",
            "Are critical systems in scope?",
            "Are findings addressed?",
          ],
          [
            "Penetration test reports",
            "Scope documentation",
            "Remediation evidence",
          ],
        ),
        clause(
          "3.3",
          "Threat-Led Penetration Testing",
          "Perform advanced resilience testing",
          [
            "Is TLPT required for your entity?",
            "Are qualified testers engaged?",
            "Are results reported to authorities?",
          ],
          ["TLPT reports", "Tester qualifications", "Regulatory submissions"],
        ),
      ],
    },
    {
      key: "4",
      title: "Third-Party ICT Risk",
      requirements: [
        clause(
          "4.1",
          "Third-Party Strategy",
          "Define third-party ICT risk strategy",
          [
            "Is there a third-party ICT strategy?",
            "Are concentration risks assessed?",
            "Is cloud strategy defined?",
          ],
          ["Third-party strategy", "Concentration analysis", "Cloud policy"],
        ),
        clause(
          "4.2",
          "Due Diligence",
          "Assess third parties before engagement",
          [
            "Is due diligence performed?",
            "Are security capabilities assessed?",
            "Are risks documented?",
          ],
          ["Due diligence reports", "Assessment criteria", "Risk documentation"],
        ),
        clause(
          "4.3",
          "Contractual Requirements",
          "Ensure contracts meet DORA requirements",
          [
            "Do contracts include required provisions?",
            "Are audit rights included?",
            "Are exit strategies defined?",
          ],
          ["Contract templates", "Clause checklist", "Exit plans"],
        ),
        clause(
          "4.4",
          "Ongoing Monitoring",
          "Continuously monitor third parties",
          [
            "Is third-party performance monitored?",
            "Are incidents tracked?",
            "Are reviews conducted periodically?",
          ],
          ["Monitoring dashboards", "Incident tracking", "Review records"],
        ),
      ],
    },
    {
      key: "5",
      title: "Information Sharing",
      requirements: [
        clause(
          "5.1",
          "Threat Intelligence",
          "Share and receive threat intelligence",
          [
            "Is threat intelligence shared?",
            "Are sharing arrangements in place?",
            "Is received intelligence actionable?",
          ],
          ["Sharing agreements", "Intelligence reports", "Action records"],
        ),
      ],
    },
  ],
};
