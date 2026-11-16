import type { FrameworkDefinition } from "../types";
import { req } from "../helpers";

// EEOC technical assistance, "The Americans with Disabilities Act and the Use of
// Software, Algorithms, and Artificial Intelligence to Assess Job Applicants and
// Employees" (EEOC-NVTA-2022-2, May 12, 2022). Removed from eeoc.gov in January 2025;
// read from the Internet Archive copy of the official page (snapshot 2025-01-06).
// Q references are to the document's numbered questions.
// Guidance text is Governly's own.
export const eeocAdaAi: FrameworkDefinition = {
  slug: "eeoc-ada-ai",
  name: "EEOC Guidance on ADA and AI",
  navLabel: "EEOC ADA & AI",
  kind: "framework",
  // Enabled from the Frameworks library (tenant_frameworks), not as a policy.
  policyNames: [],
  description:
    "Controls drawn from the EEOC's May 2022 technical assistance on how employers' use of algorithmic decision-making tools can violate Title I of the ADA. The EEOC removed this document from its website in January 2025 and it is no longer official agency guidance (it was always non-binding); the ADA obligations it explains, reasonable accommodation, screen-out and limits on disability-related inquiries, still apply.",
  source: {
    title:
      "EEOC — The ADA and the Use of Software, Algorithms, and AI to Assess Job Applicants and Employees (May 12, 2022; archived copy, removed from eeoc.gov Jan 2025)",
    url: "https://web.archive.org/web/20250106223425/https://www.eeoc.gov/laws/guidance/americans-disabilities-act-and-use-software-algorithms-and-artificial-intelligence",
  },
  sections: [
    {
      key: "1",
      title: "Scope and Employer Responsibility",
      requirements: [
        req(
          "1.1",
          "Inventory Algorithmic Decision-Making Tools",
          "Know which tools assess applicants and employees",
          "Identify every software, algorithmic or AI tool used in hiring, performance evaluation, pay, promotion or termination, and assess each against the three main ways it could violate the ADA: failing to accommodate, screening out, or making disability-related inquiries (see Background and Q2).",
          [
            "Which tools (resume screeners, chatbots, video interviews, games, monitoring) evaluate applicants or employees?",
            "At which employment stage is each tool used?",
            "Has each tool been reviewed for accommodation, screen-out and inquiry risks?",
          ],
          [
            "Inventory of employment assessment tools",
            "ADA risk review per tool",
            "Tool owner assignments",
          ],
        ),
        req(
          "1.2",
          "Accountability for Vendor-Built Tools",
          "Treat vendor tools as your own responsibility",
          "An employer may be responsible under the ADA for a tool developed or administered by a vendor, especially where the vendor acts on the employer's behalf, including for accommodation requests the vendor receives (see Q3 and Q7).",
          [
            "Which tools are administered or scored by a vendor acting on your behalf?",
            "Do contracts allocate ADA responsibilities, including accommodation handling?",
            "Would you learn of an accommodation request made only to the vendor?",
          ],
          [
            "Vendor contracts with ADA clauses",
            "Vendor accommodation procedures",
            "Vendor oversight records",
          ],
        ),
      ],
    },
    {
      key: "2",
      title: "Reasonable Accommodation",
      requirements: [
        req(
          "2.1",
          "Accommodation Notice and Request Route",
          "Tell people accommodations are available and how to ask",
          "Before an assessment, tell applicants and employees what it involves, that reasonable accommodations (including alternative formats and tests) are available, and give clear, accessible instructions for requesting one (see Q5, Q12 and Q14).",
          [
            "Does every assessment invitation explain the steps and offer accommodations?",
            "Are the request instructions clear and in accessible formats?",
            "Can a request be made without using the words \"ADA\" or \"reasonable accommodation\"?",
          ],
          [
            "Assessment invitation templates",
            "Accommodation request page or form",
            "Accessibility review of notices",
          ],
        ),
        req(
          "2.2",
          "Prompt Handling and Alternative Assessment",
          "Respond quickly and offer an accessible or alternative test",
          "Respond promptly to accommodation requests; where a disability may make a test harder or less accurate, provide an accessible format, extra time or an alternative assessment unless that would cause undue hardship, and give accommodated candidates equal consideration (see Q4 and Q6).",
          [
            "How quickly are accommodation requests answered?",
            "What alternative formats or assessments can be offered for each tool?",
            "Are accommodated candidates considered on an equal footing?",
          ],
          [
            "Accommodation request log with response times",
            "Catalogue of alternative assessments",
            "Undue hardship determinations",
          ],
        ),
        req(
          "2.3",
          "Confidentiality of Medical Information",
          "Keep accommodation medical data confidential and separate",
          "Keep all medical information obtained through accommodation requests confidential and store it separately from personnel files (see Q6).",
          [
            "Where is medical documentation from accommodation requests stored?",
            "Who can access it?",
            "Is it kept apart from personnel and assessment records, including in vendor systems?",
          ],
          [
            "Medical records storage procedure",
            "Access control lists",
            "Vendor data handling terms",
          ],
        ),
        req(
          "2.4",
          "Staff Training on Accommodation",
          "Train staff to recognise and process requests",
          "Train staff to recognise accommodation requests, including requests to retake or be assessed differently after a poor result, and to obtain alternative ways of rating people when a tool is inaccessible (see Q14).",
          [
            "Which staff handle assessment-related accommodation requests?",
            "Does training cover requests made after a poor result?",
            "Do staff know how to source an alternative rating method?",
          ],
          [
            "Training materials",
            "Training completion records",
            "Escalation procedure",
          ],
        ),
        req(
          "2.5",
          "Vendor Forwarding or Delegated Accommodation",
          "Make sure vendors pass on or handle requests properly",
          "Where a third party administers a tool, require it to forward accommodation requests promptly to the employer, or agree in writing that it will provide accommodations on the employer's behalf in line with the ADA (see Q7 and Q14).",
          [
            "Does each vendor contract require prompt forwarding of accommodation requests?",
            "If the vendor handles accommodations, is its process ADA-compliant?",
            "How is forwarding monitored?",
          ],
          [
            "Contract clauses on accommodation",
            "Forwarded request records",
            "Vendor process documentation",
          ],
        ),
      ],
    },
    {
      key: "3",
      title: "Preventing Unlawful Screen-Out",
      requirements: [
        req(
          "3.1",
          "Screen-Out Risk Assessment",
          "Check whether a disability could lower a person's result",
          "Assess whether a disability could cause someone to score lower or be unable to complete an assessment, and so lose an opportunity even though they could do the essential functions of the job with reasonable accommodation (see Q8, Q9 and Q11).",
          [
            "Could any disability reduce the accuracy of the tool or prevent participation?",
            "Does the tool penalise proxies such as employment gaps or speech patterns?",
            "Does it assume typical working conditions rather than accommodated ones?",
          ],
          [
            "Screen-out risk assessments",
            "Tool feature and criteria reviews",
            "Remediation records",
          ],
        ),
        req(
          "3.2",
          "No Reliance on \"Bias-Free\" Claims",
          "Disability bias needs its own checks",
          "Do not treat a vendor's \"bias-free\" or Title VII adverse-impact testing, or a tool's validation, as proof it will not screen out individuals with disabilities; each disability is unique and needs separate consideration (see Q10 and Q11).",
          [
            "What does the vendor's bias claim actually test?",
            "Has disability-related screen-out been assessed separately?",
            "Is validation evidence relevant to people with disabilities?",
          ],
          [
            "Vendor bias and validation reports",
            "Gap analysis for disability",
            "Procurement review notes",
          ],
        ),
        req(
          "3.3",
          "Measure Only Job-Necessary Abilities Directly",
          "Assess what the job truly needs, not correlates",
          "Ensure tools measure only abilities or qualifications truly necessary for the job, even for people entitled to on-the-job accommodation, and measure them directly rather than through correlated characteristics or scores (see Q11 and Q14).",
          [
            "Is each measured trait linked to an essential job function?",
            "Is the ability measured directly or inferred from a proxy?",
            "Would the requirement still apply with on-the-job accommodation?",
          ],
          [
            "Job analyses",
            "Trait-to-function mapping",
            "Criteria review sign-off",
          ],
        ),
        req(
          "3.4",
          "Vendor Due Diligence on Disability",
          "Ask vendors how the tool treats people with disabilities",
          "Before adopting a vendor tool, ask whether it was developed with individuals with disabilities in mind: accessibility of its interface, available alternative formats, and whether the vendor checked if measured traits correlate with disabilities. Apply the same questions to tools built in-house, using disability experts where useful (see Q12).",
          [
            "Is the tool's interface accessible to as many disabilities as possible?",
            "Which alternative formats does the vendor support, and which must you supply?",
            "Did the vendor test whether the algorithm disadvantages people with disabilities?",
          ],
          [
            "Vendor questionnaire responses",
            "Accessibility conformance reports",
            "Expert review records for in-house tools",
          ],
        ),
        req(
          "3.5",
          "Accessible Design and User Testing",
          "Choose tools accessible to many kinds of disability",
          "Prefer tools designed to be accessible to individuals with as many kinds of disabilities as possible, and use user testing to confirm it (see Q14).",
          [
            "Has the tool been tested with users with different disabilities?",
            "Does it work with assistive technology such as screen readers?",
            "Are accessibility issues tracked to resolution?",
          ],
          [
            "User testing results",
            "Assistive technology compatibility tests",
            "Accessibility issue log",
          ],
        ),
        req(
          "3.6",
          "Plain-Language Explanation of the Tool",
          "Tell people what the tool assesses and how",
          "Describe in plain language and accessible formats the traits the tool assesses, how it assesses them and the factors that may affect the rating, so individuals can decide whether they need an accommodation (see Q12 and Q14).",
          [
            "Do candidates see what traits are measured and how before the assessment?",
            "Is the explanation available in accessible formats?",
            "Does it mention factors, including disabilities, that could lower results?",
          ],
          [
            "Candidate-facing tool descriptions",
            "Accessible format versions",
            "Publication or delivery records",
          ],
        ),
      ],
    },
    {
      key: "4",
      title: "Disability-Related Inquiries and Medical Examinations",
      requirements: [
        req(
          "4.1",
          "No Pre-Offer Disability Inquiries or Medical Exams",
          "Keep tools from eliciting disability or health information",
          "Make sure no tool asks questions likely to elicit disability information or seeks information about physical or mental impairments or health before a conditional offer; after employment begins, such inquiries must be legally justified under the ADA (see Q13).",
          [
            "Does any tool ask about, or infer, health or medical conditions?",
            "Is it used before a conditional offer of employment?",
            "Are post-hire inquiries legally justified?",
          ],
          [
            "Assessment question reviews",
            "Legal review memos",
            "Tool configuration records",
          ],
        ),
        req(
          "4.2",
          "Vendor Confirmation Before Purchase",
          "Get the vendor to confirm the tool makes no such inquiries",
          "Before purchasing a tool, ask the vendor to confirm it does not ask questions likely to elicit disability information or seek health information, except in connection with an accommodation request (see Q14).",
          [
            "Has the vendor confirmed this in writing?",
            "Is the confirmation re-checked when the tool changes?",
            "How are exceptions tied to accommodation requests handled?",
          ],
          [
            "Vendor written confirmation",
            "Procurement checklist",
            "Change review records",
          ],
        ),
      ],
    },
  ],
};
