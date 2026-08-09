import { resolveNangoUrls } from "./NangoConnectButton";

describe("resolveNangoUrls", () => {
  it("falls back to the current origin when deployment env points at localhost", () => {
    const resolved = resolveNangoUrls(
      {
        NEXT_PUBLIC_NANGO_API_URL: "https://localhost/nango-api",
        NEXT_PUBLIC_NANGO_CONNECT_URL: "https://localhost/nango-connect",
      },
      "https://app.kentron.ai",
    );

    expect(resolved.apiUrl).toBe("https://app.kentron.ai/nango-api");
    expect(resolved.connectBaseUrl).toBe("https://app.kentron.ai/nango-connect");
  });
});
