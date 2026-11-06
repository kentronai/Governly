/** Library size and enabled count, shown top-right on the Regulations and Frameworks pages. */
export function LibraryStats({
  libraryCount,
  libraryLabel,
  enabledCount,
}: {
  libraryCount: number;
  libraryLabel: string;
  enabledCount: number;
}) {
  const stats = [
    { value: libraryCount, label: libraryLabel },
    { value: enabledCount, label: "Policies enabled" },
  ];
  return (
    <div className="flex gap-2">
      {stats.map(({ value, label }) => (
        <div key={label} className="rounded-lg border bg-card px-3 py-1.5 text-right">
          <p className="text-xl font-semibold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      ))}
    </div>
  );
}
