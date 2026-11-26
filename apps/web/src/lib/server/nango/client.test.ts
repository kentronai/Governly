/** @jest-environment node */
process.env.NANGO_SECRET_KEY = "test-key";

// Shape returned by the self-hosted Nango GET /connection.
const conn = (connection_id: string, provider_config_key: string) => ({
  id: 1,
  connection_id,
  provider_config_key,
  end_user: { id: "org_1" },
  created: "2026-11-26T06:03:14.349Z",
});

describe("listConnections", () => {
  it("never sends provider_config_key (Nango rejects it with 400) and filters locally", async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({ connections: [conn("a", "aws"), conn("g", "github")] }),
      json: async () => ({ connections: [conn("a", "aws"), conn("g", "github")] }),
    }));
    global.fetch = fetchMock as never;
    const { listConnections } = await import("./client");

    const items = await listConnections({ endUserId: "org_1", providerConfigKey: "aws" });

    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.has("provider_config_key")).toBe(false);
    expect(url.searchParams.get("endUserId")).toBe("org_1");
    expect(items.map((i) => [i.connectionId, i.endUserId])).toEqual([["a", "org_1"]]);
  });
});
