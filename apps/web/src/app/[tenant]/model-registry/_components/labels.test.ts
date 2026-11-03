/**
 * @jest-environment node
 */
import {
  AVAILABILITY_LABELS,
  PROVIDER_LABELS,
  availabilityLabel,
  providerLabel,
} from "./labels";

describe("availabilityLabel", () => {
  it.each([
    ["available", "Available"],
    ["preview", "Preview"],
    ["deprecated", "Deprecated"],
    ["unavailable", "Unavailable"],
    ["beta_access", "Beta Access"],
    [null, "Unknown"],
    [undefined, "Unknown"],
    ["", "Unknown"],
  ])("%p → %p", (status, label) => {
    expect(availabilityLabel(status)).toBe(label);
  });

  it("covers every provider_model_status enum value", () => {
    expect(Object.keys(AVAILABILITY_LABELS).sort()).toEqual(
      ["available", "deprecated", "preview", "unavailable"],
    );
  });
});

describe("providerLabel", () => {
  it.each([
    ["openai", "OpenAI"],
    ["gemini", "Google (Gemini)"],
    ["huggingface", "Hugging Face"],
    ["azure_openai", "Azure OpenAI"],
    ["new_provider", "New Provider"],
    [null, "—"],
  ])("%p → %p", (provider, label) => {
    expect(providerLabel(provider)).toBe(label);
  });

  it("covers every provider enum value", () => {
    expect(Object.keys(PROVIDER_LABELS).sort()).toEqual(
      [
        "anthropic",
        "azure_openai",
        "bedrock",
        "custom",
        "gemini",
        "groq",
        "huggingface",
        "ollama",
        "openai",
        "vertex",
      ],
    );
  });
});
