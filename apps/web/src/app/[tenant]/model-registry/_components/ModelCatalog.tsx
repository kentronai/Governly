"use client";

import { useMemo, useState } from "react";
import { Check, ExternalLink, Eye, FileText, Plus, Wrench, Database, Brain, Trophy, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchableSelect } from "@/components/common/SearchableSelect";
import { RowActionsMenu } from "@/components/common/RowActionsMenu";
import Pagination from "@/components/common/pagination";
import { modelPageUrl } from "@/lib/llm-providers";
import { AddModelDialog } from "./AddModelDialog";
import { cn } from "@/lib/utils";
import type { CatalogModel } from "@/lib/server/model-catalog";

const TOP = 100;
const catalogPageUrl = (m: CatalogModel) =>
  modelPageUrl(m.registryProvider, m.registryProvider ? m.id.replace(`${m.registryProvider}/`, "") : m.id);
const FEATURES = [
  { key: "vision", label: "Vision", icon: Eye },
  { key: "tools", label: "Tools", icon: Wrench },
  { key: "pdf", label: "PDF", icon: FileText },
  { key: "caching", label: "Caching", icon: Database },
  { key: "reasoning", label: "Reasoning", icon: Brain },
] as const;
type FeatureKey = (typeof FEATURES)[number]["key"];

const fmtTokens = (n: number | null) =>
  n == null ? "—" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n);
