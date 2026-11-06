"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock, Eye, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visible = rows.slice((page - 1) * pageSize, page * pageSize);
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Agent</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-16 text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                No policy violations.
              </TableCell>
            </TableRow>
          ) : (
            visible.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="font-medium">{row.agent}</TableCell>
                <TableCell>
                  <Badge variant="destructive">{row.reason}</Badge>
                </TableCell>
                <TableCell className="max-w-md truncate text-muted-foreground" title={row.description}>
                  {row.description}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Violation actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel className="flex items-center gap-2 font-normal text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        Detected {new Date(row.detectedAt).toLocaleString()}
                      </DropdownMenuLabel>
                      {row.href ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <Link href={row.href}>
                              <Eye className="mr-2 h-4 w-4" />
                              View agent
                            </Link>
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
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
