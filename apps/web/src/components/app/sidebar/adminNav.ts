import type { LucideIcon } from "lucide-react";
import {
  Archive,
  Blocks,
  FileText,
  Headset,
  Home,
  Scale,
  ScrollText,
  Settings,
  UserCheck,
  UserX,
} from "lucide-react";

/**
 * Admin Center navigation, rendered as a section of the main tenant sidebar.
 *
 * Single source of truth for every Admin Center link: the sidebar renders it
 * and the tests assert each `path` resolves to a real page under
 * `src/app/[tenant]`, so adding an entry here without a page fails CI.
 */

export interface AdminNavVisibility {
  govIQEnabled: boolean;
  iso42001: boolean;
}

export interface AdminNavItem {
  label: string;
  /** Path relative to `/[tenant]`, e.g. `admin/users/active`. */
  path: string;
  icon: LucideIcon;
  isVisible?: (ctx: AdminNavVisibility) => boolean;
}

export interface AdminNavGroup {
  /** Heading shown above the group; omitted for top-level items. */
  title?: string;
  items: AdminNavItem[];
  isVisible?: (ctx: AdminNavVisibility) => boolean;
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    items: [{ label: "Admin Home", path: "admin/home", icon: Home }],
  },
  {
    title: "Users",
    items: [
      { label: "Active Users", path: "admin/users/active", icon: UserCheck },
      {
        label: "Deactivated Users",
        path: "admin/users/deactivate",
        icon: UserX,
      },
    ],
  },
  {
    title: "Settings",
    items: [
      {
        label: "Archived Applications",
        path: "admin/archived-applications",
        icon: Archive,
      },
      {
        label: "Audit Logs",
        path: "admin/settings/audit-logs",
        icon: ScrollText,
      },
    ],
  },
  {
    title: "Compliance",
    isVisible: ({ govIQEnabled }) => govIQEnabled,
    items: [
      {
        label: "Regulations",
        path: "admin/settings/policy-center",
        icon: FileText,
      },
      {
        label: "ISO 42001",
        path: "admin/settings/iso-42001",
        icon: Scale,
        isVisible: ({ iso42001 }) => iso42001,
      },
      { label: "Integrations", path: "admin/integrations", icon: Blocks },
      {
        label: "AI Radar",
        path: "admin/settings/ai-policies-updates",
        icon: Settings,
      },
    ],
  },
  {
    items: [{ label: "Support", path: "admin/support", icon: Headset }],
  },
];

/** Groups and items the current tenant should see, with empty groups dropped. */
export function getVisibleAdminNav(ctx: AdminNavVisibility): AdminNavGroup[] {
  return ADMIN_NAV.filter((group) => group.isVisible?.(ctx) ?? true)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.isVisible?.(ctx) ?? true),
    }))
    .filter((group) => group.items.length > 0);
}

export const adminHref = (tenant: string, path: string) => `/${tenant}/${path}`;

export const isAdminRoute = (pathname: string, tenant: string) =>
  pathname === `/${tenant}/admin` || pathname.startsWith(`/${tenant}/admin/`);
