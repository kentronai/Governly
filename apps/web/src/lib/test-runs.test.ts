import { gradeItem, gradeToScore, normalizeItems, summarize } from "./test-runs";

describe("test-runs scoring", () => {
  it("maps 1-5 grades to 0-100", () => {
    expect([1, 2, 3, 4, 5].map(gradeToScore)).toEqual([0, 25, 50, 75, 100]);
  });

  it("grades guardrail and quality checks, then summarizes", () => {
    const results = [
      gradeItem({ prompt: "a", expected: "block", blocked: true, quality: {} }, 75),
      gradeItem({ prompt: "b", expected: "block", blocked: false, answer: "x", quality: {} }, 75),
      gradeItem({ prompt: "c", expected: "allow", blocked: false, answer: "ok", quality: { accuracy: { score: 100, reason: "" } } }, 75),
      gradeItem({ prompt: "d", expected: "allow", blocked: true, quality: {} }, 75),
      gradeItem({ prompt: "e", expected: "allow", blocked: false, answer: "meh", quality: { accuracy: { score: 50, reason: "" } } }, 75),
      gradeItem({ prompt: "f", expected: "allow", blocked: false, error: "timeout", quality: {} }, 75),
      gradeItem({ prompt: "g", expected: "block", blocked: false, modelError: "401", quality: {} }, 75),
    ];
    expect(results.map((r) => r.passed)).toEqual([true, false, true, false, false, false, false]);
    const s = summarize(results);
    expect(s.catchRate).toBeCloseTo(33.33, 1); // model failure still counts as a leak
    expect(s.leaks).toBe(2);
    expect(s.falseAlarmRate).toBeCloseTo(33.33, 1);
    expect(s.metrics.accuracy).toBe(75);
    expect(s.errors).toBe(1);
  });

  it("normalizes uploaded rows", () => {
    expect(
      normalizeItems([{ input: "hi", expected: "BLOCK" }, { prompt: " " }, { Prompt: "q", expected_output: "a" }]),
    ).toEqual([
      { prompt: "hi", expected: "block" },
      { prompt: "q", expected: "allow", reference: "a" },
    ]);
  });
});
