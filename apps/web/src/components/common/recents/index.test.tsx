import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";

import RecentEndpointsTable from "./index";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/acme/observability",
  useSearchParams: () => new URLSearchParams(),
}));

const baseLog = {
  id: "log-1",
  tenantId: "tenant-1",
  applicationId: null,
  agentId: null,
  policyId: null,
  requestId: "req_1",
  timestamp: "2026-08-08T23:52:00.000Z",
  method: "POST",
  path: "/v1/chat/completions",
  latencyMs: 75,
  responsePayload: null,
  metadata: {},
  createdAt: "2026-08-08T23:52:00.000Z",
  applicationName: "Chatbot",
  agentName: null,
  requestPayload: { model: "gpt-4o-mini", messages: [] },
} as any;

const renderTable = (data: any[]) =>
  render(
    <RecentEndpointsTable
      logs={{
        data,
        page: 1,
        limit: 10,
        total: data.length,
        totalPage: 1,
        prev: null,
        next: null,
      }}
      isLoading={false}
      isFetching={false}
      refetch={jest.fn()}
    />,
  );

const statusCellOf = (rowIndex: number) =>
  within(screen.getAllByRole("row")[rowIndex + 1]).getAllByRole("cell")[1];

describe("RecentEndpointsTable", () => {
  it("labels an upstream failure as Error, not Blocked", () => {
    // The row that made the dashboard contradict itself: the guards allowed
    // the request and the model provider then rejected it with a 400.
    renderTable([
      {
        ...baseLog,
        statusCode: 400,
        guardrailResults: {
          policy_decision: "allow",
          blocked: false,
          _summary: { decision: "allow", was_blocked: false },
        },
      },
    ]);

    expect(statusCellOf(0)).toHaveTextContent("Error");
    expect(statusCellOf(0)).not.toHaveTextContent("Blocked");
  });

  it("still labels a real guardrail violation as Blocked", () => {
    renderTable([
      {
        ...baseLog,
        statusCode: 400,
        guardrailResults: {
          policy_decision: "block",
          blocked: true,
          _summary: {
            decision: "block",
            was_blocked: true,
            violation: { phase: "input", rule_id: "toxicity.block" },
          },
        },
      },
    ]);

    expect(statusCellOf(0)).toHaveTextContent("Blocked");
  });

  it("labels a successful request as Allowed", () => {
    renderTable([
      {
        ...baseLog,
        statusCode: 200,
        guardrailResults: {
          policy_decision: "allow",
          blocked: false,
          _summary: { decision: "allow", was_blocked: false },
        },
      },
    ]);

    expect(statusCellOf(0)).toHaveTextContent("Allowed");
  });

  it("does not invent a decision when the guardrails never ran", () => {
    renderTable([{ ...baseLog, statusCode: 401, guardrailResults: null }]);

    expect(statusCellOf(0)).toHaveTextContent("Error");
    expect(screen.getByText("No decision")).toBeInTheDocument();
  });

  describe("expanded detail", () => {
    const expandFirstRow = () => {
      fireEvent.keyDown(screen.getAllByRole("button", { name: "Row actions" })[0], { key: "Enter" });
      fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: /view/i }));
    };

    it("lists every guardrail that ran, with the violated one marked", () => {
      renderTable([
        {
          ...baseLog,
          statusCode: 400,
          guardrailResults: {
            policy_decision: "block",
            blocked: true,
            input_guards: [
              {
                id: "pii.detect",
                name: "PII Protection",
                tier: "T0",
                status: "passed",
              },
              {
                id: "toxicity.detect",
                name: "Toxicity Detect",
                tier: "T1",
                status: "passed",
              },
            ],
            output_guards: [],
            violated_rule: { rule_id: "toxicity.detect" },
            _summary: {
              decision: "block",
              was_blocked: true,
              violation: { phase: "input", rule_id: "toxicity.detect" },
            },
          },
        },
      ]);
      expandFirstRow();

      expect(screen.getByText("PII Protection")).toBeInTheDocument();
      expect(screen.getByText("Toxicity Detect")).toBeInTheDocument();
      // The guard named in violated_rule is the one that blocked, even though
      // the gateway recorded its per-guard status as "passed".
      expect(screen.getByText("violated")).toBeInTheDocument();
      expect(screen.getAllByText("passed")).toHaveLength(1);
    });

    it("shows the detector score, threshold and categories for a block", () => {
      // Shape taken verbatim from a production harmful_instructions block.
      renderTable([
        {
          ...baseLog,
          statusCode: 400,
          guardrailResults: {
            policy_decision: "block",
            blocked: true,
            input_guards: [],
            output_guards: [],
            violated_rule: { rule_id: "harmful_instructions.detect" },
            violated_guard: {
              rule_id: "harmful_instructions.detect",
              severity: "high",
              score: 0.92,
              evidence: {
                threshold: 0.75,
                detected_categories: ["theft_and_burglary"],
              },
            },
            _summary: {
              decision: "block",
              was_blocked: true,
              violation: {
                phase: "input",
                rule_id: "harmful_instructions.detect",
                message:
                  "Request for actionable criminal or harmful instructions detected",
              },
            },
          },
        },
      ]);
      expandFirstRow();

      expect(screen.getByText("0.92")).toBeInTheDocument();
      expect(screen.getByText("0.75")).toBeInTheDocument();
      expect(screen.getByText("theft_and_burglary")).toBeInTheDocument();
    });

    it("explains an empty guard list instead of showing a bare zero", () => {
      // Production rows blocked in the pipeline carry input_guards: [].
      renderTable([
        {
          ...baseLog,
          statusCode: 400,
          guardrailResults: {
            policy_decision: "allow",
            blocked: false,
            input_guards: [],
            output_guards: [],
            _summary: { decision: "allow", was_blocked: false },
          },
        },
      ]);
      expandFirstRow();

      expect(
        screen.getByText(/No guardrail ran on this request/),
      ).toBeInTheDocument();
    });

    it("shows the model's reply for an allowed request", () => {
      renderTable([
        {
          ...baseLog,
          statusCode: 200,
          responsePayload: {
            choices: [
              { message: { role: "assistant", content: "Hello there!" } },
            ],
          },
          guardrailResults: {
            policy_decision: "allow",
            blocked: false,
            input_guards: [
              { id: "pii.detect", name: "PII Protection", status: "passed" },
            ],
            _summary: { decision: "allow", was_blocked: false },
          },
        },
      ]);
      expandFirstRow();

      expect(screen.getByText("Hello there!")).toBeInTheDocument();
    });

    it("renders a policy-check row without inventing model data", () => {
      // NORIX never called a model here — the customer's own LLM answered.
      renderTable([
        {
          ...baseLog,
          path: "/v1/guard/check",
          statusCode: 200,
          requestPayload: { messages: [{ role: "user", content: "hi" }] },
          responsePayload: {
            allowed: true,
            decision: "allow",
            violation: null,
          },
          guardrailResults: {
            policy_decision: "allow",
            blocked: false,
            input_guards: [
              {
                id: "toxicity.detect",
                name: "Toxicity Detect",
                status: "passed",
              },
            ],
            _summary: { decision: "allow", was_blocked: false },
          },
        },
      ]);

      expect(statusCellOf(0)).toHaveTextContent("Allowed");
      // The Model column must not claim "Unknown" — there is no model by design.
      expect(screen.getByText("Policy check")).toBeInTheDocument();

      expandFirstRow();
      expect(
        screen.getByText(
          /generated by your own model, which NORIX does not see/,
        ),
      ).toBeInTheDocument();
    });

    it("surfaces the provider's own words when the request failed", () => {
      renderTable([
        {
          ...baseLog,
          statusCode: 400,
          responsePayload: {
            error: {
              type: "provider_error",
              message: "The model provider rejected the request (HTTP 400).",
              provider_message: "models/Google Gemini is not found",
            },
          },
          guardrailResults: {
            policy_decision: "allow",
            blocked: false,
            _summary: { decision: "allow", was_blocked: false },
          },
        },
      ]);
      expandFirstRow();

      expect(screen.getByText("Request Failed")).toBeInTheDocument();
      expect(
        screen.getByText("models/Google Gemini is not found"),
      ).toBeInTheDocument();
    });
  });
});
