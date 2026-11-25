"use client";

import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RecordMetadata, type RecordMetadataProps } from "@/components/common/RecordMetadata";

/** Standard "View" dialog for a table row: key/value fields plus the Created/Modified block. */
export function RecordViewDialog({
  open,
  onClose,
  title,
  fields = [],
  meta,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  fields?: [string, ReactNode][];
  meta?: RecordMetadataProps;
  children?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="break-all">{title}</DialogTitle>
        </DialogHeader>
        {fields.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {fields.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="min-w-0 break-words">{value ?? "—"}</dd>
              </div>
            ))}
          </dl>
        )}
        {children}
        {meta && <RecordMetadata {...meta} />}
      </DialogContent>
    </Dialog>
  );
}