const fmtPrice = (n: number | null) => (n == null ? "—" : `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`);
const fmtUsd = (n: number, d = 2) => `$${n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;

/** Monthly cost estimate (30 days) for a model at a given daily workload. */
export function estimateCost(m: Pick<CatalogModel, "inPerM" | "outPerM">, reqPerDay: number, inTok: number, outTok: number) {
  const input = (inTok * (m.inPerM ?? 0)) / 1e6;
  const output = (outTok * (m.outPerM ?? 0)) / 1e6;
  const perReq = input + output;
  return { input, output, perReq, perDay: perReq * reqPerDay, perMonth: perReq * reqPerDay * 30 };
}

function useProviderOptions(models: CatalogModel[]) {
  return useMemo(
    () => [
      { value: "all", label: "All providers" },
      ...Array.from(new Set(models.map((m) => m.provider)))
        .sort()
        .map((p) => ({ value: p, label: p })),
    ],
    [models],
  );
}

export function ModelCatalog({ models }: { models: CatalogModel[] }) {
  if (models.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          The model catalog could not be loaded. The server needs outbound access to raw.githubusercontent.com.
        </CardContent>
      </Card>
    );
  }
  return (
    <Tabs defaultValue="all" className="space-y-4">
      <TabsList>
        <TabsTrigger value="all">All models</TabsTrigger>
        <TabsTrigger value="calculator">Cost calculator</TabsTrigger>
        <TabsTrigger value="compare">Feature comparison</TabsTrigger>
      </TabsList>
      <TabsContent value="all"><AllModels models={models} /></TabsContent>
      <TabsContent value="calculator"><CostCalculator models={models} /></TabsContent>
      <TabsContent value="compare"><Compare models={models} /></TabsContent>
    </Tabs>
  );
}

function AllModels({ models }: { models: CatalogModel[] }) {
  const [q, setQ] = useState("");
  const [provider, setProvider] = useState("all");
  const [mode, setMode] = useState("all");
  const [feats, setFeats] = useState<FeatureKey[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<CatalogModel | null>(null);
  const providerOptions = useProviderOptions(models);
  const modeOptions = useMemo(
    () => [{ value: "all", label: "All modes" }, ...Array.from(new Set(models.map((m) => m.mode))).sort().map((m) => ({ value: m, label: m }))],
    [models],
  );

  const rows = useMemo(() => {
    const s = q.toLowerCase();
    return models.filter(
      (m) =>
        (provider === "all" || m.provider === provider) &&
        (mode === "all" || m.mode === mode) &&
        feats.every((f) => m[f]) &&
        (!s || m.id.toLowerCase().includes(s)),
    );
  }, [models, q, provider, mode, feats]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search models..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="w-64" />
        <SearchableSelect className="w-52" value={provider} onValueChange={(v) => { setProvider(v); setPage(1); }} options={providerOptions} />
        <SearchableSelect className="w-52" value={mode} onValueChange={(v) => { setMode(v); setPage(1); }} options={modeOptions} />
        {FEATURES.map(({ key, label, icon: Icon }) => (
          <Button
            key={key}
            size="sm"
            variant={feats.includes(key) ? "default" : "outline"}
            onClick={() => setFeats((f) => (f.includes(key) ? f.filter((x) => x !== key) : [...f, key]))}
          >
            <Icon className="h-3.5 w-3.5 mr-1.5" />
            {label}
          </Button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{rows.length.toLocaleString()} models</p>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead className="text-right">Context</TableHead>
              <TableHead className="text-right">$/1M in</TableHead>
              <TableHead className="text-right">$/1M out</TableHead>
              <TableHead>Features</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice((page - 1) * pageSize, page * pageSize).map((m) => (
              <TableRow key={m.id}>
                <TableCell className="text-muted-foreground">{m.provider}</TableCell>
                <TableCell className="font-medium">
                  {m.id}
                  {m.deprecation && (
                    <Badge variant="outline" className="ml-2 text-orange-600 border-orange-300">
                      deprecates {m.deprecation}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{m.mode}</TableCell>
                <TableCell className="text-right">{fmtTokens(m.maxInput)}</TableCell>
                <TableCell className="text-right">{fmtPrice(m.inPerM)}</TableCell>
                <TableCell className="text-right">{fmtPrice(m.outPerM)}</TableCell>
                <TableCell>
                  <div className="flex gap-1 text-muted-foreground">
                    {FEATURES.filter((f) => m[f.key]).map(({ key, label, icon: Icon }) => (
                      <Icon key={key} className="h-3.5 w-3.5" aria-label={label} />
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <RowActionsMenu
                    label={`Actions for ${m.id}`}
                    items={[
                      {
                        label: "View model page",
                        icon: ExternalLink,
                        hidden: !catalogPageUrl(m),
                        onSelect: () => window.open(catalogPageUrl(m)!, "_blank", "noopener,noreferrer"),
                      },
                      {
                        label: added.has(m.id) ? "Added to approved models" : "Add to approved models",
                        icon: added.has(m.id) ? Check : Plus,
                        disabled: added.has(m.id) || !m.registryProvider,
                        onSelect: () => setAdding(m),
                      },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {rows.length > 0 && (
        <Pagination
          page={page}
          setPage={setPage}
          totalPages={Math.max(1, Math.ceil(rows.length / pageSize))}
          pageSize={pageSize}
          setPageSize={(n) => { setPageSize(n); setPage(1); }}
        />
      )}
      <AddModelDialog
        model={adding}
        onClose={() => setAdding(null)}
        onAdded={(id) => setAdded((prev) => new Set(prev).add(id))}
      />
    </div>
  );
}

function CostCalculator({ models }: { models: CatalogModel[] }) {
  const [req, setReq] = useState(1000);
  const [inTok, setInTok] = useState(2000);
  const [outTok, setOutTok] = useState(500);
  const [provider, setProvider] = useState("all");
  const providerOptions = useProviderOptions(models);

  const rows = useMemo(
    () =>
      models
        .filter((m) => m.mode === "chat" && m.inPerM != null && m.outPerM != null && (m.inPerM > 0 || m.outPerM > 0))
        .filter((m) => provider === "all" || m.provider === provider)
        .map((m) => ({ m, c: estimateCost(m, req, inTok, outTok) }))
        .sort((a, b) => a.c.perReq - b.c.perReq),
    [models, req, inTok, outTok, provider],
  );

  const numField = (label: string, v: number, set: (n: number) => void) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" min={0} value={v} onChange={(e) => set(Math.max(0, Number(e.target.value) || 0))} className="w-36" />
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Cost calculator</CardTitle>
          <CardDescription>Estimate monthly spend across models for your expected usage. Only chat models with published pricing are shown.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          {numField("Requests/day", req, setReq)}
          {numField("Avg input tokens", inTok, setInTok)}
          {numField("Avg output tokens", outTok, setOutTok)}
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <SearchableSelect className="w-52" value={provider} onValueChange={setProvider} options={providerOptions} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Estimated costs ({req.toLocaleString()} req/day)</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Context</TableHead>
              <TableHead className="text-right">$/req</TableHead>
              <TableHead className="text-right">Input</TableHead>
              <TableHead className="text-right">Output</TableHead>
              <TableHead className="text-right">$/day</TableHead>
              <TableHead className="text-right">$/month</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, TOP).map(({ m, c }, i) => (
              <TableRow key={m.id} className={cn(i === 0 && "bg-green-500/5")}>
                <TableCell>{i < 3 ? <Trophy className={cn("h-4 w-4", i === 0 ? "text-yellow-500" : "text-muted-foreground")} /> : i + 1}</TableCell>
                <TableCell>
                  <span className="text-muted-foreground">{m.provider}/ </span>
                  <span className="font-medium">{m.modelId}</span>
                  {i === 0 && <Badge variant="outline" className="ml-2 text-green-600 border-green-300">cheapest</Badge>}
                </TableCell>
                <TableCell className="text-right">{fmtTokens(m.maxInput)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{fmtUsd(c.perReq, 6)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{fmtUsd(c.input * req, 4)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{fmtUsd(c.output * req, 4)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{fmtUsd(c.perDay, 4)}</TableCell>
                <TableCell className="text-right font-semibold">{fmtUsd(c.perMonth)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

const POPULAR = ["gpt-4o", "gpt-4o-mini", "claude-sonnet-4-5", "claude-haiku-4-5", "gemini/gemini-2.5-flash", "gemini/gemini-2.5-pro", "mistral/mistral-large-latest", "xai/grok-4.3"];
const MAX_COMPARE = 5;

function Compare({ models }: { models: CatalogModel[] }) {
  const byId = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const popular = POPULAR.filter((id) => byId.has(id));
  const [selected, setSelected] = useState<string[]>(popular.slice(0, 1));
  const [pick, setPick] = useState("");
  const options = useMemo(() => models.map((m) => ({ value: m.id, label: m.id })), [models]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < MAX_COMPARE ? [...s, id] : s));
  const cols = selected.map((id) => byId.get(id)!).filter(Boolean);

  const yes = (b: boolean) => (b ? <Check className="h-4 w-4 text-green-600 mx-auto" /> : <X className="h-4 w-4 text-muted-foreground mx-auto" />);
  const rows: [string, (m: CatalogModel) => React.ReactNode][] = [
    ["Provider", (m) => m.provider],
    ["Mode", (m) => m.mode],
    ["Max input tokens", (m) => fmtTokens(m.maxInput)],
    ["Max output tokens", (m) => fmtTokens(m.maxOutput)],
    ["Input $/1M tokens", (m) => fmtPrice(m.inPerM)],
    ["Output $/1M tokens", (m) => fmtPrice(m.outPerM)],
    ["Vision", (m) => yes(m.vision)],
    ["Function calling", (m) => yes(m.tools)],
    ["Parallel tools", (m) => yes(m.parallelTools)],
    ["PDF input", (m) => yes(m.pdf)],
    ["Prompt caching", (m) => yes(m.caching)],
    ["Reasoning", (m) => yes(m.reasoning)],
    ["Structured output", (m) => yes(m.jsonSchema)],
    ["Deprecation date", (m) => m.deprecation ?? "—"],
    ["Routable via gateway", (m) => yes(!!m.registryProvider)],
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Feature comparison</CardTitle>
          <CardDescription>Select up to {MAX_COMPARE} models to compare side by side.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {popular.map((id) => (
              <Button key={id} size="sm" variant={selected.includes(id) ? "default" : "outline"} onClick={() => toggle(id)}>
                {id}
              </Button>
            ))}
          </div>
          <SearchableSelect
            value={pick}
            onValueChange={(v) => { if (v) toggle(v); setPick(""); }}
            options={options}
            placeholder="Or search for any model..."
            searchPlaceholder="Search models..."
          />
        </CardContent>
      </Card>
      {cols.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                {cols.map((m) => (
                  <TableHead key={m.id} className="text-center">
                    <span className="inline-flex items-center gap-1">
                      {m.modelId}
                      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => toggle(m.id)} aria-label={`Remove ${m.id}`}>
                        <X className="h-3 w-3" />
                      </Button>
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(([label, render]) => (
                <TableRow key={label}>
                  <TableCell>{label}</TableCell>
                  {cols.map((m) => (
                    <TableCell key={m.id} className="text-center">{render(m)}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
