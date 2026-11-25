"use client";

import { RecordMetadata, type RecordMetadataProps } from "@/components/common/RecordMetadata";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Copy, Eye, FileUp, Loader2, MoreHorizontal, Play, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteConfirmationModal } from "@/components/common/DeleteConfirmationModal";
import { PageHeader } from "@/components/common/PageHeader";
import { errorToast, successToast } from "@/lib/utils/toast";
import { getFormattedDateString } from "@/lib/utils/helpers";
import { DATASET_TEMPLATES, normalizeItems, type DatasetItem } from "@/lib/test-runs";
import { createDataset, deleteDataset, listDatasets } from "@/lib/actions/test-runs";

type Dataset = Awaited<ReturnType<typeof listDatasets>>[number];

export function ExpectedBadge({ expected }: { expected: DatasetItem["expected"] }) {
  return (
    <Badge
      variant="secondary"
      className={expected === "block" ? "bg-red-500/10 text-red-600" : "bg-green-500/10 text-green-600"}
    >
      {expected === "block" ? "Should block" : "Should allow"}
    </Badge>
  );
}

const counts = (items: DatasetItem[]) => {
  const block = items.filter((i) => i.expected === "block").length;
  return `${items.length} prompts · ${block} block · ${items.length - block} allow`;
};

function ItemsDialog({ title, items, meta, onClose }: { title: string; items: DatasetItem[] | null; meta?: RecordMetadataProps; onClose: () => void }) {
  return (
    <Dialog open={!!items} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {items && <DialogDescription>{counts(items)}</DialogDescription>}
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prompt</TableHead>
              <TableHead>Expected</TableHead>
              <TableHead>Reference answer</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items?.map((i, n) => (
              <TableRow key={n}>
                <TableCell className="whitespace-normal">{i.prompt}</TableCell>
                <TableCell>
                  <ExpectedBadge expected={i.expected} />
                </TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">{i.reference ?? "–"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {meta && <RecordMetadata {...meta} />}
      </DialogContent>
    </Dialog>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  applicationId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  applicationId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<DatasetItem[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setItems([]);
      setFileName("");
    }
  }, [open]);

  const readFile = async (file: File) => {
    try {
      let rows: Record<string, unknown>[];
      if (file.name.toLowerCase().endsWith(".json")) {
        const data = JSON.parse(await file.text());
        rows = Array.isArray(data) ? data : data?.items ?? data?.prompts ?? [];
      } else {
        const XLSX = await import("xlsx");
        const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
        rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: "", raw: false });
      }
      const parsed = normalizeItems(rows);
      if (!parsed.length) throw new Error("No rows with a 'prompt' column were found");
      setItems(parsed);
      setFileName(file.name);
      if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
    } catch (e: any) {
      errorToast(e?.message || "Could not read the file");
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await createDataset({ applicationId, name, description, items });
      if (!res.ok) throw new Error(res.error);
      successToast("", "", "", "Dataset created");
      onOpenChange(false);
      onCreated();
    } catch (e: any) {
      errorToast(e?.message || "Could not create the dataset");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload dataset</DialogTitle>
          <DialogDescription>
            JSON, CSV or Excel with one row per prompt. Columns: <code>prompt</code> (required),{" "}
            <code>expected</code> (<code>allow</code> or <code>block</code>, default allow) and an optional{" "}
            <code>reference</code> answer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ds-file">File</Label>
            <Input
              id="ds-file"
              type="file"
              accept=".json,.csv,.xlsx,.xls"
              onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
            />
            {fileName && <p className="text-sm text-muted-foreground">{fileName}: {counts(items)}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ds-name">Name</Label>
            <Input id="ds-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ds-desc">Description</Label>
            <Textarea id="ds-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !items.length || !name.trim()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create dataset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Datasets({ applicationId }: { applicationId: string }) {
  const { tenant } = useParams<{ tenant: string }>();
  const router = useRouter();
  const [datasets, setDatasets] = useState<Dataset[] | null>(null);
  const [tab, setTab] = useState("mine");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewing, setViewing] = useState<{ title: string; items: DatasetItem[]; meta?: RecordMetadataProps } | null>(null);
  const [deleting, setDeleting] = useState<Dataset | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    listDatasets(applicationId)
      .then(setDatasets)
      .catch((e) => errorToast(e?.message || "Could not load datasets"));
  }, [applicationId]);
  useEffect(load, [load]);

  const copyTemplate = async (t: (typeof DATASET_TEMPLATES)[number]) => {
    setBusy(t.id);
    try {
      const res = await createDataset({ applicationId, name: t.name, description: t.description, items: t.items });
      if (!res.ok) throw new Error(res.error);
      successToast("", "", "", `"${t.name}" added to My datasets`);
      load();
      setTab("mine");
    } catch (e: any) {
      errorToast(e?.message || "Could not copy the template");
    } finally {
      setBusy(null);
    }
  };

  const runHref = `/${tenant}/applications/${applicationId}/control-net/test-runs`;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Datasets"
        description="Sets of test prompts, each marked as should allow or should block. Run them in Test Runs to check your guardrails and answer quality."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={runHref}>
                <Play className="mr-2 h-4 w-4" />
                Test Runs
              </Link>
            </Button>
            <Button onClick={() => setUploadOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Upload dataset
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="mine">My datasets ({datasets?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="templates">Templates ({DATASET_TEMPLATES.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="mine">
          {datasets === null ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : datasets.length === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center text-muted-foreground">
              <FileUp className="mx-auto mb-3 h-8 w-8" />
              No datasets yet. Upload a file or start from a template.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dataset</TableHead>
                  <TableHead>Prompts</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datasets.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="font-medium">{d.name}</div>
                      {d.description && <div className="text-sm text-muted-foreground line-clamp-1">{d.description}</div>}
                    </TableCell>
                    <TableCell>{counts(d.items)}</TableCell>
                    <TableCell>{getFormattedDateString(d.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions for ${d.name}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewing({ title: d.name, items: d.items, meta: { createdBy: d.createdBy, createdAt: d.createdAt } })}>
                            <Eye className="mr-2 h-4 w-4" />
                            View prompts
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(runHref)}>
                            <Play className="mr-2 h-4 w-4" />
                            Run a test
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeleting(d)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="templates">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Prompts</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DATASET_TEMPLATES.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-sm text-muted-foreground">{t.description}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{t.category}</Badge>
                  </TableCell>
                  <TableCell>{counts(t.items)}</TableCell>
                  <TableCell className="text-right">
                    {busy === t.id ? (
                      <Loader2 className="ml-auto mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions for ${t.name}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewing({ title: t.name, items: t.items })}>
                            <Eye className="mr-2 h-4 w-4" />
                            Preview prompts
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => copyTemplate(t)}>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy to My datasets
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} applicationId={applicationId} onCreated={load} />
      <ItemsDialog title={viewing?.title ?? ""} items={viewing?.items ?? null} meta={viewing?.meta} onClose={() => setViewing(null)} />
      <DeleteConfirmationModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        isLoading={false}
        title="Delete dataset"
        itemName={deleting?.name ?? ""}
        itemType="dataset"
        onConfirm={async () => {
          if (!deleting) return;
          await deleteDataset(deleting.id).catch((e) => errorToast(e?.message || "Delete failed"));
          setDeleting(null);
          load();
        }}
      />
    </div>
  );
}
