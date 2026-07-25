"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAuditEvent } from "@/db/tenant";
import {
  getModelRegistryRuntime,
  selectTenantModel,
  testTenantModelConnection,
} from "@/lib/server/model-registry/runtime";

async function requireTenantSession() {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    throw new Error("Authentication required.");
  }
  return { userId, orgId };
}

export async function listModelRegistryRuntime() {
  const { orgId } = await requireTenantSession();
  return getModelRegistryRuntime(orgId);
}

export async function selectModelForTenant(providerModelId: string) {
  const { userId, orgId } = await requireTenantSession();
  const model = await selectTenantModel(orgId, providerModelId, userId);

  try {
    await createAuditEvent({
      tenantId: orgId,
      actorUserId: userId,
      action: "model.registry.selected",
      targetType: "provider_model",
      targetId: model.id,
      metadata: {
        provider: model.provider,
        modelId: model.modelId,
      },
    });
  } catch (error) {
    console.error("Failed to audit model selection:", error);
  }

  revalidatePath("/model-registry");
  return {
    status: true as const,
    modelId: model.modelId,
    providerModelId: model.id,
  };
}

export async function testModelConnection(providerModelId: string) {
  const { userId, orgId } = await requireTenantSession();
  const result = await testTenantModelConnection(orgId, providerModelId);

  try {
    await createAuditEvent({
      tenantId: orgId,
      actorUserId: userId,
      action: "model.registry.connection_tested",
      targetType: "provider_model",
      targetId: providerModelId,
      metadata: {
        result: result.status,
        errorCode: result.code,
      },
    });
  } catch (error) {
    console.error("Failed to audit model connection test:", error);
  }

  revalidatePath("/model-registry");
  return result;
}
