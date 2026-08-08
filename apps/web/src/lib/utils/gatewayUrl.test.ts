/**
 * @jest-environment jsdom
 */
import { getGatewayBaseUrl } from "./gatewayUrl";

const setOrigin = (origin: string) => {
  Object.defineProperty(window, "location", {
    value: { origin },
    writable: true,
  });
};

describe("getGatewayBaseUrl", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_CONTROLNET_GATEWAY_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    setOrigin("https://app.kentron.ai");
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("uses the origin the dashboard is served from", () => {
    expect(getGatewayBaseUrl()).toBe("https://app.kentron.ai");
  });

  it("works on localhost and staging origins", () => {
    setOrigin("http://localhost:3000");
    expect(getGatewayBaseUrl()).toBe("http://localhost:3000");
  });

  it("prefers an explicit gateway override", () => {
    process.env.NEXT_PUBLIC_CONTROLNET_GATEWAY_URL = "https://gw.kentron.ai";
    expect(getGatewayBaseUrl()).toBe("https://gw.kentron.ai");
  });

  it("normalizes trailing slashes and a trailing /v1 on the override", () => {
    process.env.NEXT_PUBLIC_CONTROLNET_GATEWAY_URL = "https://gw.kentron.ai/v1/";
    expect(getGatewayBaseUrl()).toBe("https://gw.kentron.ai");
  });

  it("ignores a blank override", () => {
    process.env.NEXT_PUBLIC_CONTROLNET_GATEWAY_URL = "   ";
    expect(getGatewayBaseUrl()).toBe("https://app.kentron.ai");
  });

  it("never returns the legacy demo domain", () => {
    setOrigin("https://app.kentron.ai");
    expect(getGatewayBaseUrl()).not.toContain("demo.kentron.ai");
  });
});
