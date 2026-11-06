import { fireEvent, render, screen } from "@testing-library/react";
import { FRAMEWORK_CATALOG } from "@/lib/frameworks/catalog";
import { FrameworkCatalog } from "./FrameworkCatalog";

jest.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({
    tenant: { slug: "acme" },
    policyStatus: { enabledFrameworkSlugs: [] },
    refreshPolicyStatus: jest.fn(),
  }),
}));
jest.mock("@/lib/actions/framework-controls", () => ({
  setCatalogFrameworkEnabled: jest.fn(),
}));
jest.mock("next/navigation", () => ({
  usePathname: () => "/acme/admin/settings/frameworks",
  useParams: () => ({ tenant: "acme" }),
}));
jest.mock("@/lib/utils/toast", () => ({
  successToast: jest.fn(),
  errorToast: jest.fn(),
}));

describe("FrameworkCatalog info dialog", () => {
  it("every framework has an about blurb", () => {
    FRAMEWORK_CATALOG.forEach((f) => expect(f.about.length).toBeGreaterThan(50));
  });

  it("opens a dialog describing the framework on click", () => {
    render(<FrameworkCatalog />);
    fireEvent.click(screen.getByLabelText("About NIST AI RMF"));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("NIST AI RMF");
    expect(dialog).toHaveTextContent("voluntary framework");
  });
});
