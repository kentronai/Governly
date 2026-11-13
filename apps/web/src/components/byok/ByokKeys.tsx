"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { DeleteConfirmationModal } from "@/components/common/DeleteConfirmationModal";
import { SearchableSelect } from "@/components/common/SearchableSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTenant } from "@/contexts/TenantContext";
import {
  deleteLlmKey,
  getOpenRouterModels,
  listLlmKeys,
  saveLlmKey,
  testLlmKey,
} from "@/lib/actions/llm-keys";
import { LLM_PROVIDERS, getLlmProvider } from "@/lib/llm-providers";
import { errorToast, infoToast } from "@/lib/utils/toast";

type Model = { id: string; label: string };
type SavedKey = { provider: string; modelId: string; keyLast4: string; updatedAt: string };
type KeyCheck = { status: "checking" | "ready" | "error"; message?: string };

/**
 * Admin Center → BYOK. A tenant has ONE provider, model and key: it is shown once saved,
 * edited with the pencil, removed with the bin. Saving a new one replaces the old.
 */
export function ByokKeys() {
  const { tenant } = useTenant();
  const [saved, setSaved] = useState<SavedKey | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [check, setCheck] = useState<KeyCheck | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [provider, setProvider] = useState("");
  const [models, setModels] = useState<Model[]>([]);
  const [modelId, setModelId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  /** Model list for a provider; `keep` (a saved or custom id) is always included. */
  const showProvider = (slug: string, keep?: string) => {
    const withKeep = (list: Model[]) =>
      keep && !list.some((m) => m.id === keep) ? [{ id: keep, label: keep }, ...list] : list;
    setModels(withKeep(getLlmProvider(slug)?.models ?? []));
    if (slug === "openrouter")
      getOpenRouterModels()
        .then((list) => setModels(withKeep(list)))
        .catch(() => undefined); // keep the short fallback list
  };

  /** Ask the provider whether the saved key still works, so a dead key is visible here. */
  const verify = useCallback(
    async (key: SavedKey) => {
      if (!tenant) return;
      setCheck({ status: "checking" });
      try {
        const res = await testLlmKey(tenant.slug, key.provider, key.modelId);
        setCheck(
          res.status === "ready"
            ? { status: "ready" }
            : { status: "error", message: res.message },
        );
      } catch {
        setCheck({ status: "error", message: "Could not verify the key." });
      }
    },
    [tenant],
  );

  const load = useCallback(async () => {
    if (!tenant) return;
    const rows = await listLlmKeys(tenant.slug);
    const latest =
      [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
    setSaved(latest);
    setLoaded(true);
    if (latest) {
      setProvider(latest.provider);
      setModelId(latest.modelId);
      showProvider(latest.provider, latest.modelId);
      void verify(latest);
    }
    return latest;
  }, [tenant, verify]);

  useEffect(() => {
    load().catch(errorToast);
  }, [load]);

  const pickProvider = (slug: string) => {
    setProvider(slug);
    setModelId("");
    setApiKey("");
    showProvider(slug);
  };

  const save = async () => {
    setSaving(true);
    try {
      const result = await saveLlmKey(tenant!.slug, provider, modelId, apiKey);
      if (!result.success) {
        errorToast(result.error);
        return;
      }
      setApiKey("");
      infoToast("API key saved");
      await load();
    } catch (e) {
      errorToast(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!saved || !tenant) return;
    setDeleting(true);
    try {
      await deleteLlmKey(tenant.slug, saved.provider, saved.modelId);
      infoToast("API key removed");
      setSaved(null);
      setCheck(null);
      setProvider("");
      setModelId("");
      setModels([]);
      setConfirmDelete(false);
    } catch (e) {
      errorToast(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setDeleting(false);
    }
  };

  const showForm = loaded && !saved;

  return (
    <div className="min-h-full w-full bg-background p-5 lg:p-7">
      <div className="w-full space-y-6">
        <PageHeader
          title="Bring Your Own Key"
          description="One provider, model and API key at a time. A saved key can't be edited: remove it to add a different one."
        />
        <Card className="w-full max-w-2xl border shadow-sm">
          <CardContent className="space-y-4 p-6">
            {!loaded ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : saved ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {getLlmProvider(saved.provider)?.label ?? saved.provider}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">{saved.modelId}</p>
                    <p className="mt-1 text-sm text-muted-foreground">•••• {saved.keyLast4}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4 text-red-500" />
                    Remove key
                  </Button>
                </div>
                {check?.status === "checking" && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking the key…
                  </p>
                )}
                {check?.status === "ready" && (
                  <p className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    Key saved and working
                  </p>
                )}
                {check?.status === "error" && (
                  <p className="flex items-start gap-2 text-sm text-red-500">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Key saved, but it is not working: {check.message}</span>
                  </p>
                )}
              </>
            ) : showForm ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="byok-provider">Provider</Label>
                  <SearchableSelect
                    id="byok-provider"
                    value={provider}
                    onValueChange={pickProvider}
                    options={LLM_PROVIDERS.map((p) => ({ value: p.slug, label: p.label }))}
                    placeholder="Select a provider"
                    searchPlaceholder="Search providers..."
                    emptyText="No provider found."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="byok-model">Model</Label>
                  <SearchableSelect
                    id="byok-model"
                    value={modelId}
                    onValueChange={(id) => {
                      setModelId(id);
                      setApiKey("");
                    }}
                    options={models.map((m) => ({ value: m.id, label: m.label }))}
                    disabled={!provider}
                    allowCustom
                    placeholder={provider ? "Select a model" : "Select a provider first"}
                    searchPlaceholder="Search or type a model id..."
                    emptyText="No model found."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="byok-key">API key</Label>
                  <Input
                    id="byok-key"
                    type="password"
                    autoComplete="off"
                    disabled={!modelId}
                    placeholder={getLlmProvider(provider)?.keyHint || "Paste your API key"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={saving || !modelId || !apiKey.trim()}
                  onClick={save}
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <DeleteConfirmationModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        isLoading={deleting}
        title="Remove this API key?"
        itemName={saved ? `${getLlmProvider(saved.provider)?.label ?? saved.provider} · ${saved.modelId}` : "this key"}
        itemType="API key"
      />
    </div>
  );
}
