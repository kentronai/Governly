import React from "react";
import fs from "fs";
import path from "path";
import { render, screen } from "@testing-library/react";
import {
  PAGE_DESCRIPTION_CLASS,
  PAGE_TITLE_CLASS,
  PageHeader,
  PageTitle,
} from "./PageHeader";

describe("PageHeader", () => {
  it("renders the title as an h1 with the standard size", () => {
    render(<PageHeader title="Applications" />);
    const heading = screen.getByRole("heading", { level: 1, name: "Applications" });
    expect(heading).toHaveClass("text-2xl", "font-bold");
    expect(heading.className).toBe(PAGE_TITLE_CLASS);
  });

  it("renders an optional muted description", () => {
    render(<PageHeader title="Models" description="Browse models" />);
    expect(screen.getByText("Browse models")).toHaveClass(PAGE_DESCRIPTION_CLASS);
  });

  it("omits the description when not provided", () => {
    const { container } = render(<PageHeader title="Models" />);
    expect(container.querySelector("p")).toBeNull();
  });

  it("renders right-aligned actions", () => {
    render(
      <PageHeader title="Models" actions={<button type="button">Add Model</button>} />,
    );
    expect(screen.getByRole("button", { name: "Add Model" })).toBeInTheDocument();
  });
});

describe("PageTitle", () => {
  it("renders an h1 with the standard size plus spacing classes", () => {
    render(<PageTitle className="mb-2">Risks</PageTitle>);
    const heading = screen.getByRole("heading", { level: 1, name: "Risks" });
    expect(heading).toHaveClass("text-2xl", "font-bold", "mb-2");
  });
});

describe("no hand-written page headings (CLAUDE.md rule 4)", () => {
  const SRC = path.resolve(__dirname, "../..");
  // Files allowed to contain a raw <h1>: the component itself, and an export
  // that builds standalone report HTML (not rendered in the app shell).
  const ALLOWED = new Set([
    "components/common/PageHeader.tsx",
    "components/agent-discovery/ReportExports.tsx",
  ]);
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name.endsWith(".tsx") && !entry.name.includes(".test.")
        ? [full]
        : [];
    });

  it("every page title uses PageHeader / PageTitle", () => {
    const offenders = walk(SRC)
      .map((file) => path.relative(SRC, file))
      .filter((file) => !ALLOWED.has(file))
      .filter((file) =>
        /<h1[\s>]/.test(fs.readFileSync(path.join(SRC, file), "utf8")),
      );
    expect(offenders).toEqual([]);
  });

  it("PageTitle is never given a font size, weight or colour", () => {
    const offenders = walk(SRC)
      .map((file) => path.relative(SRC, file))
      .flatMap((file) =>
        Array.from(
          fs
            .readFileSync(path.join(SRC, file), "utf8")
            .matchAll(/<PageTitle className="([^"]*)"/g),
        )
          .filter(([, cls]) =>
            /(^|\s)(\w+:)?(text-|font-|tracking-|leading-)/.test(cls),
          )
          .map(([match]) => `${file}: ${match}`),
      );
    expect(offenders).toEqual([]);
  });
});

describe("pages using the standard header", () => {
  const APP_DIR = path.resolve(__dirname, "../../app/[tenant]");

  it.each([
    ["applications/_components/ApplicationsList.tsx", "Applications"],
    ["model-registry/_components/ModelRegistryList.tsx", "Organization Approved Models"],
  ])("%s renders its title through <PageHeader>", (file, title) => {
    const source = fs.readFileSync(path.join(APP_DIR, file), "utf8");
    expect(source).toContain(`<PageHeader`);
    expect(source).toContain(`title="${title}"`);
    expect(source).not.toMatch(/<h1\b/);
  });
});
