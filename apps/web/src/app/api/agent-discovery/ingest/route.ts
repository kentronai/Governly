import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { agents, applications, db, integrations } from "@db";
import { validateApiKey } from "@/lib/api-key-manager";
import { assessRisk } from "@/lib/server/agents/risk-engine";
import { classifyAutonomy } from "@/lib/server/agents/autonomy-engine";
import type { CapabilityFacts } from "@/lib/server/agents/capability-engine";
import { syncAgentPolicyEvaluations } from "@/lib/server/policy-enforcement/agent-policy-sync";

const factsSchema = z.object({
  hasOwner: z.boolean(), hasAdminRole: z.boolean(), hasWritePermissions: z.boolean(),
  hasDeletePermissions: z.boolean(), hasInvokePermissions: z.boolean(),
  hasCrossAccountPermissions: z.boolean(), hasGuardrails: z.boolean(),
  hasApprovalWorkflow: z.boolean(), isDormant: z.boolean(), hasPublicEndpoint: z.boolean(),
  hasSensitiveDataAccess: z.boolean(), credentialAgeDays: z.number().nullable(),
  hasUnusedPermissions: z.boolean(), hasExternalApiAccess: z.boolean(),
  hasExecuteCapableResource: z.boolean(), isConversationalAgent: z.boolean(),
  resourceCount: z.number().int().nonnegative(),
});

const payloadSchema = z.object({
  integrationId: z.string().uuid(),
  provider: z.string().min(1).max(100),
  accountId: z.string().min(1).max(300),
  agents: z.array(z.object({
    externalAgentId: z.string().min(1).max(500),
    name: z.string().min(1).max(300),
    region: z.string().min(1).max(100),
    model: z.string().max(300).nullable().optional(),
    status: z.enum(["active", "inactive", "dormant"]).default("active"),
    businessFunction: z.string().max(300).nullable().optional(),
    applicationId: z.string().uuid().nullable().optional(),
    capabilities: factsSchema,
    metadata: z.record(z.string(), z.unknown()).default({}),
    observedAt: z.string().datetime().optional(),
  })).min(1).max(1000),
});

export async function POST(request: NextRequest) {
  const plainKey = request.headers.get("x-api-key");
  if (!plainKey) return NextResponse.json({ error: "X-API-KEY is required" }, { status: 401 });
  const key = await validateApiKey(plainKey);
  if (!key?.isValid || !key.tenantId) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid discovery payload", details: parsed.error.flatten() }, { status: 400 });

  const integration = await db.query.integrations.findFirst({ where: and(
    eq(integrations.id, parsed.data.integrationId),
    eq(integrations.tenantId, key.tenantId),
    eq(integrations.isEnabled, true)
  ) });
  if (!integration) return NextResponse.json({ error: "Enabled integration not found for this tenant" }, { status: 404 });

  const synced: Array<{ id: string; externalAgentId: string }> = [];
  for (const input of parsed.data.agents) {
    if (input.applicationId) {
      const application = await db.query.applications.findFirst({ where: and(
        eq(applications.id, input.applicationId),
        eq(applications.tenantId, key.tenantId)
      ) });
      if (!application) return NextResponse.json({ error: `Application ${input.applicationId} is outside this tenant` }, { status: 400 });
    }
    const now = input.observedAt ?? new Date().toISOString();
    const facts = input.capabilities as CapabilityFacts;
    const [risk, autonomy] = await Promise.all([
      assessRisk(key.tenantId, facts),
      classifyAutonomy(key.tenantId, facts),
    ]);
    const existing = await db.query.agents.findFirst({ where: and(
      eq(agents.integrationId, integration.id),
      eq(agents.externalAgentId, input.externalAgentId)
    ) });
    const values = {
      tenantId: key.tenantId,
      integrationId: integration.id,
      applicationId: input.applicationId ?? null,
      connectionId: null,
      azureConnectionId: null,
      externalAgentId: input.externalAgentId,
      name: input.name,
      platform: "other" as const,
      region: input.region,
      accountId: parsed.data.accountId,
      model: input.model ?? null,
      businessFunction: input.businessFunction ?? null,
      status: input.status,
      capabilities: facts,
      autonomyLevel: autonomy.level,
      autonomyReason: autonomy.reason,
      autonomyEvidence: autonomy.evidence,
      autonomyConfidence: String(autonomy.confidence),
      autonomyClassifiedAt: now,
      riskScore: String(risk.score),
      riskLevel: risk.level,
      riskFactors: risk.factors,
      lastSeenAt: now,
      syncStatus: "success" as const,
      rawMetadata: { ...input.metadata, provider: parsed.data.provider, provenance: "collector_api" },
      updatedAt: now,
    };
    const agentId = existing
      ? (await db.update(agents).set(values).where(eq(agents.id, existing.id)).returning({ id: agents.id }))[0].id
      : (await db.insert(agents).values({ ...values, firstSeenAt: now }).returning({ id: agents.id }))[0].id;
    await syncAgentPolicyEvaluations(key.tenantId, agentId);
    synced.push({ id: agentId, externalAgentId: input.externalAgentId });
  }
  await db.update(integrations).set({ lastSyncAt: new Date().toISOString(), syncStatus: "success", errorMessage: null }).where(eq(integrations.id, integration.id));
  return NextResponse.json({ success: true, provider: parsed.data.provider, agentsSynced: synced.length, agents: synced });
}
