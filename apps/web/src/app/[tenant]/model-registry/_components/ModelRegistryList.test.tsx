import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ModelRegistryList } from "./ModelRegistryList";

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/lib/actions/provider-models", () => ({
  createProviderModel: jest.fn(),
  updateProviderModel: jest.fn(),
  deleteProviderModel: jest.fn(),
}));

// Modals pull in heavy form/upload dependencies that aren't under test here;
// stub them so we can assert they are opened for the right model.
jest.mock("./ProviderModelModal", () => ({
  ProviderModelModal: (props: { isOpen: boolean; mode: string; model?: any }) =>
    props.isOpen ? (
      <div role="dialog" aria-label={`${props.mode} model`}>
        {props.model?.modelId}
      </div>
    ) : null,
}));
jest.mock("@/components/common/DeleteConfirmationModal", () => ({
  DeleteConfirmationModal: (props: { isOpen: boolean; itemName: string }) =>
    props.isOpen ? (
      <div role="dialog" aria-label="delete model">
        {props.itemName}
      </div>
    ) : null,
}));

const gemini = {
  id: "m1",
  provider: "gemini",
  modelId: "gemini-2.5-pro",
  displayName: "Gemini 2.5 Pro",
  tenantId: "t1",
  availabilityStatus: "available",
  riskLevel: "Medium" as const,
  contextWindowTokens: 1048576,
  inputCostPer1K: "0.00125",
  outputCostPer1K: "0.01",
  isSelected: true,
  connectionStatus: "error" as const,
  connectionMessage: "Gemini rejected the connection test (HTTP 400).",
  lastTestedAt: "2026-11-02T15:26:30.000Z",
};

const huggingFace = {
  id: "m2",
  provider: "huggingface",
  modelId: "meta-llama/Llama-3-8B",
  displayName: null,
  tenantId: null,
  availabilityStatus: "preview",
  riskLevel: null,
  contextWindowTokens: null,
  inputCostPer1K: null,
  outputCostPer1K: null,
  isSelected: false,
};

const renderList = (models: any[] = [gemini, huggingFace]) =>
  render(
    <ModelRegistryList
      initialModels={models}
      tenant="acme"
      tenantId="t1"
      userId="u1"
    />,
  );

const rowFor = (name: string) =>
  screen.getByRole("link", { name }).closest("tr") as HTMLElement;

// jsdom has no PointerEvent, so open the Radix menu the keyboard way.
const openActions = (name: string) => {
  const trigger = screen.getByRole("button", { name: `Actions for ${name}` });
  fireEvent.keyDown(trigger, { key: "Enter" });
  return screen.getByRole("menu");
};

describe("ModelRegistryList table", () => {
  beforeEach(() => mockPush.mockClear());

  it("renders models in a table with the expected columns", () => {
    renderList();
    const headers = within(screen.getByRole("table"))
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    expect(headers).toEqual([
      "Model",
      "Provider",
      "Status",
      "Risk Level",
      "Context Window",
      "Cost / 1K (in / out)",
      "Scope",
      "Actions",
    ]);
    // header row + one row per model
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("shows each model's details in its row", () => {
    renderList();
    const row = within(rowFor("Gemini 2.5 Pro"));
    expect(row.getByText("gemini-2.5-pro")).toBeInTheDocument();
    expect(row.getByText("Selected")).toBeInTheDocument();
    expect(row.getByText("Google (Gemini)")).toBeInTheDocument();
    expect(row.getByText("Medium")).toBeInTheDocument();
    expect(row.getByText("1,048,576 tokens")).toBeInTheDocument();
    expect(row.getByText("$0.0013 / $0.0100")).toBeInTheDocument();
    expect(row.getByText("Organization")).toBeInTheDocument();
  });

  it('capitalizes availability status ("available" → "Available")', () => {
    renderList();
    expect(
      within(rowFor("Gemini 2.5 Pro")).getByText("Available"),
    ).toBeInTheDocument();
    expect(
      within(rowFor("meta-llama/Llama-3-8B")).getByText("Preview"),
    ).toBeInTheDocument();
    expect(screen.queryByText("available")).not.toBeInTheDocument();
  });

  it("falls back to model ID, dashes and Global for sparse models", () => {
    renderList();
    const row = within(rowFor("meta-llama/Llama-3-8B"));
    expect(row.getByText("Hugging Face")).toBeInTheDocument();
    expect(row.getByText("Global")).toBeInTheDocument();
    expect(row.getAllByText("—")).toHaveLength(3); // risk, context, cost
    expect(row.queryByText("Selected")).not.toBeInTheDocument();
  });

  it("links the model name to its report", () => {
    renderList();
    expect(screen.getByRole("link", { name: "Gemini 2.5 Pro" })).toHaveAttribute(
      "href",
      "/acme/model-registry/m1/report",
    );
  });

  it("filters rows by search", () => {
    renderList();
    fireEvent.change(screen.getByPlaceholderText(/search models/i), {
      target: { value: "llama" },
    });
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(rowFor("meta-llama/Llama-3-8B")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Gemini 2.5 Pro" }),
    ).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing matches", () => {
    renderList();
    fireEvent.change(screen.getByPlaceholderText(/search models/i), {
      target: { value: "no-such-model" },
    });
    expect(screen.getByText("No models found")).toBeInTheDocument();
  });

  it("shows an empty state when there are no models", () => {
    renderList([]);
    expect(
      screen.getByText("No models yet. Add one to get started!"),
    ).toBeInTheDocument();
  });

  describe("actions menu", () => {
    it("offers View report, Edit and Delete", () => {
      renderList();
      const menu = openActions("Gemini 2.5 Pro");
      expect(
        within(menu)
          .getAllByRole("menuitem")
          .map((item) => item.textContent),
      ).toEqual(["View report", "Edit", "Delete"]);
    });

    it("View report navigates to the model report", () => {
      renderList();
      fireEvent.click(
        within(openActions("Gemini 2.5 Pro")).getByRole("menuitem", {
          name: "View report",
        }),
      );
      expect(mockPush).toHaveBeenCalledWith("/acme/model-registry/m1/report");
    });

    it("Edit opens the edit modal for that model", () => {
      renderList();
      fireEvent.click(
        within(openActions("Gemini 2.5 Pro")).getByRole("menuitem", {
          name: "Edit",
        }),
      );
      expect(
        screen.getByRole("dialog", { name: "edit model" }),
      ).toHaveTextContent("gemini-2.5-pro");
    });

    it("Delete opens the delete confirmation for that model", () => {
      renderList();
      fireEvent.click(
        within(openActions("Gemini 2.5 Pro")).getByRole("menuitem", {
          name: "Delete",
        }),
      );
      expect(
        screen.getByRole("dialog", { name: "delete model" }),
      ).toHaveTextContent("Gemini 2.5 Pro");
    });
  });

  it("no longer shows the Connection / Playground section", () => {
    renderList();
    for (const text of [
      "Connection error",
      "Selected for Playground",
      "Use in Playground",
      "Gemini rejected the connection test (HTTP 400).",
    ]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/Last tested/)).not.toBeInTheDocument();
  });

  it("keeps the page header and Add Model action", () => {
    renderList();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Organization Approved Models",
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add model/i }));
    expect(
      screen.getByRole("dialog", { name: "create model" }),
    ).toBeInTheDocument();
  });
});
