"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, XCircle, KeyRound, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTenant } from "@/contexts/TenantContext";
import { createProviderModel } from "@/lib/actions/provider-models";
import { listLlmKeys, saveLlmKey } from "@/lib/actions/llm-keys";
import { testModelConnection } from "@/lib/actions/model-registry-runtime";
import { getLlmProvider, getModelProvider } from "@/lib/llm-providers";
import { errorToast, successToast } from "@/lib/utils/toast";
import type { CatalogModel } from "@/lib/server/model-catalog";

type SavedKey = { provider: string; modelId: string; keyLast4: string };
type TestResult = { status: "ready" | "error"; message: string };

/**
 * Catalog "Add": approve a model into the registry, attach the workspace BYOK key for its
 * provider (or save one), then run the real connection test the gateway uses.
 */
export function AddModelDialog({
  model,
  onClose,
  onAdded,
}: {
  model: CatalogModel | null;
  onClose: () => void;
  onAdded: (catalogId: string) => void;
}) {
  const { tenant } = useTenant();
  const provider = model?.registryProvider ?? "";
  const providerInfo = getModelProvider(provider);
  // Only hosted OpenAI-compatible providers take a BYOK key and can be tested from Governly.
  const testable = !!getLlmProvider(provider);

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [purpose, setPurpose] = useState("");
  // Catalog values prefill these; the user can override before approving.
  const [f, setF] = useState({ modelId: "", ctx: "", maxOut: "", inPerM: "", outPerM: "" });
  const [risk, setRisk] = useState("N/A");
  const [keys, setKeys] = useState<SavedKey[] | null>(null);
  const [keyMode, setKeyMode] = useState<"saved" | "new">("saved");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);

  useEffect(() => {
    if (!model) return;
    setName(model.modelId);
    setBaseUrl(providerInfo?.baseUrl ?? "");
    setPurpose("");
    const s = (v: number | null) => (v == null ? "" : String(v));
    setF({ modelId: model.modelId, ctx: s(model.maxInput), maxOut: s(model.maxOutput), inPerM: s(model.inPerM), outPerM: s(model.outPerM) });
    setRisk("N/A");
    setApiKey("");
    setResult(null);
    setKeys(null);
    if (testable && tenant) listLlmKeys(tenant.slug).then(setKeys).catch(() => setKeys([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.id]);

  const saved = keys?.find((k) => k.provider === provider);
  const otherKey = keys?.find((k) => k.provider !== provider);
  useEffect(() => setKeyMode(saved ? "saved" : "new"), [saved]);

  const submit = async () => {
    if (!model || !tenant) return;
    if (!baseUrl.trim()) return errorToast("Base URL is required");
    try {
      // 1. BYOK key (one per workspace: saving replaces the existing key).
      if (testable && keyMode === "new" && apiKey.trim()) {
        setBusy("Saving API key...");
        const saveRes = await saveLlmKey(tenant.slug, provider, model.modelId, apiKey);
        if (saveRes && "success" in saveRes && saveRes.success === false) throw new Error(saveRes.error);
      }
      // 2. Approve the model into the registry.
      setBusy("Adding to approved models...");
      const res = await createProviderModel({
        provider,
        modelId: f.modelId.trim() || model.modelId,
        displayName: name.trim() || f.modelId.trim() || model.modelId,
        modality: [model.mode === "chat" ? "text" : model.mode],
        contextWindowTokens: f.ctx ? Number(f.ctx) : undefined,
        maxOutputTokens: f.maxOut ? Number(f.maxOut) : undefined,
        inputCostPer1K: f.inPerM ? String(Number(f.inPerM) / 1000) : undefined,
        outputCostPer1K: f.outPerM ? String(Number(f.outPerM) / 1000) : undefined,
        currency: "USD",
        availabilityStatus: "available",
        modelUrl: baseUrl.trim(),
        purposeUseCase: purpose.trim() || undefined,
        riskLevel: risk as "Low" | "Medium" | "High" | "N/A",
        category: "llm",
      });
      if (!res?.status || !("model" in res) || !res.model) throw new Error(res?.message || "Failed to add model");
      onAdded(model.id);
      successToast(null, "Model", "added", `${name || model.modelId} added to approved models`);

      // 3. Live connection test with the workspace key.
      const hasKey = keyMode === "saved" ? !!saved : !!apiKey.trim();
      if (testable && hasKey) {
        setBusy("Testing connection...");
        const t = await testModelConnection(res.model.id);
        setResult({ status: t.status, message: t.message ?? (t.status === "ready" ? "Connection verified." : "Test failed.") });
      } else {
        onClose();
      }
    } catch (e) {
      errorToast(e instanceof Error ? e.message : "Failed to add model");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={!!model} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add to approved models</DialogTitle>
          <DialogDescription>
            Approve this model for your workspace and connect it with your API key.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <Alert variant={result.status === "ready" ? "default" : "destructive"}>
            {result.status === "ready" ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4" />}
            <AlertDescription>
              <p className="font-medium">{result.status === "ready" ? "Model added and connected" : "Model added, but the connection test failed"}</p>
              <p className="text-sm">{result.message}</p>
              {result.status === "error" && (
                <p className="text-sm mt-1">Fix the key in Admin → BYOK, then re-test from the Playground.</p>
              )}
            </AlertDescription>
          </Alert>
        ) : (
          model && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="am-name">Display name</Label>
                <Input id="am-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Production GPT-4o" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Provider</Label>
                  <Input value={providerInfo?.label ?? provider} disabled />
                </div>
                <div className="space-y-1.5">
                  <Label>Model ID</Label>
                  <Input value={f.modelId} onChange={(e) => setF({ ...f, modelId: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ["ctx", "Context window (tokens)"],
                  ["maxOut", "Max output tokens"],
                  ["inPerM", "Input $ / 1M tokens"],
                  ["outPerM", "Output $ / 1M tokens"],
                ] as const).map(([k, label]) => (
                  <div key={k} className="space-y-1.5">
                    <Label htmlFor={`am-${k}`}>{label}</Label>
                    <Input id={`am-${k}`} type="number" min={0} step="any" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="am-url">Base URL</Label>
                <Input id="am-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
                {(provider === "azure_openai" || provider === "ollama") && (
                  <p className="text-xs text-muted-foreground">Replace with your own {providerInfo?.label} endpoint.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Risk level</Label>
                  <Select value={risk} onValueChange={setRisk}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["N/A", "Low", "Medium", "High"].map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="am-purpose">Purpose <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea id="am-purpose" rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Customer support chatbot" />
              </div>

              <div className="space-y-2 rounded-md border p-3">
                <Label className="flex items-center gap-2"><KeyRound className="h-4 w-4" />API key</Label>
                {!testable ? (
                  <p className="text-sm text-muted-foreground">
                    {providerInfo?.label ?? provider} is registered for governance only. Governly can't send test traffic to it yet, so no key is needed.
                  </p>
                ) : keys === null ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Checking saved keys...</p>
                ) : (
                  <>
                    {saved && (
                      <RadioGroup value={keyMode} onValueChange={(v) => setKeyMode(v as "saved" | "new")} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="saved" id="k-saved" />
                          <Label htmlFor="k-saved" className="font-normal">Use saved BYOK key ••••{saved.keyLast4}</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="new" id="k-new" />
                          <Label htmlFor="k-new" className="font-normal">Use a new key</Label>
                        </div>
                      </RadioGroup>
                    )}
                    {keyMode === "new" && (
                      <Input
                        type="password"
                        autoComplete="off"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={providerInfo?.keyHint || "Paste API key"}
                      />
                    )}
                    {keyMode === "new" && otherKey && (
                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          Your workspace has one BYOK key (currently {otherKey.provider} ••••{otherKey.keyLast4}). Saving this key replaces it.
                        </AlertDescription>
                      </Alert>
                    )}
                    {keyMode === "new" && !apiKey.trim() && (
                      <p className="text-xs text-muted-foreground">Leave empty to add the model without a connection test.</p>
                    )}
                    {tenant && (
                      <p className="text-xs text-muted-foreground">
                        Keys are encrypted and managed in{" "}
                        <Link className="underline" href={`/${tenant.slug}/admin/settings/byok`}>Admin → BYOK</Link>.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={!!busy}>Cancel</Button>
              <Button onClick={submit} disabled={!!busy || (testable && keys === null)}>
                {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{busy}</> : testable ? "Add & test connection" : "Add model"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
