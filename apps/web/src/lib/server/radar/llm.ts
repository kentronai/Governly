import "server-only";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { desc, eq } from "drizzle-orm";
import { db, tenantLlmKeys } from "@db";
import { getLlmProvider } from "@/lib/llm-providers";
import { decryptSecret } from "@/lib/server/crypto";
import { parseModelJson } from "./text";

export interface RadarModel {
  provider: string;
  modelId: string;
  baseUrl: string;
  apiKey: string;
}

/**
 * Models AI Radar may use, best first: the triggering tenant's own BYOK key, then
 * the server env (RADAR_LLM_PROVIDER / RADAR_LLM_MODEL / RADAR_LLM_API_KEY, or the
 * provider's own `<PROVIDER>_API_KEY`). Never another tenant's key.
 */
export async function radarModelCandidates(tenantId?: string): Promise<RadarModel[]> {
  const out: RadarModel[] = [];

  const byokRows = tenantId
    ? await db.select().from(tenantLlmKeys).where(eq(tenantLlmKeys.tenantId, tenantId)).orderBy(desc(tenantLlmKeys.updatedAt))
    : [];
  for (const row of byokRows) {
    const info = getLlmProvider(row.provider);
    if (!info) continue;
    try {
      out.push({
        provider: row.provider,
        modelId: row.modelId,
        baseUrl: info.baseUrl,
        apiKey: decryptSecret(row.keyEncrypted),
      });
    } catch {
      // unreadable key: skip it
    }
  }

  const provider =
    process.env.RADAR_LLM_PROVIDER?.trim() ||
    ["gemini", "openai", "anthropic"].find((p) => process.env[`${p.toUpperCase()}_API_KEY`]?.trim()) ||
    "gemini";
  const info = getLlmProvider(provider);
  const apiKey =
    process.env.RADAR_LLM_API_KEY?.trim() || process.env[`${provider.toUpperCase()}_API_KEY`]?.trim();
  if (info && apiKey) {
    const modelId =
      process.env.RADAR_LLM_MODEL?.trim() ||
      (provider === "gemini" && process.env.GEMINI_MODEL?.trim()) ||
      info.models[0].id;
    out.push({ provider, modelId, baseUrl: info.baseUrl, apiKey });
  }
  return out;
}

/**
 * The first configured model whose key actually works, or null (then the run must not start).
 */
export async function pickRadarModel(
  tenantId?: string,
  /** Filled with why each candidate was rejected, so the run can tell the admin. */
  failures: string[] = [],
): Promise<RadarModel | null> {
  for (const model of await radarModelCandidates(tenantId)) {
    try {
      await radarChat(model, 'Reply with the JSON {"ok":true}', "ping");
      return model;
    } catch (error) {
      // rejected key, unknown model, quota: record why, try the next one
      const reason = (error instanceof Error ? error.message : String(error))
        .replaceAll(model.apiKey, "***")
        .slice(0, 300);
      failures.push(`${model.provider}/${model.modelId}: ${reason}`);
    }
  }
  return null;
}

/** The BYOK/env model as a Vercel AI SDK model (every supported provider speaks the OpenAI wire format). */
export function radarLanguageModel(model: RadarModel) {
  return createOpenAICompatible({
    name: model.provider,
    baseURL: model.baseUrl,
    apiKey: model.apiKey,
  }).chatModel(model.modelId);
}

// Reasoning models (o-series, gpt-5) reject an explicit temperature.
export const radarTemperature = (model: RadarModel) =>
  /^(o\d|gpt-5)/.test(model.modelId) ? undefined : 0;

/** One JSON answer from the model. Throws on API errors or non-JSON output. */
export async function radarChat(
  model: RadarModel,
  system: string,
  user: string,
  /** Images the model should read along with the text (vision-capable models only). */
  images: { data: Uint8Array; mediaType: string }[] = [],
): Promise<unknown> {
  const { text } = await generateText({
    model: radarLanguageModel(model),
    temperature: radarTemperature(model),
    system,
    ...(images.length
      ? {
          messages: [
            {
              role: "user" as const,
              content: [
                { type: "text" as const, text: user },
                ...images.map((i) => ({
                  type: "image" as const,
                  image: i.data,
                  mediaType: i.mediaType,
                })),
              ],
            },
          ],
        }
      : { prompt: user }),
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(180_000),
  });
  return parseModelJson(text);
}
