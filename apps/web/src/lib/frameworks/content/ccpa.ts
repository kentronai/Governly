import type { FrameworkDefinition } from "../types";
import { clause } from "../helpers";

export const ccpa: FrameworkDefinition = {
  slug: "ccpa",
  name: "CCPA Compliance Framework",
  navLabel: "CCPA",
  kind: "regulation",
  policyNames: ["CCPA"],
  description:
    "Consumer rights, business obligations and security requirements under the California Consumer Privacy Act (as amended by the CPRA).",
  source: {
    title: "California Attorney General: CCPA",
    url: "https://oag.ca.gov/privacy/ccpa",
  },
  sections: [
    {
      key: "1",
      title: "Consumer Rights",
      requirements: [
        clause(
          "1.1",
          "Right to Know",
          "Enable consumers to know what data is collected",
          [
            "Can consumers request their data?",
            "Is there a process to respond to requests?",
            "Is the response provided within 45 days?",
          ],
          ["Request intake process", "Response templates", "Timeline tracking"],
        ),
        clause(
          "1.2",
          "Right to Delete",
          "Enable consumers to delete their data",
          [
            "Can consumers request deletion?",
            "Are exceptions documented?",
            "Is deletion verified?",
          ],
          ["Deletion request process", "Exception documentation", "Deletion logs"],
        ),
        clause(
          "1.3",
          "Right to Opt-Out",
          "Provide opt-out mechanism for data sales",
          [
            "Is there a 'Do Not Sell My Personal Information' link?",
            "Is the opt-out easy to use?",
            "Are opt-outs honored?",
          ],
          ["Opt-out mechanism", "Website compliance", "Opt-out records"],
        ),
        clause(
          "1.4",
          "Right to Non-Discrimination",
          "Ensure no discrimination for rights exercise",
          [
            "Are consumers treated equally regardless of rights exercise?",
            "Are financial incentives disclosed?",
          ],
          ["Non-discrimination policy", "Incentive disclosures"],
        ),
      ],
    },
    {
      key: "2",
      title: "Business Obligations",
      requirements: [
        clause(
          "2.1",
          "Privacy Notice",
          "Publish comprehensive privacy notice",
          [
            "Does the privacy policy describe data categories collected?",
            "Are purposes of collection disclosed?",
            "Is the notice updated annually?",
          ],
          ["Privacy policy", "Update records", "Notice at collection"],
        ),
        clause(
          "2.2",
          "Data Inventory",
          "Catalog personal information handling",
          [
            "Is there a data inventory?",
            "Are data categories mapped?",
            "Are third-party disclosures tracked?",
          ],
          ["Data inventory", "Data mapping", "Third-party records"],
        ),
        clause(
          "2.3",
          "Service Provider Contracts",
          "Update vendor contracts for CCPA",
          [
            "Do contracts restrict data use?",
            "Are service providers certified as such?",
            "Are data processing terms included?",
          ],
          ["Contract templates", "Vendor agreements", "DPA addendums"],
        ),
        clause(
          "2.4",
          "Employee Training",
          "Train staff on CCPA obligations",
          [
            "Are relevant employees trained?",
            "Is training documented?",
            "Is training refreshed annually?",
          ],
          ["Training materials", "Training records", "Competency assessments"],
        ),
      ],
    },
    {
      key: "3",
      title: "Security Requirements",
      requirements: [
        clause(
          "3.1",
          "Reasonable Security",
          "Maintain appropriate security measures",
          [
            "Are security measures appropriate to the data?",
            "Is there a security program?",
            "Are security incidents addressed?",
          ],
          ["Security policy", "Security controls", "Incident response plan"],
        ),
        clause(
          "3.2",
          "Breach Notification",
          "Prepare for breach notification",
          [
            "Is there a breach response plan?",
            "Are notification templates ready?",
            "Is there a process to assess breach scope?",
          ],
          ["Breach response plan", "Notification templates", "Assessment procedures"],
        ),
      ],
    },
  ],
};
