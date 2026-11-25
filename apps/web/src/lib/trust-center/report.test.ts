import { frameworkRow, lastFullQuarter, NOT_APPLICABLE, splitSubprocessors } from "./report";

describe("AI Trust Center report data", () => {
  const fw = { name: "HIPAA", scope: "Protected health information" };

  it("never leaves a not-enabled framework blank: Not applicable with a reason", () => {
    const row = frameworkRow(fw, { enabled: false, total: 10, done: 0, withEvidence: 0, lastUpdated: null });
    expect(row.status).toBe(NOT_APPLICABLE);
    expect(row.evidence).toMatch(/Not in scope/);
    expect(frameworkRow(fw, null, { notApplicableReason: "We do not process PHI" }).evidence).toBe("We do not process PHI");
    expect(frameworkRow(fw, { enabled: true, total: 4, done: 2, withEvidence: 1, lastUpdated: null }).status).toBe("In progress (50%)");
    const assessed = frameworkRow(fw, { enabled: false, total: 0, done: 0, withEvidence: 0, lastUpdated: "2026-11-03", assessedApps: 2, avgCoverage: 41.6 });
    expect(assessed.status).toBe("Partially aligned (42% coverage)");
    expect(assessed.evidence).toMatch(/2 applications/);
  });

  it("lists removed sub-processors only when asked, and defaults to the last full quarter", () => {
    const rows = [{ slug: "a", removedAt: null }, { slug: "b", removedAt: "2026-10-01T00:00:00Z" }];
    expect(splitSubprocessors(rows, false)).toEqual({ active: [rows[0]], previous: [] });
    expect(splitSubprocessors(rows, true).previous).toEqual([rows[1]]);
    expect(lastFullQuarter(new Date("2026-02-10T00:00:00Z"))).toMatchObject({ start: "2025-10-01", end: "2025-12-31" });
  });
});
