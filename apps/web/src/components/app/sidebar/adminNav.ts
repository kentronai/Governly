import type { LucideIcon } from "lucide-react";
import { FRAMEWORKS, enabledFrameworks, frameworkPath } from "@/lib/frameworks";
import {
  FRAMEWORK_CATALOG,
  catalogFrameworkPath,
} from "@/lib/frameworks/catalog";
import {
  Archive,
  Blocks,
  FileText,
  Headset,
  Home,
  KeyRound,
  Layers,
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
  /** Enabled policy names; each matching framework gets its own tab. */
  activePolicyNames: string[];
  /** Catalog frameworks enabled on the Frameworks page; each gets a tab. */
  enabledFrameworkSlugs?: string[];
}

export interface AdminNavItem {
  label: string;
  /** Path relative to `/[tenant]`, e.g. `admin/users/active`. Omitted for a collapsible parent. */
  path?: string;
  /** Only active on this exact path (its sub-paths belong to other tabs). */
  exact?: boolean;
  /** Nested items; the parent renders as an open/close toggle. */
  children?: AdminNavItem[];
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
    isVisible: ({ govIQEnabled }) => govIQEnabled,
    items: [
      {
        label: "Regulations",
        icon: FileText,
        children: [
          {
            label: "Manage Regulations",
            path: "admin/settings/policy-center",
            icon: FileText,
          },
          ...FRAMEWORKS.map(
            (framework): AdminNavItem => ({
              label: framework.navLabel,
              path: frameworkPath(framework.slug),
              icon: Scale,
              isVisible: ({ activePolicyNames }) =>
                enabledFrameworks(activePolicyNames).includes(framework),
            }),
          ),
        ],
      },
      {
        label: "Frameworks",
        icon: Layers,
        children: [
          {
            label: "Manage Frameworks",
            path: "admin/settings/frameworks",
            icon: Layers,
            exact: true,
          },
          ...FRAMEWORK_CATALOG.map(
            (framework): AdminNavItem => ({
              label: framework.name,
              path: catalogFrameworkPath(framework.slug),
              icon: Layers,
              isVisible: ({ enabledFrameworkSlugs = [] }) =>
                enabledFrameworkSlugs.includes(framework.slug),
            }),
          ),
        ],
      },
    ],
  },
  {
    isVisible: ({ govIQEnabled }) => govIQEnabled,
    items: [
      { label: "Integrations", path: "admin/integrations", icon: Blocks },
      { label: "BYOK", path: "admin/settings/byok", icon: KeyRound },
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

const visibleItems = (
  items: AdminNavItem[],
  ctx: AdminNavVisibility,
): AdminNavItem[] =>
  items
    .filter((item) => item.isVisible?.(ctx) ?? true)
    .map((item) =>
      item.children
        ? { ...item, children: visibleItems(item.children, ctx) }
        : item,
    )
    .filter((item) => item.path || item.children?.length);

/** Groups and items the current tenant should see, with empty groups dropped. */
export function getVisibleAdminNav(ctx: AdminNavVisibility): AdminNavGroup[] {
  return ADMIN_NAV.filter((group) => group.isVisible?.(ctx) ?? true)
    .map((group) => ({ ...group, items: visibleItems(group.items, ctx) }))
    .filter((group) => group.items.length > 0);
}

/** Every linkable item, children flattened in place of their parent. */
export const flattenNavItems = (items: AdminNavItem[]): AdminNavItem[] =>
  items.flatMap((item) =>
    item.children ? flattenNavItems(item.children) : [item],
  );

export const adminHref = (tenant: string, path: string) => `/${tenant}/${path}`;

export const isAdminRoute = (pathname: string, tenant: string) =>
  pathname === `/${tenant}/admin` || pathname.startsWith(`/${tenant}/admin/`);
