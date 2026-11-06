import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import Sidebar from "./Sidebar";

let mockPathname = "/acme";
let mockAuth: Record<string, unknown> = {};
let mockTenant: Record<string, unknown> = {};

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useParams: () => ({ tenant: "acme" }),
}));

jest.mock("@clerk/nextjs", () => ({
  useAuth: () => mockAuth,
}));

jest.mock("@/contexts/TenantContext", () => ({
  useTenant: () => mockTenant,
}));

const setup = ({
  pathname = "/acme",
  orgRole = "org:admin" as string | null,
  govIQEnabled = true,
  iso42001 = true,
  isAdminUser = false,
} = {}) => {
  mockPathname = pathname;
  mockAuth = { isSignedIn: true, isLoaded: true, orgRole };
  mockTenant = {
    tenant: { id: "t1", slug: "acme", govIQEnabled },
    policyStatus: { iso42001 },
  };
  return render(<Sidebar isAdminUser={isAdminUser} />);
};

const adminToggle = () => screen.getByRole("button", { name: /admin center/i });
const expandAdminCenter = () => {
  if (adminToggle().getAttribute("aria-expanded") !== "true") {
    fireEvent.click(adminToggle());
  }
  for (const name of ["Regulations", "Frameworks"]) {
    const folder = screen.queryByRole("button", { name });
    if (folder?.getAttribute("aria-expanded") === "false")
      fireEvent.click(folder);
  }
};

// Expected Admin Center options and their routes — written out independently
// of the nav config so a config change can't silently break a link.
const ADMIN_LINKS: [string, string][] = [
  ["Admin Home", "/acme/admin/home"],
  ["Active Users", "/acme/admin/users/active"],
  ["Deactivated Users", "/acme/admin/users/deactivate"],
  ["Archived Applications", "/acme/admin/archived-applications"],
  ["Audit Logs", "/acme/admin/settings/audit-logs"],
  ["Regulations & Frameworks", "/acme/admin/settings/policy-center"],
  ["Controls", "/acme/admin/controls"],
  ["Integrations", "/acme/admin/integrations"],
  ["BYOK", "/acme/admin/settings/byok"],
  ["AI Radar", "/acme/admin/settings/ai-policies-updates"],
  ["Support", "/acme/admin/support"],
];

