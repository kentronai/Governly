// A chainable stub that resolves to a fixed value for any drizzle query builder
// chain (insert().values().returning(), update().set().where(), etc.).
function chain(returnValue: unknown = []) {
  const p: any = Promise.resolve(returnValue);
  const handler = () => builder;
  const builder: any = {
    values: handler,
    set: handler,
    where: handler,
    from: handler,
    returning: () => Promise.resolve(returnValue),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  };
  return builder;
}

const findFirstMock = jest.fn(async () => null);

jest.mock("@db", () => ({
  agents: {
    integrationId: "integrationId",
    externalAgentId: "externalAgentId",
    id: "id",
  },
  agentResources: {},
  agentRecommendations: { agentId: "agentId", status: "status" },
  discoveryScans: { id: "id" },
  integrations: { id: "id" },
  db: {
    insert: () => chain([{ id: "scan-1" }]),
    update: () => chain([]),
    delete: () => chain([]),
    query: { agents: { findFirst: (...a: unknown[]) => findFirstMock(...a) } },
  },
}));

jest.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => a,
  notInArray: (...a: unknown[]) => a,
}));

jest.mock("@/lib/server/crypto", () => ({
  decryptSecret: (v: string) => v, // credentials stored as plain JSON in tests
}));

const crewaiApiMock = jest.fn();
jest.mock("./api-client", () => ({
  CREWAI_DEFAULT_BASE_URL: "https://app.crewai.com",
  CREWAI_ENDPOINTS: { crews: "/crews" },
  crewaiApi: (...a: unknown[]) => crewaiApiMock(...a),
}));

jest.mock("@/lib/server/agents/capability-engine", () => ({
  buildCapabilityFacts: () => ({ isDormant: false }),
}));
jest.mock("@/lib/server/agents/autonomy-engine", () => ({
  classifyAutonomy: async () => ({
    level: "L2",
    reason: "r",
    evidence: [],
    confidence: 0.6,
  }),
}));
jest.mock("@/lib/server/agents/risk-engine", () => ({
  assessRisk: async () => ({ score: 40, level: "Medium", factors: [] }),
}));
jest.mock("@/lib/server/agents/ownership-engine", () => ({
  detectOwnership: async () => ({
    ownerUserId: null,
    ownerSource: null,
    ownerConfidence: 0,
    businessFunction: null,
  }),
}));
jest.mock("@/lib/server/agents/recommendations-engine", () => ({
  generateRecommendations: () => [],
}));
jest.mock("@/lib/server/policy-enforcement/agent-policy-sync", () => ({
  syncAgentPolicyEvaluations: async () => undefined,
}));

import {
  parseCrewAICredentials,
  testCrewAIConnection,
  discoverCrewAI,
  runCrewAIDiscoveryScan,
  type CrewAIConnection,
} from "./discovery-orchestrator";

const creds = JSON.stringify({
  baseUrl: "https://app.crewai.com",
  accessToken: "pat_test",
});
const connection: CrewAIConnection = {
  id: "int-1",
  name: "CrewAI",
  configuration: {},
  credentialsEncrypted: creds,
};

const onlineCrew = {
  uuid: "u1",
  name: "streamlit-chatbot-agent",
  status: "Crew is Online",
  state: "Successful",
  description: "A chatbot",
  public_url: "https://x.crewai.com",
  error_message: null,
  tags: ["prod"],
};

beforeEach(() => {
  jest.clearAllMocks();
  findFirstMock.mockResolvedValue(null);
});

describe("parseCrewAICredentials", () => {
  it("parses stored credentials", () => {
    const c = parseCrewAICredentials(connection);
    expect(c.accessToken).toBe("pat_test");
    expect(c.baseUrl).toBe("https://app.crewai.com");
  });
  it("throws when credentials are absent", () => {
    expect(() =>
      parseCrewAICredentials({ ...connection, credentialsEncrypted: null }),
    ).toThrow(/no stored credentials/i);
  });
  it("throws when the token is missing", () => {
    expect(() =>
      parseCrewAICredentials({
        ...connection,
        credentialsEncrypted: JSON.stringify({
          baseUrl: "https://app.crewai.com",
        }),
      }),
    ).toThrow(/access token is missing/i);
  });
});

describe("testCrewAIConnection", () => {
  it("returns ok when crews can be listed", async () => {
    crewaiApiMock.mockResolvedValueOnce([]);
    expect(await testCrewAIConnection(connection)).toEqual({ ok: true });
  });
  it("returns the error when the API rejects", async () => {
    crewaiApiMock.mockRejectedValueOnce(new Error("Bad credentials"));
    const r = await testCrewAIConnection(connection);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/bad credentials/i);
  });
});

describe("discoverCrewAI", () => {
  it("maps a crew to a governed agent (array response)", async () => {
    crewaiApiMock.mockResolvedValueOnce([onlineCrew]);
    const d = await discoverCrewAI({
      baseUrl: "https://app.crewai.com",
      accessToken: "pat_test",
    });
    expect(d.baseHost).toBe("app.crewai.com");
    expect(d.agents).toHaveLength(1);
    const agent = d.agents[0];
    expect(agent.platform).toBe("crewai");
    expect(agent.externalAgentId).toBe("u1");
    expect(agent.discoverySource).toBe("crewai_crew");
    expect(agent.resources[0].metadata.publicNetworkAccess).toBe("Enabled");
    expect(agent.resources[0].tags).toEqual({ prod: "true" });
  });
  it("reads crews from a wrapped { data: [...] } response", async () => {
    crewaiApiMock.mockResolvedValueOnce({ data: [onlineCrew] });
    const d = await discoverCrewAI({
      baseUrl: "https://app.crewai.com",
      accessToken: "pat_test",
    });
    expect(d.agents).toHaveLength(1);
  });
});

describe("runCrewAIDiscoveryScan", () => {
  it("persists an active crew and returns a completed result", async () => {
    crewaiApiMock.mockResolvedValueOnce([onlineCrew]);
    const r = await runCrewAIDiscoveryScan(
      "tenant-1",
      "int-1",
      connection,
      "user-1",
    );
    expect(r.status).toBe("completed");
    expect(r.agentsDiscovered).toBe(1);
    expect(r.resourcesScanned).toEqual({ crewai_crew: 1 });
  });

  it("marks a failed-state crew inactive but still completes", async () => {
    crewaiApiMock.mockResolvedValueOnce([
      {
        ...onlineCrew,
        status: "Failed",
        state: "Failed",
        error_message: "boom",
      },
    ]);
    const r = await runCrewAIDiscoveryScan(
      "tenant-1",
      "int-1",
      connection,
      null,
    );
    expect(r.status).toBe("completed");
    expect(r.agentsDiscovered).toBe(1);
  });

  it("returns failed when discovery throws", async () => {
    crewaiApiMock.mockRejectedValueOnce(new Error("network down"));
    const r = await runCrewAIDiscoveryScan(
      "tenant-1",
      "int-1",
      connection,
      null,
    );
    expect(r.status).toBe("failed");
    expect(r.errorMessage).toMatch(/network down/i);
  });
});
