import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function CompactMetricCard({
  label,
  value,
  icon: Icon,
  tone = "text-foreground",
  loading = false,
  description,
  uppercaseLabel = false,
}: {
  label: string;
  value: number | undefined;
  icon: LucideIcon;
  tone?: string;
  loading?: boolean;
  description?: string;
  uppercaseLabel?: boolean;
}) {
  const displayValue = loading && value === undefined ? null : value;

  return (
    <Card
      className="min-w-0 gap-0 overflow-hidden py-0"
      title={description}
      aria-label={`${label}: ${displayValue === null ? "loading" : displayValue === undefined ? "unavailable" : displayValue}${description ? `. ${description}` : ""}`}
    >
      <CardContent className="flex min-h-[76px] items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p
            className={cn(
              "text-xs font-medium leading-4 text-muted-foreground",
              uppercaseLabel && "uppercase tracking-wide",
            )}
          >
            {label}
          </p>
          {displayValue === null ? (
            <div className="mt-1.5 h-6 w-10 animate-pulse rounded bg-muted" />
          ) : (
            <p
              className={cn(
                "mt-1.5 text-2xl font-semibold leading-none tabular-nums",
                tone,
              )}
            >
              {displayValue === undefined ? "—" : displayValue}
            </p>
          )}
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60">
          <Icon className={cn("h-4 w-4", tone)} aria-hidden="true" />
        </span>
      </CardContent>
    </Card>
  );
}
