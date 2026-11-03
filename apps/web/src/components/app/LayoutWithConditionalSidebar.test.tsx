import React from "react";
import { render, screen } from "@testing-library/react";
import LayoutWithConditionalSidebar from "./LayoutWithConditionalSidebar";

let mockPathname = "/acme";

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useParams: () => ({ tenant: "acme" }),
}));

jest.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: true, isLoaded: true, orgRole: "org:admin" }),
}));

jest.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({
    tenant: { id: "t1", slug: "acme", govIQEnabled: true },
    policyStatus: { iso42001: true },
  }),
}));

describe("LayoutWithConditionalSidebar", () => {
  it.each([
    ["/acme", false],
    ["/acme/applications", false],
    ["/acme/admin", true],
    ["/acme/admin/home", true],
    ["/acme/admin/users/active", true],
    ["/acme/admin/settings/audit-logs", true],
    ["/acme/applications/app-1/settings", false],
    ["/acme/applications/app-1/control-net", false],
  ])(
    "renders the main sidebar with Admin Center on %s",
    (pathname, adminExpanded) => {
      mockPathname = pathname;
      render(
        <LayoutWithConditionalSidebar isAdminUser={false}>
          <p>page content</p>
        </LayoutWithConditionalSidebar>,
      );

      // Main navigation is present on every tenant route…
      expect(
        screen.getByRole("link", { name: "Applications" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Observability" }),
      ).toBeInTheDocument();
      // …with the Admin Center section, open only on admin routes.
      expect(
        screen.getByRole("button", { name: /admin center/i }),
      ).toHaveAttribute("aria-expanded", String(adminExpanded));
      // The old admin-only sidebar is gone.
      expect(
        screen.queryByRole("link", { name: /back to app/i }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("page content")).toBeInTheDocument();
    },
  );
});
