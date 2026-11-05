"use client";
import { useEffect, useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { cn } from "@/lib/utils";
import { NavItem } from "./NavItem";
import {
  adminHref,
  flattenNavItems,
  getVisibleAdminNav,
  isAdminRoute,
  type AdminNavItem,
} from "./adminNav";

const isActiveHref = (pathname: string, href: string, exact = false) =>
  pathname === href || (!exact && pathname.startsWith(`${href}/`));

function AdminNavLink({
  item,
  tenant,
  pathname,
}: {
  item: AdminNavItem;
  tenant: string;
  pathname: string;
}) {
  const Icon = item.icon;
  const href = adminHref(tenant, item.path!);
  return (
    <NavItem
      href={href}
      icon={<Icon className="h-4 w-4" />}
      isActive={isActiveHref(pathname, href, item.exact)}
      className="py-1.5 text-foreground/80"
    >
      {item.label}
    </NavItem>
  );
}

/** Parent row that opens/closes its children, like the Admin Center toggle. */
function AdminNavFolder({
  item,
  tenant,
  pathname,
}: {
  item: AdminNavItem;
  tenant: string;
  pathname: string;
}) {
  const children = item.children ?? [];
  const containsActive = flattenNavItems(children).some((child) =>
    isActiveHref(pathname, adminHref(tenant, child.path!), child.exact),
  );
  const [open, setOpen] = useState(containsActive);
  useEffect(() => {
    if (containsActive) setOpen(true);
  }, [containsActive]);
  const Icon = item.icon;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-sm font-medium text-foreground/80 transition-colors hover:bg-muted/60"
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1">{item.label}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      <div
        hidden={!open}
        role="group"
        aria-label={item.label}
        className="ml-5 mt-1 space-y-1 border-l pl-2"
      >
        {children.map((child) => (
          <AdminNavLink
            key={child.path}
            item={child}
            tenant={tenant}
            pathname={pathname}
          />
        ))}
      </div>
    </div>
  );
}

interface AdminCenterNavProps {
  tenant: string;
  pathname: string;
}

/**
 * "Admin Center" section of the main sidebar. Mirrors the Agent Registry
 * collapsible so admins reach every admin page without leaving the app shell.
 */
export function AdminCenterNav({ tenant, pathname }: AdminCenterNavProps) {
  const { tenant: tenantInfo, policyStatus } = useTenant();
  const onAdminRoute = isAdminRoute(pathname, tenant);
  const [isOpen, setIsOpen] = useState(onAdminRoute);

  useEffect(() => {
    if (onAdminRoute) setIsOpen(true);
  }, [onAdminRoute]);

  const groups = getVisibleAdminNav({
    govIQEnabled: Boolean(tenantInfo?.govIQEnabled),
    iso42001: Boolean(policyStatus?.iso42001),
    activePolicyNames: policyStatus?.activePolicyNames ?? [],
    enabledFrameworkSlugs: policyStatus?.enabledFrameworkSlugs ?? [],
  });

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls="admin-center-navigation"
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
          onAdminRoute
            ? "bg-muted"
            : "text-muted-foreground hover:bg-muted/60 hover:text-inherit",
        )}
      >
        <ShieldCheck className="h-4 w-4 shrink-0" />
        <span className="flex-1">Admin Center</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>

      <div
        id="admin-center-navigation"
        hidden={!isOpen}
        className="ml-5 mt-1 space-y-1 border-l pl-2"
      >
        {groups.map((group, index) => (
          <div
            key={group.title ?? `group-${index}`}
            role="group"
            aria-label={group.title}
            className="space-y-1"
          >
            {group.title && (
              <p className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </p>
            )}
            {group.items.map((item) =>
              item.children ? (
                <AdminNavFolder
                  key={item.label}
                  item={item}
                  tenant={tenant}
                  pathname={pathname}
                />
              ) : (
                <AdminNavLink
                  key={item.path}
                  item={item}
                  tenant={tenant}
                  pathname={pathname}
                />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
