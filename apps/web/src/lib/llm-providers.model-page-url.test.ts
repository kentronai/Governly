import { modelPageUrl } from "./llm-providers";

describe("modelPageUrl", () => {
  it("maps API base URLs to public docs pages and hides invalid ones", () => {
    expect(modelPageUrl("openai", "gpt-4o", "https://api.openai.com/v1")).toBe("https://platform.openai.com/docs/models/gpt-4o");
    expect(modelPageUrl("openrouter", "openai/gpt-4o", null)).toBe("https://openrouter.ai/openai/gpt-4o");
    expect(modelPageUrl("huggingface", "org/m", "https://huggingface.co/org/m")).toBe("https://huggingface.co/org/m");
    expect(modelPageUrl("custom", "x", "https://example.com/m")).toBe("https://example.com/m");
    expect(modelPageUrl("custom", "x", "api.example.com/v1")).toBeNull();
    expect(modelPageUrl("custom", "x", "javascript:alert(1)")).toBeNull();
    expect(modelPageUrl(null, null, "")).toBeNull();
  });
});
