import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ControlsCenter } from "./ControlsCenter";

const getAllFrameworkControls = jest.fn();
const saveFrameworkControls = jest.fn();
let activePolicyNames: string[] = [];
let enabledFrameworkSlugs: string[] = [];

jest.mock("next/navigation", () => ({ useParams: () => ({ tenant: "acme" }) }));
jest.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({
    policyStatus: { activePolicyNames, enabledFrameworkSlugs },
  }),
}));
jest.mock("@/lib/actions/framework-controls", () => ({
  getAllFrameworkControls: (...args: unknown[]) =>
    getAllFrameworkControls(...args),
  saveFrameworkControls: (...args: unknown[]) => saveFrameworkControls(...args),
}));
jest.mock("@/lib/actions/risk-links", () => ({
  getRisksForControl: jest.fn().mockResolvedValue([]),
  getTenantRisks: jest.fn().mockResolvedValue([]),
  linkRisk: jest.fn(),
  unlinkRisk: jest.fn(),
}));
jest.mock("@/lib/actions/evidence-autofill", () => ({
  autofillFromDocument: jest.fn(),
}));
jest.mock("@/lib/actions/users", () => ({
  getActiveUsers: async () => ({ success: true, users: [] }),
}));
jest.mock("@/lib/utils/toast", () => ({
  successToast: jest.fn(),
  errorToast: jest.fn(),
  infoToast: jest.fn(),
}));
// Recharts needs real layout; the gauge ring itself isn't under test.
jest.mock("recharts", () => ({
  PolarAngleAxis: () => null,
  RadialBar: () => null,
  RadialBarChart: () => null,
}));
jest.mock("@/components/ui/chart", () => ({
  ChartContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock("@/components/common/RichTextEditor", () => ({
  RichTextEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <textarea
      aria-label="rich-text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

beforeEach(() => {
  enabledFrameworkSlugs = [];
  getAllFrameworkControls.mockReset().mockResolvedValue({});
  saveFrameworkControls.mockReset().mockResolvedValue({ success: true });
});

const openActions = async (code: string) => {
  const trigger = await screen.findByRole("button", {
    name: `Actions for ${code}`,
  });
  fireEvent.keyDown(trigger, { key: "Enter" });
  fireEvent.click(await screen.findByText("Add / edit details"));
  return screen.findByRole("dialog");
};

describe("ControlsCenter", () => {
  // The full catalog renders ~550 controls; under parallel load 5s is too tight.
  jest.setTimeout(20000);

  it("asks to enable a policy when none is enabled", async () => {
    activePolicyNames = [];
    render(<ControlsCenter />);
    expect(await screen.findByText("No policies enabled")).toBeInTheDocument();
  });

  it("lists each subcontrol as its own row with the policies it maps to", async () => {
    activePolicyNames = ["EU AI Act"];
    render(<ControlsCenter />);
    const row = (
      await screen.findByText("We train relevant staff on AI literacy and ethics")
    ).closest("tr")!;
    const cells = within(row).getAllByRole("cell");
    expect(cells[1]).toHaveTextContent("KN0001.1.2");
    expect(cells[4]).toHaveTextContent("EU AI Act");
    // Colorado is not enabled but asks for the same control, so it is mapped too.
    expect(cells[4]).toHaveTextContent("Colorado Artificial Intelligence Act");
    expect(screen.getAllByText(/^KN0001\.1\.\d$/)).toHaveLength(3);
    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(screen.getByText("Overall (enabled)")).toBeInTheDocument();
    expect(
      screen.getAllByText("Colorado Artificial Intelligence Act").length,
    ).toBeGreaterThan(1); // gauge + mapping chip
  });

  it("opens the subcontrol from its Actions menu and saves once (the server mirrors it)", async () => {
    activePolicyNames = ["EU AI Act"];
    render(<ControlsCenter />);
    const dialog = await openActions("KN0001.1.2");
    expect(
      within(dialog).getByText("KN0001.1 AI literacy and responsible-AI training"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("tab", { name: "Subcontrol 2", selected: true }),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(saveFrameworkControls).toHaveBeenCalledWith(
        "acme",
        "eu-ai-act",
        expect.objectContaining({ "1.1.2": expect.any(Object) }),
      ),
    );
    expect(saveFrameworkControls).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(getAllFrameworkControls).toHaveBeenCalledTimes(2));
  });

  it("shows the Upload evidence document action in the row menu", async () => {
    activePolicyNames = ["EU AI Act"];
    render(<ControlsCenter />);
    fireEvent.keyDown(
      await screen.findByRole("button", { name: "Actions for KN0001.1.2" }),
      { key: "Enter" },
    );
    expect(await screen.findByText("Upload evidence document")).toBeInTheDocument();
  });

  it("uses underline tabs like AI Radar", async () => {
    activePolicyNames = ["EU AI Act"];
    render(<ControlsCenter />);
    expect(
      (await screen.findByRole("tab", { name: /Regulation controls/ })).className,
    ).toContain("border-b-2");
  });

  it("keeps unsaved input after closing with X and restores it; Cancel discards it", async () => {
    activePolicyNames = ["EU AI Act"];
    localStorage.clear();
    const { unmount } = render(<ControlsCenter />);
    let dialog = await openActions("KN0001.1.2");
    fireEvent.change(within(dialog).getAllByDisplayValue("")[0], {
      target: { value: "2026-12-31" },
    });
    unmount(); // leaving the page flushes the draft
    expect(Object.keys(localStorage).some((k) => k.startsWith("norix:draft:"))).toBe(true);

    render(<ControlsCenter />);
    dialog = await openActions("KN0001.1.2");
    expect(within(dialog).getByDisplayValue("2026-12-31")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));
    expect(Object.keys(localStorage).some((k) => k.startsWith("norix:draft:"))).toBe(false);
  });

  it("marks a control complete once its details are saved", async () => {
    activePolicyNames = ["EU AI Act"];
    getAllFrameworkControls.mockResolvedValue({
      "eu-ai-act": { "1.1.2": { status: "Done" } },
    });
    render(<ControlsCenter />);
    const row = (
      await screen.findByText("We train relevant staff on AI literacy and ethics")
    ).closest("tr")!;
    expect(within(row).getByTitle("Completed")).toBeInTheDocument();
  });

  it("filters the list to one active policy", async () => {
    Element.prototype.scrollIntoView = jest.fn(); // jsdom lacks it; Radix Select calls it
    activePolicyNames = ["EU AI Act", "NYC Local Law 144"];
    render(<ControlsCenter />);
    await screen.findByText("AEDT Applicability Determination");
    expect(screen.getByText("AI literacy")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("combobox", { name: "Filter by policy" }));
    fireEvent.click(await screen.findByRole("option", { name: "NYC Local Law 144" }));

    // NYC's own row and the EU rows it maps to stay; EU-only rows disappear.
    expect(screen.getByText("AEDT Applicability Determination")).toBeInTheDocument();
    expect(
      screen.getByText("We inform people subject to high-risk decisions"),
    ).toBeInTheDocument();
    expect(screen.queryByText("AI literacy")).not.toBeInTheDocument();
    expect(
      screen.queryByText("We train relevant staff on AI literacy and ethics"),
    ).not.toBeInTheDocument();
  });

  it("splits controls into Regulation and Framework sections", async () => {
    activePolicyNames = ["EU AI Act"];
    enabledFrameworkSlugs = ["ai-ethics-governance"];
    render(<ControlsCenter />);
    await screen.findByText("We train relevant staff on AI literacy and ethics");
    expect(screen.getByRole("tab", { name: /Regulation controls/ })).toBeInTheDocument();
    // The framework's own control is not on the regulation tab...
    expect(screen.queryByText("Define fairness goals per use case")).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: /Framework controls/ }), { button: 0 });

    // ...it is on the framework tab, and the regulation's rows are gone.
    expect(await screen.findByText("Define fairness goals per use case")).toBeInTheDocument();
    expect(screen.queryByText("We train relevant staff on AI literacy and ethics")).not.toBeInTheDocument();
  });
});
