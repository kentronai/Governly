import "server-only";

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
  testConnection(
    modelId: string,
    baseUrl: string,
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
  ): Promise<ModelConnectionResult> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
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
  ): Promise<ModelConnectionResult> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
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

const adapters = new Map<string, ModelProviderAdapter>([
  ["openai", new OpenAIProviderAdapter()],
  ["gemini", new GeminiProviderAdapter()],
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
