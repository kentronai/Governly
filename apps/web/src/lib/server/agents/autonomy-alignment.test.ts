// Capture the update() calls so we can assert what was re-levelled.
const updateWhereCalls: unknown[] = [];
const setSpy = jest.fn();
let rows: Array<{ id: string; name: string; autonomyLevel: string | null }> = [];

jest.mock("@db", () => ({
  agents: { tenantId: "tenantId", id: "id", name: "name", autonomyLevel: "autonomyLevel" },
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve(rows) }) }),
    update: () => ({
      set: (v: unknown) => {
        setSpy(v);
        return { where: (w: unknown) => {
          updateWhereCalls.push(w);
          return Promise.resolve();
        } };
      },
    }),
  },
}));

jest.mock("drizzle-orm", () => ({ eq: (...a: unknown[]) => a }));

import { agentIdentityKey, alignAutonomyByIdentity } from "./autonomy-alignment";

describe("agentIdentityKey", () => {
  it("collapses the same agent deployed across platforms to one identity", () => {
    const key = agentIdentityKey("streamlit-chatbot");
    expect(agentIdentityKey("streamlit-chatbot-agent")).toBe(key);
    expect(agentIdentityKey("streamlit-chatbotagent")).toBe(key);
    expect(key).toBe("streamlitchatbot");
  });

  it("lowercases and removes separators", () => {
    expect(agentIdentityKey("Streamlit_Chatbot")).toBe("streamlitchatbot");
  });

  it("strips a trailing 'agent' token", () => {
    expect(agentIdentityKey("chatbot-agent")).toBe("chatbot");
    expect(agentIdentityKey("chatbot")).toBe("chatbot");
  });

  it("keeps genuinely different agents in distinct groups", () => {
    expect(agentIdentityKey("ArcaAgentCore_ArcaMaster")).not.toBe(
      agentIdentityKey("streamlit-chatbot"),
    );
  });
});

describe("alignAutonomyByIdentity", () => {
  beforeEach(() => {
    updateWhereCalls.length = 0;
    setSpy.mockClear();
  });

  it("raises every deployment of one agent to the group's highest level", async () => {
    rows = [
      { id: "a", name: "streamlit-chatbot", autonomyLevel: "L1" },
      { id: "b", name: "streamlit-chatbot-agent", autonomyLevel: "L2" },
      { id: "c", name: "streamlit-chatbotagent", autonomyLevel: "L3" },
    ];
    const updated = await alignAutonomyByIdentity("tenant-1");
    // L1 and L2 are raised to L3; the L3 one is left alone.
    expect(updated).toBe(2);
    expect(setSpy).toHaveBeenCalledTimes(2);
    expect(setSpy.mock.calls.every(([v]) => v.autonomyLevel === "L3")).toBe(true);
  });

  it("never lowers an agent and leaves singletons untouched", async () => {
    rows = [
      { id: "a", name: "streamlit-chatbot", autonomyLevel: "L3" },
      { id: "x", name: "ArcaAgentCore_ArcaMaster", autonomyLevel: "L4" },
    ];
    const updated = await alignAutonomyByIdentity("tenant-1");
    expect(updated).toBe(0);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("ignores rows without an autonomy level", async () => {
    rows = [{ id: "a", name: "x", autonomyLevel: null }];
    expect(await alignAutonomyByIdentity("tenant-1")).toBe(0);
  });
});
