export type ComplianceStatus =
  | "compliant"
  | "partially_compliant"
  | "non_compliant";
export type ControlStatus =
  | "verified"
  | "partial"
  | "missing"
  | "not_applicable";

export function calculateComplianceProgress<
  T extends { status: ControlStatus; required?: boolean },
>(controls: T[]) {
  const required = controls.filter(
    (control) =>
      control.required !== false && control.status !== "not_applicable",
  );
  const gaps = required.filter(
    (control) => control.status === "missing" || control.status === "partial",
  );
  const points = required.reduce(
    (sum, control) =>
      sum +
      (control.status === "verified"
        ? 1
        : control.status === "partial"
          ? 0.5
          : 0),
    0,
  );
  const coverageScore = required.length
    ? Math.round((points / required.length) * 10000) / 100
    : 0;
  // An applicable policy with no machine mappings must never appear compliant.
  const complianceStatus: ComplianceStatus =
    required.length === 0 || gaps.some((gap) => gap.status === "missing")
      ? "non_compliant"
      : gaps.length
        ? "partially_compliant"
        : "compliant";
  return { required, gaps, coverageScore, complianceStatus };
}
