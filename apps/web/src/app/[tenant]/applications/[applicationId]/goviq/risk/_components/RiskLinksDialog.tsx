"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, Loader2, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useTenant } from "@/contexts/TenantContext";
import { enabledFrameworks } from "@/lib/frameworks";
import { buildControls, controlId } from "@/lib/frameworks/controls";
import { errorToast, successToast } from "@/lib/utils/toast";
import {
  getLinkablePolicies,
  getRiskLinks,
  linkRisk,
  unlinkRisk,
  type LinkedItem,
} from "@/lib/actions/risk-links";

type TargetType = "control" | "policy";
interface Option {
  id: string;
  label: string;
  sublabel: string;
}

const COPY: Record<TargetType, { title: string; empty: string; add: string }> = {
  control: {
    title: "Linked controls",
    empty: "No controls linked yet. Link the framework controls that reduce this risk.",
    add: "Link control",
  },
  policy: {
    title: "Linked policies",
    empty: "No policies linked to this risk.",
    add: "Link policy",
  },
};

export function RiskLinksDialog({
  tenant,
  risk,
  type,
  onClose,
  onChanged,
}: {
  tenant: string;
  risk: { id: string; riskName: string } | null;
  type: TargetType;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { policyStatus } = useTenant();
  const [links, setLinks] = useState<LinkedItem[]>([]);
  const [policies, setPolicies] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // Controls of the frameworks this tenant has enabled (same list as the Controls page).
  const controls = useMemo<Option[]>(() => {
    const enabled = enabledFrameworks(
      policyStatus.activePolicyNames,
      policyStatus.enabledFrameworkSlugs,
    );
    return buildControls(enabled).flatMap((s) =>
      s.controls
        .filter((c) => !c.parent)
        .map((c) => ({
          id: controlId(c),
          label: `${c.code} ${c.title}`,
          sublabel: c.primary.framework.name,
        })),
    );
  }, [policyStatus.activePolicyNames, policyStatus.enabledFrameworkSlugs]);

  const load = useCallback(async () => {
    if (!risk) return;
    setLoading(true);
    try {
      setLinks((await getRiskLinks(tenant, risk.id)).filter((l) => l.targetType === type));
    } catch {
      errorToast("Unable to load links");
    } finally {
      setLoading(false);
    }
  }, [tenant, risk, type]);

  useEffect(() => {
    void load();
    if (risk && type === "policy")
      getLinkablePolicies(tenant)
        .then((rows) =>
          setPolicies(rows.map((p) => ({ id: p.id, label: p.name, sublabel: p.category ?? "" }))),
        )
        .catch(() => setPolicies([]));
  }, [load, risk, tenant, type]);

  // ponytail: policy linking is view-only for now; the policy library shows tenant policies,
  // not the enabled frameworks, which confused users. Flip this once that is sorted out.
  const editable = type === "control";
  const linked = new Set(links.map((l) => l.targetId));
  const options = (type === "control" ? controls : policies).filter((o) => !linked.has(o.id));

  const add = async (id: string) => {
    if (!risk) return;
    setOpen(false);
    try {
      await linkRisk(tenant, risk.id, type, id);
      successToast("", "", "", type === "control" ? "Control linked" : "Policy linked");
      await load();
      onChanged();
    } catch {
      errorToast("Unable to link");
    }
  };

  const remove = async (linkId: string) => {
    try {
      await unlinkRisk(tenant, linkId);
      await load();
      onChanged();
    } catch {
      errorToast("Unable to remove link");
    }
  };

  return (
    <Dialog open={Boolean(risk)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{COPY[type].title}</DialogTitle>
          <DialogDescription>{risk?.riskName}</DialogDescription>
        </DialogHeader>

        {editable && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="w-fit">
              <Plus className="mr-1.5 h-4 w-4" />
              {COPY[type].add}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[520px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search..." />
              <CommandList>
                <CommandEmpty>
                  {type === "control"
                    ? "No controls. Enable a framework or regulation first."
                    : "No active policies. Activate one in the policy library first."}
                </CommandEmpty>
                {options.map((o) => (
                  <CommandItem key={o.id} value={`${o.label} ${o.sublabel}`} onSelect={() => add(o.id)}>
                    <div className="flex flex-col">
                      <span>{o.label}</span>
                      <span className="text-xs text-muted-foreground">{o.sublabel}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        )}

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {loading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          ) : !links.length ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              <Link2 className="h-6 w-6" />
              {COPY[type].empty}
            </div>
          ) : (
            links.map((l) => (
              <div key={l.linkId} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{l.label}</p>
                  <p className="text-xs text-muted-foreground">{l.sublabel}</p>
                </div>
                {editable && (
                  <Button variant="ghost" size="icon" aria-label="Remove link" onClick={() => remove(l.linkId)}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
