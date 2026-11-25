"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Building2, CalendarDays, CheckCircle2, ExternalLink,
  Download, FileSearch, Globe2, Landmark, Loader2, MapPin, Search, ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";
import { successToast, errorToast } from "@/lib/utils/toast";
import { useTenant } from "@/contexts/TenantContext";
import { ComplianceTabs } from "@/components/frameworks/ComplianceTabs";
import { LibraryStats } from "@/components/frameworks/LibraryStats";
import { fetchPolicyCenterPolicies, updatePolicyCenterPolicyStatus } from "@/lib/api/policy-center";
import type { PolicyPack } from "./type";
import { ComplianceEvidenceManager } from "@/components/compliance/ComplianceEvidenceManager";
import { getControlDefinition } from "@/lib/server/compliance/control-catalog";

import { PageTitle } from "@/components/common/PageHeader";
const ALL = "__all__";

function toPolicy(data: any): PolicyPack {
  return {
    id: data.id, name: data.name, description: data.description ?? "", category: data.category ?? "Guideline",
    country: data.country ?? "International", state: data.state ?? undefined,
    projectsCompliant: data.projectsCompliant ?? 0, totalProjects: data.totalProjects ?? 0,
    isActive: Boolean(data.isActive), tags: Array.isArray(data.tags) ? data.tags : [], icon: data.icon ?? "POL",
    color: data.color ?? "bg-slate-700", type: data.type ?? "", disable: Boolean(data.disable),
    fullDescription: data.fullDescription, purpose: data.purpose, scope: data.scope,
    requirements: Array.isArray(data.requirements) ? data.requirements : [],
    riskCategories: Array.isArray(data.riskCategories) ? data.riskCategories : [],
    industriesAffected: Array.isArray(data.industriesAffected) ? data.industriesAffected : [],
    governingAuthority: data.governingAuthority, effectiveDate: data.effectiveDate, version: data.version,
    legalStatus: data.legalStatus, officialUrl: data.officialUrl,
    references: Array.isArray(data.references) ? data.references : [],
    controlMappings: Array.isArray(data.controlMappings) ? data.controlMappings : [],
    applicabilityRules: Array.isArray(data.applicabilityRules) ? data.applicabilityRules : [],
    metadata: data.metadata && typeof data.metadata === "object" ? data.metadata : null,
  };
}

const categoryTone: Record<string, string> = {
  "AI Regulation": "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300",
  Standard: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300",
  Framework: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  Guideline: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300",
};

