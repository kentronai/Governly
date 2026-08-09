import { validateModelId } from "./model-id";

describe("validateModelId", () => {
  it("accepts real provider model identifiers", () => {
    for (const id of [
      "gpt-4o-mini",
      "gemini-2.0-flash",
      "claude-sonnet-4-20250514",
      "meta-llama/Llama-3.3-70B-Instruct",
      "mistral-large-latest",
      "accounts/fireworks/models/llama-v3p1-8b",
    ]) {
      expect(validateModelId(id)).toBeNull();
    }
  });

  it("rejects the display name that broke production routing", () => {
    // A registry row saved with model_id 'Google Gemini' made the gateway send
    // `"model": "Google Gemini"` to Gemini, which 400s every request.
    expect(validateModelId("Google Gemini")).toMatch(/cannot contain spaces/);
  });

  it("rejects empty and whitespace-only input", () => {
    expect(validateModelId("")).toMatch(/required/);
    expect(validateModelId("   ")).toMatch(/required/);
    expect(validateModelId(null)).toMatch(/required/);
    expect(validateModelId(undefined)).toMatch(/required/);
  });

  it("trims surrounding whitespace before judging", () => {
    expect(validateModelId("  gpt-4o-mini  ")).toBeNull();
  });

  it("rejects characters no provider accepts", () => {
    expect(validateModelId("gpt-4o?debug=1")).toMatch(/characters no provider/);
    expect(validateModelId("-leading-dash")).toMatch(/characters no provider/);
  });
});
