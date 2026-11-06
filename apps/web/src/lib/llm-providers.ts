/**
 * LLM providers a tenant can bring their own API key (BYOK) for. All expose an
 * OpenAI-compatible `/chat/completions` endpoint, which is what the connection
 * test uses. Client-safe: no secrets here.
 */
export interface LlmProvider {
  slug: string;
  label: string;
  baseUrl: string;
  /** Models a user can pick for this provider (API model ids). */
  models: { id: string; label: string }[];
  keyHint: string;
}

/** Model ids are listed for convenience; the BYOK page also accepts any custom id the provider serves. */
export const LLM_PROVIDERS: LlmProvider[] = [
  { slug: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", models: [{ id: "gpt-5.1", label: "GPT-5.1" }, { id: "gpt-5", label: "GPT-5" }, { id: "gpt-5-mini", label: "GPT-5 mini" }, { id: "gpt-5-nano", label: "GPT-5 nano" }, { id: "gpt-4.1", label: "GPT-4.1" }, { id: "gpt-4.1-mini", label: "GPT-4.1 mini" }, { id: "gpt-4.1-nano", label: "GPT-4.1 nano" }, { id: "gpt-4o", label: "GPT-4o" }, { id: "gpt-4o-mini", label: "GPT-4o mini" }, { id: "o3", label: "o3" }, { id: "o3-mini", label: "o3-mini" }, { id: "o4-mini", label: "o4-mini" }, { id: "o1", label: "o1" }], keyHint: "sk-..." },
  { slug: "anthropic", label: "Anthropic (Claude)", baseUrl: "https://api.anthropic.com/v1", models: [{ id: "claude-fable-5-1", label: "Claude Fable 5.1" }, { id: "claude-opus-5-5", label: "Claude Opus 5.5" }, { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" }, { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" }, { id: "claude-opus-4-5-20251101", label: "Claude Opus 4.5" }, { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" }, { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" }, { id: "claude-opus-4-1-20250805", label: "Claude Opus 4.1" }, { id: "claude-opus-4-20250514", label: "Claude Opus 4" }, { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" }, { id: "claude-3-7-sonnet-20250219", label: "Claude Sonnet 3.7" }, { id: "claude-3-5-haiku-20241022", label: "Claude Haiku 3.5" }], keyHint: "sk-ant-..." },
  { slug: "gemini", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", models: [{ id: "gemini-3-pro-preview", label: "Gemini 3 Pro (preview)" }, { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" }, { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }, { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" }, { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" }, { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash-Lite" }, { id: "gemini-pro-latest", label: "Gemini Pro (latest)" }, { id: "gemini-flash-latest", label: "Gemini Flash (latest)" }, { id: "gemini-flash-lite-latest", label: "Gemini Flash-Lite (latest)" }], keyHint: "AIza..." },
  { slug: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", models: [{ id: "openai/gpt-4o", label: "OpenAI GPT-4o" }, { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" }, { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" }, { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" }, { id: "deepseek/deepseek-chat", label: "DeepSeek Chat" }], keyHint: "sk-or-..." },
  { slug: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", models: [{ id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" }, { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B" }, { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B" }, { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B" }, { id: "qwen/qwen3-32b", label: "Qwen3 32B" }, { id: "moonshotai/kimi-k2-instruct", label: "Kimi K2" }], keyHint: "gsk_..." },
  { slug: "mistral", label: "Mistral", baseUrl: "https://api.mistral.ai/v1", models: [{ id: "mistral-large-latest", label: "Mistral Large" }, { id: "mistral-medium-latest", label: "Mistral Medium" }, { id: "mistral-small-latest", label: "Mistral Small" }, { id: "codestral-latest", label: "Codestral" }, { id: "ministral-8b-latest", label: "Ministral 8B" }, { id: "pixtral-large-latest", label: "Pixtral Large" }], keyHint: "" },
  { slug: "xai", label: "xAI (Grok)", baseUrl: "https://api.x.ai/v1", models: [{ id: "grok-4", label: "Grok 4" }, { id: "grok-3", label: "Grok 3" }, { id: "grok-3-mini", label: "Grok 3 mini" }, { id: "grok-code-fast-1", label: "Grok Code Fast 1" }], keyHint: "xai-..." },
  { slug: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", models: [{ id: "deepseek-chat", label: "DeepSeek Chat" }, { id: "deepseek-reasoner", label: "DeepSeek Reasoner" }], keyHint: "sk-..." },
];

export const getLlmProvider = (slug: string) =>
  LLM_PROVIDERS.find((p) => p.slug === slug);
