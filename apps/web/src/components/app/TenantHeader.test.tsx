import React from "react";
import { render, screen } from "@testing-library/react";
import { TenantHeader } from "./TenantHeader";

let mockPathname = "/acme";

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: jest.fn() }),
  useParams: () => ({ tenant: "acme" }),
}));

jest.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: true, isLoaded: true, orgRole: "org:admin" }),
  UserButton: () => <div data-testid="user-button" />,
}));

jest.mock("@/components/common/OrganizationSwitcher", () => ({
  OrganizationSwitcher: () => <div data-testid="org-switcher" />,
}));

jest.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: jest.fn() }),
}));

jest.mock("@/lib/api/applications", () => ({
  getApplication: jest.fn(),
}));

describe("TenantHeader", () => {
  it.each(["/acme", "/acme/applications", "/acme/admin/home"])(
    "no longer shows the ADMIN button to org admins on %s",
    (pathname) => {
      mockPathname = pathname;
      render(<TenantHeader />);

      expect(screen.getByTestId("user-button")).toBeInTheDocument();
      expect(screen.getByTestId("org-switcher")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /^admin$/i }),
      ).not.toBeInTheDocument();
      expect(
        document.querySelector('a[href="/acme/admin/home"]'),
      ).not.toBeInTheDocument();
    },
  );
});
