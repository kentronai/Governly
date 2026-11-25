jest.mock("server-only", () => ({}));
jest.mock("@/app/[tenant]/model-registry/_components/AddModelDialog", () => ({}));
import { normalizeCatalog, toRegistryProvider } from "./model-catalog";
import { estimateCost } from "@/app/[tenant]/model-registry/_components/ModelCatalog";

describe("model catalog", () => {
  it("normalizes LiteLLM entries and strips the provider prefix", () => {
    const [m, b] = normalizeCatalog({
      sample_spec: { litellm_provider: "x" },
      "gemini/gemini-2.5-pro": {
        litellm_provider: "gemini",
        mode: "chat",
        max_input_tokens: 1_000_000,
        input_cost_per_token: 1.25e-6,
        output_cost_per_token: 1e-5,
        supports_vision: true,
      },
      "fal_ai/flux": { litellm_provider: "fal_ai", mode: "image_generation" },
      broken: {},
    });
    expect(m).toMatchObject({ modelId: "gemini-2.5-pro", registryProvider: "gemini", inPerM: 1.25, outPerM: 10, vision: true, tools: false });
    expect(b.registryProvider).toBeNull();
  });

  it("maps provider families onto the gateway enum", () => {
    expect(toRegistryProvider("vertex_ai-language-models")).toBe("vertex");
    expect(toRegistryProvider("bedrock_converse")).toBe("bedrock");
    expect(toRegistryProvider("azure")).toBe("azure_openai");
  });

  it("estimates monthly cost", () => {
    // gpt-4o: $2.50 in / $10 out per 1M; 1000 req/day x 2000 in + 500 out
    const c = estimateCost({ inPerM: 2.5, outPerM: 10 }, 1000, 2000, 500);
    expect(c.perReq).toBeCloseTo(0.01);
    expect(c.perMonth).toBeCloseTo(300);
  });
});
