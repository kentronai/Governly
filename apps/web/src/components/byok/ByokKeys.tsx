"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CheckCircle2, ChevronsUpDown, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTenant } from "@/contexts/TenantContext";
import {
  getOpenRouterModels,
  listLlmKeys,
  saveLlmKey,
} from "@/lib/actions/llm-keys";
import { LLM_PROVIDERS, getLlmProvider } from "@/lib/llm-providers";
import { cn } from "@/lib/utils";
import { errorToast } from "@/lib/utils/toast";

type Model = { id: string; label: string };
type SavedKey = { provider: string; modelId: string; keyLast4: string };

/** Admin Center → BYOK: pick a provider, then a model, then add your own key. */
export function ByokKeys() {
  const { tenant } = useTenant();
  const [saved, setSaved] = useState<SavedKey[]>([]);
  const [provider, setProvider] = useState("");
  const [models, setModels] = useState<Model[]>([]);
  const [modelId, setModelId] = useState("");
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!tenant) return;
    setSaved(await listLlmKeys(tenant.slug));
  }, [tenant]);

  useEffect(() => {
    load().catch(errorToast);
  }, [load]);

  const pickProvider = (slug: string) => {
    setProvider(slug);
    setModelId("");
    setApiKey("");
    const fixed = getLlmProvider(slug)?.models ?? [];
    setModels(fixed);
    if (slug === "openrouter")
      getOpenRouterModels()
        .then(setModels)
        .catch(() => undefined); // keep the short fallback list
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveLlmKey(tenant!.slug, provider, modelId, apiKey);
      setApiKey("");
      await load();
    } catch (e) {
      errorToast(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const current = saved.find(
    (k) => k.provider === provider && k.modelId === modelId,
  );
  const selected = models.find((m) => m.id === modelId);

  return (
    <div className="min-h-full w-full bg-background p-5 lg:p-7">
      <div className="w-full max-w-md space-y-6">
        <PageHeader
          title="Bring Your Own Key"
          description="Choose a provider and model, then add your API key."
        />
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={pickProvider}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a provider" />
                </SelectTrigger>
                <SelectContent>
                  {LLM_PROVIDERS.map((p) => (
                    <SelectItem key={p.slug} value={p.slug}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Model</Label>
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    disabled={!provider}
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {selected?.label ??
                        (provider ? "Select a model" : "Select a provider first")}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] p-0"
                  align="start"
                >
                  <Command>
                    <CommandInput placeholder="Search models..." />
                    <CommandList>
                      <CommandEmpty>No model found.</CommandEmpty>
                      <CommandGroup>
                        {models.map((m) => (
                          <CommandItem
                            key={m.id}
                            value={`${m.label} ${m.id}`}
                            onSelect={() => {
                              setModelId(m.id);
                              setApiKey("");
                              setOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                modelId === m.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <span className="truncate">{m.label}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {current ? (
              <p className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                Key saved (•••• {current.keyLast4})
              </p>
            ) : (
              <>
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
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
