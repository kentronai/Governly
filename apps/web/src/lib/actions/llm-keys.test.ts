/** @jest-environment node */

jest.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: "u1", orgId: "org1" }),
}));
const chain = { from: () => chain, where: () => chain, limit: async () => [{ id: "org1" }] };
const tx = { delete: () => ({ where: async () => undefined }), insert: () => ({ values: async () => undefined }) };
jest.mock("@db", () => ({
  db: { select: () => chain, transaction: async (fn: (t: unknown) => unknown) => fn(tx) },
  tenantLlmKeys: {},
  tenants: {},
}));
jest.mock("drizzle-orm", () => ({ and: () => ({}), eq: () => ({}) }));
jest.mock("@/lib/server/crypto", () => ({ encryptSecret: (s: string) => `enc:${s}`, decryptSecret: (s: string) => s }));
jest.mock("@/lib/server/audit", () => ({ createAuditEvent: async () => undefined }));
const testConnection = jest.fn();
jest.mock("@/lib/server/model-registry/providers", () => ({
  getModelProviderAdapter: () => ({ testConnection }),
}));

import { saveLlmKey } from "./llm-keys";

const save = (key = "AIza-valid-looking-key") => saveLlmKey("acme", "gemini", "gemini-2.5-flash", key);

beforeEach(() => testConnection.mockReset());

describe("saveLlmKey", () => {
  it.each([
    ["model_unavailable", "Google doesn't serve this model to this key."],
    ["authentication_failed", "Google rejected the configured Gemini credentials."],
    ["rate_limited", "slow down"],
  ])("always saves the key, even when the provider says %s", async (code, message) => {
    testConnection.mockResolvedValue({ status: "error", code, message });
    await expect(save()).resolves.toEqual({ success: true });
    // The provider check is shown on the saved card, not used to refuse the save.
    expect(testConnection).not.toHaveBeenCalled();
  });

  it("returns bad input as a message instead of throwing", async () => {
    await expect(save("short")).resolves.toEqual({ success: false, error: "Invalid API key" });
    await expect(saveLlmKey("acme", "nope", "m", "AIza-valid-looking-key")).resolves.toEqual({ success: false, error: "Unknown provider" });
    await expect(saveLlmKey("acme", "gemini", "bad model!", "AIza-valid-looking-key")).resolves.toEqual({ success: false, error: "Invalid model id" });
  });
});
