const mockState = { rows: [] as any[], deleted: 0 };
jest.mock("@db", () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => mockState.rows }) }),
    delete: () => ({ where: async () => { mockState.deleted++; } }),
  },
  integrations: { tenantId: "tenant_id" },
  repoModelDetections: { tenantId: "tenant_id" },
}));

jest.mock("./api-client", () => ({}));

import { hasConnectedGithub, purgeRepoModelsIfGithubGone } from "./model-scan";

const gh = (o: Record<string, unknown>) => ({
  nangoProviderConfigKey: "github",
  nangoConnectionId: null,
  isCredentialsAdded: false,
  ...o,
});

describe("GitHub visibility for repo model detections", () => {
  beforeEach(() => {
    mockState.rows = [];
    mockState.deleted = 0;
  });

  it("treats credentials or a Nango connection as connected", () => {
    expect(hasConnectedGithub([gh({ isCredentialsAdded: true })])).toBe(true);
    expect(hasConnectedGithub([gh({ nangoConnectionId: "c1" })])).toBe(true);
    expect(hasConnectedGithub([gh({})])).toBe(false);
    expect(hasConnectedGithub([{ ...gh({ nangoConnectionId: "c1" }), nangoProviderConfigKey: "langsmith" }])).toBe(false);
  });

  it("purges detections once GitHub is disconnected", async () => {
    mockState.rows = [gh({})];
    expect(await purgeRepoModelsIfGithubGone("t1")).toBe(true);
    expect(mockState.deleted).toBe(1);
  });

  it("keeps detections while GitHub is still connected", async () => {
    mockState.rows = [gh({ nangoConnectionId: "c1" })];
    expect(await purgeRepoModelsIfGithubGone("t1")).toBe(false);
    expect(mockState.deleted).toBe(0);
  });
});
