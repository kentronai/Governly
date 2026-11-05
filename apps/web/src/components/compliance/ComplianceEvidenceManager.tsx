"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FileCheck2,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createComplianceEvidence,
  deleteComplianceEvidence,
  getComplianceEvidence,
  updateComplianceEvidence,
} from "@/lib/actions/compliance-evidence";
import { errorToast, successToast } from "@/lib/utils/toast";

type Control = { key: string; title: string };
type EvidenceRow = Awaited<ReturnType<typeof getComplianceEvidence>>[number];

const EVIDENCE_TYPES = [
  ["policy", "Policy"],
  ["pdf", "PDF"],
  ["word", "Word document"],
  ["link", "Link"],
  ["audit_report", "Audit report"],
  ["risk_report", "Risk report"],
  ["approval_record", "Approval record"],
  ["training_record", "Training record"],
] as const;

const evidenceTypeLabel = (value: string) =>
  EVIDENCE_TYPES.find(([key]) => key === value)?.[1] ?? value;

export function ComplianceEvidenceManager({
  tenant,
  policyId,
  controls,
  applicationId,
  organizationScope = false,
  onChanged,
  addOpen,
  onAddOpenChange,
  mode = "full",
}: {
  tenant: string;
  policyId: string;
  /** Controls to map evidence to; the first one is preselected (pass open gaps first). */
  controls: Control[];
  applicationId?: string;
  organizationScope?: boolean;
  onChanged?: () => void | Promise<void>;
  /** Control the add-evidence dialog from a parent (e.g. a row action menu). */
  addOpen?: boolean;
  onAddOpenChange?: (open: boolean) => void;
  /** "add": only the add dialog. "list": evidence list with edit/delete, no add button. */
  mode?: "full" | "add" | "list";
}) {
  const [rows, setRows] = useState<EvidenceRow[]>([]);
  const [innerOpen, setInnerOpen] = useState(false);
  const open = addOpen ?? innerOpen;
  const setOpen = onAddOpenChange ?? setInnerOpen;
  const [loading, setLoading] = useState(false);
  const [controlKey, setControlKey] = useState(controls[0]?.key ?? "");
  const [evidenceType, setEvidenceType] = useState("policy");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [allApplications, setAllApplications] = useState(organizationScope);
  const [editing, setEditing] = useState<EvidenceRow | null>(null);

  const controlTitle = (key: string) =>
    controls.find((c) => c.key === key)?.title ?? key;

  const refresh = useCallback(async () => {
    setRows(
      await getComplianceEvidence({
        tenantSlugOrId: tenant,
        applicationId,
        policyId,
      }),
    );
  }, [tenant, applicationId, policyId]);
  useEffect(() => {
    if (mode !== "add") void refresh();
  }, [refresh, mode]);
  useEffect(() => {
    if (!controlKey && controls[0]) setControlKey(controls[0].key);
  }, [controls, controlKey]);

  const save = async () => {
    if (!controlKey || !name.trim() || (!url.trim() && !file)) {
      errorToast("Enter a name, and provide a file or URL");
      return;
    }
    setLoading(true);
    try {
      let fileContentBase64: string | undefined;
      if (file) {
        if (file.size > 8 * 1024 * 1024)
          throw new Error("Evidence files must be 8 MB or smaller");
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(
            ...bytes.subarray(offset, offset + 0x8000),
          );
        }
        fileContentBase64 = btoa(binary);
      }
      const orgWide = allApplications || !applicationId;
      await createComplianceEvidence({
        tenantSlugOrId: tenant,
        applicationId: orgWide ? null : applicationId,
        // Not tied to one policy: evidence is matched by control, so it counts
        // for every policy that maps this control.
        policyId: null,
        controlKey,
        scope: orgWide ? "organization" : "application",
        evidenceType,
        name: name.trim(),
        externalUrl: url.trim() || undefined,
        fileName: file?.name,
        mimeType: file?.type,
        fileSize: file?.size,
        fileContentBase64,
      });
      setName("");
      setUrl("");
      setFile(null);
      setOpen(false);
      if (mode !== "add") await refresh();
      await onChanged?.();
      successToast("Evidence saved", "Compliance", "updated");
    } catch (error) {
      errorToast(
        error instanceof Error ? error.message : "Evidence upload failed",
      );
    } finally {
      setLoading(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setLoading(true);
    try {
      await updateComplianceEvidence(tenant, editing.id, {
        name: editing.name,
        evidenceType: editing.evidenceType,
        controlKey: editing.controlKey,
        externalUrl: editing.externalUrl ?? undefined,
      });
      setEditing(null);
      await refresh();
      await onChanged?.();
      successToast("Evidence updated", "Compliance", "updated");
    } catch (error) {
      errorToast(
        error instanceof Error ? error.message : "Unable to update evidence",
      );
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string) => {
    setLoading(true);
    try {
      await deleteComplianceEvidence(tenant, id);
      await refresh();
      await onChanged?.();
      successToast("Evidence removed", "Compliance", "updated");
    } catch (error) {
      errorToast(
        error instanceof Error ? error.message : "Unable to remove evidence",
      );
    } finally {
      setLoading(false);
    }
  };

  const controlSelect = (value: string, onChange: (value: string) => void) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Choose control" />
      </SelectTrigger>
      <SelectContent>
        {controls.map((control) => (
          <SelectItem key={control.key} value={control.key}>
            {control.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const typeSelect = (value: string, onChange: (value: string) => void) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {EVIDENCE_TYPES.map(([key, label]) => (
          <SelectItem key={key} value={key}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const addDialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      {mode === "full" && (
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add evidence
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add compliance evidence</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Evidence name</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="AI governance policy v2"
            />
          </div>
          <div className="space-y-2">
            <Label>Evidence type</Label>
            {typeSelect(evidenceType, setEvidenceType)}
          </div>
          <div className="space-y-2">
            <Label>Covers control</Label>
            {controlSelect(controlKey, setControlKey)}
            <p className="text-xs text-muted-foreground">
              Counts for every policy that includes this control.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Secure HTTP(S) link (optional)</Label>
            <Input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="evidence-file">
              File (PDF, Word, text, CSV or Excel; max 8 MB)
            </Label>
            <Input
              id="evidence-file"
              type="file"
              accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Upload className="h-3 w-3" />
                {file.name}
              </p>
            )}
          </div>
          {applicationId && !organizationScope && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="evidence-all-apps"
                checked={allApplications}
                onCheckedChange={(checked) =>
                  setAllApplications(checked === true)
                }
              />
              <Label htmlFor="evidence-all-apps" className="font-normal">
                Use this evidence for all applications
              </Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={loading}>
            {loading && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (mode === "add") return addDialog;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Evidence</p>
          <p className="text-xs text-muted-foreground">
            Evidence added here counts for every policy that includes the same
            control.
          </p>
        </div>
        {mode === "full" && addDialog}
      </div>
      {rows.length === 0 && (
        <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          No evidence added yet. Use “Add evidence” from the row actions.
        </p>
      )}
      {rows.length > 0 && (
        <div className="divide-y rounded-lg border">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-3 p-3 text-sm">
              <FileCheck2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{row.name}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge variant="secondary">
                    {controlTitle(row.controlKey)}
                  </Badge>
                  <Badge variant="outline">
                    {evidenceTypeLabel(row.evidenceType)}
                  </Badge>
                  <Badge variant="outline">
                    {row.applicationId
                      ? "This application"
                      : "All applications"}
                  </Badge>
                </div>
              </div>
              {row.externalUrl && (
                <Button asChild variant="ghost" size="icon">
                  <a
                    href={row.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open evidence link"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
              {row.fileName && (
                <Button asChild variant="ghost" size="sm">
                  <a href={`/api/compliance-evidence/${row.id}`}>Download</a>
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setEditing({ ...row })}
                disabled={loading}
                aria-label="Edit evidence"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(row.id)}
                disabled={loading}
                aria-label="Delete evidence"
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={!!editing}
        onOpenChange={(value) => !value && setEditing(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit evidence</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Evidence name</Label>
                <Input
                  value={editing.name}
                  onChange={(event) =>
                    setEditing({ ...editing, name: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Evidence type</Label>
                {typeSelect(editing.evidenceType, (value) =>
                  setEditing({ ...editing, evidenceType: value }),
                )}
              </div>
              <div className="space-y-2">
                <Label>Covers control</Label>
                {controlSelect(editing.controlKey, (value) =>
                  setEditing({ ...editing, controlKey: value }),
                )}
              </div>
              <div className="space-y-2">
                <Label>Secure HTTP(S) link</Label>
                <Input
                  type="url"
                  value={editing.externalUrl ?? ""}
                  onChange={(event) =>
                    setEditing({ ...editing, externalUrl: event.target.value })
                  }
                  placeholder="https://…"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={saveEdit} disabled={loading}>
              {loading && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
