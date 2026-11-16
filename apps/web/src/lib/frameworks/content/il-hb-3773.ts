import type { FrameworkDefinition } from "../types";
import { req } from "../helpers";

// Illinois Public Act 103-0804 (HB3773), amending the Illinois Human Rights Act,
// 775 ILCS 5/2-101 and 5/2-102(L). Effective January 1, 2026.
// Guidance text is Governly's own.
export const ilHb3773: FrameworkDefinition = {
  slug: "il-hb-3773",
  name: "Illinois HB3773 — AI in Employment",
  navLabel: "Illinois HB3773",
  kind: "regulation",
  policyNames: ["Illinois HB3773"],
  description:
    "Public Act 103-0804 amends the Illinois Human Rights Act so that, from January 1, 2026, an employer commits a civil rights violation if its use of AI in employment decisions has a discriminatory effect on protected classes, if it uses zip codes as a proxy for protected classes, or if it fails to notify employees that it uses AI for those decisions. The Illinois Department of Human Rights is directed to adopt rules on notice.",
  source: {
    title: "Illinois General Assembly — Public Act 103-0804 (HB3773)",
    url: "https://www.ilga.gov/legislation/publicacts/fulltext.asp?Name=103-0804",
  },
  sections: [
    {
      key: "1",
      title: "Scope",
      requirements: [
        req(
          "1.1",
          "AI Use in Employment Inventory",
          "Know where AI touches employment decisions",
          "Identify every AI system, including generative AI and vendor tools, used for recruitment, hiring, promotion, renewal, training or apprenticeship selection, discharge, discipline, tenure or terms and conditions of employment, using the Act's definitions (Sec. 2-101(M), 2-101(N); Sec. 2-102(L)(1)).",
          [
            "Which tools used by HR, recruiters and managers meet the Act's definition of artificial intelligence?",
            "For which of the listed employment decisions is each tool used?",
            "Are third-party and embedded vendor AI features included in the inventory?",
          ],
          [
            "AI-in-employment inventory",
            "Tool-to-decision mapping",
            "Vendor product descriptions",
          ],
        ),
      ],
    },
    {
      key: "2",
      title: "Non-Discrimination",
      requirements: [
        req(
          "2.1",
          "No Discriminatory Effect",
          "Make sure AI does not discriminate in effect",
          "Ensure AI used in covered employment decisions does not have the effect of subjecting employees or applicants to discrimination on the basis of any class protected by the Human Rights Act; liability turns on effect, not intent (Sec. 2-102(L)(1)).",
          [
            "Are outcomes of each AI tool tested for disparities across protected classes before and during use?",
            "Who reviews results and can stop or change a tool that shows a discriminatory effect?",
            "Is testing repeated when the tool, its data or its use changes?",
          ],
          [
            "Adverse-impact testing results",
            "Remediation and decision records",
            "Periodic monitoring reports",
          ],
        ),
        req(
          "2.2",
          "No Zip Code Proxies",
          "Do not use zip codes as a stand-in for protected classes",
          "Confirm that AI used in covered employment decisions does not use zip codes as a proxy for protected classes (Sec. 2-102(L)(1)).",
          [
            "Do any models or scoring rules take zip code or other location data as an input?",
            "If location data is used, is there a documented, job-related reason and a check that it does not act as a proxy?",
            "Are vendors asked to confirm which location features their tools use?",
          ],
          [
            "Model feature lists",
            "Proxy analysis",
            "Vendor attestations on input features",
          ],
        ),
      ],
    },
    {
      key: "3",
      title: "Notice",
      requirements: [
        req(
          "3.1",
          "Notice of AI Use",
          "Tell employees when AI is used for employment decisions",
          "Notify employees that the organisation uses AI for the covered employment purposes, and align the timing, circumstances and means of notice with any rules adopted by the Illinois Department of Human Rights (Sec. 2-102(L)(2)).",
          [
            "Does the notice identify that AI is used and for which employment decisions?",
            "Is notice given to every affected employee, and do IDHR rules extend it to applicants?",
            "Has the notice process been checked against current IDHR rules?",
          ],
          [
            "Notice text",
            "Distribution records",
            "IDHR rule review memo",
          ],
        ),
      ],
    },
  ],
};
