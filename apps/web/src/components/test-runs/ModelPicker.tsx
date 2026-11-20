"use client";

import { Bot, Check, KeyRound, Server, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/common/SearchableSelect";
import { cn } from "@/lib/utils";
import { getLlmProvider } from "@/lib/llm-providers";
import { MODEL_SOURCES, needsEndpoint, type ModelSpec } from "@/lib/test-runs";

export type SavedKey = { provider: string; modelId: string; keyLast4: string };

const SOURCE_LABEL: Record<string, string> = {
  huggingface: "HuggingFace",
  ollama: "Ollama",
  custom: "Custom / Self-hosted",
};
const labelOf = (p: string) => getLlmProvider(p)?.label ?? SOURCE_LABEL[p] ?? p;
const iconOf = (p: string) =>
  p === "custom" ? Server : p === "ollama" ? Server : p === "huggingface" ? Sparkles : Bot;

/** True when the spec has everything the server needs (it re-validates). */
export function isSpecComplete(spec: ModelSpec | null, saved: SavedKey | null) {
  if (!spec?.provider || !spec.modelId.trim()) return false;
  if (needsEndpoint(spec.provider)) return !!spec.baseUrl?.trim();
  return !!spec.apiKey?.trim() || saved?.provider === spec.provider;
}

/** Provider cards + saved key + model/endpoint/key form. Used for the model under test and the Reviewer. */
export function ModelPicker({
  idPrefix,
  value,
  onChange,
  saved,
}: {
  idPrefix: string;
  value: ModelSpec | null;
  onChange: (v: ModelSpec | null) => void;
  saved: SavedKey | null;
}) {
  const provider = value?.provider ?? "";
  const usingSaved =
    !!saved && provider === saved.provider && value?.modelId === saved.modelId && !value?.apiKey;
  const catalog = getLlmProvider(provider);
  const set = (patch: Partial<ModelSpec>) => onChange({ provider, modelId: "", ...value, ...patch });

  return (
    <div className="space-y-4">
      {saved && (
        <div className="space-y-2">
          <Label>Saved model</Label>
          <Card
            role="radio"
            aria-checked={usingSaved}
            tabIndex={0}
            onClick={() => onChange({ provider: saved.provider, modelId: saved.modelId })}
            onKeyDown={(e) => e.key === "Enter" && onChange({ provider: saved.provider, modelId: saved.modelId })}
            className={cn("cursor-pointer py-0 transition-colors hover:bg-muted/50", usingSaved && "border-primary ring-1 ring-primary")}
          >
            <CardContent className="flex items-center gap-3 p-3">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1 text-sm">
                <div className="font-medium">{saved.modelId}</div>
                <div className="text-muted-foreground">
                  {labelOf(saved.provider)} · saved key ••••{saved.keyLast4}
                </div>
              </div>
              {usingSaved && <Check className="h-4 w-4 text-primary" />}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="space-y-2">
        <Label>{saved ? "Or choose a provider" : "Provider"}</Label>
        <div role="radiogroup" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MODEL_SOURCES.map((p) => {
            const Icon = iconOf(p);
            const active = provider === p && !usingSaved;
            return (
              <Card
                key={p}
                role="radio"
                aria-checked={active}
                tabIndex={0}
                onClick={() => onChange({ provider: p, modelId: "" })}
                onKeyDown={(e) => e.key === "Enter" && onChange({ provider: p, modelId: "" })}
                className={cn(
                  "relative cursor-pointer py-0 transition-colors hover:bg-muted/50",
                  active && "border-primary ring-1 ring-primary",
                )}
              >
                <CardContent className="flex flex-col items-center gap-2 p-3 text-center">
                  {active && <Check className="absolute right-2 top-2 h-4 w-4 text-primary" />}
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm font-medium leading-tight">{labelOf(p)}</span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {provider && !usingSaved && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-model`}>Model name</Label>
            {catalog ? (
              <SearchableSelect
                id={`${idPrefix}-model`}
                value={value?.modelId ?? ""}
                onValueChange={(modelId) => set({ modelId })}
                options={catalog.models.map((m) => ({ value: m.id, label: m.label }))}
                placeholder="Select or type a model"
                allowCustom
              />
            ) : (
              <Input
                id={`${idPrefix}-model`}
                value={value?.modelId ?? ""}
                onChange={(e) => set({ modelId: e.target.value })}
                placeholder={provider === "ollama" ? "llama3.3" : provider === "huggingface" ? "meta-llama/Llama-3.3-70B-Instruct" : "e.g. my-model"}
              />
            )}
          </div>
          {needsEndpoint(provider) && (
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-url`}>Endpoint URL (OpenAI-compatible)</Label>
              <Input
                id={`${idPrefix}-url`}
                value={value?.baseUrl ?? ""}
                onChange={(e) => set({ baseUrl: e.target.value })}
                placeholder={provider === "ollama" ? "http://localhost:11434/v1" : "https://models.example.com/v1"}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-key`}>
              API key{" "}
              {(needsEndpoint(provider) || saved?.provider === provider) && (
                <span className="text-muted-foreground">
                  (optional{saved?.provider === provider ? ", uses your saved key if empty" : ""})
                </span>
              )}
            </Label>
            <Input
              id={`${idPrefix}-key`}
              type="password"
              autoComplete="off"
              value={value?.apiKey ?? ""}
              onChange={(e) => set({ apiKey: e.target.value })}
              placeholder={catalog?.keyHint || "Leave blank if not required"}
            />
            <p className="text-xs text-muted-foreground">Encrypted and used only for this test run. It is never shown again.</p>
          </div>
        </div>
      )}
    </div>
  );
}
