/**
 * @jest-environment node
 */
import fs from "fs";
import path from "path";
import {
  ADMIN_NAV,
  adminHref,
  flattenNavItems,
  getVisibleAdminNav,
  isAdminRoute,
} from "./adminNav";
import { FRAMEWORKS, frameworkPath, getFramework } from "@/lib/frameworks";
import {
  FRAMEWORK_CATALOG,
  catalogFrameworkPath,
} from "@/lib/frameworks/catalog";
import { LEGACY_EU_AI_ACT_POLICY_NAME } from "@/lib/policy-names";

const TENANT_APP_DIR = path.resolve(__dirname, "../../../app/[tenant]");
const allItems = flattenNavItems(ADMIN_NAV.flatMap((group) => group.items));

describe("Admin Center navigation config", () => {
  it("contains every option from the former Admin Center sidebar", () => {
    expect(allItems.map(({ label, path }) => [label, path])).toEqual([
      ["Admin Home", "admin/home"],
      ["Active Users", "admin/users/active"],
      ["Deactivated Users", "admin/users/deactivate"],
      ["Archived Applications", "admin/archived-applications"],
      ["Audit Logs", "admin/settings/audit-logs"],
      ["Regulations & Frameworks", "admin/settings/policy-center"],
      ...FRAMEWORKS.map((f) => [f.navLabel, frameworkPath(f.slug)]),
      ...FRAMEWORK_CATALOG.filter((f) => !getFramework(f.slug)).map((f) => [
        f.name,
        catalogFrameworkPath(f.slug),
      ]),
      ["Controls", "admin/controls"],
      ["Integrations", "admin/integrations"],
      ["BYOK", "admin/settings/byok"],
      ["AI Radar", "admin/settings/ai-policies-updates"],
      ["Support", "admin/support"],
    ]);
  });

  it("has unique labels and paths", () => {
    const labels = allItems.map((item) => item.label);
    const paths = allItems.map((item) => item.path);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it.each(allItems.map((item) => [item.label, item.path]))(
    "%s links to an existing page (%s)",
    (_label, itemPath) => {
      // Framework tabs share the dynamic /frameworks/[slug] page.
      const routePath = itemPath!
        .replace(/frameworks\/catalog\/[^/]+$/, "frameworks/catalog/[slug]")
        .replace(/frameworks\/(?!catalog\/)[^/]+$/, "frameworks/[slug]");
      const page = path.join(TENANT_APP_DIR, routePath, "page.tsx");
      expect(fs.existsSync(page)).toBe(true);
    },
  );

  it("keeps the /admin index redirecting to Admin Home", () => {
    const indexPage = fs.readFileSync(
      path.join(TENANT_APP_DIR, "admin", "page.tsx"),
      "utf8",
    );
    expect(indexPage).toContain("/admin/home");
  });

  it("removes the old standalone admin sidebar", () => {
    expect(
      fs.existsSync(path.resolve(__dirname, "../../admin/sidebar/Sidebar.tsx")),
    ).toBe(false);
  });
});

describe("getVisibleAdminNav", () => {
  const labels = (ctx: {
    govIQEnabled: boolean;
    iso42001: boolean;
    activePolicyNames?: string[];
    enabledFrameworkSlugs?: string[];
  }) =>
    getVisibleAdminNav({ activePolicyNames: [], ...ctx }).flatMap((group) =>
      flattenNavItems(group.items).map((item) => item.label),
    );
  const allPolicies = FRAMEWORKS.flatMap((f) => f.policyNames.slice(0, 1));
  const allFrameworkSlugs = FRAMEWORKS.map((f) => f.slug);

  it("shows every option when GovIQ, ISO 42001 and every framework are enabled", () => {
    expect(
      labels({
        govIQEnabled: true,
        iso42001: true,
        activePolicyNames: allPolicies,
        enabledFrameworkSlugs: allFrameworkSlugs,
      }),
    ).toHaveLength(11 + FRAMEWORKS.length);
  });

  it("shows a framework tab right below Regulations only when its policy is enabled", () => {
    expect(labels({ govIQEnabled: true, iso42001: true })).not.toContain(
      "EU AI Act",
    );
    const visible = labels({
      govIQEnabled: true,
      iso42001: true,
      activePolicyNames: ["NYC Local Law 144"],
    });
    expect(visible[visible.indexOf("Regulations & Frameworks") + 1]).toBe(
      "NYC Local Law 144",
    );
    expect(visible).not.toContain("EU AI Act");
  });

  it("recognises the legacy EU AI Act policy name", () => {
    expect(
      labels({
        govIQEnabled: true,
        iso42001: false,
        activePolicyNames: [LEGACY_EU_AI_ACT_POLICY_NAME],
      }),
    ).toContain("EU AI Act");
  });

  it("hides the whole Frameworks and Regulations group without GovIQ", () => {
    const visible = getVisibleAdminNav({
      govIQEnabled: false,
      iso42001: true,
      activePolicyNames: allPolicies,
    });
    expect(visible.map((group) => group.title)).not.toContain(
      "Frameworks and Regulations",
    );
    expect(labels({ govIQEnabled: false, iso42001: true })).toEqual([
      "Admin Home",
      "Active Users",
      "Deactivated Users",
      "Archived Applications",
      "Audit Logs",
      "Support",
    ]);
  });

  it("hides only ISO 42001 when that policy is inactive", () => {
    const visible = labels({ govIQEnabled: true, iso42001: false });
    expect(visible).not.toContain("ISO 42001");
    expect(visible).toEqual(
      expect.arrayContaining([
        "Regulations & Frameworks",
        "Integrations",
      "BYOK",
        "AI Radar",
      ]),
    );
  });
});

describe("route helpers", () => {
  it("builds tenant-scoped hrefs", () => {
    expect(adminHref("acme", "admin/users/active")).toBe(
      "/acme/admin/users/active",
    );
  });

  it.each([
    ["/acme/admin", true],
    ["/acme/admin/home", true],
    ["/acme/admin/settings/audit-logs", true],
    ["/acme", false],
    ["/acme/applications", false],
    ["/acme/administrators", false],
    ["/other/admin/home", false],
  ])("isAdminRoute(%s) === %s", (pathname, expected) => {
    expect(isAdminRoute(pathname, "acme")).toBe(expected);
  });
});
