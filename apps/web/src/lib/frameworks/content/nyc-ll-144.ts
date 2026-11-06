import type { FrameworkDefinition } from "../types";
import { req } from "../helpers";

// NYC Admin Code §20-870 et seq. and DCWP rules (6 RCNY §5-300).
// Guidance text is NORIX's own.
export const nycLl144: FrameworkDefinition = {
  slug: "nyc-ll-144",
  name: "NYC Local Law 144",
  navLabel: "NYC Local Law 144",
  kind: "regulation",
  policyNames: ["NYC Local Law 144"],
  description:
    "New York City's rules for automated employment decision tools (AEDTs): independent bias audits, public audit summaries and candidate notices.",
  source: {
    title: "NYC DCWP — Automated Employment Decision Tools",
    url: "https://www.nyc.gov/site/dca/about/automated-employment-decision-tools.page",
  },
  sections: [
    {
      key: "1",
      title: "AEDT Classification & Scope",
      requirements: [
        req(
          "1.1",
          "AEDT Applicability Determination",
          "Decide whether each hiring tool is an AEDT",
          "Assess every tool used in hiring or promotion for NYC roles to determine whether it meets the AEDT definition.",
          [
            "Is the tool based on machine learning, statistical modeling, data analytics or AI?",
            "Does it produce a simplified output such as a score, ranking or recommendation?",
            "Is that output used to substantially assist or replace discretionary hiring or promotion decisions?",
          ],
          [
            "AEDT inventory",
            "Tool assessment memos",
            "Vendor technical descriptions",
          ],
        ),
      ],
    },
    {
      key: "2",
      title: "Bias Audit Requirements",
      requirements: [
        req(
          "2.1",
          "Independent Annual Bias Audit",
          "Audit each AEDT independently every year",
          "Have an independent auditor complete a bias audit no more than a year before the tool is used, and repeat it annually.",
          [
            "Is the auditor independent of the tool's developer, vendor and user?",
            "Does the audit report selection or scoring rates and impact ratios by sex, race/ethnicity and their intersections?",
            "Is the data used (historical or test) appropriate under the DCWP rules?",
          ],
          [
            "Signed audit report",
            "Auditor independence statement",
            "Audit methodology",
          ],
        ),
        req(
          "2.2",
          "Bias Audit Publication",
          "Publish the audit results",
          "Post a summary of the latest bias audit and the tool's distribution date on the employment section of your website before using the tool.",
          [
            "Is the summary publicly posted before the tool is used?",
            "Does it include the audit date, data source, rates and impact ratios?",
            "Will it stay posted for the required period after the tool's last use?",
          ],
          [
            "Public summary URL",
            "Page archive snapshots",
            "Publication date records",
          ],
        ),
      ],
    },
    {
      key: "3",
      title: "Candidate Notice & Transparency",
      requirements: [
        req(
          "3.1",
          "Advance Candidate Notice",
          "Notify candidates before an AEDT is used",
          "Tell NYC candidates and employees at least 10 business days in advance that an AEDT will be used and what it assesses.",
          [
            "Does the notice say an AEDT will be used?",
            "Does it list the job qualifications and characteristics assessed?",
            "Does it explain how to request an alternative process or accommodation?",
          ],
          ["Notice templates", "Notice delivery records", "Job posting text"],
        ),
        req(
          "3.2",
          "Data Use Disclosure",
          "Disclose what data the AEDT uses",
          "Make available the type and source of data the AEDT collects, either publicly or within 30 days of a written request.",
          [
            "Are the categories of data used described?",
            "Are the data sources identified?",
            "Is there a process to answer written requests on time?",
          ],
          ["Data disclosure statement", "Request handling log"],
        ),
        req(
          "3.3",
          "Data Retention Disclosure",
          "Disclose how long AEDT data is kept",
          "Make your AEDT data retention policy available to candidates and employees.",
          [
            "Is the retention period stated?",
            "Are deletion practices described?",
            "Can candidates easily find or request the policy?",
          ],
          [
            "Retention policy",
            "Retention schedule",
            "Policy publication record",
          ],
        ),
      ],
    },
    {
      key: "4",
      title: "Alternative Selection & Accommodations",
      requirements: [
        req(
          "4.1",
          "Alternative Selection Process",
          "Handle requests for alternatives fairly",
          "Explain how to request an alternative selection process or reasonable accommodation, and handle requests promptly and without penalty.",
          [
            "Are instructions for requesting alternatives clear?",
            "Are requests tracked and answered promptly?",
            "Are candidates protected from disadvantage for asking?",
          ],
          [
            "Accommodation workflow",
            "Request case log",
            "HR escalation procedure",
          ],
        ),
      ],
    },
    {
      key: "5",
      title: "Documentation & Record Keeping",
      requirements: [
        req(
          "5.1",
          "Record Retention",
          "Keep proof of compliance",
          "Retain audits, notices, disclosures and request handling records so compliance can be shown to regulators.",
          [
            "Are bias audits and summaries retained?",
            "Are notice and disclosure records kept?",
            "Could records be produced quickly for an inspection?",
          ],
          ["Compliance archive", "Audit document store", "Retention logs"],
        ),
      ],
    },
    {
      key: "6",
      title: "Vendor Management",
      requirements: [
        req(
          "6.1",
          "Vendor Responsibility Allocation",
          "Agree who does what with AEDT vendors",
          "When an AEDT comes from a vendor, define in contract who provides audit data, who publishes results and who notifies candidates — the employer stays responsible.",
          [
            "Does the contract assign responsibility for the bias audit?",
            "Is responsibility for publishing the summary assigned?",
            "Is it clear the employer still sends candidate notices?",
          ],
          [
            "Vendor contract",
            "Responsibility matrix",
            "Vendor audit deliverables",
          ],
        ),
      ],
    },
    {
      key: "7",
      title: "Pre-Deployment Compliance",
      requirements: [
        req(
          "7.1",
          "Pre-Use Compliance Verification",
          "Check everything before go-live",
          "Confirm all Local Law 144 obligations are met before an AEDT is used for any NYC role.",
          [
            "Is a current bias audit complete?",
            "Is the audit summary published?",
            "Is the candidate notice process live?",
          ],
          ["Go-live checklist", "Deployment approval", "Legal sign-off"],
        ),
      ],
    },
  ],
};
