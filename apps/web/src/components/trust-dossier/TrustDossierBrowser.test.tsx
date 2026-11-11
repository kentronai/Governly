import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  TrustDossierBrowser,
  type TrustDossierCard,
} from "./TrustDossierBrowser";

jest.mock("@/lib/actions/trust-dossier", () => ({
  getTrackedVendorSlugs: jest.fn().mockResolvedValue(["groq"]),
  setVendorTracked: jest.fn().mockResolvedValue({ tracked: true }),
}));
jest.mock("@/lib/utils/toast", () => ({
  errorToast: jest.fn(),
  infoToast: jest.fn(),
}));

const card = (
  slug: string,
  collection: string,
  grade = "A",
): TrustDossierCard => ({
  slug,
  name: slug.toUpperCase(),
  collection,
  group: "G",
  category: "C",
  domains: `${slug}.com`,
  logoUrl: "https://x/y.png",
  grade,
  score: 80,
  rank: 1,
});

it("shows Neo Cloud cards by default with dossier links and track buttons", async () => {
  await act(async () => {
    render(
      <TrustDossierBrowser
        tenant="acme"
        cards={[card("groq", "neo-cloud"), card("n8n", "ai-apps", "B")]}
      />,
    );
  });
  expect(screen.getByText("GROQ")).toBeInTheDocument();
  expect(screen.queryByText("N8N")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View dossier" })).toHaveAttribute(
    "href",
    "/acme/admin/trust-dossier/groq",
  );
  expect(screen.getByRole("button", { name: /Tracked/ })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Tracked (1)" })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Search vendors"), {
    target: { value: "zzz" },
  });
  expect(
    screen.getByText("No vendors match these filters."),
  ).toBeInTheDocument();
});
