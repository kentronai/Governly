import {
  DatabricksApiError,
  databricksApi,
  fetchDatabricksPages,
  normalizeDatabricksHost,
} from "./api-client";

describe("Databricks API client", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it("accepts official workspace roots and normalizes them", () => {
    expect(
      normalizeDatabricksHost("https://DBC-1234.cloud.databricks.com/"),
    ).toBe("https://dbc-1234.cloud.databricks.com");
    expect(
      normalizeDatabricksHost("https://adb-1234.7.azuredatabricks.net"),
    ).toBe("https://adb-1234.7.azuredatabricks.net");
  });

  it.each([
    "http://dbc-1234.cloud.databricks.com",
    "https://localhost",
    "https://example.com",
    "https://dbc-1234.cloud.databricks.com/api/2.1",
    "https://user:secret@dbc-1234.cloud.databricks.com",
  ])("rejects unsafe or non-workspace URL %s", (value) => {
    expect(() => normalizeDatabricksHost(value)).toThrow();
  });

  it("continues after an empty page when a next token exists", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        response({ catalogs: [], next_page_token: "page-2" }),
      )
      .mockResolvedValueOnce(response({ catalogs: [{ name: "main" }] }));
    global.fetch = fetchMock;

    const result = await fetchDatabricksPages<{ name: string }>(
      {
        hostUrl: "https://dbc-1234.cloud.databricks.com",
        accessToken: "secret-token",
      },
      "/api/2.1/unity-catalog/catalogs",
      "catalogs",
    );

    expect(result).toEqual([{ name: "main" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("page_token=page-2");
  });

  it("rejects repeated pagination tokens instead of looping", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(response({ next_page_token: "same-token" }));

    await expect(
      fetchDatabricksPages(
        {
          hostUrl: "https://dbc-1234.cloud.databricks.com",
          accessToken: "secret-token",
        },
        "/api/2.1/unity-catalog/catalogs",
        "catalogs",
      ),
    ).rejects.toThrow("repeated pagination token");
  });

  it("uses provider-specific page size parameters", async () => {
    const fetchMock = jest.fn().mockResolvedValue(response({ apps: [] }));
    global.fetch = fetchMock;

    await fetchDatabricksPages(
      {
        hostUrl: "https://dbc-1234.cloud.databricks.com",
        accessToken: "secret-token",
      },
      "/api/2.0/apps",
      "apps",
      undefined,
      { pageSizeParam: "page_size", pageSizeValue: "100" },
    );

    expect(String(fetchMock.mock.calls[0][0])).toContain("page_size=100");
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("max_results");
  });

  it("preserves HTTP status and Databricks error code", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({
        error_code: "FEATURE_DISABLED",
        message: "Apps are not enabled",
      }),
    } as Response);

    await expect(
      databricksApi(
        {
          hostUrl: "https://dbc-1234.cloud.databricks.com",
          accessToken: "secret-token",
        },
        "/api/2.0/apps",
      ),
    ).rejects.toMatchObject<Partial<DatabricksApiError>>({
      status: 404,
      errorCode: "FEATURE_DISABLED",
    });
  });
});

function response(payload: Record<string, unknown>): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => payload,
  } as Response;
}
