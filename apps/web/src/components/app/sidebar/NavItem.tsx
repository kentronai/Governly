import { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface NavItemProps {
  href: string;
  children: ReactNode;
  icon: ReactNode;
  isActive?: boolean;
  className?: string;
  target?: string;
}

/** Link row used by the main tenant sidebar and its Admin Center section. */
export function NavItem({
  href,
  children,
  icon,
  isActive,
  className,
  target,
}: NavItemProps) {
  return (
    <Link
      target={target}
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        isActive ? "bg-muted" : "text-muted-foreground hover:text-inherit",
        className,
      )}
    >
      {/* shrink-0: a label that wraps to two lines must not squeeze the icon. */}
      <span className="shrink-0">{icon}</span>
      {children}
    </Link>
  );
}
