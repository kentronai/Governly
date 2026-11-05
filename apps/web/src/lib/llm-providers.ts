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

export const LLM_PROVIDERS: LlmProvider[] = [
  { slug: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", models: [{ id: "gpt-4o", label: "GPT-4o" }, { id: "gpt-4o-mini", label: "GPT-4o mini" }, { id: "gpt-4.1", label: "GPT-4.1" }, { id: "o3-mini", label: "o3-mini" }], keyHint: "sk-..." },
  { slug: "anthropic", label: "Anthropic (Claude)", baseUrl: "https://api.anthropic.com/v1", models: [{ id: "claude-opus-5-5", label: "Claude Opus 5.5" }, { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" }, { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" }], keyHint: "sk-ant-..." },
  { slug: "gemini", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", models: [{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" }, { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }, { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" }], keyHint: "AIza..." },
  { slug: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", models: [{ id: "openai/gpt-4o", label: "OpenAI GPT-4o" }, { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" }, { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" }, { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" }, { id: "deepseek/deepseek-chat", label: "DeepSeek Chat" }], keyHint: "sk-or-..." },
  { slug: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", models: [{ id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" }, { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B" }], keyHint: "gsk_..." },
  { slug: "mistral", label: "Mistral", baseUrl: "https://api.mistral.ai/v1", models: [{ id: "mistral-large-latest", label: "Mistral Large" }, { id: "mistral-small-latest", label: "Mistral Small" }], keyHint: "" },
  { slug: "xai", label: "xAI (Grok)", baseUrl: "https://api.x.ai/v1", models: [{ id: "grok-3", label: "Grok 3" }, { id: "grok-3-mini", label: "Grok 3 mini" }], keyHint: "xai-..." },
  { slug: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", models: [{ id: "deepseek-chat", label: "DeepSeek Chat" }, { id: "deepseek-reasoner", label: "DeepSeek Reasoner" }], keyHint: "sk-..." },
];

export const getLlmProvider = (slug: string) =>
  LLM_PROVIDERS.find((p) => p.slug === slug);