describe("Sidebar — Admin Center section", () => {
  describe("visibility by role", () => {
    it("is shown to organization admins", () => {
      setup({ orgRole: "org:admin" });
      expect(adminToggle()).toBeInTheDocument();
    });

    it.each([["org:member"], [null]])("is hidden for role %s", (orgRole) => {
      setup({ orgRole });
      expect(
        screen.queryByRole("button", { name: /admin center/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Active Users" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("links", () => {
    it.each(ADMIN_LINKS)("%s links to %s", (label, href) => {
      setup();
      expandAdminCenter();
      expect(screen.getByRole("link", { name: label })).toHaveAttribute(
        "href",
        href,
      );
    });

    it("renders exactly the expected admin links, in order", () => {
      setup();
      expandAdminCenter();
      const region = document.getElementById("admin-center-navigation")!;
      const links = within(region).getAllByRole("link");
      expect(
        links.map((link) => [link.textContent, link.getAttribute("href")]),
      ).toEqual(ADMIN_LINKS);
    });

    it("groups options under Users and Settings headings, with no Frameworks and Regulations heading", () => {
      setup();
      expandAdminCenter();
      const group = (name: string) => screen.getByRole("group", { name });
      expect(
        within(group("Users"))
          .getAllByRole("link")
          .map((l) => l.textContent),
      ).toEqual(["Active Users", "Deactivated Users"]);
      expect(
        within(group("Settings"))
          .getAllByRole("link")
          .map((l) => l.textContent),
      ).toEqual(["Archived Applications", "Audit Logs"]);
      expect(
        screen.queryByRole("group", { name: "Frameworks and Regulations" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "ISO 42001" }),
      ).not.toBeInTheDocument();
    });

    it("no longer offers a 'Back to app' link", () => {
      setup({ pathname: "/acme/admin/home" });
      expect(
        screen.queryByRole("link", { name: /back to app/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("feature gating", () => {
    it("hides Compliance options when GovIQ is disabled", () => {
      setup({ govIQEnabled: false });
      expandAdminCenter();
      for (const label of [
        "Regulations & Frameworks",
        "ISO 42001",
        "Integrations",
        "BYOK",
        "AI Radar",
      ]) {
        expect(
          screen.queryByRole("link", { name: label }),
        ).not.toBeInTheDocument();
      }
      expect(
        screen.queryByRole("group", { name: "Frameworks and Regulations" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Active Users" }),
      ).toBeInTheDocument();
    });

    it("hides only ISO 42001 when the ISO policy is inactive", () => {
      setup({ iso42001: false });
      expandAdminCenter();
      expect(
        screen.queryByRole("link", { name: "ISO 42001" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Regulations & Frameworks" }),
      ).toBeInTheDocument();
    });
  });

  describe("expand / collapse and active state", () => {
    it("is collapsed outside admin routes and expands on click", () => {
      setup({ pathname: "/acme/applications" });
      expect(adminToggle()).toHaveAttribute("aria-expanded", "false");
      expect(
        screen.queryByRole("link", { name: "Active Users" }),
      ).not.toBeInTheDocument();

      fireEvent.click(adminToggle());
      expect(adminToggle()).toHaveAttribute("aria-expanded", "true");
      expect(
        screen.getByRole("link", { name: "Active Users" }),
      ).toBeInTheDocument();

      fireEvent.click(adminToggle());
      expect(adminToggle()).toHaveAttribute("aria-expanded", "false");
    });

    it.each(ADMIN_LINKS)(
      "on the %s page the section is open and only that link is current",
      (label, href) => {
        setup({ pathname: href });
        expect(adminToggle()).toHaveAttribute("aria-expanded", "true");
        const current = screen
          .getAllByRole("link")
          .filter((link) => link.getAttribute("aria-current") === "page");
        expect(current.map((link) => link.textContent)).toEqual([label]);
      },
    );

    it("keeps the parent option current on nested admin routes", () => {
      setup({ pathname: "/acme/admin/settings/policy-center/eu-ai-act" });
      expect(
        screen.getByRole("link", { name: "Regulations & Frameworks" }),
      ).toHaveAttribute("aria-current", "page");
    });

    it("keeps Regulations & Frameworks current on the Frameworks tab", () => {
      setup({ pathname: "/acme/admin/settings/frameworks" });
      expect(
        screen.getByRole("link", { name: "Regulations & Frameworks" }),
      ).toHaveAttribute("aria-current", "page");
    });

    it("opens on the /admin index route", () => {
      setup({ pathname: "/acme/admin" });
      expect(adminToggle()).toHaveAttribute("aria-expanded", "true");
    });
  });
});

describe("Sidebar — existing navigation (regression)", () => {
  it.each([
    ["Applications", "/acme/applications"],
    ["Agent Risk Dashboard", "/acme/ai-agent-discovery/dashboard"],
    ["Agent Inventory", "/acme/ai-agent-inventory"],
    ["Model Registry", "/acme/model-registry"],
    ["AI Catalog", "/acme/ai-catalog"],
    ["Dashboard", "/acme/reports"],
    ["AI Usage Console", "/acme/ai-console"],
    ["API Keys", "/acme/api-keys"],
    ["Observability", "/acme/observability"],
    ["Docs", "https://docs.kentron.ai/"],
  ])("still links %s to %s", (label, href) => {
    setup({ orgRole: "org:member" });
    expect(screen.getByRole("link", { name: label })).toHaveAttribute(
      "href",
      href,
    );
  });

  it('shows "Dashboard" (formerly Reports) as the first nav item', () => {
    setup({ orgRole: "org:member" });
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveTextContent("Dashboard");
    expect(links[0]).toHaveAttribute("href", "/acme/reports");
    expect(
      screen.queryByRole("link", { name: "Reports" }),
    ).not.toBeInTheDocument();
  });

  it("highlights Dashboard on the reports route", () => {
    setup({ orgRole: "org:member", pathname: "/acme/reports" });
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("hides Dashboard when govIQ is disabled", () => {
    setup({ orgRole: "org:member", govIQEnabled: false });
    expect(
      screen.queryByRole("link", { name: "Dashboard" }),
    ).not.toBeInTheDocument();
  });

  it("still gates Operations on isAdminUser", () => {
    const { unmount } = setup({ isAdminUser: true });
    expect(screen.getByRole("link", { name: "Operations" })).toHaveAttribute(
      "href",
      "/acme/ops",
    );
    unmount();
    setup({ isAdminUser: false });
    expect(
      screen.queryByRole("link", { name: "Operations" }),
    ).not.toBeInTheDocument();
  });

  it("renders nothing for signed-out users", () => {
    mockPathname = "/acme";
    mockAuth = { isSignedIn: false, isLoaded: true, orgRole: null };
    const { container } = render(<Sidebar isAdminUser={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
