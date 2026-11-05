import {
  normalizeCrewAIBaseUrl,
  describeCrewAIFetchFailure,
  crewaiApi,
  CrewAIApiError,
  CREWAI_ENDPOINTS,
  CREWAI_DEFAULT_BASE_URL,
} from "./api-client";

const creds = { baseUrl: "https://app.crewai.com", accessToken: "pat_test" };

describe("crewaiApi", () => {
  const realFetch = global.fetch;
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn();
    (global as { fetch: unknown }).fetch = fetchMock;
  });
  afterAll(() => {
    (global as { fetch: unknown }).fetch = realFetch;
  });

  it("returns the JSON payload and sends a Bearer token", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ uuid: "u1" }],
    });
    const out = await crewaiApi<Array<{ uuid: string }>>(
      creds,
      CREWAI_ENDPOINTS.crews,
    );
    expect(out).toEqual([{ uuid: "u1" }]);
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer pat_test",
    });
  });

  it("throws a CrewAIApiError with the status on a non-ok response", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: "bad_credentials",
        message: "Bad credentials",
      }),
    });
    await expect(
      crewaiApi(creds, CREWAI_ENDPOINTS.crews),
    ).rejects.toBeInstanceOf(CrewAIApiError);
    await expect(
      crewaiApi(creds, CREWAI_ENDPOINTS.crews),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("wraps a network failure with the unwrapped cause", async () => {
    const cause = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });
    fetchMock.mockRejectedValue(
      Object.assign(new Error("fetch failed"), { cause }),
    );
    await expect(crewaiApi(creds, CREWAI_ENDPOINTS.crews)).rejects.toThrow(
      /ECONNREFUSED/,
    );
  });
});

describe("normalizeCrewAIBaseUrl", () => {
  it("accepts the managed cloud host", () => {
    expect(normalizeCrewAIBaseUrl(CREWAI_DEFAULT_BASE_URL)).toBe(
      "https://app.crewai.com",
    );
  });

  it("lowercases the host and drops a trailing slash", () => {
    expect(normalizeCrewAIBaseUrl("https://App.CrewAI.com/")).toBe(
      "https://app.crewai.com",
    );
  });

  it("accepts any *.crewai.com deployment host", () => {
    expect(normalizeCrewAIBaseUrl("https://my-crew-123.crewai.com")).toBe(
      "https://my-crew-123.crewai.com",
    );
  });

  it("rejects a non-crewai host", () => {
    expect(() => normalizeCrewAIBaseUrl("https://evil.example.com")).toThrow();
  });

  it("rejects http (non-TLS)", () => {
    expect(() => normalizeCrewAIBaseUrl("http://app.crewai.com")).toThrow();
  });

  it("rejects a URL with a path, query, or credentials", () => {
    expect(() =>
      normalizeCrewAIBaseUrl("https://app.crewai.com/crewai_plus"),
    ).toThrow();
    expect(() =>
      normalizeCrewAIBaseUrl("https://app.crewai.com?x=1"),
    ).toThrow();
    expect(() =>
      normalizeCrewAIBaseUrl("https://user:pass@app.crewai.com"),
    ).toThrow();
  });

  it("rejects a non-URL string", () => {
    expect(() => normalizeCrewAIBaseUrl("not a url")).toThrow();
  });
});

describe("describeCrewAIFetchFailure", () => {
  it("unwraps the undici cause chain to the real reason", () => {
    const cause = Object.assign(new Error("connect ECONNREFUSED 1.2.3.4:443"), {
      code: "ECONNREFUSED",
    });
    const err = Object.assign(new Error("fetch failed"), { cause });
    const described = describeCrewAIFetchFailure(err);
    expect(described).toContain("fetch failed");
    expect(described).toContain("ECONNREFUSED");
  });

  it("reports an aborted request as a timeout", () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    expect(describeCrewAIFetchFailure(err)).toMatch(/timed out/i);
  });

  it("falls back to string form for non-Error input", () => {
    expect(describeCrewAIFetchFailure("boom")).toBe("boom");
  });
});
