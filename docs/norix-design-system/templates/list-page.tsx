/**
 * NORIX canonical LIST PAGE.
 *
 * Section order is fixed and load-bearing:
 *   1. PageHeader (title + description + primary action)
 *   2. Search field, w-[400px]
 *   3. Table, with a colSpan empty-state row
 *   4. Stat strip
 *   5. Pagination (only when server-paged)
 *   6. Modals, mounted last
 *
 * Frame is `p-6`, stack is `space-y-6`. Do not change these.
 * Rename Receipt/receipts to your entity and delete what you don't need.
 */

"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/common/PageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { StatStrip } from "@/components/common/StatStrip";
import { DeleteConfirmationModal } from "@/components/common/DeleteConfirmationModal";
import Pagination from "@/components/common/Pagination";
import { successToast, errorToast } from "@/lib/utils/toast";

interface Receipt {
  id: string;
  vendor: string;
  reference: string;
  status: "processed" | "pending" | "failed";
  total: string;
  createdAt: string;
}

const COLUMN_COUNT = 6;

/** Healthy → secondary, neutral/terminal → outline, failure → destructive. */
const statusVariant = (status: Receipt["status"]) =>
  status === "processed"
    ? "secondary"
    : status === "failed"
      ? "destructive"
      : "outline";

export function ReceiptsList({ initialReceipts }: { initialReceipts: Receipt[] }) {
  const [receipts, setReceipts] = useState(initialReceipts);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [isPending, startTransition] = useTransition();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<Receipt | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return receipts.filter(
      (r) =>
        r.vendor.toLowerCase().includes(q) ||
        r.reference.toLowerCase().includes(q),
    );
  }, [receipts, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleDelete = () => {
    if (!selected) return;
    startTransition(async () => {
      try {
        await deleteReceipt(selected.id); // server action
        setReceipts((prev) => prev.filter((r) => r.id !== selected.id));
        successToast(null, "Receipt", "deleted");
        setIsDeleteOpen(false);
        setSelected(null);
      } catch (error) {
        errorToast(error);
      }
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receipts"
        description="Every receipt captured, parsed, and reconciled"
        action={
          <Button disabled={isPending}>
            <Plus className="h-4 w-4 mr-2" />
            Add Receipt
          </Button>
        }
      />

      <SearchInput
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder="Search receipts..."
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vendor</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={COLUMN_COUNT}
                className="text-center py-12 text-muted-foreground"
              >
                {search
                  ? "No receipts found"
                  : "No receipts yet. Add one to get started!"}
              </TableCell>
            </TableRow>
          ) : (
            visible.map((receipt) => (
              <TableRow key={receipt.id}>
                <TableCell className="font-medium">{receipt.vendor}</TableCell>
                <TableCell>
                  <code className="text-sm bg-muted px-2 py-1 rounded">
                    {receipt.reference}
                  </code>
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(receipt.status)}>
                    {receipt.status}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-nums">{receipt.total}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(receipt.createdAt).toLocaleDateString("en-US")}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Edit receipt"
                      disabled={isPending}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Delete receipt"
                      disabled={isPending}
                      onClick={() => {
                        setSelected(receipt);
                        setIsDeleteOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <StatStrip
        stats={[
          { label: "Total", value: receipts.length },
          {
            label: "Processed",
            value: receipts.filter((r) => r.status === "processed").length,
          },
          {
            label: "Failed",
            value: receipts.filter((r) => r.status === "failed").length,
          },
        ]}
      />

      <Pagination
        page={page}
        setPage={setPage}
        totalPages={totalPages}
        pageSize={pageSize}
        setPageSize={setPageSize}
        isLoading={isPending}
      />

      <DeleteConfirmationModal
        isOpen={isDeleteOpen}
        onClose={() => {
          setIsDeleteOpen(false);
          setSelected(null);
        }}
        onConfirm={handleDelete}
        isLoading={isPending}
        title="Delete Receipt"
        itemName={selected?.vendor ?? ""}
        itemType="receipt"
      />
    </div>
  );
}

/* --- The server component that wraps it ----------------------------------
 *
 * export default async function ReceiptsPage() {
 *   const receipts = await getReceipts();
 *   return (
 *     <div className="p-6">
 *       <ReceiptsList initialReceipts={receipts} />
 *     </div>
 *   );
 * }
 * ------------------------------------------------------------------------- */

declare function deleteReceipt(id: string): Promise<void>;
