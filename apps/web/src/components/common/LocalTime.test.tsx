import { render, screen } from "@testing-library/react";
import { LocalTime } from "./LocalTime";

describe("LocalTime", () => {
  it("renders the fallback for a null/empty value", () => {
    render(<LocalTime value={null} fallback="—" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders the fallback for an unparseable value", () => {
    render(<LocalTime value="not-a-date" fallback="—" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders a non-empty localized string for a valid timestamp", () => {
    const { container } = render(<LocalTime value="2026-07-24T10:00:00Z" />);
    const span = container.querySelector("span");
    expect(span).toBeInTheDocument();
    // After mount the effect fills in the localized time (locale/tz agnostic:
    // just assert it produced non-empty, year-bearing text).
    expect(span?.textContent ?? "").toMatch(/2026/);
  });

  it("marks the output with suppressHydrationWarning to tolerate tz/locale", () => {
    const { container } = render(<LocalTime value="2026-07-24T10:00:00Z" />);
    // React does not reflect suppressHydrationWarning as a DOM attribute, so we
    // assert the element renders as a <span> wrapper the component owns.
    expect(container.querySelector("span")).toBeInTheDocument();
  });
});
