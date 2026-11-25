import "server-only";

import { db, providerModels, tenantModelSettings, tenantLlmKeys } from "@db";
import { decryptSecret } from "@/lib/server/crypto";
import { getModelCatalog, findCatalogModel, catalogBackfill } from "@/lib/server/model-catalog";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import {
  getModelProviderAdapter,
  isExecutableModelProvider,
} from "./providers";

export const DEFAULT_GEMINI_MODEL =
  process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";
export const GEMINI_OPENAI_API_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai";

export async function ensureDefaultGeminiModel(tenantId: string) {
  const [existing] = await db
    .select()
    .from(providerModels)
    .where(
      and(
        eq(providerModels.tenantId, tenantId),
        eq(providerModels.provider, "gemini"),
        eq(providerModels.modelId, DEFAULT_GEMINI_MODEL),
      ),
    )
    .limit(1);

  let model = existing;
  if (!model) {
    const [created] = await db
      .insert(providerModels)
      .values({
        tenantId,
        provider: "gemini",
        modelId: DEFAULT_GEMINI_MODEL,
        displayName: `Google ${DEFAULT_GEMINI_MODEL}`,
        family: "Google Gemini",
        modality: ["text"],
        supportsStreaming: true,
        supportsJson: true,
        availabilityStatus: "available",
        modelUrl: GEMINI_OPENAI_API_BASE_URL,
        purposeUseCase: "NORIX policy and guardrail testing",
        riskLevel: "N/A",
        category: "llm",
      })
      .onConflictDoNothing()
      .returning();

    if (created) {
      model = created;
    } else {
      [model] = await db
        .select()
        .from(providerModels)
        .where(
          and(
            eq(providerModels.tenantId, tenantId),
            eq(providerModels.provider, "gemini"),
            eq(providerModels.modelId, DEFAULT_GEMINI_MODEL),
          ),
        )
        .limit(1);
    }
  }

  if (!model) {
    throw new Error("Unable to initialize the NORIX Gemini test model.");
  }

  // Retire only NORIX's old seeded OpenAI default. Tenant-created OpenAI
  // registry entries remain untouched and can still be governed independently.
  const legacyOpenAIModels = await db
    .select({ id: providerModels.id })
    .from(providerModels)
    .where(
      and(
        eq(providerModels.tenantId, tenantId),
        eq(providerModels.provider, "openai"),
        eq(providerModels.purposeUseCase, "NORIX policy and guardrail testing"),
        eq(providerModels.availabilityStatus, "available"),
      ),
    );

  if (legacyOpenAIModels.length > 0) {
    const now = new Date().toISOString();
    await db.transaction(async (tx) => {
      for (const legacyModel of legacyOpenAIModels) {
        await tx
          .update(tenantModelSettings)
          .set({ isSelected: false, updatedAt: now })
          .where(
            and(
              eq(tenantModelSettings.tenantId, tenantId),
              eq(tenantModelSettings.providerModelId, legacyModel.id),
            ),
          );
        await tx
          .update(providerModels)
          .set({ availabilityStatus: "deprecated", updatedAt: now })
          .where(eq(providerModels.id, legacyModel.id));
      }
    });
  }

  const [selected] = await db
    .select()
    .from(tenantModelSettings)
    .where(
      and(
        eq(tenantModelSettings.tenantId, tenantId),
        eq(tenantModelSettings.isSelected, true),
      ),
    )
    .limit(1);

  if (!selected) {
    const [modelSetting] = await db
      .select()
      .from(tenantModelSettings)
      .where(
        and(
          eq(tenantModelSettings.tenantId, tenantId),
          eq(tenantModelSettings.providerModelId, model.id),
        ),
      )
      .limit(1);

    try {
      if (modelSetting) {
        await db
          .update(tenantModelSettings)
          .set({
            isSelected: true,
            selectedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(tenantModelSettings.id, modelSetting.id));
      } else {
        await db.insert(tenantModelSettings).values({
          tenantId,
          providerModelId: model.id,
          isSelected: true,
          selectedAt: new Date().toISOString(),
        });
      }
    } catch {
      // A concurrent request may have selected the same default. The database
      // constraints are the source of truth, so a duplicate race is harmless.
    }
  }

  return model;
}

/** The tenant's decrypted BYOK key for a provider, if they saved one. */
export async function getTenantLlmKey(tenantId: string, provider: string) {
  const [row] = await db
    .select({ keyEncrypted: tenantLlmKeys.keyEncrypted })
    .from(tenantLlmKeys)
    .where(
      and(
        eq(tenantLlmKeys.tenantId, tenantId),
        eq(tenantLlmKeys.provider, provider),
      ),
    )
    .orderBy(desc(tenantLlmKeys.updatedAt))
    .limit(1);
  return row ? decryptSecret(row.keyEncrypted) : undefined;
}

/** Fill missing context window / cost on registry rows from the public Model Catalog and persist it. */
export async function backfillFromCatalog<
  T extends {
    id: string;
    provider: string;
    modelId: string;
    contextWindowTokens: number | null;
    maxOutputTokens: number | null;
    inputCostPer1K: string | null;
    outputCostPer1K: string | null;
  },
>(rows: T[]): Promise<T[]> {
  const missing = rows.filter(
    (r) => r.contextWindowTokens == null || r.inputCostPer1K == null || r.outputCostPer1K == null,
  );
  if (!missing.length) return rows;
  const catalog = await getModelCatalog(); // cached 24h; [] when offline
  if (!catalog.length) return rows;
  const patched = new Map<string, Partial<T>>();
  for (const r of missing) {
    const patch = catalogBackfill(r, findCatalogModel(catalog, r.provider, r.modelId));
    if (!patch) continue;
    patched.set(r.id, patch as Partial<T>);
    // ponytail: system backfill, so updatedBy/updatedAt stay untouched.
    await db.update(providerModels).set(patch).where(eq(providerModels.id, r.id));
  }
  return rows.map((r) => (patched.has(r.id) ? { ...r, ...patched.get(r.id) } : r));
}

export async function getModelRegistryRuntime(tenantId: string) {
  await ensureDefaultGeminiModel(tenantId);

  const rows = await db
    .select({
      id: providerModels.id,
      provider: providerModels.provider,
      modelId: providerModels.modelId,
      displayName: providerModels.displayName,
      family: providerModels.family,
      modality: providerModels.modality,
      contextWindowTokens: providerModels.contextWindowTokens,
      maxOutputTokens: providerModels.maxOutputTokens,
      inputCostPer1K: providerModels.inputCostPer1K,
      outputCostPer1K: providerModels.outputCostPer1K,
      availabilityStatus: providerModels.availabilityStatus,
      tenantId: providerModels.tenantId,
      modelUrl: providerModels.modelUrl,
      purposeUseCase: providerModels.purposeUseCase,
      riskLevel: providerModels.riskLevel,
      category: providerModels.category,
      isSelected: tenantModelSettings.isSelected,
      connectionStatus: tenantModelSettings.connectionStatus,
      connectionErrorCode: tenantModelSettings.connectionErrorCode,
      connectionMessage: tenantModelSettings.connectionMessage,
      lastTestedAt: tenantModelSettings.lastTestedAt,
    })
    .from(providerModels)
    .leftJoin(
      tenantModelSettings,
      and(
        eq(tenantModelSettings.providerModelId, providerModels.id),
        eq(tenantModelSettings.tenantId, tenantId),
      ),
    )
    .where(
      or(
        eq(providerModels.tenantId, tenantId),
        isNull(providerModels.tenantId),
      ),
    )
    .orderBy(desc(providerModels.createdAt));
  return backfillFromCatalog(rows);
}

async function getAvailableTenantModel(tenantId: string, modelId: string) {
  const [model] = await db
    .select()
    .from(providerModels)
    .where(
      and(
        eq(providerModels.id, modelId),
        or(
          eq(providerModels.tenantId, tenantId),
          isNull(providerModels.tenantId),
        ),
        eq(providerModels.availabilityStatus, "available"),
      ),
    )
    .limit(1);

  if (!model || !model.modelUrl) {
    throw new Error("The selected model is not available for this tenant.");
  }
  if (!isExecutableModelProvider(model.provider)) {
    throw new Error(
      `${model.provider} is registered for governance but is not executable in Playground.`,
    );
  }
  return model;
}

export async function selectTenantModel(
  tenantId: string,
  providerModelId: string,
  userId: string,
) {
  const model = await getAvailableTenantModel(tenantId, providerModelId);
  const now = new Date().toISOString();

  await db.transaction(async (tx) => {
    await tx
      .update(tenantModelSettings)
      .set({ isSelected: false, updatedAt: now })
      .where(eq(tenantModelSettings.tenantId, tenantId));

    await tx
      .insert(tenantModelSettings)
      .values({
        tenantId,
        providerModelId,
        isSelected: true,
        selectedBy: userId,
        selectedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          tenantModelSettings.tenantId,
          tenantModelSettings.providerModelId,
        ],
        set: {
          isSelected: true,
          selectedBy: userId,
          selectedAt: now,
          updatedAt: now,
        },
      });
  });

  return model;
}

export async function testTenantModelConnection(
  tenantId: string,
  providerModelId: string,
) {
  const model = await getAvailableTenantModel(tenantId, providerModelId);
  const now = new Date().toISOString();

  await db
    .insert(tenantModelSettings)
    .values({
      tenantId,
      providerModelId,
      connectionStatus: "testing",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        tenantModelSettings.tenantId,
        tenantModelSettings.providerModelId,
      ],
      set: {
        connectionStatus: "testing",
        connectionErrorCode: null,
        connectionMessage: null,
        updatedAt: now,
      },
    });

  const adapter = getModelProviderAdapter(model.provider);
  const result = await adapter.testConnection(
    model.modelId,
    model.modelUrl!,
    await getTenantLlmKey(tenantId, model.provider),
  );
  const testedAt = new Date().toISOString();

  await db
    .update(tenantModelSettings)
    .set({
      connectionStatus: result.status,
      connectionErrorCode: result.code,
      connectionMessage: result.message,
      lastTestedAt: testedAt,
      updatedAt: testedAt,
    })
    .where(
      and(
        eq(tenantModelSettings.tenantId, tenantId),
        eq(tenantModelSettings.providerModelId, providerModelId),
      ),
    );

  return { ...result, lastTestedAt: testedAt };
}
