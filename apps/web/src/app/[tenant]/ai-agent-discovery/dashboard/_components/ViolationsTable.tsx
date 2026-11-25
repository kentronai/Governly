"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RowActionsMenu } from "@/components/common/RowActionsMenu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Pagination from "@/components/common/pagination";

export interface ViolationRow {
  key: string;
  agent: string;
  reason: string;
  description: string;
  detectedAt: string;
  href: string | null;
}

export function ViolationsTable({ rows }: { rows: ViolationRow[] }) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visible = rows.slice((page - 1) * pageSize, page * pageSize);
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14">#</TableHead>
            <TableHead>Agent</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Detected</TableHead>
            <TableHead className="w-16 text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                No policy violations.
              </TableCell>
            </TableRow>
          ) : (
            visible.map((row, i) => (
              <TableRow key={row.key}>
                <TableCell className="text-muted-foreground">{(page - 1) * pageSize + i + 1}</TableCell>
                <TableCell className="font-medium">{row.agent}</TableCell>
                <TableCell>
                  <Badge variant="destructive">{row.reason}</Badge>
                </TableCell>
                <TableCell className="max-w-md truncate text-muted-foreground" title={row.description}>
                  {row.description}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {new Date(row.detectedAt).toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  <RowActionsMenu
                    label="Violation actions"
                    items={[{ label: "View", icon: Eye, onSelect: () => row.href && router.push(row.href), disabled: !row.href }]}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <div className="border-t p-3">
        <Pagination
          page={page}
          setPage={setPage}
          totalPages={totalPages}
          pageSize={pageSize}
          setPageSize={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>
    </>
  );
}
