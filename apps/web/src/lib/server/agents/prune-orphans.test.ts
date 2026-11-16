jest.mock("server-only", () => ({}));

const whereMock = jest.fn(async (..._a: unknown[]) => undefined);
jest.mock("@db", () => ({
  agents: { externalAgentId: "externalAgentId" },
  integrations: {},
  db: { update: () => ({ set: () => ({ where: whereMock }) }) },
}));
jest.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ["and", ...a],
  notInArray: (...a: unknown[]) => ["notIn", ...a],
}));

import { retireMissingAgents } from "./prune-orphans";

describe("retireMissingAgents", () => {
  beforeEach(() => whereMock.mockClear());

  it("never retires on a partial scan", async () => {
    expect(await retireMissingAgents("scope" as never, ["a"], ["us-east-1 Bedrock: 503"])).toBe(false);
    expect(whereMock).not.toHaveBeenCalled();
  });

  it("retires agents not seen by a complete scan", async () => {
    expect(await retireMissingAgents("scope" as never, ["a"], [])).toBe(true);
    expect(whereMock).toHaveBeenCalledWith(["and", "scope", ["notIn", "externalAgentId", ["a"]]]);
  });
});
