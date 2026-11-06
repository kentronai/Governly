import type { FrameworkDefinition } from "../types";
import { req } from "../helpers";

// FTC expectations under Section 5 of the FTC Act and related statutes (FCRA,
// ECOA, COPPA, Health Breach Notification Rule). Guidance text is NORIX's own.
export const ftcAi: FrameworkDefinition = {
  slug: "ftc-ai",
  name: "FTC AI Guidance",
  navLabel: "FTC AI Guidance",
  kind: "framework",
  policyNames: ["FTC AI Guidance"],
  description:
    "How the US Federal Trade Commission expects businesses to market, build and operate AI fairly and truthfully under existing consumer-protection law.",
  source: {
    title: "FTC business guidance on artificial intelligence",
    url: "https://www.ftc.gov/business-guidance/artificial-intelligence",
  },
  sections: [
    {
      key: "1",
      title: "Truth in AI Advertising",
      requirements: [
        req(
          "1.1",
          "Substantiated AI Claims",
          "Have proof for every AI claim",
          "Any claim about what the AI does or how well it performs must be backed by competent evidence before it is made.",
          [
            "Is there test evidence behind each performance or capability claim?",
            "Do marketing claims match measured results?",
            "Are claims reviewed before publication?",
          ],
          [
            "Claim substantiation file",
            "Benchmark results",
            "Marketing review sign-off",
          ],
        ),
        req(
          "1.2",
          "No Deceptive AI Representations",
          "Do not overstate what the AI is or does",
          'Avoid exaggerating AI capabilities or calling a product AI-powered when it is not ("AI washing").',
          [
            "Does the product actually use AI the way it is described?",
            "Are limitations and error rates disclosed where they matter to buyers?",
            "Has the marketing been checked for exaggeration?",
          ],
          [
            "Capability statement",
            "Limitations disclosure",
            "Marketing audit notes",
          ],
        ),
        req(
          "1.3",
          "Clear AI Disclosure",
          "Tell consumers when AI is involved",
          "Make it clear when consumers are talking to a bot, seeing AI-generated content or being decided about by AI.",
          [
            "Do chatbots and assistants say they are not human?",
            "Is AI-generated content labeled?",
            "Are consumers told when AI shapes a decision about them?",
          ],
          [
            "Bot disclosure text",
            "Content labeling policy",
            "Decision notice templates",
          ],
        ),
        req(
          "1.4",
          "Testimonials and Endorsements",
          "Keep reviews and endorsements genuine",
          "Do not use fake or AI-generated reviews or undisclosed paid endorsements to promote AI products.",
          [
            "Are testimonials from real customers with real experiences?",
            "Are material connections with endorsers disclosed?",
            "Is the creation or purchase of fake reviews prohibited?",
          ],
          [
            "Review authenticity policy",
            "Endorser disclosure records",
            "Review moderation logs",
          ],
        ),
      ],
    },
    {
      key: "2",
      title: "Algorithmic Fairness and Non-Discrimination",
      requirements: [
        req(
          "2.1",
          "Equal Credit Opportunity Act (ECOA) Compliance",
          "No discrimination in AI credit decisions",
          "AI used in credit decisions must not discriminate on protected characteristics, and applicants who are denied must get specific reasons.",
          [
            "Has the model been tested for disparate impact across protected classes?",
            "Are proxy variables for protected characteristics identified and handled?",
            "Do adverse action notices give specific, accurate reasons?",
          ],
          [
            "Fair lending analysis",
            "Proxy variable review",
            "Adverse action notice samples",
          ],
        ),
        req(
          "2.2",
          "Fair Credit Reporting Act (FCRA) Compliance",
          "Follow FCRA when AI uses consumer reports",
          "When AI relies on consumer report data, use it only for a permissible purpose, keep it accurate and honor notice and dispute rights.",
          [
            "Is there a permissible purpose for each use of consumer report data?",
            "Are consumers notified when report data leads to an adverse decision?",
            "Can consumers dispute inaccurate information?",
          ],
          [
            "Permissible purpose records",
            "Adverse action process",
            "Dispute handling procedure",
          ],
        ),
        req(
          "2.3",
          "Bias Testing and Mitigation",
          "Test for bias and fix what you find",
          "Test AI outcomes for bias before and after deployment, document results and act on disparities.",
          [
            "Is bias tested across relevant groups before launch?",
            "Is bias monitored after launch?",
            "Are mitigation steps recorded and verified?",
          ],
          ["Bias test reports", "Monitoring dashboard", "Remediation log"],
        ),
        req(
          "2.4",
          "Fair Housing Act Compliance",
          "Keep AI in housing decisions fair",
          "AI used for tenant screening, lending or housing ads must not discriminate against protected classes.",
          [
            "Are screening models tested for disparate impact?",
            "Are housing ad audiences reviewed for discriminatory exclusion?",
            "Is fair housing compliance documented?",
          ],
          [
            "Screening model audit",
            "Ad targeting review",
            "Fair housing compliance record",
          ],
        ),
      ],
    },
    {
      key: "3",
      title: "Data Privacy and Security",
      requirements: [
        req(
          "3.1",
          "Data Collection Practices",
          "Collect only what you need, honestly",
          "Collect data for AI only as disclosed and as needed, and do not change privacy promises retroactively to use data for training.",
          [
            "Is collection limited to what the AI needs?",
            "Do privacy notices accurately describe how data trains or feeds AI?",
            "Is consent obtained where required, especially for sensitive data?",
          ],
          ["Data minimization record", "Privacy notice", "Consent records"],
        ),
        req(
          "3.2",
          "Data Security",
          "Protect the data AI uses",
          "Apply reasonable security to training data, prompts, outputs and the systems that hold them.",
          [
            "Are access controls and encryption applied to AI data?",
            "Are AI data stores included in security monitoring?",
            "Is there an incident response plan covering AI systems?",
          ],
          [
            "Security assessment",
            "Access control configuration",
            "Incident response plan",
          ],
        ),
        req(
          "3.3",
          "Children's Privacy (COPPA)",
          "Protect children's data",
          "If an AI service is directed to or knowingly collects data from children under 13, obtain verifiable parental consent and limit use and retention.",
          [
            "Could the service reach children under 13?",
            "Is verifiable parental consent collected before data collection?",
            "Is children's data kept out of model training without consent?",
          ],
          ["COPPA assessment", "Parental consent flow", "Retention schedule"],
        ),
        req(
          "3.4",
          "Health Data Protection",
          "Treat health data with extra care",
          "Use health data only with clear consent, avoid unexpected sharing, and follow breach notification duties where they apply.",
          [
            "Is health data used or shared only as consumers were told?",
            "Is express consent obtained for sensitive health uses?",
            "Does the breach response cover health data notification duties?",
          ],
          [
            "Health data policy",
            "Consent records",
            "Breach notification procedure",
          ],
        ),
      ],
    },
    {
      key: "4",
      title: "Transparency and Explainability",
      requirements: [
        req(
          "4.1",
          "Algorithmic Transparency",
          "Be open about how AI affects people",
          "Explain in plain language how the AI is used and which main factors drive its outcomes.",
          [
            "Can the main factors behind an outcome be described?",
            "Is the explanation in plain language?",
            "Is the information easy for affected consumers to find?",
          ],
          [
            "Plain-language AI description",
            "Key factor documentation",
            "Public help page",
          ],
        ),
        req(
          "4.2",
          "Automated Decision Notices",
          "Notify people about automated decisions",
          "Tell consumers, on time and clearly, when an automated decision affects them and what they can do about it.",
          [
            "Are consumers notified when AI makes a decision that affects them?",
            "Does the notice explain their options and rights?",
            "Is an opt-out or alternative offered where appropriate?",
          ],
          ["Notice templates", "Delivery timing records", "Opt-out mechanism"],
        ),
        req(
          "4.3",
          "Right to Explanation",
          "Explain decisions on request",
          "Give consumers a meaningful explanation of an AI decision when they ask, within a reasonable time.",
          [
            "Is there a channel to request an explanation?",
            "Are explanations specific and useful?",
            "Are requests answered within a set timeframe?",
          ],
          [
            "Explanation request process",
            "Explanation templates",
            "Response time metrics",
          ],
        ),
      ],
    },
    {
      key: "5",
      title: "Accountability and Governance",
      requirements: [
        req(
          "5.1",
          "AI Governance Structure",
          "Assign clear ownership for AI",
          "Define who is accountable for each AI system and give leadership oversight of AI risk.",
          [
            "Does every AI system have a named owner?",
            "Are governance roles and approvals documented?",
            "Does leadership review AI risk regularly?",
          ],
          [
            "Governance charter",
            "RACI for AI systems",
            "Leadership review minutes",
          ],
        ),
        req(
          "5.2",
          "AI Risk Assessment",
          "Assess consumer harm before and after launch",
          "Assess foreseeable consumer harms before deployment and keep monitoring them afterwards.",
          [
            "Is a risk assessment completed before deployment?",
            "Are high-risk uses identified and given extra controls?",
            "Is risk reassessed after significant changes?",
          ],
          [
            "Pre-deployment risk assessment",
            "High-risk AI register",
            "Reassessment records",
          ],
        ),
        req(
          "5.3",
          "Third-Party AI Accountability",
          "You remain responsible for vendor AI",
          "Vet third-party AI tools and contract for the information and controls you need, since the FTC holds the deploying business accountable.",
          [
            "Are AI vendors assessed before use?",
            "Do contracts give rights to testing data, documentation and audits?",
            "Is vendor AI monitored after deployment?",
          ],
          [
            "Vendor due diligence",
            "Contract clauses",
            "Vendor monitoring records",
          ],
        ),
        req(
          "5.4",
          "Record Keeping",
          "Keep records that show compliance",
          "Keep records of AI design decisions, testing, changes and incidents long enough to demonstrate compliance.",
          [
            "Are design, testing and approval decisions recorded?",
            "Is there an audit trail of model changes?",
            "Are records retained on a defined schedule?",
          ],
          ["Model documentation", "Change log", "Retention schedule"],
        ),
      ],
    },
    {
      key: "6",
      title: "Consumer Rights and Redress",
      requirements: [
        req(
          "6.1",
          "Consumer Dispute Resolution",
          "Let consumers challenge AI decisions",
          "Provide an accessible way for consumers to dispute an AI decision and receive a reasoned response.",
          [
            "Is it easy for consumers to submit a dispute?",
            "Are disputes resolved within a set timeframe?",
            "Are outcomes communicated to the consumer?",
          ],
          ["Dispute procedure", "Dispute case log", "Resolution letters"],
        ),
        req(
          "6.2",
          "Human Review Option",
          "Offer a person, not just the model",
          "Where decisions significantly affect consumers, offer review by a trained person.",
          [
            "Can consumers ask for human review?",
            "Are reviewers trained and empowered to change outcomes?",
            "Are review outcomes recorded?",
          ],
          [
            "Human review process",
            "Reviewer training records",
            "Review outcome log",
          ],
        ),
        req(
          "6.3",
          "Correction of Errors",
          "Fix AI errors and their effects",
          "Find and correct AI errors, tell affected consumers and remedy the harm caused.",
          [
            "Is there a process to identify and correct errors?",
            "Are affected consumers notified?",
            "Are root causes addressed to prevent repeats?",
          ],
          [
            "Error correction procedure",
            "Consumer notifications",
            "Root cause analyses",
          ],
        ),
        req(
          "6.4",
          "Data Access and Deletion",
          "Honor data rights",
          "Let consumers access and delete their data where promised or required, and make sure deletion actually happens.",
          [
            "Can consumers request access to and deletion of their data?",
            "Are requests fulfilled on time?",
            "Is deletion verified, including in derived datasets where required?",
          ],
          [
            "Data request procedure",
            "Request fulfillment log",
            "Deletion verification",
          ],
        ),
      ],
    },
    {
      key: "7",
      title: "AI in Marketing and Sales",
      requirements: [
        req(
          "7.1",
          "AI-Powered Pricing",
          "Keep algorithmic pricing fair and honest",
          "Make sure AI pricing is not discriminatory or deceptive and that personalized pricing is disclosed where required.",
          [
            "Is pricing tested for discriminatory outcomes?",
            "Are price differences based on legitimate factors?",
            "Is personalized pricing disclosed?",
          ],
          [
            "Pricing model audit",
            "Pricing factor documentation",
            "Pricing disclosures",
          ],
        ),
        req(
          "7.2",
          "Targeted Advertising",
          "Target ads without unfair exclusion",
          "Review AI ad targeting so it does not unlawfully exclude groups or misuse sensitive data.",
          [
            "Are targeting criteria reviewed for discriminatory exclusion?",
            "Is targeting on sensitive categories restricted?",
            "Are targeting practices disclosed?",
          ],
          [
            "Targeting criteria review",
            "Sensitive category policy",
            "Ad disclosures",
          ],
        ),
        req(
          "7.3",
          "Dark Patterns Prevention",
          "Do not use AI to manipulate",
          "Avoid AI-driven interfaces that trick consumers into purchases, consent or subscriptions they did not intend.",
          [
            "Are AI-driven flows free of manipulative design?",
            "Is consent obtained without pressure or deception?",
            "Is cancelling as easy as signing up?",
          ],
          ["UX design review", "Consent flow audit", "Cancellation flow test"],
        ),
      ],
    },
  ],
};