export default function CompliancePolicyCenterPage() {
  const [policies, setPolicies] = useState<PolicyPack[]>([]);
  const [catalog, setCatalog] = useState<PolicyPack[]>([]);
  const [selected, setSelected] = useState<PolicyPack | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [country, setCountry] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [requirementType, setRequirementType] = useState(ALL);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const { tenant, refreshPolicyStatus } = useTenant();

  const loadCatalog = useCallback(async () => {
    const data = await fetchPolicyCenterPolicies();
    setCatalog(data.map(toPolicy));
  }, []);

  const loadPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPolicyCenterPolicies({
        search: debouncedSearch || undefined,
        country: country === ALL ? undefined : country,
        category: category === ALL ? undefined : category,
        active: status === ALL ? undefined : status,
        type: requirementType === ALL ? undefined : requirementType,
      });
      setPolicies(data.map(toPolicy));
    } catch {
      errorToast("Unable to load compliance policies");
    } finally {
      setLoading(false);
    }
  }, [category, country, debouncedSearch, requirementType, status]);

  useEffect(() => { loadCatalog().catch(() => errorToast("Unable to load policy filters")); }, [loadCatalog]);
  useEffect(() => { loadPolicies(); }, [loadPolicies]);

  const countries = useMemo(() => [...new Set(catalog.map((p) => p.country).filter(Boolean))].sort(), [catalog]);
  const categories = useMemo(() => [...new Set(catalog.map((p) => p.category).filter(Boolean))].sort(), [catalog]);

  const togglePolicy = async (policy: PolicyPack, enabled: boolean) => {
    setToggling(policy.id);
    setPolicies((current) => current.map((item) => item.id === policy.id ? { ...item, isActive: enabled } : item));
    setCatalog((current) => current.map((item) => item.id === policy.id ? { ...item, isActive: enabled } : item));
    if (selected?.id === policy.id) setSelected({ ...selected, isActive: enabled });
    try {
      await updatePolicyCenterPolicyStatus(policy.id, enabled);
      await refreshPolicyStatus();
      successToast(`Policy ${enabled ? "enabled" : "disabled"}`, policy.name, "updated");
    } catch {
      setPolicies((current) => current.map((item) => item.id === policy.id ? { ...item, isActive: !enabled } : item));
      setCatalog((current) => current.map((item) => item.id === policy.id ? { ...item, isActive: !enabled } : item));
      if (selected?.id === policy.id) setSelected({ ...selected, isActive: !enabled });
      errorToast("Unable to update policy status");
    } finally {
      setToggling(null);
    }
  };

  const resetFilters = () => { setSearch(""); setCountry(ALL); setCategory(ALL); setStatus(ALL); setRequirementType(ALL); };
  const hasFilters = Boolean(search) || [country, category, status, requirementType].some((value) => value !== ALL);

  return <><ComplianceTabs /><div className="min-h-full w-full bg-background p-5 lg:p-7">
    <div className="w-full space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><ShieldCheck className="h-4 w-4" />Compliance library</div>
          <PageTitle>Regulations</PageTitle>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Explore, understand and enable authoritative AI regulations, standards, frameworks and guidelines for application governance.</p>
        </div>
        <LibraryStats libraryCount={catalog.length} libraryLabel="Policies in library" enabledCount={catalog.filter((item) => item.isActive).length} />
      </header>

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.4fr)_repeat(4,minmax(150px,1fr))_auto]">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, description, country or authority…" className="pl-9" /></div>
          <PolicySelect value={country} onChange={setCountry} label="Country" options={countries} />
          <PolicySelect value={category} onChange={setCategory} label="Regulation type" options={categories} />
          <PolicySelect value={status} onChange={setStatus} label="Status" options={["enabled", "disabled"]} format={(v) => v[0].toUpperCase() + v.slice(1)} />
          <PolicySelect value={requirementType} onChange={setRequirementType} label="Mandatory / Voluntary" options={["Mandatory", "Voluntary"]} />
          <Button variant="ghost" disabled={!hasFilters} onClick={resetFilters}>Reset</Button>
        </div>
      </section>

      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{loading ? "Loading policy library…" : `${policies.length} ${policies.length === 1 ? "policy" : "policies"}`}</p><p className="text-xs text-muted-foreground">Disabled policies stay in existing mappings but cannot be assigned</p></div>

      {loading ? <div className="flex min-h-64 items-center justify-center rounded-xl border"><Loader2 className="mr-2 h-5 w-5 animate-spin" /><span className="text-sm text-muted-foreground">Loading policies</span></div>
      : policies.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border bg-card text-center"><FileSearch className="mb-3 h-9 w-9 text-muted-foreground" /><h2 className="font-semibold">No policies found</h2><p className="mt-1 text-sm text-muted-foreground">Adjust the filters or search terms.</p><Button variant="outline" className="mt-4" onClick={resetFilters}>Clear filters</Button></div>
      : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{policies.map((policy) =>
        <article key={policy.id} role="button" tabIndex={0} onClick={() => setSelected(policy)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelected(policy); }}
          className="group flex cursor-pointer items-center gap-3 rounded-lg border bg-card px-3 py-3 transition-colors hover:border-primary/40 hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary">
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-bold tracking-tight text-white", policy.color)}>{policy.icon}</div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold group-hover:text-primary">{policy.name}</h2>
            <p className="truncate text-xs text-muted-foreground">{policy.country}{policy.state ? ` · ${policy.state}` : ""} · {policy.type || "Voluntary"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2" onClick={(event) => event.stopPropagation()}>{toggling === policy.id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}<Switch checked={policy.isActive} disabled={policy.disable || toggling === policy.id} onCheckedChange={(enabled) => togglePolicy(policy, enabled)} aria-label={`${policy.isActive ? "Disable" : "Enable"} ${policy.name}`} /></div>
        </article>)}</div>}
    </div>

    <PolicyDetails tenant={tenant?.slug || tenant?.id || ""} policy={selected} onClose={() => setSelected(null)} onToggle={togglePolicy} toggling={toggling} />
  </div></>;
}

