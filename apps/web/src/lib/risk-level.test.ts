import { calculateRiskLevel } from "./risk-level";

describe("calculateRiskLevel", () => {
  it.each([
    ["Minor", "Rare", "Low"],
    ["Minor", "Possible", "Low"],
    ["Moderate", "Unlikely", "Medium"],
    ["Major", "Unlikely", "Medium"],
    ["Major", "Possible", "High"],
    ["Moderate", "Likely", "High"],
    ["Major", "Likely", "Critical"],
    ["Catastrophic", "Possible", "Critical"],
  ])("%s x %s = %s", (severity, likelihood, level) => {
    expect(calculateRiskLevel(severity, likelihood)).toBe(level);
  });

  it("is undefined until both are set", () => {
    expect(calculateRiskLevel("Major", undefined)).toBeUndefined();
  });
});
