import { ReactNode } from "react";

/**
 * Standard page header: title + description on the left, primary action right.
 * Extracted from the pattern repeated across every NORIX list screen.
 *
 * Always the first child of the page's `space-y-6` stack.
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex justify-between items-start">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
