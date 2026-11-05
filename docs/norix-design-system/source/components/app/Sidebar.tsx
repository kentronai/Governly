"use client";

/**
 * NORIX sidebar — portable version.
 *
 * Identical classnames/metrics to apps/web/src/components/app/sidebar/Sidebar.tsx,
 * with the Clerk + tenant-slug coupling replaced by a plain `items` config so it
 * can be dropped into any Next.js App Router project.
 *
 * Metrics that must not drift: w-64 container, p-4 nav, px-3 py-2 rows,
 * rounded-lg, gap-3, h-4 w-4 icons, active = bg-muted.
 */

import React, { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface NavLeaf {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Renders in a new tab (external docs, status page, …). */
  external?: boolean;
  /** Pin to the bottom of the sidebar, below the mt-auto divider. */
  footer?: boolean;
  /** Match only on an exact pathname instead of a prefix. */
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  /** Any pathname starting with one of these marks the group active/open. */
  matches: string[];
  items: NavLeaf[];
}

export type NavEntry = NavLeaf | NavGroup;

const isGroup = (entry: NavEntry): entry is NavGroup => "items" in entry;

function NavItem({
  href,
  children,
  icon,
  isActive,
  className,
  target,
}: {
  href: string;
  children: ReactNode;
  icon: ReactNode;
  isActive?: boolean;
  className?: string;
  target?: string;
}) {
  return (
    <Link
      href={href}
      target={target}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        isActive ? "bg-muted" : "text-muted-foreground hover:text-inherit",
        className,
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

function NavGroupSection({
  group,
  pathname,
}: {
  group: NavGroup;
  pathname: string;
}) {
  const isRouteInside = group.matches.some((m) => pathname.startsWith(m));
  const [isOpen, setIsOpen] = useState(isRouteInside);
  const panelId = `nav-group-${group.label.toLowerCase().replace(/\s+/g, "-")}`;
  const Icon = group.icon;

  // Navigating into the group opens it and keeps it open.
  useEffect(() => {
    if (isRouteInside) setIsOpen(true);
  }, [isRouteInside]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
          isRouteInside
            ? "bg-muted"
            : "text-muted-foreground hover:bg-muted/60 hover:text-inherit",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1">{group.label}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {/* Height animation via grid rows — no max-height guessing, no layout jump. */}
      <div
        id={panelId}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="ml-5 mt-1 space-y-1 border-l pl-2">
            {group.items.map((item) => {
              const ItemIcon = item.icon;
              return (
                <NavItem
                  key={item.href}
                  href={item.href}
                  icon={<ItemIcon className="h-3.5 w-3.5" />}
                  isActive={pathname === item.href}
                  className="py-1.5 text-xs"
                >
                  {item.label}
                </NavItem>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({ items }: { items: NavEntry[] }) {
  const pathname = usePathname();
  const [isMounted, setIsMounted] = useState(false);

  // Render an identically-sized shell on the server and on the client's first
  // pass, then reveal navigation after hydration so nothing shifts.
  useEffect(() => setIsMounted(true), []);

  if (!isMounted) {
    return (
      <div className="flex w-64 flex-col border-r shadow-sm">
        <div className="flex-1 space-y-1 p-4">
          <div className="animate-pulse">
            <Skeleton className="h-4 rounded w-3/4 mb-2" />
            <Skeleton className="h-4 rounded w-1/2 mb-2" />
            <Skeleton className="h-4 rounded w-2/3 mb-2" />
          </div>
        </div>
      </div>
    );
  }

  const isActive = (item: NavLeaf) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  const render = (entry: NavEntry) => {
    if (isGroup(entry)) {
      return (
        <NavGroupSection key={entry.label} group={entry} pathname={pathname} />
      );
    }
    const Icon = entry.icon;
    return (
      <NavItem
        key={entry.href}
        href={entry.href}
        target={entry.external ? "_blank" : undefined}
        icon={<Icon className="h-4 w-4" />}
        isActive={entry.external ? false : isActive(entry)}
      >
        {entry.label}
      </NavItem>
    );
  };

  const main = items.filter((e) => isGroup(e) || !e.footer);
  const footer = items.filter((e): e is NavLeaf => !isGroup(e) && !!e.footer);

  return (
    <div className="flex w-64 flex-col border-r shadow-sm">
      <nav className="flex-1 space-y-1 p-4">
        <div className="space-y-1">{main.map(render)}</div>
      </nav>
      {footer.length > 0 && (
        <nav className="mt-auto p-4 pb-6">{footer.map(render)}</nav>
      )}
    </div>
  );
}
