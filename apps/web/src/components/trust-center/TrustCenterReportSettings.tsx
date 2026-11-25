"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { errorToast, successToast } from "@/lib/utils/toast";
import { getTrustCenterSettings, publishTrainingPolicy, saveTrustCenterSettings } from "@/lib/actions/trust-center";
import { fmtDate, REPORT_FRAMEWORKS, type TrainingCategory, type TrustCenterSettings } from "@/lib/trust-center/report";

type Loaded = Awaited<ReturnType<typeof getTrustCenterSettings>>;
const EMPTY_POLICY = { policyId: "", version: "", effectiveDate: "", owner: "", statement: "", categories: [] as TrainingCategory[] };

/** Admin-editable report content that Governly has no other source for. */
export function TrustCenterReportSettings({ tenantSlug }: { tenantSlug: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [settings, setSettings] = useState<TrustCenterSettings>({});
  const [policy, setPolicy] = useState(EMPTY_POLICY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getTrustCenterSettings(tenantSlug)
      .then((r) => {
        setLoaded(r);
        setSettings(r.settings);
        if (r.trainingPolicy) {
          const p = r.trainingPolicy;
          setPolicy({ policyId: p.policyId, version: p.version, effectiveDate: p.effectiveDate, owner: p.owner, statement: p.statement, categories: p.categories });
        }
      })
      .catch(errorToast);
  }, [tenantSlug]);

  if (!loaded) return null;
  const readOnly = !loaded.isAdmin;
  const set = (patch: Partial<TrustCenterSettings>) => setSettings((s) => ({ ...s, ...patch }));
  const setFw = (key: string, field: string, value: string) =>
    set({ frameworks: { ...settings.frameworks, [key]: { ...settings.frameworks?.[key], [field]: value } } });
  const setSp = (slug: string, field: string, value: string) =>
    set({ subprocessors: { ...settings.subprocessors, [slug]: { ...settings.subprocessors?.[slug], [field]: value } } });
  const setCat = (i: number, patch: Partial<TrainingCategory>) =>
    setPolicy((p) => ({ ...p, categories: p.categories.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  const save = async () => {
    setSaving(true);
    try {
      await saveTrustCenterSettings(tenantSlug, settings);
      successToast(null, "Trust Center settings", "updated");
    } catch (e) {
      errorToast(e instanceof Error ? e.message : e);
    } finally {
      setSaving(false);
    }
  };
  const publish = async () => {
    setSaving(true);
    try {
      const row = await publishTrainingPolicy(tenantSlug, policy);
      setLoaded({ ...loaded, trainingPolicy: row });
      successToast(null, "Training policy", "published", `Training policy version ${row.version} published`);
    } catch (e) {
      errorToast(e instanceof Error ? e.message : e);
    } finally {
      setSaving(false);
    }
  };

  const text = (id: string, label: string, value: string | undefined, onChange: (v: string) => void, placeholder?: string) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );

  return (
    <fieldset disabled={readOnly || saving} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Customer data training policy</CardTitle>
          <CardDescription>
            {loaded.trainingPolicy
              ? `Current: ${loaded.trainingPolicy.policyId} version ${loaded.trainingPolicy.version}, effective ${fmtDate(loaded.trainingPolicy.effectiveDate)}. Publishing creates a new version; earlier versions are kept.`
              : "No policy published yet. The report shows the latest published version."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            {text("tp-id", "Policy ID", policy.policyId, (v) => setPolicy({ ...policy, policyId: v }), "AIP-DATA-004")}
            {text("tp-version", "Version", policy.version, (v) => setPolicy({ ...policy, version: v }), "2.3")}
            <div className="space-y-1">
              <Label htmlFor="tp-date">Effective date</Label>
              <Input id="tp-date" type="date" value={policy.effectiveDate} onChange={(e) => setPolicy({ ...policy, effectiveDate: e.target.value })} />
            </div>
            {text("tp-owner", "Owner", policy.owner, (v) => setPolicy({ ...policy, owner: v }), "Chief Privacy Officer")}
          </div>
          <div className="space-y-1">
            <Label htmlFor="tp-statement">Policy statement</Label>
            <Textarea id="tp-statement" rows={3} value={policy.statement} onChange={(e) => setPolicy({ ...policy, statement: e.target.value })} />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data category</TableHead>
                <TableHead>Used for model training</TableHead>
                <TableHead>Conditions</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {policy.categories.map((c, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Input aria-label="Data category" value={c.category} onChange={(e) => setCat(i, { category: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Input aria-label="Used for model training" value={c.usedForTraining} placeholder="No / Yes / Only with written opt-in" onChange={(e) => setCat(i, { usedForTraining: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Input aria-label="Conditions" value={c.conditions} onChange={(e) => setCat(i, { conditions: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" aria-label="Remove category" onClick={() => setPolicy({ ...policy, categories: policy.categories.filter((_, j) => j !== i) })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setPolicy({ ...policy, categories: [...policy.categories, { category: "", usedForTraining: "No", conditions: "" }] })}>
              <Plus className="mr-2 h-4 w-4" />
              Add data category
            </Button>
            <Button onClick={publish}>Publish new version</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Governance, contacts and methodology</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {text("g-privacy", "Privacy contact", settings.privacyContact, (v) => set({ privacyContact: v }), "privacy@example.com")}
          {text("g-security", "Security contact", settings.securityContact, (v) => set({ securityContact: v }), "security@example.com")}
          {text("g-ai", "AI governance contact", settings.aiGovernanceContact, (v) => set({ aiGovernanceContact: v }), "ai-governance@example.com")}
          {text("g-cadence", "Review cadence", settings.reviewCadence, (v) => set({ reviewCadence: v }), "Quarterly")}
          {text("g-next", "Next scheduled review", settings.nextReview, (v) => set({ nextReview: v }), "December 2026")}
          <div className="space-y-1 md:col-span-3">
            <Label htmlFor="g-method">Methodology (leave empty for the Governly default)</Label>
            <Textarea id="g-method" rows={2} value={settings.methodology ?? ""} onChange={(e) => set({ methodology: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Framework alignment</CardTitle>
          <CardDescription>
            Empty fields use the Governly requirements tracker. Frameworks that are not enabled show as Not applicable; give the reason here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Framework</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Evidence reference</TableHead>
                <TableHead>Last assessed</TableHead>
                <TableHead>Not applicable reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {REPORT_FRAMEWORKS.map((f) => {
                const o = settings.frameworks?.[f.key] ?? {};
                return (
                  <TableRow key={f.key}>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell>
                      <Input aria-label={`${f.name} status`} value={o.status ?? ""} placeholder="Automatic" onChange={(e) => setFw(f.key, "status", e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <Input aria-label={`${f.name} evidence`} value={o.evidence ?? ""} placeholder="Automatic" onChange={(e) => setFw(f.key, "evidence", e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <Input aria-label={`${f.name} last assessed`} type="date" value={o.lastAssessed ?? ""} onChange={(e) => setFw(f.key, "lastAssessed", e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <Input aria-label={`${f.name} not applicable reason`} value={o.notApplicableReason ?? ""} placeholder="e.g. We do not process PHI" onChange={(e) => setFw(f.key, "notApplicableReason", e.target.value)} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sub-processors</CardTitle>
          <CardDescription>
            Sub-processors are the vendors you track in Trust Dossier. Untracked vendors are kept as previously used.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!loaded.vendors.length ? (
            <p className="text-sm text-muted-foreground">No vendors tracked yet. Track vendors under Admin Center &gt; Trust Dossier.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Data processed</TableHead>
                  <TableHead>Processing locations</TableHead>
                  <TableHead>DPA signed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loaded.vendors.map((v) => {
                  const o = settings.subprocessors?.[v.slug] ?? {};
                  return (
                    <TableRow key={v.slug}>
                      <TableCell className="font-medium">{v.name}</TableCell>
                      <TableCell>
                        <Input aria-label={`${v.name} service`} value={o.service ?? ""} placeholder="From Trust Dossier" onChange={(e) => setSp(v.slug, "service", e.target.value)} />
                      </TableCell>
                      <TableCell>
                        <Input aria-label={`${v.name} data processed`} value={o.dataProcessed ?? ""} onChange={(e) => setSp(v.slug, "dataProcessed", e.target.value)} />
                      </TableCell>
                      <TableCell>
                        <Input aria-label={`${v.name} locations`} value={o.locations ?? ""} placeholder="From Trust Dossier" onChange={(e) => setSp(v.slug, "locations", e.target.value)} />
                      </TableCell>
                      <TableCell>
                        <Select value={o.dpaSigned ?? ""} onValueChange={(val) => setSp(v.slug, "dpaSigned", val)}>
                          <SelectTrigger aria-label={`${v.name} DPA signed`} className="w-32">
                            <SelectValue placeholder="Not recorded" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Yes">Yes</SelectItem>
                            <SelectItem value="No">No</SelectItem>
                            <SelectItem value="In negotiation">In negotiation</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!readOnly && (
        <div className="flex justify-end">
          <Button onClick={save}>Save report settings</Button>
        </div>
      )}
    </fieldset>
  );
}
