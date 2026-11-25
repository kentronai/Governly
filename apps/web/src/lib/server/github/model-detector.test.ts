import { detectModelFile, detectModelsInText, guessProvider, isApproved } from "./model-detector";

describe("model detector", () => {
  it("finds SDK model ids, HF/OpenRouter ids and lines", () => {
    const src = [
      'client.chat.completions.create(model="gpt-4o-mini")',
      "",
      'tok = AutoTokenizer.from_pretrained("meta-llama/Llama-3.1-8B")',
      'litellm.completion(model="openrouter/anthropic/claude-3.5-sonnet")',
      "ANTHROPIC_MODEL=claude-sonnet-4-20250514",
      'ollama.chat(model="llama3")',
    ].join("\n");
    const hits = detectModelsInText(src);
    const by = Object.fromEntries(hits.map((h) => [h.modelId, h]));
    expect(by["gpt-4o-mini"].line).toBe(1);
    expect(by["meta-llama/llama-3.1-8b"]).toMatchObject({ kind: "hf", line: 3 });
    expect(by["openrouter/anthropic/claude-3.5-sonnet"].line).toBe(4);
    expect(by["claude-sonnet-4-20250514"].line).toBe(5);
    expect(by["llama3"].line).toBe(6);
  });

  it("flags model weight files", () => {
    expect(detectModelFile("models/clf.onnx")).toMatchObject({ modelId: "clf.onnx", kind: "file" });
    expect(detectModelFile("src/app.py")).toBeNull();
  });

  it("guesses providers and matches approvals", () => {
    expect(guessProvider("claude-3-haiku", "model_id")).toBe("anthropic");
    expect(guessProvider("bert-base/uncased", "hf")).toBe("huggingface");
    expect(isApproved("openai/gpt-4o", ["gpt-4o"])).toBe(true);
    expect(isApproved("gpt-4o", ["gpt-4o-mini"])).toBe(false);
  });
});
