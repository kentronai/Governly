import { getNumericParamConfig, getThresholdKind } from "./guardrail-params";

describe("guardrail-params", () => {
  it("treats pii/profanity thresholds as match counts with a minimum of 1", () => {
    for (const key of ["pii.detect", "pii.detect_pii", "profanity.detect"]) {
      expect(getThresholdKind(key)).toBe("count");

      const config = getNumericParamConfig(key, "threshold", 1);
      expect(config.min).toBe(1);
      expect(config.max).toBeUndefined();
      expect(config.step).toBe("1");
    }
  });

  it("treats other guard thresholds as 0.0-1.0 scores", () => {
    expect(getThresholdKind("jailbreak.detect")).toBe("score");

    const config = getNumericParamConfig("jailbreak.detect", "threshold", 0.6);
    expect(config.min).toBe(0);
    expect(config.max).toBe(1);
    expect(config.step).toBe("0.01");
  });

  it("falls back to a plain number field for non-threshold params", () => {
    const config = getNumericParamConfig("pii.detect", "max_length", 512);
    expect(config.min).toBeUndefined();
    expect(config.max).toBeUndefined();
    expect(config.hint).toBe("Default: 512");
  });
});
