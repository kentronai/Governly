jest.mock("@/lib/server/nango/client", () => ({ proxy: jest.fn() }));
jest.mock("@db", () => ({}));
jest.mock("@aws-sdk/client-ecr", () => ({}));
import { pickAppUrl, serverNameUrl } from "./discovery-orchestrator";

test("prefers the app host on the website's domain", () => {
  expect(pickAppUrl("https://owluc.com", ["see https://app.owluc.com/login and https://evil.com"])).toBe("https://app.owluc.com");
  expect(pickAppUrl("https://owluc.com", ["https://app.other.com"])).toBe("https://owluc.com");
  expect(pickAppUrl(null, [])).toBeNull();
});

test("reads the served domain from an nginx server_name, skipping IPs and catch-alls", () => {
  expect(serverNameUrl(["server {\n  server_name _;\n}\nserver {\n  server_name aigov.kentron.ai 98.88.103.48 _;\n}"])).toBe("https://aigov.kentron.ai");
  expect(serverNameUrl(["server_name _;", "server_name localhost;"])).toBeNull();
});
