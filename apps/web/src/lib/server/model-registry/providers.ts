import "server-only";
import { LLM_PROVIDERS, getLlmProvider } from "@/lib/llm-providers";

export type ModelConnectionStatus =
  | "not_tested"
  | "testing"
  | "ready"
  | "error";

export interface ModelConnectionResult {
  status: "ready" | "error";
  code: string | null;
  message: string;
}

export interface ModelProviderAdapter {
  readonly provider: string;
  /** `apiKey` is the tenant's BYOK key; falls back to the server env key. */
  testConnection(
    modelId: string,
    baseUrl: string,
    apiKey?: string,
  ): Promise<ModelConnectionResult>;
}

const safeFailure = (code: string, message: string): ModelConnectionResult => ({
  status: "error",
  code,
  message,
});

export class OpenAIProviderAdapter implements ModelProviderAdapter {
  readonly provider = "openai";

  async testConnection(
    modelId: string,
    baseUrl: string,
    byokKey?: string,
  ): Promise<ModelConnectionResult> {
    const apiKey = byokKey || process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return safeFailure(
        "missing_api_key",
        "OpenAI is not configured on the NORIX server.",
      );
    }

    let endpoint: URL;
    try {
      endpoint = new URL(`${baseUrl.replace(/\/+$/, "")}/chat/completions`);
    } catch {
      return safeFailure("invalid_endpoint", "The model endpoint is invalid.");
    }