function PolicySelect({ value, onChange, label, options, format = (value) => value }: { value: string; onChange: (value: string) => void; label: string; options: string[]; format?: (value: string) => string }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue placeholder={label} /></SelectTrigger><SelectContent><SelectItem value={ALL}>All {label === "Mandatory / Voluntary" ? "obligations" : label.toLowerCase()}</SelectItem>{options.map((option) => <SelectItem key={option} value={option}>{format(option)}</SelectItem>)}</SelectContent></Select>;
}

function PolicyDetails({ tenant, policy, onClose, onToggle, toggling }: { tenant: string; policy: PolicyPack | null; onClose: () => void; onToggle: (policy: PolicyPack, enabled: boolean) => Promise<void>; toggling: string | null }) {
  const requirements = policy?.requirements ?? []; const risks = policy?.riskCategories ?? []; const industries = policy?.industriesAffected ?? []; const references = policy?.references ?? []; const controls = policy?.controlMappings ?? [];
  const downloadChecklist = () => {
    if (!policy) return;
    const header = ["Control", "Requirement", "Required", "Mapped Norix field", "Required evidence", "Implementation guidance"];
    const rows = controls.map((control) => { const definition = getControlDefinition(control.key); return [control.key, control.title, control.required === false ? "No" : "Yes", definition.mappedField, definition.requiredEvidence.join("; "), definition.implementationGuidance]; });
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${policy.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-evidence-checklist.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  return <Dialog open={Boolean(policy)} onOpenChange={(open) => !open && onClose()}><DialogContent
    className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-4xl"
    onEscapeKeyDown={(event) => event.preventDefault()}
    onInteractOutside={(event) => event.preventDefault()}
    onPointerDownOutside={(event) => event.preventDefault()}
  >
    {policy && <div className="flex max-h-[90vh] flex-col"><DialogHeader className="shrink-0 border-b p-5 pr-12"><div className="flex items-start gap-4"><div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white", policy.color)}>{policy.icon}</div><div className="min-w-0"><DialogTitle className="text-xl leading-tight">{policy.name}</DialogTitle><DialogDescription className="mt-1">{policy.governingAuthority}</DialogDescription><div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline" className={categoryTone[policy.category] ?? categoryTone.Guideline}>{policy.category}</Badge><Badge variant="outline">{policy.country}{policy.state ? ` · ${policy.state}` : ""}</Badge><Badge variant="outline">{policy.type}</Badge></div></div></div></DialogHeader>
      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        {(policy.metadata as any)?.citationWarning && <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" /><p>This citation is commonly confused with an AI bill. Review the official source and the clarification below before mapping controls.</p></div>}
        <DetailSection title="Overview"><p className="text-sm leading-6 text-muted-foreground">{policy.fullDescription || policy.description}</p></DetailSection>
        <div className="grid gap-4 sm:grid-cols-2"><DetailSection title="Purpose"><p className="text-sm leading-6 text-muted-foreground">{policy.purpose || "Not specified"}</p></DetailSection><DetailSection title="Scope"><p className="text-sm leading-6 text-muted-foreground">{policy.scope || "Not specified"}</p></DetailSection></div>
        <DetailSection title="Core requirements"><BulletList items={requirements} /></DetailSection>
        <DetailSection title="Automated Norix evidence checks">
          {controls.length ? <div className="space-y-3"><Button type="button" variant="outline" size="sm" onClick={downloadChecklist}><Download className="mr-1.5 h-4 w-4" />Download evidence checklist</Button><ul className="space-y-3">{controls.map((control) => { const definition = getControlDefinition(control.key); return <li key={control.key} className="rounded-lg border p-3 text-sm"><div className="flex gap-2 font-medium"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{control.title}{control.required === false ? " (optional)" : ""}</span></div><p className="mt-2 text-xs text-muted-foreground"><strong>Mapped field:</strong> {definition.mappedField}</p><p className="mt-1 text-xs text-muted-foreground"><strong>Evidence:</strong> {definition.requiredEvidence.join("; ")}</p><p className="mt-1 text-xs text-muted-foreground"><strong>Guidance:</strong> {definition.implementationGuidance}</p></li>; })}</ul></div> : <p className="text-sm text-muted-foreground">No automated controls apply to this entry. Review the applicability notice above.</p>}
        </DetailSection>
        {tenant && controls.length > 0 && <DetailSection title="Inherited evidence"><ComplianceEvidenceManager tenant={tenant} policyId={policy.id} controls={controls} organizationScope /></DetailSection>}
        <div className="grid gap-4 sm:grid-cols-2"><DetailSection title="Risk categories"><TagList items={risks} /></DetailSection><DetailSection title="Industries affected"><TagList items={industries} /></DetailSection></div>
        <DetailSection title="Policy information"><div className="grid gap-x-6 sm:grid-cols-2"><InfoRow icon={Globe2} label="Country / region" value={`${policy.country}${policy.state ? ` · ${policy.state}` : ""}`} /><InfoRow icon={Landmark} label="Governing authority" value={policy.governingAuthority || "Not specified"} /><InfoRow icon={CalendarDays} label="Effective / publication date" value={policy.effectiveDate ? new Date(`${policy.effectiveDate}T00:00:00`).toLocaleDateString() : "Not enacted / not specified"} /><InfoRow icon={ShieldCheck} label="Version" value={policy.version || "Not specified"} /><InfoRow icon={CheckCircle2} label="Legal status" value={policy.legalStatus || "Not specified"} /><InfoRow icon={Building2} label="Obligation" value={policy.type || "Not specified"} /></div></DetailSection>
        {policy.officialUrl && <DetailSection title="Official documentation"><a href={policy.officialUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm font-medium text-primary hover:bg-muted"><span className="truncate">{policy.officialUrl}</span><ExternalLink className="h-4 w-4 shrink-0" /></a></DetailSection>}
        {references.length > 0 && <DetailSection title="References"><div className="space-y-2">{references.map((reference) => <a key={reference.url} href={reference.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm hover:bg-muted"><span>{reference.title}</span><ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" /></a>)}</div></DetailSection>}
      </div>
      <div className="shrink-0 border-t p-5"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium">Policy assignment</p><p className="text-xs text-muted-foreground">{policy.isActive ? "Available to applications" : "Hidden from new application assignments"}</p></div><div className="flex items-center gap-2">{toggling === policy.id && <Loader2 className="h-4 w-4 animate-spin" />}<Switch checked={policy.isActive} disabled={toggling === policy.id} onCheckedChange={(enabled) => onToggle(policy, enabled)} /></div></div></div>
    </div>}
  </DialogContent></Dialog>;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) { return <section><h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>{children}</section>; }
function BulletList({ items }: { items: string[] }) { return items.length ? <ul className="space-y-2">{items.map((item) => <li key={item} className="flex gap-2 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>{item}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No requirements recorded.</p>; }
function TagList({ items }: { items: string[] }) { return items.length ? <div className="flex flex-wrap gap-2">{items.map((item) => <Badge key={item} variant="secondary">{item}</Badge>)}</div> : <p className="text-sm text-muted-foreground">Not specified.</p>; }
function InfoRow({ icon: Icon, label, value }: { icon: typeof Globe2; label: string; value: string }) { return <div className="flex gap-3 border-b py-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-medium">{value}</p></div></div>; }
