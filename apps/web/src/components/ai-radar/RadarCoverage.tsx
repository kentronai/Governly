"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MoreHorizontal, Pencil, Plus, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import Pagination from "@/components/common/pagination";
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
  region: string;
  country: string;
  state: string;
  urls: string;
  isEnabled: boolean;
};
const EMPTY: Draft = {
  jurisdictionName: "",
  tier: 2,
  instrumentsTracked: "",
  region: "",
  country: "",
  state: "",
  urls: "",
  isEnabled: true,
};

/** The coverage registry: a jurisdiction not listed here is unmonitored. */
export function RadarCoverage() {
  const { tenant } = useTenant();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<string>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const load = useCallback(
    () => listRadarCoverage().then(setRows).catch((e) => { errorToast(e); setRows([]); }),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => setPage(1), [query, region]);

  const save = async () => {
    if (!draft || !tenant) return;
    setSaving(true);
    try {
      await saveRadarCoverage(tenant.slug, {
        id: draft.id,
        jurisdictionName: draft.jurisdictionName,
        tier: draft.tier,
        instrumentsTracked: draft.instrumentsTracked,
        region: draft.region,
        country: draft.country,
        state: draft.state,
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

  const monitoring = rows.filter((r) => r.isEnabled && r.primarySourceUrls.length > 0).length;
  const regions = [...new Set(rows.map((r) => r.region).filter(Boolean))].sort() as string[];
  const q = query.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (!region || r.region === region) &&
      `${r.jurisdictionName} ${r.country ?? ""}`.toLowerCase().includes(q),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  const edit = (r: Row) =>
    setDraft({
      id: r.id,
      jurisdictionName: r.jurisdictionName,
      tier: r.tier,
      instrumentsTracked: r.instrumentsTracked ?? "",
      region: r.region ?? "",
      country: r.country ?? "",
      state: r.state ?? "",
      urls: r.primarySourceUrls.join("\n"),
      isEnabled: r.isEnabled,
    });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="relative min-w-[240px] flex-[2]">
          <Input
            type="search"
            placeholder="Search jurisdictions"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
          />
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        <div className="min-w-[160px] flex-1">
          <Select value={region ?? "all"} onValueChange={(v) => setRegion(v === "all" ? undefined : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by Region" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              {regions.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {(query || region) && (
          <Button
            variant="ghost"
            onClick={() => {
              setQuery("");
              setRegion(undefined);
            }}
            className="flex items-center gap-2 text-muted-foreground"
          >
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
        <Button onClick={() => setDraft(EMPTY)}>
          <Plus className="mr-2 h-4 w-4" />
          Add jurisdiction
        </Button>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        {monitoring} of {rows.length} jurisdictions are being monitored. Tier 1 = priority markets, checked first.
      </p>

      {!filtered.length ? (
        <div className="py-12 text-center">
          <p>No jurisdictions found</p>
          <p className="text-sm text-muted-foreground">Try adjusting your search or filters</p>
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jurisdiction</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Sources</TableHead>
                <TableHead>Last verified</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <TableRow key={r.id} className="h-10">
                  <TableCell className="max-w-[260px] truncate font-medium">{r.jurisdictionName}</TableCell>
                  <TableCell>{r.region ?? "N/A"}</TableCell>
                  <TableCell>Tier {r.tier}</TableCell>
                  <TableCell>{r.primarySourceUrls.length || "N/A"}</TableCell>
                  <TableCell>{r.lastVerifiedDate ?? "Never"}</TableCell>
                  <TableCell>
                    {!r.isEnabled ? (
                      <Badge className="bg-muted text-muted-foreground">Paused</Badge>
                    ) : r.primarySourceUrls.length > 0 ? (
                      <Badge className="bg-green-500/10 text-green-500">Monitoring</Badge>
                    ) : r.discoveryAttemptedAt ? (
                      <Badge className="bg-red-500/10 text-red-500">No source found</Badge>
                    ) : (
                      <Badge className="bg-yellow-500/10 text-yellow-600">Finding sources</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-transparent">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[152px]">
                        <DropdownMenuItem
                          onClick={() => edit(r)}
                          className="flex cursor-pointer items-center gap-2 text-sm font-normal"
                        >
                          <Pencil size={15} />
                          Edit
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-6">
            <Pagination
              page={page}
              setPage={setPage}
              totalPages={totalPages}
              pageSize={pageSize}
              setPageSize={setPageSize}
            />
          </div>
        </>
      )}

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
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="radar-region">Region</Label>
                  <Input id="radar-region" placeholder="e.g. Europe" value={draft.region} onChange={(e) => setDraft({ ...draft, region: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="radar-country">Country</Label>
                  <Input id="radar-country" placeholder="Defaults to jurisdiction" value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="radar-state">State</Label>
                  <Input id="radar-state" placeholder="Sub-national only" value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })} />
                </div>
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">
                Region, country and state decide which filters the policies Radar finds appear under.
              </p>
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
