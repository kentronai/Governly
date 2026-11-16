import type { FrameworkDefinition } from "../types";
import { req } from "../helpers";

// UNESCO Recommendation on the Ethics of Artificial Intelligence, adopted by the
// General Conference at its 41st session, 23 November 2021 (SHS/BIO/PI/2021/1).
// Paragraph numbers below are the Recommendation's. Paragraphs addressed only to
// Member States (legislation, funding, national strategies) are left out; the
// controls cover what an organisation developing or deploying AI can do itself.
// Guidance text is Governly's own.
export const unescoAiEthics: FrameworkDefinition = {
  slug: "unesco-ai-ethics",
  name: "UNESCO Recommendation on the Ethics of AI",
  navLabel: "UNESCO AI Ethics",
  kind: "framework",
  // Enabled from the Frameworks library (tenant_frameworks), not as a policy.
  policyNames: [],
  description:
    "Organisational controls derived from the ten principles (paras. 25–47) and the policy areas (paras. 50–127) of the Recommendation on the Ethics of AI adopted by UNESCO's General Conference in November 2021. Actions the Recommendation addresses only to governments are not included.",
  source: {
    title:
      "UNESCO Recommendation on the Ethics of Artificial Intelligence (SHS/BIO/PI/2021/1, adopted 23 November 2021); English text as hosted by Japan's MEXT",
    url: "https://www.mext.go.jp/content/20220826-mxt_koktou02-000024125_9.pdf",
  },
  sections: [
    {
      key: "1",
      title: "Proportionality and Do No Harm",
      requirements: [
        req(
          "1.1",
          "Justified and Proportionate Use of AI",
          "Justify the decision to use AI and the method chosen",
          "Paras. 25–26: no stage of the AI life cycle should go beyond what a legitimate aim requires. Record why AI is used at all, why this method is appropriate and proportionate to the aim, that it does not infringe human rights, and that it rests on sound science. Where harm is possible, assess the risk and act to prevent it.",
          [
            "Is the legitimate aim of each AI system written down?",
            "Was a less intrusive or non-AI alternative considered, and why was it rejected?",
            "Is the scientific basis of the chosen method documented?",
          ],
          [
            "Use-case justification or business case",
            "Alternatives and proportionality analysis",
            "Risk assessment with preventive measures",
          ],
        ),
        req(
          "1.2",
          "No Social Scoring or Mass Surveillance",
          "Exclude social scoring and mass surveillance uses",
          "Para. 26: AI systems should not be used for social scoring or mass surveillance. Make this an explicit prohibited use and screen new use cases against it.",
          [
            "Does the AI policy list social scoring and mass surveillance as prohibited uses?",
            "Are new use cases screened against the prohibited-use list before approval?",
            "Do customer and vendor contracts restrict these uses of your AI systems?",
          ],
          [
            "AI acceptable-use policy",
            "Use-case intake screening records",
            "Contract or terms-of-use clauses",
          ],
        ),
      ],
    },
    {
      key: "2",
      title: "Safety and Security",
      requirements: [
        req(
          "2.1",
          "Safety and Security Across the Life Cycle",
          "Prevent unwanted harms and attack vulnerabilities",
          "Para. 27: safety risks (unwanted harms) and security risks (vulnerabilities to attack) should be avoided, addressed and eliminated throughout the AI system life cycle, supported by privacy-protective access to quality data for training and validation.",
          [
            "Are safety and security risks assessed at design, before release and after changes?",
            "Are AI-specific attacks (e.g. poisoning, prompt injection, model extraction) covered by security testing?",
            "Is the quality of training and validation data checked?",
          ],
          [
            "AI safety and security risk assessments",
            "Security and red-team test reports",
            "Data quality validation results",
          ],
        ),
      ],
    },
    {
      key: "3",
      title: "Fairness and Non-discrimination",
      requirements: [
        req(
          "3.1",
          "Inclusive and Accessible AI",
          "Make AI benefits available to all user groups",
          "Para. 28: AI actors should take an inclusive approach so that the benefits of AI are accessible to all, considering the needs of different age groups, cultures, language groups, persons with disabilities, girls and women, and disadvantaged or vulnerable people.",
          [
            "Have the needs of different age, language and disability groups been considered in design?",
            "Has the system been tested for accessibility?",
            "Are languages and cultural contexts of the intended users supported?",
          ],
          [
            "User and stakeholder analysis",
            "Accessibility test results",
            "Language and localisation coverage",
          ],
        ),
        req(
          "3.2",
          "Bias Minimisation",
          "Avoid discriminatory or biased outcomes",
          "Para. 29: AI actors should make all reasonable efforts to minimise and avoid reinforcing or perpetuating discriminatory or biased applications and outcomes throughout the life cycle (see also para. 66 on stereotyping in outcomes and training data).",
          [
            "Are outcomes tested for bias across relevant groups before release?",
            "Is bias monitored after deployment?",
            "Are training datasets reviewed for stereotyping and under-representation?",
          ],
          [
            "Bias and fairness test reports",
            "Production fairness monitoring",
            "Dataset review records",
          ],
        ),
        req(
          "3.3",
          "Remedy for Discrimination",
          "Offer an effective remedy for biased decisions",
          "Para. 29: an effective remedy should be available against discrimination and biased algorithmic determinations. Give affected people a route to raise a complaint and have it corrected.",
          [
            "Can affected people report a discriminatory outcome?",
            "Who investigates and how quickly?",
            "Are confirmed cases corrected and fed back into the system?",
          ],
          [
            "Complaint and redress procedure",
            "Case log with resolutions",
            "Corrective action records",
          ],
        ),
      ],
    },
    {
      key: "4",
      title: "Sustainability and Environment",
      requirements: [
        req(
          "4.1",
          "Sustainability Impact Assessment",
          "Assess human, social and environmental impact",
          "Para. 31: the human, social, cultural, economic and environmental impact of AI should be assessed continuously, with regard to sustainability goals such as the UN Sustainable Development Goals.",
          [
            "Is sustainability impact part of the AI system assessment?",
            "Is the assessment repeated during the system's life?",
            "Are effects on relevant Sustainable Development Goals identified?",
          ],
          [
            "Sustainability impact assessment",
            "Periodic review records",
            "SDG mapping",
          ],
        ),
        req(
          "4.2",
          "Environmental Footprint",
          "Measure and reduce the environmental impact of AI",
          "Para. 84: business enterprises should assess the direct and indirect environmental impact of AI across its life cycle, including carbon footprint and energy consumption, and reduce the impact of AI systems and data infrastructure.",
          [
            "Is energy use or carbon footprint of training and inference measured or estimated?",
            "Are reduction targets or measures defined?",
            "Do hosting and vendor choices take environmental impact into account?",
          ],
          [
            "Energy and emissions estimates",
            "Reduction plan",
            "Cloud or vendor sustainability information",
          ],
        ),
        req(
          "4.3",
          "Resource-Efficient Methods",
          "Prefer data-, energy- and resource-efficient AI",
          "Para. 86: in line with proportionality, favour data-, energy- and resource-efficient AI methods, keep evidence that the application has its intended effect, and do not use AI where its environmental impact is disproportionate.",
          [
            "Was model size or method chosen with efficiency in mind?",
            "Is there evidence that the system delivers its intended effect?",
            "Has a disproportionate environmental impact ever led to dropping or changing a use case?",
          ],
          [
            "Model selection rationale",
            "Effectiveness evaluation",
            "Design review notes",
          ],
        ),
      ],
    },
    {
      key: "5",
      title: "Right to Privacy and Data Protection",
      requirements: [
        req(
          "5.1",
          "Lawful Data Life Cycle",
          "Collect, use, share, archive and delete data lawfully",
          "Paras. 32–33: data for AI should be collected, used, shared, archived and deleted consistently with applicable law and international data protection principles, with a legitimate aim and a valid legal basis, including informed consent where required.",
          [
            "Is the legal basis for each personal data use in AI recorded?",
            "Are retention and deletion rules applied to training and inference data?",
            "Is consent collected where it is the legal basis?",
          ],
          [
            "Records of processing",
            "Retention schedule",
            "Consent records",
          ],
        ),
        req(
          "5.2",
          "Privacy Impact Assessment and Privacy by Design",
          "Assess privacy impact and build privacy in",
          "Paras. 34 and 72: algorithmic systems need adequate privacy impact assessments that include societal and ethical considerations, as part of the ethical impact assessment, and privacy by design. AI actors are accountable for protecting personal information throughout the life cycle.",
          [
            "Has a privacy impact assessment been done for each AI system that uses personal data?",
            "Does it cover wider societal and ethical effects, not only legal compliance?",
            "Which privacy-by-design measures (minimisation, pseudonymisation, access limits) are in place?",
          ],
          [
            "Privacy impact assessments",
            "Privacy-by-design checklist",
            "Data minimisation records",
          ],
        ),
        req(
          "5.3",
          "Protection of Sensitive Data",
          "Secure sensitive personal data",
          "Para. 74 names data whose disclosure can cause exceptional harm: offences and criminal proceedings, biometric, genetic and health data, and data on race, gender, age, religion, political opinion, origin, disability and similar characteristics. Identify such data in AI systems and protect it accordingly.",
          [
            "Do any AI systems process sensitive data categories?",
            "What additional safeguards apply to that data?",
            "Is access to sensitive data restricted and logged?",
          ],
          [
            "Data inventory with sensitivity classification",
            "Security controls for sensitive data",
            "Access logs",
          ],
        ),
        req(
          "5.4",
          "Training Data Quality",
          "Evaluate training data quality continuously",
          "Paras. 71 and 76: evaluate the quality of training data on an ongoing basis, including the adequacy of collection and selection, security and protection, and use quality datasets built on a valid legal basis, with annotation that shows how a dataset was gathered and what properties it has.",
          [
            "Is training data quality checked before and during use?",
            "Is it documented how each dataset was collected and selected?",
            "Are lessons from data errors fed back into the process?",
          ],
          [
            "Dataset documentation (e.g. datasheets)",
            "Data quality reports",
            "Data issue log",
          ],
        ),
      ],
    },
    {
      key: "6",
      title: "Human Oversight and Determination",
      requirements: [
        req(
          "6.1",
          "Attributable Responsibility",
          "Assign a responsible person for every life-cycle stage",
          "Paras. 35 and 42: ethical and legal responsibility for every stage of the AI life cycle, and for remedy, must be attributable to natural persons or legal entities, according to their role.",
          [
            "Is a named owner recorded for each AI system?",
            "Are responsibilities for development, deployment and monitoring stages assigned?",
            "Is it clear who is responsible when a remedy is needed?",
          ],
          [
            "AI system inventory with owners",
            "RACI matrix",
            "Governance charter",
          ],
        ),
        req(
          "6.2",
          "Final Human Determination",
          "Keep humans in charge of irreversible decisions",
          "Paras. 26 and 36: where decisions are irreversible or hard to reverse, or involve life and death, final human determination should apply. Humans may choose to rely on AI, but AI never replaces ultimate human responsibility.",
          [
            "Which AI-supported decisions are irreversible or high-impact?",
            "Does a human make the final call for those decisions?",
            "Can the reviewer override the AI output?",
          ],
          [
            "Decision impact classification",
            "Human-in-the-loop design",
            "Override logs",
          ],
        ),
      ],
    },
    {
      key: "7",
      title: "Transparency and Explainability",
      requirements: [
        req(
          "7.1",
          "Disclosure of AI Use",
          "Tell people when AI is involved",
          "Para. 38: people should be fully informed when a decision is informed by or made on the basis of AI, and AI actors should tell users in a proper and timely way when a product or service is provided directly or with the help of AI.",
          [
            "Are users told when a product, service or decision involves AI?",
            "Is the notice given before or at the point of interaction?",
            "Is the disclosure wording reviewed for clarity?",
          ],
          [
            "User-facing AI notices",
            "Screenshots of disclosures",
            "Notice review records",
          ],
        ),
        req(
          "7.2",
          "Explanation and Human Review of Decisions",
          "Explain decisions and let people ask for review",
          "Paras. 38 and 40: people affected by a decision about their rights should be able to obtain the reasons and make submissions to a designated staff member able to review and correct it. For decisions that are not temporary, easily reversible or low-risk, a meaningful explanation should accompany the decision.",
          [
            "Can an affected person obtain the reasons for an AI-based decision?",
            "Is a designated staff member able to review and correct decisions?",
            "Are explanations provided with higher-impact decisions?",
          ],
          [
            "Explanation templates",
            "Review and appeal procedure",
            "Review request log",
          ],
        ),
        req(
          "7.3",
          "Context-Appropriate Transparency",
          "Document how the system works for its audience",
          "Paras. 38–40: the level of transparency and explainability should fit the context and impact, balanced against privacy, safety and security. It can cover how each stage of the system works, the factors behind a prediction, and what safeguards (e.g. safety or fairness measures) are in place.",
          [
            "Is there documentation of the system's purpose, data, logic and limitations?",
            "Are safeguards such as fairness or safety measures described?",
            "Was the level of disclosure set according to the system's impact?",
          ],
          [
            "Model or system cards",
            "Transparency documentation",
            "Disclosure decision records",
          ],
        ),
      ],
    },
    {
      key: "8",
      title: "Responsibility and Accountability",
      requirements: [
        req(
          "8.1",
          "Oversight, Audit and Due Diligence",
          "Run oversight, audit and due diligence on AI systems",
          "Paras. 43 and 51: develop oversight, impact assessment, audit and due diligence mechanisms, including whistle-blower protection, so the organisation can identify, prevent, mitigate and account for the impact of AI on human rights, the rule of law and inclusive societies.",
          [
            "Is there a human rights due diligence process for AI?",
            "Are AI systems audited internally or externally?",
            "Can staff raise AI concerns with whistle-blower protection?",
          ],
          [
            "Due diligence procedure",
            "Audit reports",
            "Whistle-blowing policy",
          ],
        ),
        req(
          "8.2",
          "Auditability and Traceability",
          "Make AI systems traceable and auditable",
          "Paras. 43 and 55: technical and institutional design should ensure the auditability and traceability of how AI systems work, so conflicts with human rights and environmental harm can be found and addressed.",
          [
            "Are model versions, data and configurations traceable for each deployment?",
            "Are inputs, outputs and decisions logged?",
            "Could an auditor reconstruct how a given output was produced?",
          ],
          [
            "Version and lineage records",
            "Decision logs",
            "Audit trail samples",
          ],
        ),
        req(
          "8.3",
          "Remediation of Harm",
          "Investigate and remedy harm caused by AI",
          "Para. 55: harms caused through AI systems should be investigated and redressed, including through remediation mechanisms provided by private and public sector companies.",
          [
            "Is there a process to investigate harm reported about an AI system?",
            "What remedies can be offered to affected people?",
            "Are root causes fixed and tracked?",
          ],
          [
            "Incident and harm procedure",
            "Incident records with remediation",
            "Corrective action tracker",
          ],
        ),
      ],
    },
    {
      key: "9",
      title: "Awareness and Literacy",
      requirements: [
        req(
          "9.1",
          "AI Ethics Training and Literacy",
          "Train people on AI and its human rights impact",
          "Paras. 44–45: the private sector is among those expected to promote understanding of AI through digital skills and AI ethics training, grounded in the impact of AI on human rights and the environment.",
          [
            "Do staff who build, buy or use AI receive AI ethics training?",
            "Does the training cover human rights and environmental impacts?",
            "Is information offered to users to help them make informed choices about AI?",
          ],
          [
            "Training materials",
            "Completion records",
            "User guidance material",
          ],
        ),
      ],
    },
    {
      key: "10",
      title: "Multi-stakeholder and Adaptive Governance",
      requirements: [
        req(
          "10.1",
          "Stakeholder Participation",
          "Involve affected stakeholders across the life cycle",
          "Paras. 47 and 58: participation of different stakeholders, including marginalised groups, is needed for inclusive AI governance. Where Indigenous Peoples' data is involved, respect their self-governance of that data. Favour open standards and interoperability.",
          [
            "Which stakeholder groups were consulted for each AI system?",
            "How were marginalised or affected communities included?",
            "Is the use of Indigenous Peoples' data governed with their involvement?",
          ],
          [
            "Stakeholder engagement plan",
            "Consultation records",
            "Data governance agreements",
          ],
        ),
      ],
    },
    {
      key: "11",
      title: "Ethical Impact Assessment",
      requirements: [
        req(
          "11.1",
          "Ethical Impact Assessment",
          "Assess benefits, concerns and risks of each AI system",
          "Paras. 50–51: carry out an ethical impact assessment that identifies benefits, concerns and risks, with prevention, mitigation and monitoring measures, covering human rights (especially of vulnerable people), labour rights, the environment and social implications. UNESCO has published an EIA methodology (para. 131(a)).",
          [
            "Has an ethical impact assessment been completed for each AI system?",
            "Does it cover vulnerable groups, labour rights and the environment?",
            "Are mitigation and monitoring measures assigned and tracked?",
          ],
          [
            "Ethical impact assessments",
            "Mitigation action plan",
            "Assessment sign-off",
          ],
        ),
        req(
          "11.2",
          "Pre-release Testing of High-Risk Systems",
          "Test rights-affecting systems before release",
          "Para. 51: AI systems identified as potential risks to human rights should be broadly tested, in real-world conditions if needed, as part of the ethical impact assessment before they are released.",
          [
            "Which systems were identified as potential human rights risks?",
            "What testing was done before release, and under what conditions?",
            "Who approved release based on the results?",
          ],
          [
            "Test plans and reports",
            "Pilot or field-test results",
            "Release approval records",
          ],
        ),
        req(
          "11.3",
          "Life-Cycle Monitoring",
          "Monitor algorithms, data and actors in operation",
          "Para. 52: business enterprises should monitor all phases of the AI life cycle, including how decision-making algorithms function, the data, and the AI actors involved, especially where end users interact directly with the system.",
          [
            "Are deployed systems monitored for performance and harmful behaviour?",
            "Is data drift or quality degradation monitored?",
            "Are monitoring results reviewed by the system owner?",
          ],
          [
            "Monitoring dashboards",
            "Alert and review records",
            "Periodic monitoring reports",
          ],
        ),
        req(
          "11.4",
          "Effects on Decision-making Autonomy",
          "Assess effects of AI recommendations on autonomy",
          "Paras. 51 and 125: private sector companies should investigate the sociological and psychological effects of AI-based recommendations on people's decision-making autonomy, including the possibility of AI manipulating human cognitive biases.",
          [
            "Do any systems recommend or nudge user decisions?",
            "Has their effect on users' autonomy been assessed?",
            "Are manipulative design patterns ruled out?",
          ],
          [
            "Autonomy or manipulation risk assessment",
            "UX and design review",
            "User research findings",
          ],
        ),
      ],
    },
    {
      key: "12",
      title: "Ethical Governance and Stewardship",
      requirements: [
        req(
          "12.1",
          "AI Ethics Oversight Role",
          "Appoint an AI ethics officer or equivalent mechanism",
          "Para. 58: organisations are encouraged to involve stakeholders in AI governance and to consider an independent AI Ethics Officer or another mechanism to oversee ethical impact assessment, auditing and continuous monitoring.",
          [
            "Is there an AI ethics officer, committee or equivalent?",
            "How independent is it from the teams it oversees?",
            "Does it oversee impact assessments, audits and monitoring?",
          ],
          [
            "Appointment or committee charter",
            "Meeting minutes",
            "Oversight reports",
          ],
        ),
        req(
          "12.2",
          "Consistent Standards Across Markets",
          "Apply your ethical standards wherever you deploy",
          "Para. 120: AI actors from countries with AI ethics standards should respect those standards when exporting, developing or applying AI systems in countries where such standards may not exist.",
          [
            "Do the same ethical requirements apply in every market you serve?",
            "Are exceptions for specific countries documented and approved?",
            "Is local law also checked for each deployment country?",
          ],
          [
            "Global AI policy scope statement",
            "Exception register",
            "Country legal review records",
          ],
        ),
      ],
    },
    {
      key: "13",
      title: "Gender",
      requirements: [
        req(
          "13.1",
          "Gender Perspective in Impact Assessment",
          "Include gender in ethical impact assessment",
          "Para. 87: the rights, safety and integrity of girls and women must not be violated at any stage of the AI life cycle, and ethical impact assessment should include a cross-cutting gender perspective.",
          [
            "Does the impact assessment address effects on women and girls?",
            "Are gender-related safety risks (e.g. harassment) considered?",
            "Is gender expertise involved in the assessment?",
          ],
          [
            "Gender section in impact assessments",
            "Risk register entries",
            "Reviewer list",
          ],
        ),
        req(
          "13.2",
          "Gender Stereotyping and Bias",
          "Identify and redress gender stereotypes in AI",
          "Para. 90: gender stereotyping and discriminatory bias should not be translated into AI systems but proactively identified and redressed.",
          [
            "Are outputs tested for gender stereotypes?",
            "Are training data reviewed for gender imbalance?",
            "Are identified issues corrected and retested?",
          ],
          [
            "Gender bias test results",
            "Dataset balance analysis",
            "Remediation records",
          ],
        ),
        req(
          "13.3",
          "Gender Balance in AI Teams",
          "Promote balanced participation and harassment-free work",
          "Paras. 67, 89 and 91: promote gender representation and diversity in AI teams, management and boards, and develop and enforce harassment-free workplace policies.",
          [
            "Is gender representation in AI teams and leadership tracked?",
            "Are there actions to improve it?",
            "Is a harassment-free workplace policy in force?",
          ],
          [
            "Diversity metrics",
            "Diversity and inclusion plan",
            "Anti-harassment policy",
          ],
        ),
      ],
    },
    {
      key: "14",
      title: "Communication and Information",
      requirements: [
        req(
          "14.1",
          "Content Moderation Notice and Appeal",
          "Explain content decisions and allow appeals",
          "Para. 113: AI actors should respect freedom of expression and access to information in automated content generation, moderation and curation, give users prompt notice of the reasons for removal or other treatment of content, and offer an appeal.",
          [
            "Do you generate, moderate or curate content with AI?",
            "Are users told why their content was removed or restricted?",
            "Can users appeal and get a human review?",
          ],
          [
            "Moderation notices",
            "Appeal procedure",
            "Appeal outcome statistics",
          ],
        ),
      ],
    },
    {
      key: "15",
      title: "Economy and Labour",
      requirements: [
        req(
          "15.1",
          "Fair Transition for Affected Workers",
          "Support workers whose jobs AI changes",
          "Para. 118: private sector companies are expected to work with workers and unions toward a fair transition for at-risk employees, including upskilling and reskilling and ways to retain employees during the transition.",
          [
            "Has the effect of AI deployments on jobs been assessed?",
            "Are workers or their representatives consulted?",
            "Are reskilling or redeployment options offered?",
          ],
          [
            "Workforce impact assessment",
            "Consultation records",
            "Reskilling programme records",
          ],
        ),
      ],
    },
    {
      key: "16",
      title: "Health and Social Well-being",
      requirements: [
        req(
          "16.1",
          "Identifiable AI and Right to a Human",
          "Let users recognise AI and ask for a human",
          "Para. 127: users should be able to tell whether they are interacting with a living being or an AI system imitating human or animal characteristics, refuse that interaction and request human intervention.",
          [
            "Do chatbots and assistants identify themselves as AI?",
            "Can users opt out of the AI interaction?",
            "Is there a working route to a human?",
          ],
          [
            "Chatbot disclosure text",
            "Escalation-to-human flow",
            "Escalation usage data",
          ],
        ),
        req(
          "16.2",
          "Health Care AI Safeguards",
          "Apply extra safeguards to health AI",
          "Para. 123 (where you build or deploy health AI): oversight to reduce bias, clinicians and patients involved as domain experts, privacy and informed consent, final diagnosis and treatment decisions taken by humans, and ethics committee review before clinical use where necessary.",
          [
            "Are clinicians and patients involved in developing the system?",
            "Do humans make the final diagnosis and treatment decisions?",
            "Was ethics committee review obtained before clinical use where needed?",
          ],
          [
            "Clinical advisory involvement records",
            "Clinical workflow showing human decision",
            "Ethics committee approval",
          ],
        ),
      ],
    },
  ],
};
