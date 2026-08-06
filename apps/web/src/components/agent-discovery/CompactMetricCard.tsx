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
  /** Strings are accepted for pre-formatted values (percentages, currency, "12 ms"). */
  value: string | number | undefined;
  icon: LucideIcon;
  tone?: string;
  loading?: boolean;
  description?: string;
  uppercaseLabel?: boolean;
}) {
  const displayValue = loading && value === undefined ? null : value;

  return (
    <Card
      className="h-[68px] w-[160px] min-w-0 gap-0 overflow-hidden py-0"
      title={description}
      aria-label={`${label}: ${displayValue === null ? "loading" : displayValue === undefined ? "unavailable" : displayValue}${description ? `. ${description}` : ""}`}
    >
      <CardContent className="relative flex h-full items-center px-3 py-2">
        <div className="min-w-0 pr-8">
          <p
            className={cn(
              "truncate text-[11px] font-medium leading-4 text-muted-foreground",
              uppercaseLabel && "uppercase tracking-wide",
            )}
          >
            {label}
          </p>
          {displayValue === null ? (
            <div className="mt-1 h-5 w-9 animate-pulse rounded bg-muted" />
          ) : (
            <p
              className={cn(
                "mt-1 text-xl font-semibold leading-none tabular-nums",
                tone,
              )}
            >
              {displayValue === undefined ? "—" : displayValue}
            </p>
          )}
        </div>
        <span className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-md bg-muted/60">
          <Icon className={cn("h-3.5 w-3.5", tone)} aria-hidden="true" />
        </span>
      </CardContent>
    </Card>
  );
}
