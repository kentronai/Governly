import {
  agentPolicyEvaluations,
  agents,
  applicationPolicies,
  db,
  observabilityLogs,
  policies,
  policyCenter,
  policyFindings,
} from "@db";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  evaluateApplicationCompliancePolicy,
  type ComplianceControlResult,
  type ComplianceEvaluationResult,
} from "@/lib/server/compliance/evaluation-engine";
import { calculateComplianceProgress } from "@/lib/server/compliance/scoring";
import { getControlDefinition } from "@/lib/server/compliance/control-catalog";

type AgentRow = typeof agents.$inferSelect;

const record = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const guardIds = (yaml: string | null): string[] =>
  yaml
    ? [...yaml.matchAll(/^\s*-\s+id:\s*([^\s#]+)\s*$/gm)].map(
        (match) => match[1],
      )
    : [];

const observedGuardIds = (results: unknown): string[] => {
  if (!results || typeof results !== "object") return [];
  const value = results as Record<string, unknown>;
  return [value.input_guards, value.output_guards]
    .filter(Array.isArray)
    .flat()
    .map((guard) => {
      const row = guard as Record<string, unknown>;
      return row.id ?? row.guard_id ?? row.guardId;
    })
    .filter((id): id is string => typeof id === "string");
};

function standaloneAgentEvaluation(
  agent: AgentRow,
  policy: { id: string; name: string; controlMappings: unknown },
): ComplianceEvaluationResult {
  const evaluatedAt = new Date().toISOString();
  const rawMetadata = record(agent.rawMetadata);
  const provider = record(rawMetadata.providerEvidence);
  const tags = record(provider.tags);
  const riskFactors = Array.isArray(agent.riskFactors) ? agent.riskFactors : [];
  const purpose =
    tags.Purpose ?? tags.purpose ?? tags.UseCase ?? tags["use-case"] ?? null;
  const providerEvidence = provider.resourceArn
    ? [
        {
          type: "provider_runtime_configuration",
          source: provider.evidenceSource ?? rawMetadata.evidenceSource,
          resourceArn: provider.resourceArn,
          status: provider.status,
          version: provider.version,
          roleArn: provider.roleArn ?? agent.iamRoleArn,
          modelId: provider.modelId ?? agent.model,
          networkConfiguration: provider.networkConfiguration,
          protocolConfiguration: provider.protocolConfiguration,
          artifact: provider.agentRuntimeArtifact,
          environmentKeys: provider.environmentKeys,
          tags,
          observedAt: provider.lastUpdatedAt ?? agent.lastSeenAt,
        },
      ]
    : [];
  const mappings = Array.isArray(policy.controlMappings)
    ? (
        policy.controlMappings as Array<{
          key: string;
          title: string;
          required?: boolean;
        }>
      ).filter(
        (mapping) =>
          typeof mapping?.key === "string" &&
          typeof mapping?.title === "string",
      )
    : [];

  const controls: ComplianceControlResult[] = mappings.map((mapping) => {
    const definition = getControlDefinition(mapping.key);
    const base = {
      ...mapping,
      required: mapping.required !== false,
      mappedField: definition.mappedField,
      mappedRoute: definition.route,
      requiredEvidence: definition.requiredEvidence,
      implementationGuidance: definition.implementationGuidance,
      priority: definition.priority,
    };
    if (mapping.key === "responsible_owner") {
      return agent.ownerUserId
        ? {
            ...base,
            status: "verified" as const,
            reason: `A real owner is assigned from ${agent.ownerSource ?? "Norix"}.`,
            evidence: [
              {
                type: "agent_owner",
                agentId: agent.id,
                ownerUserId: agent.ownerUserId,
                source: agent.ownerSource,
                confidence: agent.ownerConfidence,
              },
            ],
          }
        : {
            ...base,
            status: "missing" as const,
            reason:
              "AWS returned no owner tag that maps to a Norix user, and no accountable owner was assigned manually.",
            evidence: providerEvidence,
          };
    }
    if (mapping.key === "model_inventory") {
      return agent.model
        ? {
            ...base,
            status: "verified" as const,
            reason: `Discovered model ${agent.model} is recorded.`,
            evidence: [
              { type: "agent_model", agentId: agent.id, model: agent.model },
            ],
          }
        : providerEvidence.length
          ? {
              ...base,
              status: "partial" as const,
              reason:
                "AWS GetAgentRuntime verified the runtime artifact, IAM role, network and protocol configuration, but AgentCore did not expose a model identifier.",
              evidence: providerEvidence,
            }
          : {
              ...base,
              status: "missing" as const,
              reason:
                "The provider scan did not return runtime configuration or a model identifier for this agent.",
              evidence: [],
            };
    }
    if (
      mapping.key === "runtime_policy_configured" ||
      mapping.key === "runtime_monitoring" ||
      mapping.key === "policy_execution_verified"
    ) {
      return {
        ...base,
        status: "missing" as const,
        reason:
          "Link this agent to an application and route its traffic through ControlNet before runtime compliance can be verified.",
        evidence: [],
      };
    }
    if (mapping.key === "application_scope_documented") {
      return purpose
        ? {
            ...base,
            status: "partial" as const,
            reason: `AWS resource tags provide purpose/use-case evidence (${purpose}), but system boundaries and prohibited uses still require approval.`,
            evidence: providerEvidence,
          }
        : {
            ...base,
            status: "missing" as const,
            reason:
              "AWS runtime configuration was collected, but no Purpose/UseCase tag or approved application-scope record exists.",
            evidence: providerEvidence,
          };
    }
    if (mapping.key === "use_case_documented") {
      return purpose
        ? {
            ...base,
            status: "partial" as const,
            reason: `AWS tags identify the use case as “${purpose}”; business impact and approval evidence are still required.`,
            evidence: providerEvidence,
          }
        : {
            ...base,
            status: "missing" as const,
            reason:
              "AWS returned no Purpose or UseCase tag, and this agent is not linked to an approved Norix use case.",
            evidence: providerEvidence,
          };
    }
    if (mapping.key === "risk_register") {
      return riskFactors.length
        ? {
            ...base,
            status: "partial" as const,
            reason: `${riskFactors.length} provider-derived risk signal(s) are recorded; mitigation owners and treatment evidence are still required.`,
            evidence: riskFactors.map((factor) => ({
              type: "detected_risk",
              ...record(factor),
            })),
          }
        : {
            ...base,
            status: "missing" as const,
            reason:
              "No provider-derived risks or approved risk assessment are recorded.",
            evidence: providerEvidence,
          };
    }
    if (mapping.key === "record_keeping") {
      return providerEvidence.length
        ? {
            ...base,
            status: "partial" as const,
            reason:
              "The timestamped AWS runtime configuration is retained as inventory evidence; approved governance records and runtime audit traffic are still required.",
            evidence: providerEvidence,
          }
        : {
            ...base,
            status: "missing" as const,
            reason:
              "No provider inventory snapshot, governance record, or runtime audit trail is available.",
            evidence: [],
          };
    }
    return {
      ...base,
      status: "missing" as const,
      reason: `No agent-scoped live evidence is available for “${mapping.key}”; Norix will not infer a pass.`,
      evidence: [],
    };
  });
  const { required, gaps, coverageScore, complianceStatus } =
    calculateComplianceProgress(controls);
  return {
    version: "1.0",
    policyId: policy.id,
    policyName: policy.name,
    applicationId: agent.applicationId ?? "unlinked",
    applicabilityStatus: "applicable",
    complianceStatus,
    coverageScore,
    evaluatedAt,
    controls,
    gaps,
    evidence: controls.flatMap((control) =>
      control.evidence.map((item) => ({ ...item, controlKey: control.key })),
    ),
    summary: gaps.length
      ? `${gaps.length} of ${required.length} required controls need attention.`
      : `All ${required.length} machine-verifiable controls have evidence.`,
  };
}

async function persistEvaluation(input: {
  agent: AgentRow;
  policyType: "runtime" | "compliance";
  policyId: string;
  policyName: string;
  assignmentSource: string;
  evaluation: ComplianceEvaluationResult;
}) {
  const now = input.evaluation.evaluatedAt;
  await db
    .insert(agentPolicyEvaluations)
    .values({
      tenantId: input.agent.tenantId,
      agentId: input.agent.id,
      policyType: input.policyType,
      policyId: input.policyId,
      policyName: input.policyName,
      assignmentSource: input.assignmentSource,
      complianceStatus: input.evaluation.complianceStatus,
      coverageScore: input.evaluation.coverageScore.toFixed(2),
      evaluation: input.evaluation,
      gaps: input.evaluation.gaps,
      evidence: input.evaluation.evidence,
      evaluatedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        agentPolicyEvaluations.agentId,
        agentPolicyEvaluations.policyType,
        agentPolicyEvaluations.policyId,
      ],
      set: {
        policyName: input.policyName,
        assignmentSource: input.assignmentSource,
        isActive: true,
        complianceStatus: input.evaluation.complianceStatus,
        coverageScore: input.evaluation.coverageScore.toFixed(2),
        evaluation: input.evaluation,
        gaps: input.evaluation.gaps,
        evidence: input.evaluation.evidence,
        evaluatedAt: now,
        updatedAt: now,
      },
    });

  const existing = await db.query.policyFindings.findMany({
    where: and(
      eq(policyFindings.tenantId, input.agent.tenantId),
      eq(policyFindings.agentId, input.agent.id),
      eq(policyFindings.policyType, input.policyType),
      eq(policyFindings.policyId, input.policyId),
      eq(policyFindings.source, "compliance_evaluation"),
      eq(policyFindings.status, "open"),
    ),
  });
  const gapKeys = new Set(input.evaluation.gaps.map((gap) => gap.key));
  const resolvedIds = existing
    .filter((finding) => !gapKeys.has(finding.findingKey))
    .map((finding) => finding.id);
  if (resolvedIds.length) {
    await db
      .update(policyFindings)
      .set({ status: "resolved", resolvedAt: now, updatedAt: now })
      .where(inArray(policyFindings.id, resolvedIds));
  }
  for (const gap of input.evaluation.gaps) {
    const match = existing.find((finding) => finding.findingKey === gap.key);
    const values = {
      applicationId: input.agent.applicationId,
      severity:
        gap.priority === "high"
          ? "high"
          : gap.priority === "low"
            ? "low"
            : "medium",
      title: `${input.policyName}: ${gap.title}`,
      description: gap.reason,
      evidence: { control: gap, evaluatedAt: now },
      lastDetectedAt: now,
      updatedAt: now,
    };
    if (match) {
      await db
        .update(policyFindings)
        .set({ ...values, occurrenceCount: match.occurrenceCount + 1 })
        .where(eq(policyFindings.id, match.id));
    } else {
      await db.insert(policyFindings).values({
        tenantId: input.agent.tenantId,
        agentId: input.agent.id,
        ...values,
        policyType: input.policyType,
        policyId: input.policyId,
        source: "compliance_evaluation",
        findingKey: gap.key,
        category: "compliance",
      });
    }
  }
}

async function runtimeEvaluation(agent: AgentRow) {
  if (!agent.applicationId) return null;
  const [runtimePolicy] = await db
    .select({ id: policies.id, name: policies.name, yaml: policies.yaml })
    .from(applicationPolicies)
    .innerJoin(policies, eq(applicationPolicies.policyId, policies.id))
    .where(
      and(
        eq(applicationPolicies.tenantId, agent.tenantId),
        eq(applicationPolicies.applicationId, agent.applicationId),
        eq(applicationPolicies.isActive, true),
        eq(applicationPolicies.isDefault, true),
        eq(policies.isActive, true),
        isNull(policies.deletedAt),
      ),
    )
    .limit(1);
  if (!runtimePolicy) return null;
  const rows = await db
    .select({
      id: observabilityLogs.id,
      results: observabilityLogs.guardrailResults,
    })
    .from(observabilityLogs)
    .where(
      and(
        eq(observabilityLogs.tenantId, agent.tenantId),
        eq(observabilityLogs.agentId, agent.id),
        eq(observabilityLogs.policyId, runtimePolicy.id),
      ),
    )
    .orderBy(desc(observabilityLogs.timestamp))
    .limit(100);
  const expected = guardIds(runtimePolicy.yaml);
  const observed = new Set(
    rows.flatMap((row) => observedGuardIds(row.results)),
  );
  const missing = expected.filter((id) => !observed.has(id));
  const evaluatedAt = new Date().toISOString();
  const status =
    rows.length === 0
      ? "non_compliant"
      : missing.length
        ? "partially_compliant"
        : "compliant";
  const coverage =
    expected.length === 0
      ? rows.length
        ? 100
        : 0
      : Math.round(
          ((expected.length - missing.length) / expected.length) * 100,
        );
  const gaps =
    rows.length === 0
      ? [
          {
            key: "runtime_monitoring",
            title: "Runtime monitoring evidence",
            required: true,
            status: "missing" as const,
            reason: "No ControlNet request is attributed to this agent.",
            evidence: [],
            mappedField: "observabilityLogs",
            mappedRoute: "/observability",
            requiredEvidence: ["A request with X-Agent-ID"],
            implementationGuidance:
              "Route agent traffic through ControlNet and set X-Agent-ID.",
            priority: "high" as const,
          },
        ]
      : missing.map((id) => ({
          key: `guard:${id}`,
          title: `Guardrail ${id}`,
          required: true,
          status: "missing" as const,
          reason: `No execution evidence exists for configured guardrail ${id}.`,
          evidence: [],
          mappedField: "guardrailResults",
          mappedRoute: "/observability",
          requiredEvidence: ["Guard execution record"],
          implementationGuidance:
            "Send representative traffic through this agent's default policy.",
          priority: "high" as const,
        }));
  const evaluation: ComplianceEvaluationResult = {
    version: "1.0",
    policyId: runtimePolicy.id,
    policyName: runtimePolicy.name,
    applicationId: agent.applicationId,
    applicabilityStatus: "applicable",
    complianceStatus: status,
    coverageScore: coverage,
    evaluatedAt,
    controls: gaps,
    gaps,
    evidence: rows
      .slice(0, 10)
      .map((row) => ({ type: "runtime_log", id: row.id })),
    summary:
      rows.length === 0
        ? "The policy is assigned, but no live execution evidence exists for this agent."
        : missing.length
          ? `${missing.length} configured guardrail(s) lack execution evidence.`
          : "Live logs prove every configured guardrail executed for this agent.",
  };
  return { runtimePolicy, evaluation };
}

export async function syncAgentPolicyEvaluations(
  tenantId: string,
  agentId: string,
) {
  const agent = await db.query.agents.findFirst({
    where: and(eq(agents.id, agentId), eq(agents.tenantId, tenantId)),
  });
  if (!agent) throw new Error("Agent not found");
  const activeCompliancePolicies = await db.query.policyCenter.findMany({
    where: and(
      eq(policyCenter.tenantId, tenantId),
      eq(policyCenter.isActive, true),
    ),
  });
  const now = new Date().toISOString();
  await db
    .update(agentPolicyEvaluations)
    .set({ isActive: false, updatedAt: now })
    .where(
      and(
        eq(agentPolicyEvaluations.tenantId, tenantId),
        eq(agentPolicyEvaluations.agentId, agentId),
      ),
    );
  // Evaluations re-activated below; findings of every other (deactivated or
  // unlinked) policy are resolved at the end so they don't stay open forever.
  const activeKeys = new Set<string>();
  for (const policy of activeCompliancePolicies) {
    const policyId = policy.parentPolicyId ?? policy.id;
    activeKeys.add(`compliance:${policyId}`);
    const evaluation = agent.applicationId
      ? await evaluateApplicationCompliancePolicy({
          tenantId,
          applicationId: agent.applicationId,
          policy: {
            id: policyId,
            name: policy.name,
            controlMappings: policy.controlMappings,
            applicabilityRules: policy.applicabilityRules,
          },
        })
      : standaloneAgentEvaluation(agent, {
          id: policyId,
          name: policy.name,
          controlMappings: policy.controlMappings,
        });
    await persistEvaluation({
      agent,
      policyType: "compliance",
      policyId,
      policyName: policy.name,
      assignmentSource: agent.applicationId ? "linked_application" : "tenant",
      evaluation,
    });
  }
  const runtime = await runtimeEvaluation(agent);
  if (runtime) {
    activeKeys.add(`runtime:${runtime.runtimePolicy.id}`);
    await persistEvaluation({
      agent,
      policyType: "runtime",
      policyId: runtime.runtimePolicy.id,
      policyName: runtime.runtimePolicy.name,
      assignmentSource: "linked_application_default",
      evaluation: runtime.evaluation,
    });
  }
  const orphaned = (
    await db.query.policyFindings.findMany({
      columns: { id: true, policyType: true, policyId: true },
      where: and(
        eq(policyFindings.tenantId, tenantId),
        eq(policyFindings.agentId, agentId),
        eq(policyFindings.source, "compliance_evaluation"),
        eq(policyFindings.status, "open"),
      ),
    })
  ).filter((f) => !activeKeys.has(`${f.policyType}:${f.policyId}`));
  if (orphaned.length) {
    await db
      .update(policyFindings)
      .set({ status: "resolved", resolvedAt: now, updatedAt: now })
      .where(inArray(policyFindings.id, orphaned.map((f) => f.id)));
  }
  return {
    compliancePolicies: activeCompliancePolicies.length,
    runtimePolicy: Boolean(runtime),
  };
}

export async function syncTenantAgentPolicyEvaluations(tenantId: string) {
  const rows = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.tenantId, tenantId));
  const results = [];
  for (const row of rows)
    results.push(await syncAgentPolicyEvaluations(tenantId, row.id));
  return { agentsEvaluated: results.length };
}
