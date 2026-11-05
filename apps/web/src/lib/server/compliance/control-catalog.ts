export interface ComplianceControlDefinition {
  key: string;
  mappedField: string;
  route: string;
  requiredEvidence: string[];
  implementationGuidance: string;
  priority: "high" | "medium" | "low";
}

export const COMPLIANCE_CONTROL_CATALOG: Record<
  string,
  ComplianceControlDefinition
> = {
  application_scope_documented: {
    key: "application_scope_documented",
    mappedField: "Application Scope",
    route: "goviq/application-scope",
    requiredEvidence: [
      "Completed application scope",
      "System purpose and boundaries",
    ],
    implementationGuidance:
      "Document the intended purpose, boundaries, users, prohibited uses and operating context.",
    priority: "high",
  },
  use_case_documented: {
    key: "use_case_documented",
    mappedField: "Use Cases",
    route: "goviq/use-case",
    requiredEvidence: ["Approved use case", "Business impact and KPIs"],
    implementationGuidance:
      "Record each intended use, inputs, outputs, affected users and measurable business impact.",
    priority: "high",
  },
  risk_register: {
    key: "risk_register",
    mappedField: "Risk Register",
    route: "goviq/risk",
    requiredEvidence: ["Risk assessment", "Mitigation plan", "Risk owner"],
    implementationGuidance:
      "Identify risks, score likelihood/severity, assign owners and maintain active mitigation plans.",
    priority: "high",
  },
  responsible_owner: {
    key: "responsible_owner",
    mappedField: "Stakeholders",
    route: "goviq/stakeholders-role",
    requiredEvidence: ["Accountable owner", "Roles and responsibilities"],
    implementationGuidance:
      "Assign an accountable Owner stakeholder and owners for every linked discovered agent.",
    priority: "high",
  },
  model_inventory: {
    key: "model_inventory",
    mappedField: "Models & Technical Details",
    route: "goviq/models-info",
    requiredEvidence: ["Model card", "Architecture and hosting details"],
    implementationGuidance:
      "Inventory every model, vendor, hosting location, architecture and intended objective.",
    priority: "high",
  },
  runtime_policy_configured: {
    key: "runtime_policy_configured",
    mappedField: "ControlNet Policies",
    route: "control-net/policies",
    requiredEvidence: ["Active default policy", "Configured guardrail list"],
    implementationGuidance:
      "Select one active application-default runtime policy containing the required guardrails.",
    priority: "high",
  },
  runtime_monitoring: {
    key: "runtime_monitoring",
    mappedField: "ControlNet Overview",
    route: "control-net/overview",
    requiredEvidence: ["Runtime audit logs", "Monitoring record"],
    implementationGuidance:
      "Route application traffic through ControlNet and retain request decisions and guard execution evidence.",
    priority: "high",
  },
  policy_execution_verified: {
    key: "policy_execution_verified",
    mappedField: "ControlNet Observability",
    route: "control-net/overview",
    requiredEvidence: ["Expected-versus-executed guard report"],
    implementationGuidance:
      "Send an application-scoped runtime request and confirm every guard configured by the default policy executes.",
    priority: "high",
  },
  record_keeping: {
    key: "record_keeping",
    mappedField: "Record Keeping",
    route: "goviq/record-keeping",
    requiredEvidence: ["Governance records", "Runtime audit trail"],
    implementationGuidance:
      "Maintain completed governance records together with immutable runtime decision logs.",
    priority: "medium",
  },
  human_oversight: {
    key: "human_oversight",
    mappedField: "Human Oversight",
    route: "goviq/risk",
    requiredEvidence: [
      "Human oversight procedure",
      "Escalation and approval record",
    ],
    implementationGuidance:
      "Document intervention, escalation, exception handling and approval requirements, especially for L3/L4 agents.",
    priority: "high",
  },
  data_governance: {
    key: "data_governance",
    mappedField: "Data Governance",
    route: "goviq/data-governance",
    requiredEvidence: [
      "Data governance record",
      "Dataset provenance and quality evidence",
    ],
    implementationGuidance:
      "Document dataset sources, lawful basis, quality, lineage, retention and access controls.",
    priority: "high",
  },
  red_team_testing: {
    key: "red_team_testing",
    mappedField: "Red Teaming",
    route: "control-net/red-teaming",
    requiredEvidence: ["Passing red-team report", "Remediation record"],
    implementationGuidance:
      "Run adversarial tests, remediate failures and retain a passing test result.",
    priority: "medium",
  },
  bias_assessment: {
    key: "bias_assessment",
    mappedField: "Bias & Fairness",
    route: "goviq/risk",
    requiredEvidence: ["Bias test report", "Protected-class impact review"],
    implementationGuidance:
      "Run and approve a bias assessment using data appropriate to the affected population.",
    priority: "high",
  },
  transparency_notice: {
    key: "transparency_notice",
    mappedField: "Transparency Documentation",
    route: "goviq/risk",
    requiredEvidence: ["User or affected-person notice", "Disclosure approval"],
    implementationGuidance:
      "Document and approve the disclosures required for affected users and decision subjects.",
    priority: "high",
  },
};

export function getControlDefinition(key: string): ComplianceControlDefinition {
  return (
    COMPLIANCE_CONTROL_CATALOG[key] ?? {
      key,
      mappedField: "Compliance Evidence",
      route: "settings",
      requiredEvidence: ["Control-specific evidence"],
      implementationGuidance:
        "Upload evidence and assign a reviewer for this control.",
      priority: "medium",
    }
  );
}
