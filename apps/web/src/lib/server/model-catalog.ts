import "server-only";

/**
 * Public LLM catalog (pricing, context windows, capabilities) sourced from
 * LiteLLM's community-maintained model_prices_and_context_window.json.
 */
const SOURCE_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const TTL_MS = 24 * 60 * 60 * 1000;

export interface CatalogModel {
  id: string; // LiteLLM key, e.g. "gpt-4o" or "bedrock/anthropic.claude-..."
  provider: string; // LiteLLM provider, e.g. "openai", "vertex_ai-language-models"
  registryProvider: string | null; // Governly `provider` enum value when the gateway can route it
  modelId: string; // id sent to the provider (key without "provider/" prefix)
  mode: string;
  maxInput: number | null;
  maxOutput: number | null;
  inPerM: number | null; // USD per 1M input tokens
  outPerM: number | null;
  vision: boolean;
  tools: boolean;
  parallelTools: boolean;
  pdf: boolean;
  caching: boolean;
  reasoning: boolean;
  jsonSchema: boolean;
  deprecation: string | null;
}

// LiteLLM provider -> Governly `provider` pgEnum. Anything else is browse-only.
export function toRegistryProvider(p: string): string | null {
  if (p.startsWith("vertex_ai")) return "vertex";
  if (p.startsWith("bedrock")) return "bedrock";
  const map: Record<string, string> = {
    openai: "openai",
    text_completion_openai: "openai",
    anthropic: "anthropic",
    gemini: "gemini",
    groq: "groq",
    ollama: "ollama",
    ollama_chat: "ollama",
    azure: "azure_openai",
    openrouter: "openrouter",
    mistral: "mistral",
    xai: "xai",
    deepseek: "deepseek",
    huggingface: "huggingface",
  };
  return map[p] ?? null;
}

const perM = (v: unknown) => (typeof v === "number" ? v * 1_000_000 : null);
const num = (v: unknown) => (typeof v === "number" ? v : null);

export function normalizeCatalog(raw: Record<string, any>): CatalogModel[] {
  const out: CatalogModel[] = [];
  for (const [id, v] of Object.entries(raw)) {
    if (id === "sample_spec" || !v?.litellm_provider) continue;
    const provider = String(v.litellm_provider);
    const prefix = id.indexOf("/");
    out.push({
      id,
      provider,
      registryProvider: toRegistryProvider(provider),
      modelId: prefix > 0 && id.slice(0, prefix) === provider ? id.slice(prefix + 1) : id,
      mode: v.mode ?? "unknown",
      maxInput: num(v.max_input_tokens),
      maxOutput: num(v.max_output_tokens),
      inPerM: perM(v.input_cost_per_token),
      outPerM: perM(v.output_cost_per_token),
      vision: !!v.supports_vision,
      tools: !!v.supports_function_calling,
      parallelTools: !!v.supports_parallel_function_calling,
      pdf: !!v.supports_pdf_input,
      caching: !!v.supports_prompt_caching,
      reasoning: !!v.supports_reasoning,
      jsonSchema: !!v.supports_response_schema,
      deprecation: v.deprecation_date ?? null,
    });
  }
  return out;
}

// ponytail: per-process memory cache; the file is ~5MB, over Next's 2MB fetch-cache limit.
let cache: { at: number; models: CatalogModel[] } | null = null;

export async function getModelCatalog(): Promise<CatalogModel[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.models;
  try {
    const res = await fetch(SOURCE_URL, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    cache = { at: Date.now(), models: normalizeCatalog(await res.json()) };
    return cache.models;
  } catch (err) {
    console.warn("[model-catalog] fetch failed", err);
    return cache?.models ?? []; // serve stale on failure
  }
}

/** Best catalog match for a registry model: same provider + id, else same id from any provider. */
export function findCatalogModel(
  catalog: CatalogModel[],
  provider: string,
  modelId: string,
): CatalogModel | undefined {
  const id = modelId.toLowerCase();
  const same = (m: CatalogModel) => m.modelId.toLowerCase() === id || m.id.toLowerCase() === id;
  return (
    catalog.find((m) => m.registryProvider === provider && same(m)) ?? catalog.find(same)
  );
}

/** Context window + per-1K costs (as numeric strings) to fill gaps in a registry row. */
export function catalogBackfill(
  row: {
    contextWindowTokens: number | null;
    maxOutputTokens?: number | null;
    inputCostPer1K: string | null;
    outputCostPer1K: string | null;
  },
  m: CatalogModel | undefined,
) {
  if (!m) return null;
  const per1K = (v: number | null) => (v == null ? null : (v / 1000).toFixed(6));
  const patch: Record<string, number | string> = {};
  if (row.contextWindowTokens == null && m.maxInput) patch.contextWindowTokens = m.maxInput;
  if (row.maxOutputTokens == null && m.maxOutput) patch.maxOutputTokens = m.maxOutput;
  if (row.inputCostPer1K == null && m.inPerM != null) patch.inputCostPer1K = per1K(m.inPerM)!;
  if (row.outputCostPer1K == null && m.outPerM != null) patch.outputCostPer1K = per1K(m.outPerM)!;
  return Object.keys(patch).length ? patch : null;
}
