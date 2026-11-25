"use client";

import { useEffect, useState } from "react";
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
  // Raw Clerk ids ("user_…") are resolved to a name/email here so every View can pass the column as-is.
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    const ids = [createdBy, updatedBy].filter((v): v is string => !!v && v.startsWith("user_"));
    // Lazy import keeps the server-action graph out of client bundles/tests that never see raw ids.
    if (ids.length)
      import("@/lib/actions/users")
        .then((m) => m.getUserDisplayNames(ids))
        .then(setNames)
        .catch(() => {});
  }, [createdBy, updatedBy]);
  const who = (v?: string | null) => (v ? names[v] ?? v : v);
  const items: [string, React.ReactNode][] = [
    ["Created by", who(createdBy) || "—"],
    ["Created at", <LocalTime key="c" value={createdAt} fallback="—" />],
    ["Last modified by", who(updatedBy) || "—"],
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
