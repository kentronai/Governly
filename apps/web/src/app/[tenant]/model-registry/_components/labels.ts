/** Display labels for Model Registry enum values (`provider`, `provider_model_status`). */

export const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google (Gemini)",
  vertex: "Google (Vertex AI)",
  bedrock: "AWS (Bedrock)",
  azure_openai: "Azure OpenAI",
  groq: "Groq",
  ollama: "Ollama",
  huggingface: "Hugging Face",
  custom: "Custom",
};

export const AVAILABILITY_LABELS: Record<string, string> = {
  available: "Available",
  preview: "Preview",
  deprecated: "Deprecated",
  unavailable: "Unavailable",
};

const titleCase = (value: string) =>
  value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

export const providerLabel = (provider?: string | null) =>
  provider ? (PROVIDER_LABELS[provider] ?? titleCase(provider)) : "—";

export const availabilityLabel = (status?: string | null) =>
  status ? (AVAILABILITY_LABELS[status] ?? titleCase(status)) : "Unknown";
