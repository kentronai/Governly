/**
 * Server actions for Application Models
 */

"use server";

import { db, applicationModels } from "@db";
import { and, eq } from "drizzle-orm";
import {
  requireActiveTenant,
  requireTenantApplication,
} from "@/lib/server/tenant-access";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { withApplicationTracking } from "@/lib/utils/application-tracking";
import { createAuditEvent } from "@/lib/server/audit";

interface CreateModelInput {
  tenantId: string;
  applicationId: string;
  vendor?: string;
  model?: string;
  hostingLocation: string;
  modelArchitecture: string;
  objectives: string;
  computeInfrastructure: string;
  trainingDuration: string;
  modelSize: string;
  trainingDataSize: string;
  inferenceLatency: string;
  hardwareRequirements: string;
  software: string;
  promptRegistry?: string;
}

export const createApplicationModel = async (input: CreateModelInput) => {
  await requireTenantApplication(input.tenantId, input.applicationId);
  return withApplicationTracking(input.applicationId, async () => {
    const { userId } = await auth();

    if (!userId) {
      throw new Error("Authentication required");
    }

    const [model] = await db
      .insert(applicationModels)
      .values({
        ...input,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    revalidatePath("/[tenant]/applications/[applicationId]", "layout");

    try {
      await createAuditEvent({
        tenantId: input.tenantId,
        actorUserId: userId,
        action: "model_info.created",
        targetType: "model_info",
        targetId: model.id,
        metadata: { vendor: input.vendor, model: input.model },
      });
    } catch (e) {
      console.error("Failed to write audit event (model_info.created):", e);
    }

    return model;
  });
};

export const updateApplicationModel = async (
  id: string,
  input: Partial<CreateModelInput>,
) => {
  // Get the model first to get the applicationId
  const { tenantId } = await requireActiveTenant();
  const existingModel = await db.query.applicationModels.findFirst({
    where: and(eq(applicationModels.id, id), eq(applicationModels.tenantId, tenantId)),
  });

  if (!existingModel) {
    throw new Error("Model not found");
  }

  return withApplicationTracking(existingModel.applicationId, async () => {
    const { userId } = await auth();

    if (!userId) {
      throw new Error("Authentication required");
    }

    const [model] = await db
      .update(applicationModels)
      .set({
        // tenant/application are fixed once created
        ...{ ...input, tenantId: undefined, applicationId: undefined },
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(applicationModels.id, id))
      .returning();

    if (!model) {
      throw new Error("Model not found");
    }

    revalidatePath("/[tenant]/applications/[applicationId]", "layout");

    try {
      await createAuditEvent({
        tenantId: existingModel.tenantId,
        actorUserId: userId,
        action: "model_info.updated",
        targetType: "model_info",
        targetId: model.id,
        metadata: { update: input },
      });
    } catch (e) {
      console.error("Failed to write audit event (model_info.updated):", e);
    }

    return model;
  });
};

export const deleteApplicationModel = async (id: string) => {
  // Get the model first to get the applicationId
  const { tenantId } = await requireActiveTenant();
  const existingModel = await db.query.applicationModels.findFirst({
    where: and(eq(applicationModels.id, id), eq(applicationModels.tenantId, tenantId)),
  });

  if (!existingModel) {
    throw new Error("Model not found");
  }

  return withApplicationTracking(existingModel.applicationId, async () => {
    const { userId } = await auth();

    if (!userId) {
      throw new Error("Authentication required");
    }

    const [model] = await db
      .delete(applicationModels)
      .where(eq(applicationModels.id, id))
      .returning();

    if (!model) {
      throw new Error("Model not found");
    }

    revalidatePath("/[tenant]/applications/[applicationId]", "layout");

    try {
      await createAuditEvent({
        tenantId: model.tenantId,
        actorUserId: userId,
        action: "model_info.deleted",
        targetType: "model_info",
        targetId: id,
      });
    } catch (e) {
      console.error("Failed to write audit event (model_info.deleted):", e);
    }

    return { success: true };
  });
};
