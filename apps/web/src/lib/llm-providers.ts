/**
 * THE model catalog: every provider/model picker in NORIX (BYOK, Model Registry, Applications)
 * reads from here. LLM_PROVIDERS are hosted APIs with an OpenAI-compatible `/chat/completions`
 * endpoint, so all of them work for BYOK. ENDPOINT_PROVIDERS need a customer-specific endpoint
 * (or aren't chat APIs), so they appear in the registry/applications pickers but not in BYOK.
 * Models are listed newest first. Client-safe: no secrets here.
 */
export interface LlmProvider {
  slug: string;
  label: string;
  baseUrl: string;
  /** Models a user can pick for this provider (API model ids). */
  models: { id: string; label: string }[];
  keyHint: string;
}

const m = (id: string, label = id) => ({ id, label });

/** Model ids are listed for convenience; the BYOK page also accepts any custom id the provider serves. */
export const LLM_PROVIDERS: LlmProvider[] = [
  {
    slug: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", keyHint: "sk-...",
    models: [m("gpt-5.5", "GPT-5.5"), m("gpt-5.4", "GPT-5.4"), m("gpt-5.2", "GPT-5.2"), m("gpt-5.1", "GPT-5.1"), m("gpt-5", "GPT-5"), m("gpt-5-mini", "GPT-5 mini"), m("gpt-5-nano", "GPT-5 nano"), m("gpt-4.1", "GPT-4.1"), m("gpt-4.1-mini", "GPT-4.1 mini"), m("gpt-4.1-nano", "GPT-4.1 nano"), m("gpt-4o", "GPT-4o"), m("gpt-4o-mini", "GPT-4o mini"), m("o3"), m("o4-mini"), m("o3-mini"), m("o1")],
  },
  {
    slug: "anthropic", label: "Anthropic (Claude)", baseUrl: "https://api.anthropic.com/v1", keyHint: "sk-ant-...",
    models: [m("claude-fable-5-2", "Claude Fable 5.2"), m("claude-opus-5-5", "Claude Opus 5.5"), m("claude-sonnet-5-5", "Claude Sonnet 5.5"), m("claude-haiku-5-5", "Claude Haiku 5.5"), m("claude-opus-5", "Claude Opus 5"), m("claude-sonnet-5", "Claude Sonnet 5"), m("claude-opus-4-8", "Claude Opus 4.8"), m("claude-opus-4-7", "Claude Opus 4.7"), m("claude-opus-4-6", "Claude Opus 4.6"), m("claude-sonnet-4-6", "Claude Sonnet 4.6"), m("claude-opus-4-5-20251101", "Claude Opus 4.5"), m("claude-sonnet-4-5-20250929", "Claude Sonnet 4.5"), m("claude-haiku-4-5-20251001", "Claude Haiku 4.5"), m("claude-opus-4-1-20250805", "Claude Opus 4.1"), m("claude-opus-4-20250514", "Claude Opus 4"), m("claude-sonnet-4-20250514", "Claude Sonnet 4"), m("claude-3-7-sonnet-20250219", "Claude Sonnet 3.7"), m("claude-3-5-haiku-20241022", "Claude Haiku 3.5")],
  },
  {
    slug: "gemini", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", keyHint: "AIza...",
    models: [m("gemini-3.6-pro", "Gemini 3.6 Pro"), m("gemini-3.6-flash", "Gemini 3.6 Flash"), m("gemini-3.5-flash", "Gemini 3.5 Flash"), m("gemini-3.1-pro-preview", "Gemini 3.1 Pro (preview)"), m("gemini-3.1-flash-lite-preview", "Gemini 3.1 Flash-Lite (preview)"), m("gemini-3-pro-preview", "Gemini 3 Pro (preview)"), m("gemini-3-flash-preview", "Gemini 3 Flash (preview)"), m("gemini-2.5-pro", "Gemini 2.5 Pro"), m("gemini-2.5-flash", "Gemini 2.5 Flash"), m("gemini-2.5-flash-lite", "Gemini 2.5 Flash-Lite"), m("gemini-2.0-flash", "Gemini 2.0 Flash"), m("gemini-2.0-flash-lite", "Gemini 2.0 Flash-Lite"), m("gemini-pro-latest", "Gemini Pro (latest)"), m("gemini-flash-latest", "Gemini Flash (latest)"), m("gemini-flash-lite-latest", "Gemini Flash-Lite (latest)")],
  },
  {
    slug: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", keyHint: "sk-or-...",
    models: [m("openrouter/auto", "Auto (best available)"), m("openai/gpt-5", "OpenAI GPT-5"), m("anthropic/claude-sonnet-4.5", "Claude Sonnet 4.5"), m("google/gemini-2.5-pro", "Gemini 2.5 Pro"), m("google/gemini-2.5-flash", "Gemini 2.5 Flash"), m("x-ai/grok-4", "Grok 4"), m("openai/gpt-4o", "OpenAI GPT-4o"), m("anthropic/claude-3.5-sonnet", "Claude 3.5 Sonnet"), m("meta-llama/llama-3.3-70b-instruct", "Llama 3.3 70B"), m("deepseek/deepseek-chat", "DeepSeek Chat")],
  },
  {
    slug: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", keyHint: "gsk_...",
    models: [m("meta-llama/llama-4-maverick-17b-128e-instruct", "Llama 4 Maverick"), m("meta-llama/llama-4-scout-17b-16e-instruct", "Llama 4 Scout"), m("openai/gpt-oss-120b", "GPT-OSS 120B"), m("openai/gpt-oss-20b", "GPT-OSS 20B"), m("moonshotai/kimi-k2-instruct", "Kimi K2"), m("qwen/qwen3-32b", "Qwen3 32B"), m("llama-3.3-70b-versatile", "Llama 3.3 70B"), m("llama-3.1-8b-instant", "Llama 3.1 8B")],
  },
  {
    slug: "mistral", label: "Mistral", baseUrl: "https://api.mistral.ai/v1", keyHint: "",
    models: [m("mistral-large-latest", "Mistral Large"), m("mistral-medium-latest", "Mistral Medium"), m("magistral-medium-latest", "Magistral Medium"), m("mistral-small-latest", "Mistral Small"), m("codestral-latest", "Codestral"), m("ministral-8b-latest", "Ministral 8B"), m("pixtral-large-latest", "Pixtral Large")],
  },
  {
    slug: "xai", label: "xAI (Grok)", baseUrl: "https://api.x.ai/v1", keyHint: "xai-...",
    models: [m("grok-4", "Grok 4"), m("grok-4-fast", "Grok 4 Fast"), m("grok-code-fast-1", "Grok Code Fast 1"), m("grok-3", "Grok 3"), m("grok-3-mini", "Grok 3 mini")],
  },
  {
    slug: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", keyHint: "sk-...",
    models: [m("deepseek-chat", "DeepSeek Chat"), m("deepseek-reasoner", "DeepSeek Reasoner")],
  },
];

