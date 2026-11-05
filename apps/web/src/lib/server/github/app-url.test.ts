jest.mock("@/lib/server/nango/client", () => ({ proxy: jest.fn() }));
jest.mock("@db", () => ({}));
jest.mock("@aws-sdk/client-ecr", () => ({}));
import { pickAppUrl } from "./discovery-orchestrator";

test("prefers the app host on the website's domain", () => {
  expect(pickAppUrl("https://owluc.com", ["see https://app.owluc.com/login and https://evil.com"])).toBe("https://app.owluc.com");
  expect(pickAppUrl("https://owluc.com", ["https://app.other.com"])).toBe("https://owluc.com");
  expect(pickAppUrl(null, [])).toBeNull();
});
