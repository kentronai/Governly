import { computeFairness } from "./fairness";

const rows = (spec: [string, string, string?][]) =>
  spec.map(([g, d, y]) => ({ gender: g, hired: d, actual: y }));

// 10 women, 4 hired (0.4); 10 men, 6 hired (0.6) -> impact ratio 0.6667 (< 0.8, fails).
const data = [
  ...Array.from({ length: 10 }, (_, i) => ["F", i < 4 ? "1" : "0", i < 5 ? "1" : "0"] as [string, string, string]),
  ...Array.from({ length: 10 }, (_, i) => ["M", i < 6 ? "1" : "0", i < 6 ? "1" : "0"] as [string, string, string]),
];

test("selection rates, impact ratio and the four-fifths rule", () => {
  const r = computeFairness({ rows: rows(data), groupColumn: "gender", decisionColumn: "hired", positiveValue: "1" });
  expect(r.rows).toBe(20);
  expect(r.groups.map((g) => [g.group, g.selectionRate, g.impactRatio])).toEqual([
    ["F", 0.4, 0.6667],
    ["M", 0.6, 1],
  ]);
  expect(r.minImpactRatio).toBe(0.6667);
  expect(r.demographicParityDifference).toBe(0.2);
  expect(r.passed).toBe(false);
  expect(r.groups.every((g) => g.small)).toBe(true);
});

test("equal opportunity from a true-label column", () => {
  const r = computeFairness({
    rows: rows(data), groupColumn: "gender", decisionColumn: "hired", positiveValue: "1", labelColumn: "actual",
  });
  // F: 5 truly positive, 4 of them hired -> 0.8. M: 6 truly positive, all 6 hired -> 1.
  expect(r.groups.find((g) => g.group === "F")!.truePositiveRate).toBe(0.8);
  expect(r.equalOpportunityDifference).toBe(0.2);
});

test("equal rates pass, empty cells are skipped, one group is rejected", () => {
  const ok = computeFairness({
    rows: rows([["A", "1"], ["A", "0"], ["B", "1"], ["B", "0"], ["", "1"]]),
    groupColumn: "gender", decisionColumn: "hired", positiveValue: "1",
  });
  expect(ok.passed).toBe(true);
  expect(ok.skipped).toBe(1);
  expect(() =>
    computeFairness({ rows: rows([["A", "1"]]), groupColumn: "gender", decisionColumn: "hired", positiveValue: "1" }),
  ).toThrow("two groups");
});
