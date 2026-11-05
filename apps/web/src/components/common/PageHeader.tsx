import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Standard page title typography — keep every page header identical. */
export const PAGE_TITLE_CLASS = "text-2xl font-bold";
export const PAGE_DESCRIPTION_CLASS = "text-muted-foreground";

interface PageTitleProps {
  children: ReactNode;
  /** Layout/spacing only (e.g. `mb-2`). Never pass font size, weight or colour. */
  className?: string;
}

/**
 * The page's <h1>, with the standard size. Use directly only when a page's
 * header layout is too custom for <PageHeader>; otherwise prefer PageHeader.
 */
export function PageTitle({ children, className }: PageTitleProps) {
  return <h1 className={cn(PAGE_TITLE_CLASS, className)}>{children}</h1>;
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned controls, e.g. the page's primary <Button>. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Top-of-page header used by every tenant page: an <h1> title, optional
 * muted description and optional right-aligned actions.
 *
 * Use this instead of hand-writing an <h1> so header sizes stay consistent.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div>
        <PageTitle>{title}</PageTitle>
        {description && <p className={PAGE_DESCRIPTION_CLASS}>{description}</p>}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
