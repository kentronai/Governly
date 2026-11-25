import { detectModelFile, detectModelsInText, guessProvider, isApproved, NON_USAGE_PATH } from "./model-detector";

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

describe("NON_USAGE_PATH", () => {
  it("skips tests, examples, demos, docs, fixtures, markdown and lockfiles", () => {
    for (const p of [
      "tests/test_llm_client_errors.py",
      "apps/controlnet/test_x.py",
      "src/foo.test.ts",
      "src/foo_test.go",
      "examples/enhanced_sdk_demo.py",
      "demo/app.py",
      "docs/guide.py",
      "fixtures/a.yaml",
      "README.md",
      "pnpm-lock.yaml",
      ".env.example",
    ]) expect([p, NON_USAGE_PATH.test(p)]).toEqual([p, true]);
    for (const p of ["apps/controlnet/gateway/llm_client.py", "src/agents/run.ts", "config/latest.yaml"])
      expect([p, NON_USAGE_PATH.test(p)]).toEqual([p, false]);
  });
});
