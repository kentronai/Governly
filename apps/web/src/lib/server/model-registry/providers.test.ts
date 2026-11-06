/** @jest-environment node */

jest.mock("server-only", () => ({}));

import {
  GeminiProviderAdapter,
  getModelProviderAdapter,
  isExecutableModelProvider,
  OpenAIProviderAdapter,
} from "./providers";

describe("OpenAIProviderAdapter", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-server-key";
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env.OPENAI_API_KEY = originalKey;
  });

  it("reports missing server credentials without making a request", async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await new OpenAIProviderAdapter().testConnection(
      "gpt-4o-mini",
      "https://api.openai.com/v1",
    );

    expect(result).toEqual({
      status: "error",
      code: "missing_api_key",
      message: "OpenAI is not configured on the NORIX server.",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("verifies model inference through a minimal OpenAI completion", async () => {
    (fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });
    const result = await new OpenAIProviderAdapter().testConnection(
      "gpt-4o-mini",
      "https://api.openai.com/v1/",
    );

    expect(result.status).toBe("ready");
    expect(fetch).toHaveBeenCalledWith(
      new URL("https://api.openai.com/v1/chat/completions"),
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        headers: expect.objectContaining({
          Authorization: "Bearer test-server-key",
        }),
        body: expect.stringContaining('"model":"gpt-4o-mini"'),
      }),
    );
  });

  it.each([
    [401, "authentication_failed"],
    [403, "authentication_failed"],
    [404, "model_unavailable"],
    [429, "rate_limited"],
    [503, "provider_unavailable"],
    [400, "connection_rejected"],
  ])("maps HTTP %s to safe code %s", async (status, code) => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status,
      json: jest.fn().mockResolvedValue({ error: { code } }),
    });
    const result = await new OpenAIProviderAdapter().testConnection(
      "gpt-4o-mini",
      "https://api.openai.com/v1",
    );

    expect(result.status).toBe("error");
    expect(result.code).toBe(code);
    expect(JSON.stringify(result)).not.toContain("test-server-key");
  });

  it("distinguishes exhausted quota from temporary rate limiting", async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 429,
      json: jest
        .fn()
        .mockResolvedValue({ error: { code: "insufficient_quota" } }),
    });

    const result = await new OpenAIProviderAdapter().testConnection(
      "gpt-4o-mini",
      "https://api.openai.com/v1",
    );

    expect(result.status).toBe("error");
    expect(result.code).toBe("insufficient_quota");
    expect(result.message).toContain("billing/credits");
  });

  it("rejects invalid and insecure endpoints before network access", async () => {
    const invalid = await new OpenAIProviderAdapter().testConnection(
      "gpt-4o-mini",
      "not a url",
    );
    const insecure = await new OpenAIProviderAdapter().testConnection(
      "gpt-4o-mini",
      "http://api.openai.com/v1",
    );
    const untrusted = await new OpenAIProviderAdapter().testConnection(
      "gpt-4o-mini",
      "https://example.com/v1",
    );

    expect(invalid.code).toBe("invalid_endpoint");
    expect(insecure.code).toBe("insecure_endpoint");
    expect(untrusted.code).toBe("untrusted_endpoint");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps network errors without returning raw exception details", async () => {
    (fetch as jest.Mock).mockRejectedValue(
      new Error("request included secret test-server-key"),
    );
    const result = await new OpenAIProviderAdapter().testConnection(
      "gpt-4o-mini",
      "https://api.openai.com/v1",
    );

    expect(result).toEqual({
      status: "error",
      code: "network_error",
      message: "NORIX could not reach OpenAI from the server.",
    });
  });
});

describe("GeminiProviderAdapter", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env.GEMINI_API_KEY = originalKey;
  });

  it("verifies Gemini with a real inference-shaped request", async () => {
    (fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });

    const result = await new GeminiProviderAdapter().testConnection(
      "gemini-3.6-flash",
      "https://generativelanguage.googleapis.com/v1beta/openai",
    );

    expect(result).toEqual({
      status: "ready",
      code: null,
      message: "Gemini credentials and model access verified.",
    });
    expect(fetch).toHaveBeenCalledWith(
      new URL(
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      ),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-gemini-key",
        }),
        body: expect.stringContaining('"model":"gemini-3.6-flash"'),
      }),
    );
  });

  it("on a 404 names the models the key can use instead of a generic message", async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: "models/gemini-2.0-flash" },
            { id: "models/gemini-2.5-flash" },
            { id: "models/text-embedding-004" },
          ],
        }),
      });
    const result = await new GeminiProviderAdapter().testConnection(
      "gemini-3-pro-preview",
      "https://generativelanguage.googleapis.com/v1beta/openai",
      "test-gemini-key",
    );

    expect(result.code).toBe("model_unavailable");
    expect(result.message).toContain("gemini-2.5-flash, gemini-2.0-flash");
    expect(result.message).not.toContain("embedding");
    expect(JSON.stringify(result)).not.toContain("test-gemini-key");
  });

  it("shows Google's own reason for other rejections, without the key", async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => [{ error: { message: "API key not valid: test-gemini-key" } }],
    });
    const result = await new GeminiProviderAdapter().testConnection(
      "gemini-2.5-flash",
      "https://generativelanguage.googleapis.com/v1beta/openai",
      "test-gemini-key",
    );

    expect(result.message).toContain("HTTP 400: API key not valid: ***");
    expect(JSON.stringify(result)).not.toContain("test-gemini-key");
  });

  it("rejects non-Google endpoints without sending credentials", async () => {
    const result = await new GeminiProviderAdapter().testConnection(
      "gemini-3.6-flash",
      "https://example.com/v1",
    );

    expect(result.code).toBe("untrusted_endpoint");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports missing Gemini credentials safely", async () => {
    delete process.env.GEMINI_API_KEY;

    const result = await new GeminiProviderAdapter().testConnection(
      "gemini-3.6-flash",
      "https://generativelanguage.googleapis.com/v1beta/openai",
    );

    expect(result.code).toBe("missing_api_key");
    expect(JSON.stringify(result)).not.toContain("test-gemini-key");
  });
});

describe("model provider registry", () => {
  it("exposes implemented execution adapters", () => {
    expect(isExecutableModelProvider("openai")).toBe(true);
    expect(isExecutableModelProvider("gemini")).toBe(true);
    expect(isExecutableModelProvider("anthropic")).toBe(true);
    expect(isExecutableModelProvider("openrouter")).toBe(true);
    expect(isExecutableModelProvider("bedrock")).toBe(false);
    expect(getModelProviderAdapter("OPENAI")).toBeInstanceOf(
      OpenAIProviderAdapter,
    );
    expect(getModelProviderAdapter("GEMINI")).toBeInstanceOf(
      GeminiProviderAdapter,
    );
  });
});
