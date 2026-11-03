/**
 * @jest-environment node
 */
import fs from "fs";
import path from "path";
import {
  ADMIN_NAV,
  adminHref,
  getVisibleAdminNav,
  isAdminRoute,
} from "./adminNav";

const TENANT_APP_DIR = path.resolve(__dirname, "../../../app/[tenant]");
const allItems = ADMIN_NAV.flatMap((group) => group.items);

describe("Admin Center navigation config", () => {
  it("contains every option from the former Admin Center sidebar", () => {
    expect(allItems.map(({ label, path }) => [label, path])).toEqual([
      ["Admin Home", "admin/home"],
      ["Active Users", "admin/users/active"],
      ["Deactivated Users", "admin/users/deactivate"],
      ["Archived Applications", "admin/archived-applications"],
      ["Audit Logs", "admin/settings/audit-logs"],
      ["Regulations", "admin/settings/policy-center"],
      ["ISO 42001", "admin/settings/iso-42001"],
      ["Integrations", "admin/integrations"],
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
      const page = path.join(TENANT_APP_DIR, itemPath, "page.tsx");
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
      fs.existsSync(
        path.resolve(__dirname, "../../admin/sidebar/Sidebar.tsx"),
      ),
    ).toBe(false);
  });
});

describe("getVisibleAdminNav", () => {
  const labels = (ctx: { govIQEnabled: boolean; iso42001: boolean }) =>
    getVisibleAdminNav(ctx).flatMap((group) =>
      group.items.map((item) => item.label),
    );

  it("shows every option when GovIQ and ISO 42001 are enabled", () => {
    expect(labels({ govIQEnabled: true, iso42001: true })).toHaveLength(10);
  });

  it("hides the whole Compliance group without GovIQ", () => {
    const visible = getVisibleAdminNav({ govIQEnabled: false, iso42001: true });
    expect(visible.map((group) => group.title)).not.toContain("Compliance");
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
        "Regulations",
        "Integrations",
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