/** Registry/applications-only providers: their endpoint is per-customer, so no BYOK. */
export const ENDPOINT_PROVIDERS: LlmProvider[] = [
  { slug: "vertex", label: "Google (Vertex AI)", baseUrl: "https://vertexai.googleapis.com/v1", keyHint: "", models: [m("gemini-3-pro-preview", "Gemini 3 Pro (preview)"), m("gemini-3-flash-preview", "Gemini 3 Flash (preview)"), m("gemini-2.5-pro", "Gemini 2.5 Pro"), m("gemini-2.5-flash", "Gemini 2.5 Flash")] },
  { slug: "bedrock", label: "AWS (Bedrock)", baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com", keyHint: "", models: [m("anthropic.claude-sonnet-4-5-20250929-v1:0", "Claude Sonnet 4.5"), m("anthropic.claude-opus-4-1-20250805-v1:0", "Claude Opus 4.1"), m("amazon.nova-pro-v1:0", "Amazon Nova Pro"), m("amazon.nova-lite-v1:0", "Amazon Nova Lite"), m("amazon.nova-micro-v1:0", "Amazon Nova Micro"), m("meta.llama3-3-70b-instruct-v1:0", "Llama 3.3 70B"), m("mistral.mistral-large-2407-v1:0", "Mistral Large")] },
  { slug: "azure_openai", label: "Azure OpenAI", baseUrl: "https://your-resource.openai.azure.com", keyHint: "", models: [] },
  { slug: "ollama", label: "Ollama (self-hosted)", baseUrl: "http://localhost:11434/v1", keyHint: "", models: [m("llama3.3", "Llama 3.3"), m("llama3.1", "Llama 3.1"), m("gemma3", "Gemma 3"), m("qwen2.5", "Qwen 2.5"), m("mistral", "Mistral"), m("deepseek-r1", "DeepSeek R1")] },
  { slug: "huggingface", label: "Hugging Face", baseUrl: "", keyHint: "", models: [] },
  { slug: "custom", label: "Custom", baseUrl: "", keyHint: "", models: [] },
];

/** Every provider, for the registry and applications pickers. */
export const ALL_MODEL_PROVIDERS = [...LLM_PROVIDERS, ...ENDPOINT_PROVIDERS];

export const getLlmProvider = (slug: string) =>
  LLM_PROVIDERS.find((p) => p.slug === slug);

export const getModelProvider = (slug: string) =>
  ALL_MODEL_PROVIDERS.find((p) => p.slug === slug);

const MODEL_DOCS: Record<string, (id: string) => string> = {
  openai: (id) => `https://platform.openai.com/docs/models/${encodeURIComponent(id)}`,
  azure_openai: (id) => `https://platform.openai.com/docs/models/${encodeURIComponent(id)}`,
  anthropic: () => "https://docs.anthropic.com/en/docs/about-claude/models",
  gemini: () => "https://ai.google.dev/gemini-api/docs/models",
  vertex: () => "https://cloud.google.com/vertex-ai/generative-ai/docs/models",
  bedrock: () => "https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html",
  openrouter: (id) => `https://openrouter.ai/${id}`,
  groq: () => "https://console.groq.com/docs/models",
  mistral: () => "https://docs.mistral.ai/getting-started/models/",
  xai: () => "https://docs.x.ai/docs/models",
  deepseek: () => "https://api-docs.deepseek.com/quick_start/pricing",
  ollama: (id) => `https://ollama.com/library/${encodeURIComponent(id.split(":")[0])}`,
  huggingface: (id) => `https://huggingface.co/${id}`,
};

const httpUrl = (u?: string | null) => {
  try {
    const url = new URL(u ?? "");
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
};

/**
 * Public page for a model, for "Model URL" links. Stored `model_url` is usually the API base
 * (https://api.openai.com/v1), which 404s in a browser, so known providers get their docs page.
 * Returns null when no http(s) URL can be derived: hide the link then.
 */
export function modelPageUrl(provider?: string | null, modelId?: string | null, modelUrl?: string | null): string | null {
  const id = modelId?.trim();
  if (provider === "huggingface" && httpUrl(modelUrl)) return httpUrl(modelUrl);
  const docs = provider ? MODEL_DOCS[provider] : undefined;
  if (docs && id) return docs(id);
  return httpUrl(modelUrl);
}
