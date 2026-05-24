"use server";

import { db, guardrails, tenants } from "@/db";
import { revalidatePath } from "next/cache";
import { eq, and, isNull } from "drizzle-orm";

export interface CreateGuardrailInput {
  tenantSlug: string;
  userId: string;
  key: string;
  name: string;
  description: string;
  tier: "T0" | "T1" | "T2";
  category: string;
  infrastructure: "rule" | "llm" | "na";
  pack_name: string;
  function_name: string;
  default_params?: Record<string, any>;
}

export async function createGuardrail(input: CreateGuardrailInput) {
  const { tenantSlug, userId, ...guardrailData } = input;

  // Get tenant ID from slug
  const tenant = await db.query.tenants.findFirst({
    where: (tenants, { eq }) => eq(tenants.slug, tenantSlug),
  });

  if (!tenant) {
    throw new Error("Tenant not found");
  }

  // Calculate performance budget based on tier
  const performanceBudgetMs =
    guardrailData.tier === "T0" ? 5 : guardrailData.tier === "T1" ? 20 : 100;

  // Insert guardrail
  const [newGuardrail] = await db
    .insert(guardrails)
    .values({
      tenantId: tenant.id,
      createdBy: userId,
      key: guardrailData.key,
      name: guardrailData.name,
      packName: guardrailData.pack_name,
      functionName: guardrailData.function_name,
      description: guardrailData.description,
      tier: guardrailData.tier,
      performanceBudgetMs: performanceBudgetMs.toString(),
      infrastructure: guardrailData.infrastructure,
      defaultParams: guardrailData.default_params || {},
      isEnabled: true,
      isGlobal: false,
      isCertified: false,
    })
    .returning();

  revalidatePath(`/${tenantSlug}/guardrails`);

  return newGuardrail;
}

export type InstallResult =
  | { ok: true; data: { id: string; key: string; name: string | null } }
  | { ok: false; error: string };

export async function installMarketplaceGuardrail(input: {
  tenantSlug: string;
  userId: string;
  sourceGuardrailId: string;
}): Promise<InstallResult> {
  const { tenantSlug, userId, sourceGuardrailId } = input;

  const tenant = await db.query.tenants.findFirst({
    where: (tenants, { eq }) => eq(tenants.slug, tenantSlug),
  });
  if (!tenant) return { ok: false, error: "Tenant not found" };

  const sourceGuardrail = await db.query.guardrails.findFirst({
    where: (g, { eq, and, isNull }) =>
      and(
        eq(g.id, sourceGuardrailId),
        eq(g.isGlobal, true),
        isNull(g.deletedAt)
      ),
  });
  if (!sourceGuardrail)
    return { ok: false, error: "Source guardrail not found or not global" };

  const existing = await db.query.guardrails.findFirst({
    where: (g, { eq, and, isNull }) =>
      and(
        eq(g.tenantId, tenant.id),
        eq(g.key, sourceGuardrail.key),
        isNull(g.deletedAt)
      ),
  });
  if (existing)
    return { ok: false, error: "Guardrail already installed for this tenant" };

  try {
    const [installed] = await db
      .insert(guardrails)
      .values({
        tenantId: tenant.id,
        createdBy: userId,
        key: sourceGuardrail.key,
        name: sourceGuardrail.name,
        packName: sourceGuardrail.packName,
        functionName: sourceGuardrail.functionName,
        description: sourceGuardrail.description,
        tier: sourceGuardrail.tier,
        performanceBudgetMs: sourceGuardrail.performanceBudgetMs,
        infrastructure: sourceGuardrail.infrastructure,
        inputSchema: sourceGuardrail.inputSchema,
        outputSchema: sourceGuardrail.outputSchema,
        category: sourceGuardrail.category,
        family: sourceGuardrail.family,
        defaultParams: sourceGuardrail.defaultParams,
        metadata: sourceGuardrail.metadata,
        isEnabled: true,
        isGlobal: false,
        isCertified: false,
        enableInstall: false,
        fallbackGuardrailId: sourceGuardrailId,
      })
      .returning({
        id: guardrails.id,
        key: guardrails.key,
        name: guardrails.name,
      });

    revalidatePath(`/${tenantSlug}/guardrails`);
    return { ok: true, data: installed };
  } catch (e: any) {
    console.error("[installMarketplaceGuardrail] insert failed:", e);
    return {
      ok: false,
      error: e?.message ?? "Database insert failed",
    };
  }
}
