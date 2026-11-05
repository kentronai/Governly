import type { FrameworkDefinition } from "../types";
import {
  EU_AI_ACT_POLICY_NAME,
  LEGACY_EU_AI_ACT_POLICY_NAME,
} from "@/lib/policy-names";

export const euAiAct: FrameworkDefinition = {
  slug: "eu-ai-act",
  name: "EU AI Act",
  navLabel: "EU AI Act",
  policyNames: [EU_AI_ACT_POLICY_NAME, LEGACY_EU_AI_ACT_POLICY_NAME],
  description:
    "Obligations for providers and deployers of AI systems under Regulation (EU) 2024/1689, focused on AI literacy, prohibited practices and the requirements for high-risk AI systems.",
  source: {
    title: "Regulation (EU) 2024/1689 (Artificial Intelligence Act), EUR-Lex",
    url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
  },
  sections: [
    {
      key: "1",
      title: "AI literacy",
      requirements: [
        {
          key: "1.1",
          title: "AI literacy and responsible-AI training",
          description:
            "Take measures so that staff and others operating AI systems on the organization's behalf have a sufficient level of AI literacy for their role and context (Art. 4).",
          subcontrols: [
            {
              key: "1.1.1",
              title:
                "We assign leadership accountability for AI risk decisions",
              description:
                "A named executive or committee owns AI risk decisions, evidenced by a charter, RACI or board minutes.",
            },
            {
              key: "1.1.2",
              title: "We train relevant staff on AI literacy and ethics",
              description:
                "Role-based AI literacy and responsible-AI training is delivered and completion records are retained.",
            },
            {
              key: "1.1.3",
              title:
                "We inform workers about high-risk AI used in the workplace",
              description:
                "Before deploying a high-risk AI system at work, affected workers and their representatives are informed (Art. 26(7)), evidenced by notices or communications.",
            },
          ],
        },
        {
          key: "1.2",
          title: "Regulatory training and authority response",
          description:
            "Define who is responsible for AI risk management and prepare staff to apply the regulation and to cooperate with competent authorities.",
          subcontrols: [
            {
              key: "1.2.1",
              title:
                "We define roles and responsibilities for AI risk management",
              description:
                "Documented roles cover AI risk management, oversight and compliance, with named owners per AI system.",
            },
            {
              key: "1.2.2",
              title: "We train staff on the regulation and authority requests",
              description:
                "Training and a documented procedure explain the AI Act and how to respond to information or access requests from competent authorities.",
            },
          ],
        },
      ],
    },
    {
      key: "2",
      title: "Prohibited AI practices",
      requirements: [
        {
          key: "2.1",
          title: "Screen for prohibited practices",
          description:
            "Ensure no AI system is placed on the market, put into service or used for a practice prohibited by Art. 5.",
          subcontrols: [
            {
              key: "2.1.1",
              title: "We screen every AI use case against Art. 5",
              description:
                "Each use case in the AI inventory has a recorded check against prohibited practices such as manipulative techniques, exploitation of vulnerabilities, social scoring and untargeted facial-image scraping.",
            },
            {
              key: "2.1.2",
              title:
                "We restrict emotion recognition and biometric categorization",
              description:
                "Policy bars emotion recognition in workplaces and schools and biometric categorization inferring sensitive traits, except where the Act permits.",
            },
            {
              key: "2.1.3",
              title: "We escalate and retire prohibited uses",
              description:
                "A documented process escalates suspected prohibited uses and records their discontinuation.",
            },
          ],
        },
      ],
    },
    {
      key: "3",
      title: "Risk management system",
      requirements: [
        {
          key: "3.1",
          title: "Lifecycle risk management process",
          description:
            "Establish, document and maintain a continuous, iterative risk management system for each high-risk AI system (Art. 9).",
          subcontrols: [
            {
              key: "3.1.1",
              title: "We identify and analyze foreseeable risks",
              description:
                "Risk assessments cover risks to health, safety and fundamental rights under intended use and reasonably foreseeable misuse.",
            },
            {
              key: "3.1.2",
              title: "We adopt targeted risk mitigation measures",
              description:
                "Mitigations are recorded per risk and residual risk is judged acceptable before release.",
            },
            {
              key: "3.1.3",
              title: "We review risks using post-market data",
              description:
                "Risk registers are updated with monitoring data, and the effect on minors and other vulnerable groups is considered.",
            },
          ],
        },
        {
          key: "3.2",
          title: "Testing against defined metrics",
          description:
            "Test high-risk AI systems before market placement against prior defined metrics and probabilistic thresholds appropriate to the intended purpose.",
          subcontrols: [
            {
              key: "3.2.1",
              title: "We define test metrics and thresholds in advance",
              description:
                "Test plans state metrics and acceptance thresholds before testing begins.",
            },
            {
              key: "3.2.2",
              title: "We retain test results",
              description:
                "Test reports, including any real-world testing, are stored with the system's documentation.",
            },
          ],
        },
      ],
    },
    {
      key: "4",
      title: "Data and data governance",
      requirements: [
        {
          key: "4.1",
          title: "Data governance for training data",
          description:
            "Training, validation and testing data for high-risk AI systems must follow appropriate governance and management practices (Art. 10).",
          subcontrols: [
            {
              key: "4.1.1",
              title: "We document data provenance and preparation",
              description:
                "Records describe data collection, origin, original purpose for personal data, and preparation steps such as labeling and cleaning.",
            },
            {
              key: "4.1.2",
              title: "We assess data relevance, representativeness and quality",
              description:
                "Data assessments check that datasets are relevant, sufficiently representative and as free of errors and complete as possible for the intended purpose.",
            },
            {
              key: "4.1.3",
              title: "We examine and mitigate bias",
              description:
                "Bias examinations and mitigation measures are recorded, including safeguards where special-category data is processed for bias correction.",
            },
          ],
        },
      ],
    },
    {
      key: "5",
      title: "Technical documentation and record-keeping",
      requirements: [
        {
          key: "5.1",
          title: "Maintain technical documentation",
          description:
            "Draw up technical documentation before market placement and keep it up to date, covering the elements in Annex IV (Art. 11).",
          subcontrols: [
            {
              key: "5.1.1",
              title: "We maintain Annex IV documentation per system",
              description:
                "Each high-risk system has documentation of its purpose, design, data, development process, performance and risk management.",
            },
            {
              key: "5.1.2",
              title: "We version documentation with system changes",
              description:
                "Documentation is updated and versioned whenever the system is modified.",
            },
          ],
        },
        {
          key: "5.2",
          title: "Automatic event logging",
          description:
            "High-risk AI systems must technically allow automatic recording of events over their lifetime to support traceability (Art. 12).",
          subcontrols: [
            {
              key: "5.2.1",
              title: "We enable automatic logging",
              description:
                "Systems log events relevant to identifying risks, substantial modifications and post-market monitoring.",
            },
            {
              key: "5.2.2",
              title: "We retain logs for the required period",
              description:
                "Logs under our control are kept for a period appropriate to the purpose and at least six months unless other law provides otherwise.",
            },
          ],
        },
      ],
    },
    {
      key: "6",
      title: "Transparency and instructions for use",
      requirements: [
        {
          key: "6.1",
          title: "Provide instructions for use to deployers",
          description:
            "Design high-risk AI systems to be sufficiently transparent and supply deployers with clear instructions for use (Art. 13).",
          subcontrols: [
            {
              key: "6.1.1",
              title: "We publish instructions for use",
              description:
                "Instructions state the provider identity, intended purpose, accuracy and robustness levels, known risks and limitations.",
            },
            {
              key: "6.1.2",
              title: "We describe oversight and log-handling measures",
              description:
                "Instructions explain human oversight measures, expected lifetime, maintenance and how to collect and interpret logs.",
            },
          ],
        },
      ],
    },
    {
      key: "7",
      title: "Human oversight",
      requirements: [
        {
          key: "7.1",
          title: "Design for effective human oversight",
          description:
            "Enable natural persons to effectively oversee high-risk AI systems while in use (Art. 14).",
          subcontrols: [
            {
              key: "7.1.1",
              title: "We define oversight measures per system",
              description:
                "Oversight measures are documented, including the ability to interpret outputs, override them and stop the system.",
            },
            {
              key: "7.1.2",
              title: "We address automation bias",
              description:
                "Overseers are made aware of the tendency to over-rely on outputs, evidenced by training or UI warnings.",
            },
            {
              key: "7.1.3",
              title: "We assign competent oversight personnel",
              description:
                "Deployers assign oversight to people with the necessary competence, training, authority and support (Art. 26(2)).",
            },
          ],
        },
      ],
    },
    {
      key: "8",
      title: "Accuracy, robustness and cybersecurity",
      requirements: [
        {
          key: "8.1",
          title: "Achieve appropriate accuracy and robustness",
          description:
            "High-risk AI systems must achieve an appropriate level of accuracy, robustness and cybersecurity throughout their lifecycle (Art. 15).",
          subcontrols: [
            {
              key: "8.1.1",
              title: "We declare and measure accuracy metrics",
              description:
                "Accuracy levels and metrics are measured and declared in the instructions for use.",
            },
            {
              key: "8.1.2",
              title: "We build resilience to errors and feedback loops",
              description:
                "Technical and organizational measures, such as fallback plans, address errors, faults and biased feedback loops in continuously learning systems.",
            },
            {
              key: "8.1.3",
              title: "We protect against AI-specific attacks",
              description:
                "Security controls and testing address data poisoning, model poisoning, adversarial examples and confidentiality attacks.",
            },
          ],
        },
      ],
    },
    {
      key: "9",
      title: "Deployer obligations",
      requirements: [
        {
          key: "9.1",
          title: "Use high-risk systems as instructed",
          description:
            "Deployers must use high-risk AI systems in line with the instructions for use and monitor their operation (Art. 26).",
          subcontrols: [
            {
              key: "9.1.1",
              title: "We follow provider instructions for use",
              description:
                "Technical and organizational measures ensure each system is used according to its instructions.",
            },
            {
              key: "9.1.2",
              title: "We ensure input data is relevant",
              description:
                "Where we control input data, checks confirm it is relevant and sufficiently representative for the intended purpose.",
            },
            {
              key: "9.1.3",
              title: "We monitor operation and report risks",
              description:
                "Operation is monitored and the provider and authorities are informed, and use suspended, when a risk or serious incident is identified.",
            },
          ],
        },
        {
          key: "9.2",
          title: "Deployer logs and notifications",
          description:
            "Keep automatically generated logs under the deployer's control and inform affected persons where required.",
          subcontrols: [
            {
              key: "9.2.1",
              title: "We retain system logs under our control",
              description:
                "Logs are kept for at least six months unless other law provides otherwise.",
            },
            {
              key: "9.2.2",
              title: "We inform people subject to high-risk decisions",
              description:
                "Natural persons subject to decisions made or assisted by Annex III high-risk systems are told that such a system is used.",
            },
          ],
        },
      ],
    },
    {
      key: "10",
      title: "Fundamental rights impact assessment",
      requirements: [
        {
          key: "10.1",
          title: "Perform a FRIA before deployment",
          description:
            "Deployers that are public bodies or provide public services, and deployers of certain credit-scoring and insurance-pricing systems, must assess impacts on fundamental rights before first use (Art. 27).",
          subcontrols: [
            {
              key: "10.1.1",
              title: "We determine whether a FRIA is required",
              description:
                "Each high-risk deployment has a recorded determination of FRIA applicability.",
            },
            {
              key: "10.1.2",
              title: "We document the FRIA contents",
              description:
                "The assessment describes the process, period and frequency of use, affected groups, specific risks of harm, oversight measures and remedial actions.",
            },
            {
              key: "10.1.3",
              title: "We notify the market surveillance authority",
              description:
                "Results are notified to the authority using the required template and the FRIA is updated when relevant factors change.",
            },
          ],
        },
      ],
    },
    {
      key: "11",
      title: "Transparency for certain AI systems",
      requirements: [
        {
          key: "11.1",
          title: "Disclose AI interaction and synthetic content",
          description:
            "Inform people when they interact with AI and mark or disclose AI-generated or manipulated content (Art. 50).",
          subcontrols: [
            {
              key: "11.1.1",
              title: "We tell people they are interacting with AI",
              description:
                "Chatbots and similar systems disclose their AI nature unless it is obvious from the context.",
            },
            {
              key: "11.1.2",
              title: "We mark synthetic outputs as AI-generated",
              description:
                "Generated audio, image, video or text is marked in a machine-readable, detectable format where technically feasible.",
            },
            {
              key: "11.1.3",
              title: "We disclose deepfakes and emotion recognition",
              description:
                "Deployers disclose deep fakes, AI-generated public-interest text, and the operation of emotion recognition or biometric categorization systems.",
            },
          ],
        },
      ],
    },
    {
      key: "12",
      title: "Post-market monitoring and incident reporting",
      requirements: [
        {
          key: "12.1",
          title: "Post-market monitoring plan",
          description:
            "Providers must establish and document a post-market monitoring system proportionate to the risks of the high-risk AI system (Art. 72).",
          subcontrols: [
            {
              key: "12.1.1",
              title: "We maintain a post-market monitoring plan",
              description:
                "A documented plan, part of the technical documentation, defines how performance data is collected and analyzed.",
            },
            {
              key: "12.1.2",
              title: "We evaluate continued compliance",
              description:
                "Monitoring results are reviewed periodically and feed corrective actions.",
            },
          ],
        },
        {
          key: "12.2",
          title: "Serious incident reporting",
          description:
            "Report serious incidents to the market surveillance authority within the deadlines in Art. 73 and investigate them.",
          subcontrols: [
            {
              key: "12.2.1",
              title: "We maintain a serious-incident procedure",
              description:
                "A procedure defines serious incidents, reporting owners and the deadlines (no later than 15 days, shorter for deaths and widespread or critical-infrastructure incidents).",
            },
            {
              key: "12.2.2",
              title: "We investigate and record incidents",
              description:
                "Incident records include risk assessment, root cause and corrective action, without altering the system in ways that hinder investigation before informing authorities.",
            },
          ],
        },
      ],
    },
  ],
};
