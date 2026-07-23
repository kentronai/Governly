"use client";

import { useCallback, useEffect, useState } from "react";
import { FileCheck2, ExternalLink, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createComplianceEvidence, deleteComplianceEvidence, getComplianceEvidence } from "@/lib/actions/compliance-evidence";
import { errorToast, successToast } from "@/lib/utils/toast";

type Control = { key: string; title: string };
type EvidenceRow = Awaited<ReturnType<typeof getComplianceEvidence>>[number];

const EVIDENCE_TYPES = [
  ["policy", "Policy"], ["pdf", "PDF"], ["word", "Word document"], ["link", "Link"],
  ["audit_report", "Audit report"], ["risk_report", "Risk report"],
  ["approval_record", "Approval record"], ["training_record", "Training record"],
] as const;

export function ComplianceEvidenceManager({
  tenant,
  policyId,
  controls,
  applicationId,
  organizationScope = false,
  onChanged,
}: {
  tenant: string;
  policyId: string;
  controls: Control[];
  applicationId?: string;
  organizationScope?: boolean;
  onChanged?: () => void | Promise<void>;
}) {
  const [rows, setRows] = useState<EvidenceRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [controlKey, setControlKey] = useState(controls[0]?.key ?? "");
  const [evidenceType, setEvidenceType] = useState("policy");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const refresh = useCallback(async () => {
    setRows(await getComplianceEvidence({ tenantSlugOrId: tenant, applicationId, policyId }));
  }, [tenant, applicationId, policyId]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (!controlKey && controls[0]) setControlKey(controls[0].key); }, [controls, controlKey]);

  const save = async () => {
    if (!controlKey || !name.trim() || (!url.trim() && !file)) {
      errorToast("Select a control, enter a name, and provide a file or URL");
      return;
    }
    setLoading(true);
    try {
      let fileContentBase64: string | undefined;
      if (file) {
        if (file.size > 8 * 1024 * 1024) throw new Error("Evidence files must be 8 MB or smaller");
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        fileContentBase64 = btoa(binary);
      }
      await createComplianceEvidence({
        tenantSlugOrId: tenant,
        applicationId: organizationScope ? null : applicationId,
        policyId,
        controlKey,
        scope: organizationScope ? "organization" : "application",
        evidenceType,
        name: name.trim(),
        externalUrl: url.trim() || undefined,
        fileName: file?.name,
        mimeType: file?.type,
        fileSize: file?.size,
        fileContentBase64,
      });
      setName(""); setUrl(""); setFile(null); setOpen(false);
      await refresh(); await onChanged?.();
      successToast("Evidence saved and mapped", "Compliance", "updated");
    } catch (error) {
      errorToast(error instanceof Error ? error.message : "Evidence upload failed");
    } finally { setLoading(false); }
  };

  const remove = async (id: string) => {
    setLoading(true);
    try {
      await deleteComplianceEvidence(tenant, id);
      await refresh(); await onChanged?.();
      successToast("Evidence removed", "Compliance", "updated");
    } catch (error) {
      errorToast(error instanceof Error ? error.message : "Unable to remove evidence");
    } finally { setLoading(false); }
  };

  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <div><p className="text-sm font-medium">{organizationScope ? "Organization evidence" : "Application evidence"}</p><p className="text-xs text-muted-foreground">{organizationScope ? "Inherited automatically by every application." : "Mapped directly to this application and control."}</p></div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button type="button" variant="outline" size="sm"><Plus className="mr-1 h-3.5 w-3.5" />Add evidence</Button></DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Add compliance evidence</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Mapped control</Label><Select value={controlKey} onValueChange={setControlKey}><SelectTrigger><SelectValue placeholder="Choose control" /></SelectTrigger><SelectContent>{controls.map((control) => <SelectItem key={control.key} value={control.key}>{control.title}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Evidence type</Label><Select value={evidenceType} onValueChange={setEvidenceType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EVIDENCE_TYPES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Evidence name</Label><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="AI governance policy v2" /></div>
            <div className="space-y-2"><Label>Secure HTTP(S) link (optional)</Label><Input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /></div>
            <div className="space-y-2"><Label htmlFor="evidence-file">File (PDF, Word, text, CSV or Excel; max 8 MB)</Label><Input id="evidence-file" type="file" accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />{file && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Upload className="h-3 w-3" />{file.name}</p>}</div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="button" onClick={save} disabled={loading}>{loading && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save evidence</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    {rows.length > 0 && <div className="divide-y rounded-lg border">{rows.map((row) => <div key={row.id} className="flex items-center gap-3 p-3 text-sm"><FileCheck2 className="h-4 w-4 shrink-0 text-emerald-600" /><div className="min-w-0 flex-1"><p className="truncate font-medium">{row.name}</p><div className="mt-1 flex flex-wrap gap-1"><Badge variant="secondary" className="text-[10px]">{row.scope}</Badge><Badge variant="outline" className="text-[10px]">{row.controlKey}</Badge></div></div>{row.externalUrl && <Button asChild variant="ghost" size="icon"><a href={row.externalUrl} target="_blank" rel="noreferrer" aria-label="Open evidence link"><ExternalLink className="h-4 w-4" /></a></Button>}{row.fileName && <Button asChild variant="ghost" size="sm"><a href={`/api/compliance-evidence/${row.id}`}>Download</a></Button>}<Button type="button" variant="ghost" size="icon" onClick={() => remove(row.id)} disabled={loading} aria-label="Delete evidence"><Trash2 className="h-4 w-4 text-red-500" /></Button></div>)}</div>}
  </div>;
}
