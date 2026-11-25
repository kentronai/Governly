"use client";

import { LocalTime } from "@/components/common/LocalTime";
import { cn } from "@/lib/utils";

export interface RecordMetadataProps {
  /** Display name (already resolved) of who created the record. */
  createdBy?: string | null;
  createdAt?: string | Date | null;
  /** Display name (already resolved) of who last modified the record. */
  updatedBy?: string | null;
  updatedAt?: string | Date | null;
  className?: string;
}

/** Created by / created at / last modified by / modified at block for "View" screens. */
export function RecordMetadata({
  createdBy,
  createdAt,
  updatedBy,
  updatedAt,
  className,
}: RecordMetadataProps) {
  const items: [string, React.ReactNode][] = [
    ["Created by", createdBy || "—"],
    ["Created at", <LocalTime key="c" value={createdAt} fallback="—" />],
    ["Last modified by", updatedBy || "—"],
    ["Modified at", <LocalTime key="u" value={updatedAt} fallback="—" />],
  ];
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-4 rounded-lg border bg-muted/30 p-4 text-sm md:grid-cols-4",
        className,
      )}
    >
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
          <dd className="truncate">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default RecordMetadata;
