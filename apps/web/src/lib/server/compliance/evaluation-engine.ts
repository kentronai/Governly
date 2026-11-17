import {
  agents,
  applicationDocumentation,
  applicationModels,
  applicationPolicies,
  applications,
  db,
  fairnessChecks,
  observabilityLogs,
  policies,
  complianceEvidence,
  redTeamingTests,
  risks,
  stakeholders,
  useCases,
} from "@db";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { getControlDefinition } from "./control-catalog";
import { calculateComplianceProgress } from "./scoring";

export interface ComplianceControlMapping {
  key: string;
  title: string;
  required?: boolean;
}

export interface ComplianceControlResult extends ComplianceControlMapping {
  status: "verified" | "partial" | "missing" | "not_applicable";
  reason: string;
  evidence: Array<Record<string, unknown>>;
  mappedField: string;
  mappedRoute: string;
  requiredEvidence: string[];
  implementationGuidance: string;
  priority: "high" | "medium" | "low";
}

export interface ComplianceEvaluationResult {
  version: "1.0";
  policyId: string;
  policyName: string;
  applicationId: string;
  applicabilityStatus: "applicable" | "not_applicable";
  complianceStatus:
    | "compliant"
    | "partially_compliant"
    | "non_compliant"
    | "not_applicable";
  coverageScore: number;
  evaluatedAt: string;
  controls: ComplianceControlResult[];
  gaps: ComplianceControlResult[];
  evidence: Array<Record<string, unknown>>;
  summary: string;
}

type PolicyDefinition = {
  id: string;
  name: string;
  controlMappings: unknown;
  applicabilityRules: unknown;
};

const asMappings = (value: unknown): ComplianceControlMapping[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is ComplianceControlMapping =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as ComplianceControlMapping).key === "string" &&
          typeof (item as ComplianceControlMapping).title === "string",
      )
    : [];

