/**
 * Heuristic detector for ML/LLM models referenced in a repo: model ids passed
 * to SDKs (reuses agent-profile's MODEL_ID regex), "org/name" ids given to
 * from_pretrained / OpenRouter / LiteLLM / pipeline(model=...), and committed
 * model weight files.
 * ponytail: regex only, no AST; misses ids built from variables.
 */

import { extractModelIds } from "../agents/agent-profile";

export interface ModelHit {
  modelId: string;
  kind: "model_id" | "hf" | "file";
  line: number | null;
}

export const MODEL_FILE = /\.(onnx|safetensors|gguf|pt|pth|ckpt)$/i;
export const SCANNABLE_FILE =
  /(\.(py|ipynb|ts|tsx|js|mjs|cjs|go|java|rb|yaml|yml|json|toml|ini|cfg)|(^|\/)\.env(\.[\w-]+)?|(^|\/)Modelfile)$/i;

// "org/name" handed to a model loader or a `model=` / `model:` setting.
const SLASH_ID =
  /(?:from_pretrained|pipeline|SentenceTransformer|hf_hub_download|snapshot_download)\s*\([^)]*?["']([\w.-]+\/[\w.:/-]+)["']|\bmodel(?:_name|_id|Id|Name)?["']?\s*[=:]\s*["']([\w.-]+\/[\w.:/-]+)["']/gi;

export function detectModelsInText(text: string): ModelHit[] {
  const hits = new Map<string, ModelHit>();
  text.split("\n").forEach((raw, i) => {
    if (raw.length > 2000) return; // minified/blob lines
    for (const id of extractModelIds(raw)) {
      if (!hits.has(id)) hits.set(id, { modelId: id, kind: "model_id", line: i + 1 });
    }
    for (const m of raw.matchAll(SLASH_ID)) {
      const id = (m[1] ?? m[2]).toLowerCase();
      if (!hits.has(id)) hits.set(id, { modelId: id, kind: "hf", line: i + 1 });
    }
  });
  return [...hits.values()];
}

export function detectModelFile(path: string): ModelHit | null {
  return MODEL_FILE.test(path) ? { modelId: path.split("/").pop()!, kind: "file", line: null } : null;
}

/** Best-guess registry provider for an id (used when approving). */
export function guessProvider(id: string, kind: ModelHit["kind"]): string {
  const s = id.toLowerCase();
  if (kind === "file") return "custom";
  if (/^(anthropic|amazon|meta|cohere)\.|^mistral\./.test(s)) return "bedrock";
  if (s.includes("/")) {
    return /^(openai|anthropic|google|meta-llama|mistralai|x-ai|deepseek)\//.test(s) ? "openrouter" : "huggingface";
  }
  if (s.startsWith("claude")) return "anthropic";
  if (/^(gpt|o\d)/.test(s)) return "openai";
  if (s.startsWith("gemini")) return "gemini";
  if (s.startsWith("grok")) return "xai";
  if (s.startsWith("deepseek")) return "deepseek";
  if (s.startsWith("mistral")) return "mistral";
  if (s.startsWith("llama")) return "ollama";
  return "custom";
}

/** A detected id is approved when a registry model id matches it (ignoring an "org/" prefix). */
export function isApproved(id: string, approved: string[]): boolean {
  const s = id.toLowerCase();
  return approved.some((a) => {
    const x = a.toLowerCase();
    return x === s || s.endsWith(`/${x}`) || x.endsWith(`/${s}`);
  });
}
