"use client";
import { useEffect, useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { cn } from "@/lib/utils";
import { NavItem } from "./NavItem";
import { adminHref, getVisibleAdminNav, isAdminRoute } from "./adminNav";

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
              <p className="px-3 pt-2 pb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                {group.title}
              </p>
            )}
            {group.items.map(({ label, path, icon: Icon }) => {
              const href = adminHref(tenant, path);
              return (
                <NavItem
                  key={path}
                  href={href}
                  icon={<Icon className="h-3.5 w-3.5" />}
                  isActive={pathname === href || pathname.startsWith(`${href}/`)}
                  className="py-1.5 text-xs"
                >
                  {label}
                </NavItem>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
