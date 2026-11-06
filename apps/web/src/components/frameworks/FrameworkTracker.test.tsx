import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { FRAMEWORKS } from "@/lib/frameworks";
import { FrameworkTracker } from "./FrameworkTracker";

const getFrameworkControls = jest.fn();
const saveFrameworkControls = jest.fn();

jest.mock("next/navigation", () => ({ useParams: () => ({ tenant: "acme" }) }));
jest.mock("@/lib/actions/framework-controls", () => ({
  getFrameworkControls: (...args: unknown[]) => getFrameworkControls(...args),
  saveFrameworkControls: (...args: unknown[]) => saveFrameworkControls(...args),
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
// Tiptap needs a real DOM layout engine; the editor itself isn't under test here.
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
  jest.clearAllMocks();
  getFrameworkControls.mockResolvedValue({});
  saveFrameworkControls.mockResolvedValue({ success: true });
});

describe("FrameworkTracker", () => {
  it.each(FRAMEWORKS.map((f) => [f.navLabel, f]))(
    "renders every section and requirement for %s",
    async (_label, framework) => {
      render(<FrameworkTracker framework={framework} />);
      expect(
        await screen.findByText(/Requirements: 0 of \d+ completed/),
      ).toBeInTheDocument();
      expect(getFrameworkControls).toHaveBeenCalledWith("acme", framework.slug);
      for (const section of framework.sections) {
        expect(screen.getAllByText(section.title).length).toBeGreaterThan(0);
        for (const req of section.requirements) {
          expect(
            screen.getByText(`${req.key} ${req.title}`),
          ).toBeInTheDocument();
        }
      }
    },
  );

  it("opens a requirement and saves it under its framework", async () => {
    const framework = FRAMEWORKS.find((f) => f.slug === "eu-ai-act")!;
    const req = framework.sections[0].requirements[0];
    render(<FrameworkTracker framework={framework} />);
    fireEvent.click(await screen.findByText(`${req.key} ${req.title}`));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getAllByRole("tab", { name: /Subcontrol/ }),
    ).toHaveLength(req.subcontrols.length);
    // Fill the first field of every subcontrol tab so the requirement completes.
    for (const [i, tab] of within(dialog)
      .getAllByRole("tab", { name: /Subcontrol/ })
      .entries()) {
      fireEvent.mouseDown(tab);
      fireEvent.click(tab);
      const editors = within(dialog).getAllByLabelText("rich-text");
      fireEvent.change(editors[0], {
        target: { value: i === 0 ? "Staff AI literacy training" : "Done" },
      });
    }
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveFrameworkControls).toHaveBeenCalled());
    const [tenant, slug, entries] = saveFrameworkControls.mock.calls[0];
    expect([tenant, slug]).toEqual(["acme", "eu-ai-act"]);
    expect(entries[req.subcontrols[0].key].implementation).toBe(
      "Staff AI literacy training",
    );
    expect(
      await screen.findByText(/Requirements: 1 of \d+ completed/),
    ).toBeInTheDocument();
  });

  it("shows guidance and saves Details directly for flat frameworks", async () => {
    const framework = FRAMEWORKS.find((f) => f.slug === "pci-dss-lite")!;
    const req = framework.sections[0].requirements[0];
    render(<FrameworkTracker framework={framework} />);
    fireEvent.click(await screen.findByText(`${req.key} ${req.title}`));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Summary:")).toBeInTheDocument();
    expect(within(dialog).getByText("Key Questions:")).toBeInTheDocument();
    expect(within(dialog).getByText("Evidence Examples:")).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("tab", { name: /Subcontrol/ }),
    ).toBeNull();

    fireEvent.change(within(dialog).getAllByLabelText("rich-text")[0], {
      target: { value: "Firewall rules reviewed quarterly" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveFrameworkControls).toHaveBeenCalled());
    const [, slug, entries] = saveFrameworkControls.mock.calls[0];
    expect(slug).toBe("pci-dss-lite");
    expect(entries[req.key].implementation).toBe(
      "Firewall rules reviewed quarterly",
    );
    expect(
      await screen.findByText("Requirements: 1 of 10 completed"),
    ).toBeInTheDocument();
  });
});