    if (endpoint.protocol !== "https:") {
      return safeFailure(
        "insecure_endpoint",
        "The model endpoint must use HTTPS.",
      );
    }
    if (endpoint.origin !== "https://api.openai.com") {
      return safeFailure(
        "untrusted_endpoint",
        "OpenAI connection tests must use the official OpenAI API endpoint.",
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: "Reply only OK" }],
          max_tokens: 1,
          temperature: 0,
        }),
        cache: "no-store",
        signal: controller.signal,
      });

      if (response.ok) {
        return {
          status: "ready",
          code: null,
          message: "OpenAI credentials and model access verified.",
        };
      }

      if (response.status === 401 || response.status === 403) {
        return safeFailure(
          "authentication_failed",
          "OpenAI rejected the configured server credentials.",
        );
      }
      if (response.status === 404) {
        return safeFailure(
          "model_unavailable",
          "This OpenAI model is not available to the configured project.",
        );
      }
      if (response.status === 429) {
        try {
          const payload = await response.json();
          const providerCode =
            payload?.error?.code || payload?.error?.type || "rate_limited";
          if (providerCode === "insufficient_quota") {
            return safeFailure(
              "insufficient_quota",
              "The configured OpenAI project has insufficient quota. Add billing/credits or use a project key with available quota.",
            );
          }
        } catch {
          // Fall through to the safe generic rate-limit message.
        }
        return safeFailure(
          "rate_limited",
          "OpenAI temporarily rate-limited the connection test.",
        );
      }
      if (response.status >= 500) {
        return safeFailure(
          "provider_unavailable",
          "OpenAI is temporarily unavailable.",
        );
      }

      return safeFailure(
        "connection_rejected",
        `OpenAI rejected the connection test (HTTP ${response.status}).`,
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return safeFailure("timeout", "The OpenAI connection test timed out.");
      }
      return safeFailure(
        "network_error",
        "NORIX could not reach OpenAI from the server.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class GeminiProviderAdapter implements ModelProviderAdapter {
  readonly provider = "gemini";

  async testConnection(
    modelId: string,
    baseUrl: string,
    byokKey?: string,
  ): Promise<ModelConnectionResult> {
    const apiKey = byokKey || process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return safeFailure(
        "missing_api_key",
        "Gemini is not configured on the NORIX server.",
      );
    }

    let endpoint: URL;
    try {
      endpoint = new URL(`${baseUrl.replace(/\/+$/, "")}/chat/completions`);
    } catch {
      return safeFailure("invalid_endpoint", "The model endpoint is invalid.");
    }

    if (endpoint.protocol !== "https:") {
      return safeFailure(
        "insecure_endpoint",
        "The model endpoint must use HTTPS.",
      );
    }
    if (endpoint.origin !== "https://generativelanguage.googleapis.com") {
      return safeFailure(
        "untrusted_endpoint",
        "Gemini connection tests must use the official Google API endpoint.",
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: "Reply only OK" }],
          max_tokens: 128,
          temperature: 0,
        }),
        cache: "no-store",
        signal: controller.signal,
      });

      if (response.ok) {
        return {
          status: "ready",
          code: null,
          message: "Gemini credentials and model access verified.",
        };
      }
      if (response.status === 401 || response.status === 403) {
        return safeFailure(
          "authentication_failed",
          "Google rejected the configured Gemini credentials.",
        );
      }
      if (response.status === 404) {
        return safeFailure(
          "model_unavailable",
          "This Gemini model is not available to the configured project.",
        );
      }
      if (response.status === 429) {
        return safeFailure(
          "rate_limited",
          "Gemini rate-limited the connection test or the project quota is exhausted.",
        );
      }
      if (response.status >= 500) {
        return safeFailure(
          "provider_unavailable",
          "Gemini is temporarily unavailable.",
        );
      }
      return safeFailure(
        "connection_rejected",
        `Gemini rejected the connection test (HTTP ${response.status}).`,
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return safeFailure("timeout", "The Gemini connection test timed out.");
      }
      return safeFailure(
        "network_error",
        "NORIX could not reach Gemini from the server.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Any provider with an OpenAI-compatible `/chat/completions` endpoint
 * (Anthropic, OpenRouter, Groq, ...). Only the provider's official origin is
 * allowed, so a BYOK key can never be sent to an arbitrary host.
 */
export class OpenAICompatAdapter implements ModelProviderAdapter {
  constructor(readonly provider: string) {}

  async testConnection(
    modelId: string,
    baseUrl: string,
    apiKey?: string,
  ): Promise<ModelConnectionResult> {
    const info = getLlmProvider(this.provider);
    if (!info) return safeFailure("unknown_provider", "Unknown provider.");
    if (!apiKey) {
      return safeFailure("missing_api_key", `No ${info.label} API key saved.`);
    }
    if (new URL(baseUrl).origin !== new URL(info.baseUrl).origin) {
      return safeFailure(
        "untrusted_endpoint",
        `${info.label} connection tests must use the official ${info.label} API endpoint.`,
      );
    }

    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: "Reply only OK" }],
          max_tokens: 16,
          temperature: 0,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) {
        return { status: "ready", code: null, message: `${info.label} key verified.` };
      }
      if (response.status === 401 || response.status === 403) {
        return safeFailure("authentication_failed", `${info.label} rejected this API key.`);
      }
      if (response.status === 404) {
        return safeFailure("model_unavailable", `This key cannot access the ${modelId} model.`);
      }
      if (response.status === 429) {
        return safeFailure("rate_limited", `${info.label} rate-limited the test or the quota is exhausted.`);
      }
      if (response.status >= 500) {
        return safeFailure("provider_unavailable", `${info.label} is temporarily unavailable.`);
      }
      return safeFailure("connection_rejected", `${info.label} rejected the test (HTTP ${response.status}).`);
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        return safeFailure("timeout", `The ${info.label} connection test timed out.`);
      }
      return safeFailure("network_error", `NORIX could not reach ${info.label} from the server.`);
    }
  }
}

const adapters = new Map<string, ModelProviderAdapter>([
  ["openai", new OpenAIProviderAdapter()],
  ["gemini", new GeminiProviderAdapter()],
  ...LLM_PROVIDERS.filter((p) => p.slug !== "openai" && p.slug !== "gemini").map(
    (p): [string, ModelProviderAdapter] => [p.slug, new OpenAICompatAdapter(p.slug)],
  ),
]);

export function getModelProviderAdapter(
  provider: string,
): ModelProviderAdapter {
  const adapter = adapters.get(provider.toLowerCase());
  if (!adapter) {
    throw new Error(`Provider '${provider}' is not executable in Playground.`);
  }
  return adapter;
}

export function isExecutableModelProvider(provider: string): boolean {
  return adapters.has(provider.toLowerCase());
}
