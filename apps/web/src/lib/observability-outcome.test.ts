import {
  classifyLogOutcome,
  describeRouting,
  getErrorMessage,
  getPolicyDecision,
} from "./observability-outcome";

describe("observability-outcome", () => {
  it("classifies a passing request as allowed", () => {
    expect(
      classifyLogOutcome({
        statusCode: 200,
        guardrailResults: {
          policy_decision: "allow",
          blocked: false,
          _summary: { decision: "allow", was_blocked: false },
        },
      }),
    ).toBe("allowed");
  });

  it("classifies a guardrail violation as blocked", () => {
    expect(
      classifyLogOutcome({
        statusCode: 400,
        guardrailResults: {
          policy_decision: "block",
          blocked: true,
          _summary: { decision: "block", was_blocked: true },
        },
      }),
    ).toBe("blocked");
  });

  it("does not report a provider failure as a policy block", () => {
    // The guards allowed the request; the upstream model provider rejected it.
    // This is the row that used to render "Blocked" next to Decision "allow".
    expect(
      classifyLogOutcome({
        statusCode: 400,
        guardrailResults: {
          policy_decision: "allow",
          blocked: false,
          _summary: { decision: "allow", was_blocked: false },
        },
      }),
    ).toBe("error");
  });

  it("treats a failure with no guardrail decision as an error", () => {
    expect(
      classifyLogOutcome({ statusCode: 404, guardrailResults: null }),
    ).toBe("error");
  });

  it("trusts a recorded block even when the status code looks successful", () => {
    // Streaming responses are already committed to a 200 when an output guard
    // fires mid-stream.
    expect(
      classifyLogOutcome({
        statusCode: 200,
        guardrailResults: { _summary: { was_blocked: true } },
      }),
    ).toBe("blocked");
  });

  it("does not read a pipeline failure as an approval", () => {
    // e.g. a missing provider key or an unresolvable model: recorded as a
    // violation by the pipeline, but not a guardrail decision.
    const log = {
      statusCode: 400,
      guardrailResults: {
        policy_decision: "error",
        blocked: false,
        _summary: { decision: "error", was_blocked: false },
      },
    };
    expect(getPolicyDecision(log.guardrailResults)).toBeNull();
    expect(classifyLogOutcome(log)).toBe("error");
  });

  it("reads the decision from any of the shapes the gateway writes", () => {
    expect(getPolicyDecision({ blocked: true })).toBe("block");
    expect(getPolicyDecision({ _summary: { decision: "allow" } })).toBe(
      "allow",
    );
    expect(getPolicyDecision(null)).toBeNull();
    expect(getPolicyDecision({ input_guards: [] })).toBeNull();
  });

  it("surfaces the underlying failure message", () => {
    expect(
      getErrorMessage({
        statusCode: 400,
        responsePayload: {
          detail: {
            type: "provider_error",
            message: "The model provider rejected the request (HTTP 400).",
          },
        },
      }),
    ).toBe("The model provider rejected the request (HTTP 400).");

    expect(getErrorMessage({ statusCode: 502 })).toBe(
      "Request failed with HTTP 502",
    );

    // The provider's own words beat the gateway's generic summary.
    expect(
      getErrorMessage({
        statusCode: 400,
        responsePayload: {
          error: {
            type: "provider_error",
            message: "The model provider rejected the request (HTTP 400).",
            provider_message: "The model `x` does not exist",
          },
        },
      }),
    ).toBe("The model `x` does not exist");
  });
});

describe("describeRouting", () => {
  it("flags when the Model Registry selection overrode the requested model", () => {
    expect(
      describeRouting({
        model: "gpt-4o-mini",
        routed_model: "gemini-2.0-flash",
        routed_provider: "gemini",
      }),
    ).toBe(
      'gemini / gemini-2.0-flash — overrides requested "gpt-4o-mini" (Model Registry selection)',
    );
  });

  it("stays quiet when the request went where it asked to go", () => {
    expect(
      describeRouting({
        model: "gpt-4o-mini",
        routed_model: "gpt-4o-mini",
        routed_provider: "openai",
      }),
    ).toBe("openai / gpt-4o-mini");
    expect(describeRouting({ model: "gpt-4o-mini" })).toBeNull();
    expect(describeRouting(null)).toBeNull();
  });
});
