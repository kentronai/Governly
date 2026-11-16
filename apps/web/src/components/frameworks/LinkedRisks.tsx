"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { errorToast } from "@/lib/utils/toast";
import {
  getRisksForControl,
  getTenantRisks,
  linkRisk,
  unlinkRisk,
} from "@/lib/actions/risk-links";

type Linked = Awaited<ReturnType<typeof getRisksForControl>>[number];
type TenantRisk = Awaited<ReturnType<typeof getTenantRisks>>[number];

/** Risks linked to one control leaf ("slug:key"); same links as the risk register shows. */
export function LinkedRisks({ tenant, controlId }: { tenant: string; controlId: string }) {
  const [linked, setLinked] = useState<Linked[]>([]);
  const [all, setAll] = useState<TenantRisk[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(
    () =>
      getRisksForControl(tenant, [controlId])
        .then(setLinked)
        .catch(() => setLinked([])),
    [tenant, controlId],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const openPicker = (o: boolean) => {
    setOpen(o);
    if (o && !all.length) getTenantRisks(tenant).then(setAll).catch(() => undefined);
  };

  const add = async (riskId: string) => {
    setOpen(false);
    try {
      await linkRisk(tenant, riskId, "control", controlId);
      await load();
    } catch {
      errorToast("Unable to link risk");
    }
  };

  const remove = async (linkId: string) => {
    try {
      await unlinkRisk(tenant, linkId);
      await load();
    } catch {
      errorToast("Unable to remove link");
    }
  };

  const taken = new Set(linked.map((l) => l.riskId));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Linked risks</Label>
        <Popover open={open} onOpenChange={openPicker}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              Link risk
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[420px] p-0" align="end">
            <Command>
              <CommandInput placeholder="Search risks..." />
              <CommandList>
                <CommandEmpty>No risks. Add one on an application's Risks page.</CommandEmpty>
                {all
                  .filter((r) => !taken.has(r.id))
                  .map((r) => (
                    <CommandItem key={r.id} value={`${r.riskName} ${r.id}`} onSelect={() => add(r.id)}>
                      <span className="flex-1">{r.riskName}</span>
                      <Badge variant="secondary">{r.riskLevel}</Badge>
                    </CommandItem>
                  ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      {!linked.length ? (
        <p className="text-sm text-muted-foreground">No risks linked to this control.</p>
      ) : (
        <div className="space-y-1.5">
          {linked.map((l) => (
            <div key={l.linkId} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1">{l.riskName}</span>
              <Badge variant="secondary">{l.riskLevel}</Badge>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Remove link" onClick={() => remove(l.linkId)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