const extractGuardIds = (yaml: string | null | undefined): string[] =>
  yaml
    ? [...yaml.matchAll(/^\s*-\s+id:\s*([^\s#]+)\s*$/gm)].map(
        (match) => match[1],
      )
    : [];

const executedGuardIds = (result: unknown): string[] => {
  if (!result || typeof result !== "object") return [];
  const value = result as Record<string, unknown>;
  const guards = [value.input_guards, value.output_guards]
    .filter(Array.isArray)
    .flat() as Array<Record<string, unknown>>;
  return guards
    .map((guard) => guard.id ?? guard.guard_id ?? guard.guardId)
    .filter((id): id is string => typeof id === "string");
};

/**
 * Evaluate one assigned compliance policy using persisted Norix evidence.
 * This engine deliberately fails closed: absent evidence never becomes a pass.
 */
export async function evaluateApplicationCompliancePolicy(input: {
  tenantId: string;
  applicationId: string;
  policy: PolicyDefinition;
}): Promise<ComplianceEvaluationResult> {
  const { tenantId, applicationId, policy } = input;
  const evaluatedAt = new Date().toISOString();
  const rules = Array.isArray(policy.applicabilityRules)
    ? (policy.applicabilityRules as Array<Record<string, unknown>>)
    : [];

  const neverRule = rules.find((rule) => rule.type === "never");
  if (neverRule) {
    return {
      version: "1.0",
      policyId: policy.id,
      policyName: policy.name,
      applicationId,
      applicabilityStatus: "not_applicable",
      complianceStatus: "not_applicable",
      coverageScore: 0,
      evaluatedAt,
      controls: [],
      gaps: [],
      evidence: [],
      summary:
        typeof neverRule.reason === "string"
          ? neverRule.reason
          : "This policy is not applicable to AI systems.",
    };
  }

  const application = await db.query.applications.findFirst({
    where: and(
      eq(applications.id, applicationId),
      eq(applications.tenantId, tenantId),
      isNull(applications.deletedAt),
    ),
  });
  if (!application) throw new Error("Application not found or access denied");

  const [
    docs,
    useCaseRows,
    riskRows,
    stakeholderRows,
    modelRows,
    testRows,
    agentRows,
    runtimeRows,
    defaultPolicyRows,
    uploadedEvidenceRows,
    passedFairnessRows,
  ] = await Promise.all([
    db
      .select()
      .from(applicationDocumentation)
      .where(
        and(
          eq(applicationDocumentation.tenantId, tenantId),
          eq(applicationDocumentation.applicationId, applicationId),
        ),
      ),
    db
      .select({ id: useCases.id })
      .from(useCases)
      .where(
        and(
          eq(useCases.tenantId, tenantId),
          eq(useCases.applicationId, applicationId),
          isNull(useCases.deletedAt),
        ),
      ),
    db
      .select({
        id: risks.id,
        mitigationPlan: risks.mitigationPlan,
        mitigationStatus: risks.mitigationStatus,
      })
      .from(risks)
      .where(
        and(
          eq(risks.tenantId, tenantId),
          eq(risks.applicationId, applicationId),
        ),
      ),
    db
      .select({ id: stakeholders.id, role: stakeholders.role })
      .from(stakeholders)
      .where(
        and(
          eq(stakeholders.tenantId, tenantId),
          eq(stakeholders.applicationId, applicationId),
        ),
      ),
    db
      .select({ id: applicationModels.id })
      .from(applicationModels)
      .where(
        and(
          eq(applicationModels.tenantId, tenantId),
          eq(applicationModels.applicationId, applicationId),
        ),
      ),
    db
      .select({
        id: redTeamingTests.id,
        type: redTeamingTests.testType,
        status: redTeamingTests.testStatus,
      })
      .from(redTeamingTests)
      .where(
        and(
          eq(redTeamingTests.tenantId, tenantId),
          eq(redTeamingTests.applicationId, applicationId),
        ),
      ),
    db
      .select({
        id: agents.id,
        ownerUserId: agents.ownerUserId,
        autonomyLevel: agents.autonomyLevel,
      })
      .from(agents)
      .where(
        and(
          eq(agents.tenantId, tenantId),
          eq(agents.applicationId, applicationId),
        ),
      ),
    db
      .select({
        id: observabilityLogs.id,
        policyId: observabilityLogs.policyId,
        guardrailResults: observabilityLogs.guardrailResults,
      })
      .from(observabilityLogs)
      .where(
        and(
          eq(observabilityLogs.tenantId, tenantId),
          eq(observabilityLogs.applicationId, applicationId),
        ),
      )
      .orderBy(desc(observabilityLogs.timestamp))
      .limit(100),
    db
      .select({ id: policies.id, yaml: policies.yaml, name: policies.name })
      .from(applicationPolicies)
      .innerJoin(policies, eq(applicationPolicies.policyId, policies.id))
      .where(
        and(
          eq(applicationPolicies.tenantId, tenantId),
          eq(applicationPolicies.applicationId, applicationId),
          eq(applicationPolicies.isDefault, true),
          eq(applicationPolicies.isActive, true),
          isNull(policies.deletedAt),
        ),
      )
      .limit(1),
    db
      .select({
        id: complianceEvidence.id,
        controlKey: complianceEvidence.controlKey,
        scope: complianceEvidence.scope,
        evidenceType: complianceEvidence.evidenceType,
        name: complianceEvidence.name,
        externalUrl: complianceEvidence.externalUrl,
        fileName: complianceEvidence.fileName,
        createdAt: complianceEvidence.createdAt,
      })
      .from(complianceEvidence)
      .where(
        and(
          eq(complianceEvidence.tenantId, tenantId),
          eq(complianceEvidence.isActive, true),
          or(
            isNull(complianceEvidence.applicationId),
            eq(complianceEvidence.applicationId, applicationId),
          ),
          or(
            isNull(complianceEvidence.policyId),
            eq(complianceEvidence.policyId, policy.id),
          ),
        ),
      ),
    // Passing fairness checks (four-fifths rule) on this application's risks.
    db
      .select({ id: fairnessChecks.id })
      .from(fairnessChecks)
      .innerJoin(risks, eq(fairnessChecks.riskId, risks.id))
      .where(
        and(
          eq(fairnessChecks.tenantId, tenantId),
          eq(fairnessChecks.passed, true),
          eq(risks.applicationId, applicationId),
        ),
      ),
  ]);

  const defaultPolicy = defaultPolicyRows[0];
  const expectedGuards = extractGuardIds(defaultPolicy?.yaml);
  const relevantRuntimeRows = defaultPolicy
    ? runtimeRows.filter((row) => row.policyId === defaultPolicy.id)
    : [];
  const observedGuards = new Set(
    relevantRuntimeRows.flatMap((row) =>
      executedGuardIds(row.guardrailResults),
    ),
  );
  const missingExecutedGuards = expectedGuards.filter(
    (guard) => !observedGuards.has(guard),
  );
  const completedDocs = docs.filter(
    (doc) => Boolean(doc.content?.trim()) && doc.status === "Done",
  );
  const docsFor = (section: string) =>
    completedDocs.filter((doc) => doc.sectionType === section);
  const risksWithMitigation = riskRows.filter(
    (risk) =>
      Boolean(risk.mitigationPlan?.trim()) &&
      risk.mitigationStatus !== "Not Started",
  );
  const unownedAgents = agentRows.filter((agent) => !agent.ownerUserId);

  const check = (
    mapping: ComplianceControlMapping,
  ): ComplianceControlResult => {
    const result = (
      status: ComplianceControlResult["status"],
      reason: string,
      evidence: Array<Record<string, unknown>> = [],
    ): ComplianceControlResult => {
      const definition = getControlDefinition(mapping.key);
      return {
        ...mapping,
        required: mapping.required !== false,
        status,
        reason,
        evidence,
        mappedField: definition.mappedField,
        mappedRoute: definition.route,
        requiredEvidence: definition.requiredEvidence,
        implementationGuidance: definition.implementationGuidance,
        priority: definition.priority,
      };
    };

    const uploaded = uploadedEvidenceRows.filter(
      (row) => row.controlKey === mapping.key,
    );
    if (uploaded.length > 0) {
      return result(
        "verified",
        `${uploaded.length} inherited or application-specific evidence item(s) are attached to this control.`,
        uploaded.map((row) => ({
          type: "uploaded_evidence",
          id: row.id,
          name: row.name,
          evidenceType: row.evidenceType,
          scope: row.scope,
          fileName: row.fileName,
          externalUrl: row.externalUrl,
          createdAt: row.createdAt,
        })),
      );
    }

    switch (mapping.key) {
      case "application_scope_documented": {
        const rows = docsFor("application_scope");
        return rows.length
          ? result(
              "verified",
              "Completed application-scope documentation exists.",
              rows.map((row) => ({
                type: "documentation",
                id: row.id,
                field: row.fieldKey,
              })),
            )
          : result(
              "missing",
              "Complete at least one Application Scope documentation item.",
            );
      }
      case "use_case_documented":
        return useCaseRows.length
          ? result(
              "verified",
              `${useCaseRows.length} intended use case(s) recorded.`,
              useCaseRows.map((row) => ({ type: "use_case", id: row.id })),
            )
          : result(
              "missing",
              "No intended use case is recorded for this application.",
            );
      case "risk_register":
        return riskRows.length === 0
          ? result("missing", "No application risks are recorded.")
          : risksWithMitigation.length === riskRows.length
            ? result(
                "verified",
                "Every recorded risk has an active mitigation.",
                riskRows.map((row) => ({ type: "risk", id: row.id })),
              )
            : result(
                "partial",
                `${riskRows.length - risksWithMitigation.length} risk(s) lack an active mitigation.`,
                risksWithMitigation.map((row) => ({
                  type: "risk",
                  id: row.id,
                })),
              );
      case "responsible_owner":
        return stakeholderRows.length && unownedAgents.length === 0
          ? result(
              "verified",
              "Application stakeholders and all linked-agent owners are assigned.",
              [
                ...stakeholderRows.map((row) => ({
                  type: "stakeholder",
                  id: row.id,
                })),
                ...agentRows.map((row) => ({
                  type: "agent_owner",
                  id: row.id,
                })),
              ],
            )
          : stakeholderRows.length
            ? result(
                "partial",
                `${unownedAgents.length} linked agent(s) have no owner.`,
                stakeholderRows.map((row) => ({
                  type: "stakeholder",
                  id: row.id,
                })),
              )
            : result(
                "missing",
                "No responsible stakeholder is assigned to the application.",
              );
      case "model_inventory":
        return modelRows.length
          ? result(
              "verified",
              `${modelRows.length} model record(s) are linked.`,
              modelRows.map((row) => ({ type: "model", id: row.id })),
            )
          : result(
              "missing",
              "No model/technical inventory is linked to this application.",
            );
      case "runtime_policy_configured":
        return defaultPolicy
          ? result(
              "verified",
              `Default runtime policy “${defaultPolicy.name}” is active with ${expectedGuards.length} guardrail(s).`,
              [
                {
                  type: "runtime_policy",
                  id: defaultPolicy.id,
                  expectedGuards,
                },
              ],
            )
          : result(
              "missing",
              "No active default runtime policy is configured.",
            );
      case "runtime_monitoring":
        return runtimeRows.length
          ? result(
              "verified",
              `${runtimeRows.length} recent runtime request(s) are auditable.`,
              runtimeRows
                .slice(0, 10)
                .map((row) => ({ type: "runtime_log", id: row.id })),
            )
          : result(
              "missing",
              "No runtime observability evidence exists for this application.",
            );
      case "policy_execution_verified":
        return !defaultPolicy
          ? result(
              "missing",
              "A default runtime policy must be configured first.",
            )
          : relevantRuntimeRows.length === 0
            ? result(
                "missing",
                "No request has executed the configured default policy.",
              )
            : missingExecutedGuards.length === 0
              ? result(
                  "verified",
                  "Runtime logs prove every configured guardrail executed.",
                  [
                    {
                      type: "runtime_execution",
                      policyId: defaultPolicy.id,
                      observedGuards: [...observedGuards],
                    },
                  ],
                )
              : result(
                  "partial",
                  `Runtime evidence is missing configured guardrail(s): ${missingExecutedGuards.join(", ")}.`,
                  [
                    {
                      type: "runtime_execution",
                      policyId: defaultPolicy.id,
                      observedGuards: [...observedGuards],
                      missingGuards: missingExecutedGuards,
                    },
                  ],
                );
      case "record_keeping":
        return completedDocs.length && runtimeRows.length
          ? result(
              "verified",
              "Completed governance records and runtime audit logs exist.",
              [
                {
                  type: "record_summary",
                  documents: completedDocs.length,
                  runtimeLogs: runtimeRows.length,
                },
              ],
            )
          : result(
              "missing",
              "Both completed governance documentation and runtime audit logs are required.",
            );
      case "human_oversight": {
        const rows = docsFor("human_oversight");
        const autonomousAgents = agentRows.filter(
          (agent) => agent.autonomyLevel === "L4",
        );
        return rows.length &&
          stakeholderRows.length &&
          (autonomousAgents.length === 0 || unownedAgents.length === 0)
          ? result(
              "verified",
              "Human oversight is documented with accountable stakeholders.",
              rows.map((row) => ({
                type: "documentation",
                id: row.id,
                field: row.fieldKey,
              })),
            )
          : result(
              "missing",
              "Document human oversight and assign accountable owners, especially for L4 agents.",
            );
      }
      case "data_governance": {
        const rows = docsFor("data_governance");
        return rows.length
          ? result(
              "verified",
              "Completed data-governance documentation exists.",
              rows.map((row) => ({
                type: "documentation",
                id: row.id,
                field: row.fieldKey,
              })),
            )
          : result(
              "missing",
              "Complete the Data Governance documentation section.",
            );
      }
      case "red_team_testing": {
        const passed = testRows.filter((row) => row.status === "passed");
        return passed.length
          ? result(
              "verified",
              `${passed.length} red-team test(s) passed.`,
              passed.map((row) => ({ type: "red_team_test", id: row.id })),
            )
          : testRows.length
            ? result(
                "partial",
                "Tests exist, but none has a passing result.",
                testRows.map((row) => ({
                  type: "red_team_test",
                  id: row.id,
                  status: row.status,
                })),
              )
            : result("missing", "No red-team or assurance tests are recorded.");
      }
      case "bias_assessment": {
        const biasTests = testRows.filter((row) => row.type === "bias");
        const passed = biasTests.filter((row) => row.status === "passed");
        const evidence = [
          ...passed.map((row) => ({ type: "bias_test", id: row.id })),
          ...passedFairnessRows.map((row) => ({
            type: "fairness_check",
            id: row.id,
          })),
        ];
        return evidence.length
          ? result("verified", "A recorded bias assessment passed.", evidence)
          : result("missing", "Run and record a passing bias assessment.");
      }
      case "transparency_notice": {
        const rows = docsFor("transparency");
        return rows.length
          ? result(
              "verified",
              "Completed transparency documentation exists.",
              rows.map((row) => ({
                type: "documentation",
                id: row.id,
                field: row.fieldKey,
              })),
            )
          : result(
              "missing",
              "Document the applicable user/affected-person transparency notice.",
            );
      }
      default:
        return result(
          "missing",
          `No automated evidence collector is registered for control “${mapping.key}”.`,
        );
    }
  };

  const mappings = asMappings(policy.controlMappings);
  const controls = mappings.map(check);
  const { required, gaps, coverageScore, complianceStatus } =
    calculateComplianceProgress(controls);
  const evidence = controls.flatMap((control) =>
    control.evidence.map((item) => ({ ...item, controlKey: control.key })),
  );

  return {
    version: "1.0",
    policyId: policy.id,
    policyName: policy.name,
    applicationId,
    applicabilityStatus: "applicable",
    complianceStatus,
    coverageScore,
    evaluatedAt,
    controls,
    gaps,
    evidence,
    summary:
      gaps.length === 0
        ? `All ${required.length} machine-verifiable controls have evidence.`
        : `${gaps.length} of ${required.length} required controls need attention.`,
  };
}
