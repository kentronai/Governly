"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useTenant } from "@/contexts/TenantContext";
import { listRadarCoverage, saveRadarCoverage } from "@/lib/actions/ai-radar";
import { errorToast, successToast } from "@/lib/utils/toast";

type Row = Awaited<ReturnType<typeof listRadarCoverage>>[number];
type Draft = {
  id?: string;
  jurisdictionName: string;
  tier: number;
  instrumentsTracked: string;
  urls: string;
  isEnabled: boolean;
};
const EMPTY: Draft = { jurisdictionName: "", tier: 2, instrumentsTracked: "", urls: "", isEnabled: true };

/** The coverage registry: a jurisdiction not listed here is unmonitored. */
export function RadarCoverage() {
  const { tenant } = useTenant();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    () => listRadarCoverage().then(setRows).catch((e) => { errorToast(e); setRows([]); }),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!draft || !tenant) return;
    setSaving(true);
    try {
      await saveRadarCoverage(tenant.slug, {
        id: draft.id,
        jurisdictionName: draft.jurisdictionName,
        tier: draft.tier,
        instrumentsTracked: draft.instrumentsTracked,
        primarySourceUrls: draft.urls.split("\n").map((u) => u.trim()).filter(Boolean),
        isEnabled: draft.isEnabled,
      });
      successToast({ message: "Coverage saved" }, "Coverage", "updated");
      setDraft(null);
      await load();
    } catch (e) {
      errorToast(e);
    } finally {
      setSaving(false);
    }
  };

  if (!rows)
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {rows.filter((r) => r.isEnabled).length} jurisdictions monitored. Each needs at least one primary source URL.
        </p>
        <Button size="sm" onClick={() => setDraft(EMPTY)}>
          <Plus className="mr-2 h-4 w-4" />
          Add jurisdiction
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Jurisdiction</TableHead>
            <TableHead>Tier</TableHead>
            <TableHead>Primary sources</TableHead>
            <TableHead>Last verified</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.jurisdictionName}</TableCell>
              <TableCell>Tier {r.tier}</TableCell>
              <TableCell>
                {r.primarySourceUrls.length || <span className="text-yellow-600">None (gap)</span>}
              </TableCell>
              <TableCell>{r.lastVerifiedDate ?? "Never"}</TableCell>
              <TableCell>
                <Badge className={r.isEnabled ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground"}>
                  {r.isEnabled ? "Monitored" : "Paused"}
                </Badge>
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setDraft({
                      id: r.id,
                      jurisdictionName: r.jurisdictionName,
                      tier: r.tier,
                      instrumentsTracked: r.instrumentsTracked ?? "",
                      urls: r.primarySourceUrls.join("\n"),
                      isEnabled: r.isEnabled,
                    })
                  }
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!draft} onOpenChange={() => setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit jurisdiction" : "Add jurisdiction"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="radar-name">Jurisdiction</Label>
                <Input
                  id="radar-name"
                  value={draft.jurisdictionName}
                  onChange={(e) => setDraft({ ...draft, jurisdictionName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Tier</Label>
                <Select value={String(draft.tier)} onValueChange={(v) => setDraft({ ...draft, tier: Number(v) })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Tier 1 (highest priority)</SelectItem>
                    <SelectItem value="2">Tier 2</SelectItem>
                    <SelectItem value="3">Tier 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="radar-instruments">Instruments tracked</Label>
                <Input
                  id="radar-instruments"
                  placeholder="e.g. AI Act, sector guidance, standards"
                  value={draft.instrumentsTracked}
                  onChange={(e) => setDraft({ ...draft, instrumentsTracked: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="radar-urls">Primary source URLs (one per line)</Label>
                <Textarea
                  id="radar-urls"
                  rows={4}
                  value={draft.urls}
                  onChange={(e) => setDraft({ ...draft, urls: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Official gazette, legislature or regulator pages. HTML/text only (PDFs are not read yet).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={draft.isEnabled} onCheckedChange={(v) => setDraft({ ...draft, isEnabled: v })} />
                <Label>Monitor this jurisdiction</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !draft?.jurisdictionName.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
