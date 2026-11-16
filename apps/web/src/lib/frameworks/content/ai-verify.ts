import type { FrameworkDefinition } from "../types";
import { req } from "../helpers";

// AI Verify Testing Framework (AI Verify Foundation / IMDA Singapore): the 11
// AI governance principles and their outcomes ("testable criteria") with process
// checks, as published in the AI Verify toolkit's process-checklist plugin
// (github.com/aiverify-foundation/aiverify, Apache License 2.0). Keys follow the
// framework's own numbering: section = principle, requirement = outcome, and
// the process IDs are cited in each description. Adapted, not copied; the
// aiverifyfoundation.sg website copy is under separate, non-commercial terms and
// was not used. Guidance text is Governly's own.
export const aiVerify: FrameworkDefinition = {
  slug: "ai-verify",
  name: "AI Verify Testing Framework",
  navLabel: "AI Verify",
  kind: "framework",
  // Enabled from the Frameworks library (tenant_frameworks), not as a policy.
  policyNames: [],
  description:
    "Singapore's AI Verify testing framework (AI Verify Foundation, built by IMDA): process checks that let an organisation show, with documentary evidence, how it implements 11 internationally recognised AI governance principles. Voluntary; the Foundation maps it to the NIST AI RMF, ISO/IEC 42001 and the Hiroshima Process Code of Conduct.",
  source: {
    title:
      "AI Verify Foundation: AI Verify process checklist (aiverify.stock.process-checklist), Apache License 2.0",
    url: "https://github.com/aiverify-foundation/aiverify/tree/main/stock-plugins/aiverify.stock.process-checklist",
  },
  sections: [
    {
      key: "1",
      title: "Transparency",
      requirements: [
        req(
          "1.1",
          "Transparency on Personal Data Use",
          "Tell end users how their personal data is used",
          "Outcome 1.1 (processes 1.1.1–1.1.2): align with applicable data protection law and guidance (in Singapore, the PDPC's advisory guidelines, Guide to Accountability and Guide to DPIAs) and publish a privacy policy explaining how personal data is used in the AI system, e.g. third-party involvement, data ownership and portability, data flows and standards complied with.",
          [
            "Does an internal policy require alignment with applicable data protection law?",
            "Does the published privacy policy describe personal data use in the AI system?",
            "Does it cover third parties, data flows and data ownership?",
          ],
          [
            "Internal data protection policy",
            "Published privacy policy",
            "Data flow diagram",
          ],
        ),
        req(
          "1.2",
          "Informing Affected Parties About the AI System",
          "Disclose purpose, limits and risks at the right points",
          "Outcome 1.2 (processes 1.2.1–1.2.5): where IP, safety and integrity allow, inform end users and other parties about the AI system's purpose, criteria, limitations and risks. Have an in-house communication policy on transparency, tell stakeholders AI is used, explain the factors behind decisions where possible, consult end users early, and share accuracy, intended use and limitation information as regulations require.",
          [
            "Is there an internal policy on communicating AI use to consumers?",
            "Are users told when AI is used and, where possible, why a decision was made?",
            "Are accuracy, intended use and limitations shared with users and authorities?",
          ],
          [
            "AI communication policy",
            "User-facing AI notices and decision explanations",
            "Records of early end-user consultation",
          ],
        ),
        req(
          "1.3",
          "Guidance on Proper Use",
          "Give users clear instructions for using the system",
          "Outcome 1.3 (process 1.3.1): provide end users, in an accessible way, with the purpose, intended use and intended response of the AI system.",
          [
            "Is user guidance available for each AI system?",
            "Does it state the intended use and what the system should not be used for?",
            "Is it written for the actual audience?",
          ],
          [
            "User guides or help pages",
            "Terms of use",
            "Accessibility review of guidance",
          ],
        ),
        req(
          "1.4",
          "Reporting Adverse Impacts",
          "Let users report harm caused by the AI system",
          "Outcome 1.4 (process 1.4.1): give end users and external parties a way to report adverse impacts of the AI system to the organisation.",
          [
            "Is there a channel for users and third parties to report adverse impacts?",
            "Is it easy to find?",
            "Are reports triaged and tracked to closure?",
          ],
          [
            "Reporting channel (form, email, in-product link)",
            "Reporting procedure",
            "Report log",
          ],
        ),
        req(
          "1.5",
          "Incident Communication",
          "Notify end users when an incident occurs",
          "Outcome 1.5 (process 1.5.1): have a process to communicate incidents involving the AI system to end users.",
          [
            "Does the incident process include notifying affected users?",
            "Who decides what is communicated and when?",
            "Have past incidents been communicated as required?",
          ],
          [
            "Incident communication procedure",
            "Notification templates",
            "Past incident notices",
          ],
        ),
      ],
    },
    {
      key: "2",
      title: "Explainability",
      requirements: [
        req(
          "2.1",
          "Preference for Explainable Models",
          "Favour interpretable models or justify the trade-off",
          "Outcome 2.1 (process 2.1.1): prefer models that can explain their decisions or are interpretable by default. If a less explainable approach is chosen, document the rationale, the risk assessment and the trade-offs. The framework pairs this with technical explainability tests in the AI Verify toolkit.",
          [
            "Was explainability considered when choosing the model?",
            "If a less explainable model was chosen, is the rationale documented?",
            "Have explainability tests been run on the model?",
          ],
          [
            "Model selection rationale",
            "Risk and trade-off assessment",
            "Explainability test results",
          ],
        ),
      ],
    },
    {
      key: "3",
      title: "Repeatability / Reproducibility",
      requirements: [
        req(
          "3.1",
          "Model Provenance",
          "Version code, parameters and data for every model",
          "Outcome 3.1 (process 3.1.1): record the provenance of the AI model: version control source code and frameworks and, for each model version, track the code version, parameters, hyperparameters and source data.",
          [
            "Is model code under version control?",
            "Can you tell which code, parameters and data produced each model version?",
            "Are frameworks and dependencies versioned?",
          ],
          [
            "Repository history",
            "Model registry entries",
            "Experiment tracking records",
          ],
        ),
        req(
          "3.2",
          "Data Quality Over Time",
          "Check data accuracy, completeness and relevance",
          "Outcome 3.2 (process 3.2.1): verify the quality of data used by the AI system, e.g. accuracy, completeness (missing values, duplicates), credibility of the source, recency, relevance, integrity of joins and transformations, usability, and feature distributions.",
          [
            "Which data quality checks run on training and input data?",
            "Is the reliability of each data source assessed?",
            "Are quality results reviewed over time?",
          ],
          [
            "Data quality reports",
            "Distribution analysis",
            "Data source assessments",
          ],
        ),
        req(
          "3.3",
          "Data Lineage",
          "Know where data came from and how it changed",
          "Outcome 3.3 (process 3.3.1): keep a data provenance record covering how data was collected and what it means, how it is used, labelling by a representative group with a documented bias check, sources of error, updates, and attribution to sources.",
          [
            "Is there a provenance record for each dataset?",
            "Is labelling done by a representative group and checked for bias?",
            "Can errors be traced back to their source?",
          ],
          [
            "Data provenance records",
            "Labelling procedure and bias review",
            "Lineage diagrams",
          ],
        ),
        req(
          "3.4",
          "Traceability of Data Behind Decisions",
          "Log the data used for training and inference",
          "Outcome 3.4 (process 3.4.1): log the data used to train each model version and to produce inference results, whether batch scoring or an API endpoint.",
          [
            "Is training data recorded per model version?",
            "Is inference input data logged?",
            "Can you retrieve the data behind a given decision?",
          ],
          [
            "Training data manifests",
            "Inference logs",
            "Sample decision trace",
          ],
        ),
        req(
          "3.5",
          "Traceability of Model Behind Decisions",
          "Link each output to the model that produced it",
          "Outcome 3.5 (process 3.5.1): link inference results back to the underlying model version and source code.",
          [
            "Does each logged output record the model version?",
            "Can the model version be linked to its source code?",
            "Is this linkage kept for batch and API use?",
          ],
          [
            "Inference logs with model IDs",
            "Model registry",
            "Sample trace from output to code",
          ],
        ),
        req(
          "3.6",
          "Decision Logging",
          "Keep inputs and outputs long enough to review",
          "Outcome 3.6 (process 3.6.1): log all model inputs and inference outputs and keep them for a reasonable period so they can be reviewed.",
          [
            "Are all inputs and outputs logged?",
            "What is the retention period, and why?",
            "Are logs protected and reviewable?",
          ],
          [
            "Logging configuration",
            "Retention policy",
            "Log review records",
          ],
        ),
        req(
          "3.7",
          "Reproducible Training",
          "Tie model artefacts to the code and settings used",
          "Outcome 3.7 (process 3.7.1): be able to reproduce the training process (apart from data) by associating each model artefact with the code, dependencies and parameters used to train it.",
          [
            "Is each artefact linked to its code, dependencies and parameters?",
            "Has a model ever been retrained to confirm reproducibility?",
            "Are training environments captured (e.g. containers, lock files)?",
          ],
          [
            "Model artefact metadata",
            "Environment specifications",
            "Reproduction test results",
          ],
        ),
        req(
          "3.8",
          "Repeatability of Outputs",
          "Check the model gives the same output for the same input",
          "Outcome 3.8 (process 3.8.1): assess repeatability by running multiple inferences on the same input and checking that differences stay within accepted statistical limits (not applicable at retraining time).",
          [
            "Has repeatability been tested?",
            "What variation is accepted, and how was it set?",
            "Are non-deterministic settings documented?",
          ],
          [
            "Repeatability test results",
            "Acceptance thresholds",
            "Model configuration records",
          ],
        ),
        req(
          "3.9",
          "Defined Model Development Process",
          "Set metrics and track experiments",
          "Outcome 3.9 (processes 3.9.1–3.9.2): define and evaluate the model development process by setting technical and business metrics for assessing models, and tracking challenger-model experiments, the reasons for them and how the final model was chosen.",
          [
            "Are technical and business metrics defined for each model?",
            "Are experiments and challenger models tracked?",
            "Is the choice of final model documented?",
          ],
          [
            "Metric definitions",
            "Experiment tracking records",
            "Model selection decision",
          ],
        ),
        req(
          "3.10",
          "Reproducible Input Data",
          "Version training data or its transformations",
          "Outcome 3.10 (process 3.10.1): version the input data used for training where possible; if not, avoid changing raw data at source and track each transformation step in the data pipeline.",
          [
            "Is training data versioned?",
            "If not, is raw data kept unchanged at source?",
            "Are pipeline transformation steps recorded?",
          ],
          [
            "Data versioning records",
            "Pipeline definitions",
            "Raw data retention evidence",
          ],
        ),
        req(
          "3.11",
          "Assumptions Hold Across Retraining",
          "Flag distribution changes between retraining runs",
          "Outcome 3.11 (process 3.11.1): record the statistical distribution of input features and outputs so divergence during retraining can be flagged, and monitor inputs and evaluation metrics for anomalies across runs.",
          [
            "Are feature and output distributions recorded per training run?",
            "Are divergences flagged automatically?",
            "Who reviews anomalies before a retrained model is released?",
          ],
          [
            "Distribution comparison reports",
            "Retraining anomaly alerts",
            "Release review records",
          ],
        ),
        req(
          "3.12",
          "Reproducible Deployments",
          "Keep an audit trail of every deployment",
          "Outcome 3.12 (process 3.12.1): log when and how each model was deployed, including serving code, test and validation data, and the model artefact version.",
          [
            "Is every deployment logged with date and method?",
            "Are serving code and artefact versions recorded?",
            "Are the test and validation data used recorded?",
          ],
          [
            "Deployment logs",
            "CI/CD records",
            "Release notes",
          ],
        ),
        req(
          "3.13",
          "Validating Third-Party Model Claims",
          "Test vendor accuracy claims yourself",
          "Outcome 3.13 (process 3.13.1): for black-box or third-party models, assess the vendor's accuracy claims by running a curated test set and reviewing performance.",
          [
            "Are third-party model claims tested before adoption?",
            "Is the test set representative of your use case?",
            "Are results compared against the vendor's claims?",
          ],
          [
            "Curated test set description",
            "Vendor model evaluation report",
            "Vendor documentation",
          ],
        ),
        req(
          "3.14",
          "Continuous Output Quality Monitoring",
          "Monitor live models against their design assumptions",
          "Outcome 3.14 (process 3.14.1): after go-live, continuously monitor and periodically validate model performance (feature and inference drift, accuracy against ground truth) and application performance (latency, throughput, error rates).",
          [
            "Is drift monitored in production?",
            "Is accuracy checked against ground truth when available?",
            "Are latency and error rates monitored?",
          ],
          [
            "Monitoring dashboards",
            "Periodic validation reports",
            "Alert history",
          ],
        ),
      ],
    },
    {
      key: "4",
      title: "Safety",
      requirements: [
        req(
          "4.1",
          "Materiality Assessment",
          "Assess materiality and escalate risks to accountable parties",
          "Outcome 4.1 (process 4.1.1): complete an assessment of materiality, submit it to those accountable for the AI system (e.g. AI governance committee, system owner, reviewers), highlight its risks, and document the justification for materiality decisions and the controls applied.",
          [
            "Has a materiality assessment been completed for each AI system?",
            "Was it reviewed by the accountable parties?",
            "Are the reasons for the materiality rating documented?",
          ],
          [
            "Materiality assessment",
            "Governance committee review records",
            "Control mapping",
          ],
        ),
        req(
          "4.2",
          "Use-Case Risk Assessment",
          "Document intended use, capabilities and limitations",
          "Outcome 4.2 (process 4.2.1): assess risks for each use case, including dependence on stable behaviour, and document intended use cases, capabilities and limitations (e.g. model cards) stored with the model and reviewed before deployment.",
          [
            "Is there a model card or equivalent for each model?",
            "Is it stored with the model artefact?",
            "Is it reviewed before production deployment?",
          ],
          [
            "Model cards",
            "Risk assessment per use case",
            "Pre-deployment review records",
          ],
        ),
        req(
          "4.3",
          "Ongoing Risk Monitoring",
          "Review the model after deployment for new risks",
          "Outcome 4.3 (process 4.3.1): continuously assess and monitor risks, including new ones after deployment, by assigning a reviewer familiar with the downstream use case to check that real use matches the intended use.",
          [
            "Is a post-deployment reviewer assigned?",
            "Does the review compare actual use with intended use?",
            "Are new risks recorded and acted on?",
          ],
          [
            "Reviewer assignment",
            "Post-deployment review reports",
            "Risk register updates",
          ],
        ),
        req(
          "4.4",
          "Anticipating Failure",
          "Use confidence and outlier scores to spot failure",
          "Outcome 4.4 (process 4.4.1): assess how the system might fail given its inputs and outputs. Where feasible, use models that produce a confidence score and detect inputs that are outliers relative to the training data.",
          [
            "Does the model output confidence scores?",
            "Are out-of-distribution inputs detected?",
            "Are known failure conditions documented and shared?",
          ],
          [
            "Model output specification",
            "Outlier detection configuration",
            "Failure mode documentation",
          ],
        ),
        req(
          "4.5",
          "Fault Tolerance",
          "Plan fallbacks for model failure",
          "Outcome 4.5 (processes 4.5.1–4.5.4): plan fault tolerance using blue-green or canary deployments, a backup model server, fallback to a backup or sensible default when the model fails or has low confidence, and retraining with ground truth from production.",
          [
            "Is there a fallback when the model fails or is unsure?",
            "Are releases staged (e.g. canary, blue-green)?",
            "Is production ground truth used to improve the model?",
          ],
          [
            "Deployment strategy documentation",
            "Fallback design",
            "Retraining records",
          ],
        ),
        req(
          "4.6",
          "Residual Risk",
          "Document residual risk and the tolerance for it",
          "Outcome 4.6 (process 4.6.1): identify residual risks that cannot be mitigated, assess the organisation's tolerance, and document the reasons for that tolerance.",
          [
            "Are residual risks listed for each AI system?",
            "Is the risk tolerance stated and justified?",
            "Who accepted the residual risk?",
          ],
          [
            "Residual risk assessment",
            "Risk acceptance sign-off",
            "Risk appetite statement",
          ],
        ),
      ],
    },
    {
      key: "5",
      title: "Security",
      requirements: [
        req(
          "5.1",
          "Team Competency in AI Security",
          "Keep the team current on AI threats",
          "Outcome 5.1 (process 5.1.1): staff involved in the model life cycle know the threats, vulnerabilities, impact and mitigations relevant to AI systems, and keep that knowledge up to date.",
          [
            "Have relevant staff had AI security training?",
            "How is knowledge kept up to date?",
            "Who is covered (developers, operators, reviewers)?",
          ],
          [
            "Training records",
            "Training content",
            "Threat intelligence sources",
          ],
        ),
        req(
          "5.2",
          "Security Risk Assessment at Inception",
          "Assess security risk at the start of development",
          "Outcome 5.2 (process 5.2.1): carry out a security risk assessment at inception in line with relevant industry standards, and take mitigating steps.",
          [
            "Was a security risk assessment done before development started?",
            "Which standard was followed?",
            "Are mitigations tracked?",
          ],
          [
            "Security risk assessment",
            "Threat model",
            "Mitigation tracker",
          ],
        ),
        req(
          "5.3",
          "Security in Verification and Validation",
          "Protect integrity and chain of custody",
          "Outcome 5.3 (processes 5.3.1–5.3.2): ensure the integrity and chain of custody of data and models, and validate and verify the integrity of acquired datasets.",
          [
            "Is chain of custody for data and models recorded?",
            "Are acquired datasets validated before use?",
            "Are integrity checks (e.g. hashes, signatures) used?",
          ],
          [
            "Chain-of-custody records",
            "Dataset validation reports",
            "Integrity check logs",
          ],
        ),
        req(
          "5.4",
          "Security in Design and Development",
          "Secure the development environment and assets",
          "Outcome 5.4 (processes 5.4.1–5.4.4): secure the development environment and access controls, protect data at rest and in transit, track changes to models and data, and mitigate dataset attacks such as poisoning (sanitisation, secure storage, post-training validation).",
          [
            "Is access to the development environment controlled?",
            "Is data encrypted at rest and in transit?",
            "What measures guard against data poisoning?",
          ],
          [
            "Access control configuration",
            "Encryption settings",
            "Poisoning mitigation and validation records",
          ],
        ),
        req(
          "5.5",
          "Security in Deployment and Monitoring",
          "Defend live systems and accept vulnerability reports",
          "Outcome 5.5 (processes 5.5.1–5.5.3): mitigate inference and model-extraction attacks, alert on anomalous behaviour such as unauthorised access, and run a vulnerability disclosure process for the AI system.",
          [
            "Are inference and extraction attacks addressed?",
            "Is anomalous access alerted on?",
            "Is there a public vulnerability disclosure process?",
          ],
          [
            "Attack mitigation design",
            "Security alerting configuration",
            "Vulnerability disclosure policy",
          ],
        ),
        req(
          "5.6",
          "Security for Continual Learning",
          "Control risks of models that keep learning",
          "Outcome 5.6 (processes 5.6.1–5.6.2): for continual or online learning, consider risks such as poisoning and drift, confirm continual learning is still justified, and require approved performance targets to be met before an updated model goes live.",
          [
            "Do any systems learn continually in production?",
            "Has the justification been reviewed against the risks?",
            "Must updates meet approved targets before release?",
          ],
          [
            "Continual learning risk assessment",
            "Performance targets",
            "Release gate records",
          ],
        ),
        req(
          "5.7",
          "Secure End of Life",
          "Dispose of data and models securely",
          "Outcome 5.7 (process 5.7.1): at end of life, dispose of or destroy data and models securely and in line with data privacy standards and applicable rules.",
          [
            "Is there a decommissioning procedure for AI systems?",
            "Are data and model artefacts securely deleted?",
            "Is disposal recorded?",
          ],
          [
            "Decommissioning procedure",
            "Disposal certificates or logs",
            "Retention policy",
          ],
        ),
      ],
    },
    {
      key: "6",
      title: "Robustness",
      requirements: [
        req(
          "6.1",
          "Quality of Development Data",
          "Keep data current, complete and representative",
          "Outcome 6.1 (process 6.1.1): ensure data is up to date, complete and representative of the deployment environment, log training run metadata, and compare production and training data characteristics to detect data and concept drift.",
          [
            "Is training data representative of the deployment environment?",
            "Is training metadata logged for comparison?",
            "Is production data compared with training data for drift?",
          ],
          [
            "Representativeness analysis",
            "Training run metadata",
            "Drift reports",
          ],
        ),
        req(
          "6.2",
          "Causes of Low Accuracy",
          "Assess consequences of inaccurate outputs",
          "Outcome 6.2 (process 6.2.1): review factors that could lower accuracy and whether that could have critical, adversarial or damaging consequences; document intended use, risks and limitations (e.g. in model cards).",
          [
            "Are factors that reduce accuracy identified?",
            "Are the consequences of inaccurate outputs assessed?",
            "Is this captured in the model card?",
          ],
          [
            "Model cards",
            "Error analysis",
            "Impact assessment",
          ],
        ),
        req(
          "6.3",
          "Self-Invalidation Risks",
          "Check whether use can undermine training assumptions",
          "Outcome 6.3 (process 6.3.1): consider whether the system's operation can invalidate its data or assumptions, e.g. feedback loops, user adaptation and adversarial attacks, and document this with intended use, risks and limitations.",
          [
            "Could the system's outputs feed back into its own training data?",
            "Could users adapt their behaviour to game it?",
            "Are these risks documented and monitored?",
          ],
          [
            "Model cards",
            "Feedback loop analysis",
            "Monitoring plan",
          ],
        ),
        req(
          "6.4",
          "Change-Triggered Robustness Review",
          "Re-review robustness when the system changes",
          "Outcome 6.4 (process 6.4.1): have a review process that highlights changes in code (training, serving), input data (raw data, features) and outputs (inference results, metrics) to decide when a new robustness review is needed.",
          [
            "Which changes trigger a robustness review?",
            "Are code, data and output changes all tracked?",
            "Are reviews recorded?",
          ],
          [
            "Change management procedure",
            "Change logs",
            "Robustness review records",
          ],
        ),
        req(
          "6.5",
          "Black-Box Attack Mitigation",
          "Monitor and respond to suspicious use of live systems",
          "Outcome 6.5 (processes 6.5.1–6.5.3): decide on and apply training-time mitigations for known adversarial attacks where possible, monitor requests (frequency, feature distribution) for suspicious use, and act on suspicious users (flag, rate-limit, block, suspend). The toolkit also provides technical robustness tests.",
          [
            "Were adversarial mitigations considered at training time?",
            "Are request patterns monitored for abuse?",
            "What actions are taken against suspicious users?",
          ],
          [
            "Adversarial mitigation decision record",
            "Request monitoring and rate-limit configuration",
            "Abuse response log",
          ],
        ),
      ],
    },
    {
      key: "7",
      title: "Fairness",
      requirements: [
        req(
          "7.1",
          "Individual Fairness",
          "Assess fairness within groups",
          "Outcome 7.1 (process 7.1.1): assess within-group (individual) fairness, for example with a counterfactual fairness assessment.",
          [
            "Has individual fairness been tested?",
            "Which method was used (e.g. counterfactual testing)?",
            "Were issues found and addressed?",
          ],
          [
            "Counterfactual fairness test results",
            "Method description",
            "Remediation records",
          ],
        ),
        req(
          "7.2",
          "Life-Cycle Bias Testing",
          "Track fairness metrics through the life cycle",
          "Outcome 7.2 (process 7.2.1): test for bias across the whole life cycle, including bias from unrepresentative data, and monitor changes in fairness metric values over time.",
          [
            "Are fairness metrics measured at each stage?",
            "Are changes over time tracked?",
            "Do results lead to mitigation?",
          ],
          [
            "Fairness metric history",
            "Bias test reports",
            "Mitigation actions",
          ],
        ),
        req(
          "7.3",
          "Choice of Fairness Metrics",
          "Pick fairness metrics that fit the use case",
          "Outcome 7.3 (process 7.3.1): have a strategy for selecting fairness metrics aligned with the system's intended outcomes, e.g. using a fairness decision tree such as AI Verify's or Aequitas.",
          [
            "Which fairness metrics were chosen?",
            "Why do they suit this application?",
            "Was a structured selection method used?",
          ],
          [
            "Metric selection rationale",
            "Decision tree output",
            "Approval record",
          ],
        ),
        req(
          "7.4",
          "Sensitive Features",
          "Define sensitive features and consult affected groups",
          "Outcome 7.4 (processes 7.4.1–7.4.2): define sensitive features consistent with law and corporate values, identify privileged and unprivileged groups where feasible, and where feasible consult affected communities on the right definition of fairness.",
          [
            "Is there a list of sensitive features?",
            "Are privileged and unprivileged groups identified?",
            "Were affected communities consulted?",
          ],
          [
            "Sensitive feature register",
            "Group definitions",
            "Consultation notes",
          ],
        ),
        req(
          "7.5",
          "Sub-populations for Fairness Evaluation",
          "Define which groups outcomes must be fair between",
          "Outcome 7.5 (process 7.5.1): define the sub-populations between which outcomes should be fair, using sensitive features that are excluded from training but used to evaluate fairness.",
          [
            "Are evaluation sub-populations defined?",
            "Are sensitive features kept out of training?",
            "Are they still available for fairness evaluation?",
          ],
          [
            "Sub-population definitions",
            "Feature selection records",
            "Fairness evaluation dataset description",
          ],
        ),
        req(
          "7.6",
          "Representative Training Data",
          "Check groups are represented in the data",
          "Outcome 7.6 (process 7.6.1): check that training data represents the end-user population through exploratory analysis of each sensitive group, resampling or collecting more data where a group is badly under-represented.",
          [
            "Has group representation in training data been analysed?",
            "Were under-represented groups found?",
            "What was done about them?",
          ],
          [
            "Exploratory data analysis",
            "Representation statistics",
            "Resampling or data collection records",
          ],
        ),
        req(
          "7.7",
          "Flagging Bias Issues",
          "Alert on fairness threshold breaches and harms",
          "Outcome 7.7 (process 7.7.1): have a way to flag bias, discrimination or poor performance, by monitoring fairness metric threshold violations and actual harms after deployment.",
          [
            "Are fairness thresholds defined?",
            "Do breaches raise alerts?",
            "Are reports of actual harm captured?",
          ],
          [
            "Threshold definitions",
            "Alert records",
            "Harm reports",
          ],
        ),
        req(
          "7.8",
          "Ongoing Fairness Assurance",
          "Monitor fairness on the latest production data",
          "Outcome 7.8 (process 7.8.1): monitor fairness metrics on the latest data for the deployed model on an ongoing basis.",
          [
            "Are fairness metrics computed on current production data?",
            "How often?",
            "Who reviews the results?",
          ],
          [
            "Fairness monitoring dashboard",
            "Monitoring schedule",
            "Review records",
          ],
        ),
        req(
          "7.9",
          "Adjusting for Minority Samples",
          "Correct imbalanced training data",
          "Outcome 7.9 (process 7.9.1): address bias from unrepresentative data by adjusting samples of minorities where possible, e.g. oversampling, undersampling or synthetic samples (SMOTE).",
          [
            "Is class or group imbalance measured?",
            "Which balancing technique was used, if any?",
            "Was its effect on fairness and accuracy checked?",
          ],
          [
            "Imbalance analysis",
            "Balancing method documentation",
            "Before/after evaluation",
          ],
        ),
      ],
    },
    {
      key: "8",
      title: "Data Governance",
      requirements: [
        req(
          "8.1",
          "Data Quality Measures",
          "Maintain data quality over time",
          "Outcome 8.1 (process 8.1.1): verify data quality, covering accuracy, completeness, credibility, recency, relevance, integrity of transformations, usability and distributions. (The framework repeats this check under Reproducibility, outcome 3.2.)",
          [
            "Is data quality checked before each use?",
            "Are quality issues logged and fixed?",
            "Is ownership of data quality assigned?",
          ],
          [
            "Data quality reports",
            "Issue log",
            "Data owner assignments",
          ],
        ),
        req(
          "8.2",
          "Data Lineage Record",
          "Record origin, collection and movement of data",
          "Outcome 8.2 (process 8.2.1): keep a provenance record of where data came from, how it was collected and curated, and how it moved through the organisation. (Also checked under Reproducibility, outcome 3.3.)",
          [
            "Is lineage recorded from source to model?",
            "Are labelling and curation steps documented?",
            "Is the record kept up to date?",
          ],
          [
            "Lineage records",
            "Data catalogue entries",
            "Curation procedures",
          ],
        ),
        req(
          "8.3",
          "Regulatory Compliance of Data Practices",
          "Assess data practices against law and standards",
          "Outcome 8.3 (process 8.3.1): assess data practices against relevant regulations and industry standards and take mitigating steps.",
          [
            "Which regulations and standards apply to the data?",
            "Has a compliance assessment been done?",
            "Are gaps being remediated?",
          ],
          [
            "Compliance assessment",
            "Gap remediation plan",
            "Privacy impact assessments",
          ],
        ),
        req(
          "8.4",
          "Data Governance Competency",
          "Make data roles and responsibilities clear",
          "Outcome 8.4 (process 8.4.1): ensure staff who manage and use data for the AI system know their data governance roles and responsibilities, e.g. a data policy team that manages lineage tracking with proper controls.",
          [
            "Are data governance roles defined?",
            "Do staff know their responsibilities?",
            "Is training provided?",
          ],
          [
            "Data governance role descriptions",
            "Training records",
            "Data policy",
          ],
        ),
      ],
    },
    {
      key: "9",
      title: "Accountability",
      requirements: [
        req(
          "9.1",
          "Internal Governance Structure",
          "Set clear roles, a committee and escalation routes",
          "Outcome 9.1 (processes 9.1.1–9.1.3): adapt existing structures (e.g. three lines of defence) or create new ones; where AI is used across departments, set up an AI governance committee with data science, technology, risk and product; and enable reporting of actions affecting outcomes, with the accountable party responding.",
          [
            "Are AI roles and responsibilities defined?",
            "Is there a cross-functional AI governance committee?",
            "Is there a process to report and respond to outcome-affecting actions?",
          ],
          [
            "Governance framework and RACI",
            "Committee charter and minutes",
            "Escalation procedure",
          ],
        ),
        req(
          "9.2",
          "Auditability by Design",
          "Make the life cycle auditable",
          "Outcome 9.2 (process 9.2.1): use processes or tooling that support auditability: version control of code and model, versioned or immutable data, deployment audit trail, input/output logs and linking predictions to the originating model.",
          [
            "Are code, models and data versioned?",
            "Is there an audit trail of deployments?",
            "Can predictions be linked to the model that made them?",
          ],
          [
            "Tooling configuration",
            "Audit trail samples",
            "Model registry",
          ],
        ),
        req(
          "9.3",
          "Role-Based Access Control",
          "Enforce fine-grained, role-based permissions",
          "Outcome 9.3 (process 9.3.1): define and enforce access rights per role for training and deployment code and data, execution environments, actions such as training, review and deployment, and administration of access rules.",
          [
            "Are permissions defined per role?",
            "Are deployment and review rights separated?",
            "Are access rights reviewed periodically?",
          ],
          [
            "Access control matrix",
            "IAM configuration",
            "Access review records",
          ],
        ),
        req(
          "9.4",
          "Independent Oversight",
          "Keep model reviewers separate from builders",
          "Outcome 9.4 (process 9.4.1): maintain independent oversight: reviewers should be distinct from those who train and deploy models (the same people may train and deploy).",
          [
            "Who reviews models before deployment?",
            "Are reviewers independent of the training team?",
            "Is the review recorded?",
          ],
          [
            "Reviewer assignments",
            "Review sign-offs",
            "Organisation chart",
          ],
        ),
        req(
          "9.5",
          "Third-Party Model Suitability",
          "Justify and understand third-party models",
          "Outcome 9.5 (processes 9.5.1–9.5.2): for black-box third-party models, evaluate why they are needed and make an effort to understand what data trained them, how they were assessed for effectiveness and explainability, and when they perform poorly.",
          [
            "Is the need for each third-party model justified?",
            "Do you know what data trained it?",
            "Do you know its known weaknesses?",
          ],
          [
            "Vendor model justification",
            "Vendor model documentation",
            "Due diligence questionnaire",
          ],
        ),
        req(
          "9.6",
          "Supply-Chain Responsibilities",
          "Agree responsibilities with partners and suppliers",
          "Outcome 9.6 (process 9.6.1): clearly communicate responsibilities and obligations to all parties in the AI supply chain: partners, suppliers, customers and third parties.",
          [
            "Are AI responsibilities set out in contracts?",
            "Do customers know their obligations when using the system?",
            "Are responsibilities reviewed when the system changes?",
          ],
          [
            "Contracts and data processing agreements",
            "Customer documentation",
            "Shared responsibility matrix",
          ],
        ),
        req(
          "9.7",
          "Responsible Supplier Selection",
          "Choose aligned suppliers and require remediation",
          "Outcome 9.7 (process 9.7.1): select AI suppliers aligned with the organisation's approach, with processes for suppliers to take remedial action when their systems do not perform as intended.",
          [
            "Are suppliers assessed against your responsible AI approach?",
            "Do contracts require remediation of failures?",
            "Has supplier performance been reviewed?",
          ],
          [
            "Supplier assessments",
            "Contract clauses",
            "Supplier performance reviews",
          ],
        ),
        req(
          "9.8",
          "End-User Expectations",
          "Engage end users on their needs",
          "Outcome 9.8 (process 9.8.1): engage end users on their expectations and needs, e.g. through general usage agreements that scope the system's use.",
          [
            "How are end users' needs gathered?",
            "Is there a usage agreement scoping the system's use?",
            "Do findings change the system?",
          ],
          [
            "User research records",
            "Usage agreement",
            "Change records based on feedback",
          ],
        ),
      ],
    },
    {
      key: "10",
      title: "Human Agency and Oversight",
      requirements: [
        req(
          "10.1",
          "Equipped Oversight Parties",
          "Give overseers the training, tools and information they need",
          "Outcome 10.1 (processes 10.1.1–10.1.2): make sure those who use, review and sponsor the system are trained and have the tools to inquire into past decisions and record training and deployment information, with a guided way to document key information and decisions, and a system organising information by role.",
          [
            "Are users, reviewers and sponsors trained for oversight?",
            "Can they look into past decisions?",
            "Is key information documented in a guided, consistent way?",
          ],
          [
            "Oversight training records",
            "Documentation templates (e.g. model cards)",
            "Information management system",
          ],
        ),
        req(
          "10.2",
          "Oversight Suited to Autonomy",
          "Define the human's role and route uncertain cases to people",
          "Outcome 10.2 (processes 10.2.1–10.2.3): match oversight to how autonomous the system is: define the human role (in, over or out of the loop), flag highly uncertain decisions for human review, and detect outlier inputs.",
          [
            "Is the human oversight model defined for each system?",
            "Are low-confidence decisions sent for human review?",
            "Are outlier inputs detected?",
          ],
          [
            "Oversight model documentation",
            "Human review queue",
            "Outlier detection configuration",
          ],
        ),
        req(
          "10.3",
          "Pre-production Review",
          "Present model properties to decision-makers before launch",
          "Outcome 10.3 (process 10.3.1): before production, run a systematic review that presents performance, explainability and fairness metrics in a form that data science, product, legal, risk, research and ethics teams can understand.",
          [
            "Is there a pre-production review?",
            "Which teams take part?",
            "Are metrics presented in an accessible form?",
          ],
          [
            "Review pack",
            "Attendee list and minutes",
            "Go/no-go decision",
          ],
        ),
        req(
          "10.4",
          "Re-evaluation Schedule",
          "Re-test models on a schedule and on change",
          "Outcome 10.4 (process 10.4.1): set how often and how AI systems are re-tested after deployment, continuously or at intervals, using time-based or event-based triggers (new product, new data, changed context, substantial modification).",
          [
            "Is a re-evaluation frequency set?",
            "Which events trigger re-evaluation?",
            "Are re-evaluations recorded?",
          ],
          [
            "Re-evaluation policy",
            "Trigger definitions",
            "Re-evaluation reports",
          ],
        ),
        req(
          "10.5",
          "Role of AI in Decision-making",
          "Declare how AI complements or replaces humans",
          "Outcome 10.5 (process 10.5.1): those accountable for the system should consider how it benefits humans in decision-making, and declare how and where in the process AI complements or replaces the human.",
          [
            "Is it documented where AI sits in each decision process?",
            "Does it complement or replace human judgement?",
            "Was this approved by the accountable parties?",
          ],
          [
            "Decision process maps",
            "Transparency declaration",
            "Approval records",
          ],
        ),
      ],
    },
    {
      key: "11",
      title: "Inclusive Growth, Societal and Environmental Well-being",
      requirements: [
        req(
          "11.1",
          "Beneficial Outcomes",
          "Confirm the AI system benefits people, society and environment",
          "Outcome 11.1 (process 11.1.1): have a process to determine that developing and deploying the AI system benefits people, society and, where applicable, the environment.",
          [
            "Is the intended benefit of the system documented?",
            "Are societal and environmental effects considered?",
            "Who approves that the benefit justifies deployment?",
          ],
          [
            "Benefit assessment",
            "Societal and environmental impact notes",
            "Approval record",
          ],
        ),
      ],
    },
  ],
};
