import "server-only";

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
 * The model behind AI Radar. Platform config first (RADAR_LLM_PROVIDER /
 * RADAR_LLM_MODEL / RADAR_LLM_API_KEY, falling back to the provider's own
 * `<PROVIDER>_API_KEY`, e.g. GEMINI_API_KEY). Manual runs with no platform key
 * fall back to the triggering tenant's BYOK key. Any OpenAI-compatible provider
 * from llm-providers.ts works.
 */
export async function resolveRadarModel(tenantId?: string): Promise<RadarModel> {
  const provider = process.env.RADAR_LLM_PROVIDER?.trim() || "gemini";
  const info = getLlmProvider(provider);
  if (!info) throw new Error(`Unknown RADAR_LLM_PROVIDER "${provider}"`);

  const apiKey =
    process.env.RADAR_LLM_API_KEY?.trim() ||
    process.env[`${provider.toUpperCase()}_API_KEY`]?.trim();
  if (apiKey) {
    const modelId =
      process.env.RADAR_LLM_MODEL?.trim() ||
      (provider === "gemini" && process.env.GEMINI_MODEL?.trim()) ||
      info.models[0].id;
    return { provider, modelId, baseUrl: info.baseUrl, apiKey };
  }

  if (tenantId) {
    const [row] = await db
      .select()
      .from(tenantLlmKeys)
      .where(eq(tenantLlmKeys.tenantId, tenantId))
      .orderBy(desc(tenantLlmKeys.updatedAt))
      .limit(1);
    const byok = row && getLlmProvider(row.provider);
    if (row && byok) {
      return {
        provider: row.provider,
        modelId: row.modelId,
        baseUrl: byok.baseUrl,
        apiKey: decryptSecret(row.keyEncrypted),
      };
    }
  }
  throw new Error(
    "AI Radar has no model: set RADAR_LLM_API_KEY (and optionally RADAR_LLM_PROVIDER / RADAR_LLM_MODEL), or add a key under Admin Center → BYOK.",
  );
}

/** One JSON-mode chat completion. Throws on HTTP errors or non-JSON output. */
export async function radarChat(
  model: RadarModel,
  system: string,
  user: string,
): Promise<unknown> {
  const res = await fetch(`${model.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${model.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model.modelId,
      // Reasoning models (o-series, gpt-5) reject an explicit temperature.
      ...(/^(o\d|gpt-5)/.test(model.modelId) ? {} : { temperature: 0 }),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(180_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Model API returned HTTP ${res.status}`);
  const content = (await res.json())?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Model API returned no content");
  return parseModelJson(content);
}
