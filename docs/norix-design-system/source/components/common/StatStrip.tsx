import { Fragment } from "react";

/**
 * The muted summary line under a list — "Total: 12 • Active: 9 • Revoked: 3".
 */
export function StatStrip({
  stats,
}: {
  stats: { label: string; value: number | string }[];
}) {
  return (
    <div className="flex gap-4 text-sm text-muted-foreground">
      {stats.map((stat, i) => (
        <Fragment key={stat.label}>
          {i > 0 && <span>•</span>}
          <span>
            {stat.label}: {stat.value}
          </span>
        </Fragment>
      ))}
    </div>
  );
}
