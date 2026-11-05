jest.mock("@/lib/server/nango/client", () => ({ proxy: jest.fn() }));
jest.mock("@db", () => ({}));
jest.mock("@aws-sdk/client-ecr", () => ({}));
import { agentFolders } from "./discovery-orchestrator";

test("a repo of agent folders is split, an app with a root manifest is not", () => {
  expect(
    agentFolders([
      "agents/a/requirements.txt",
      "agents/b/requirements.txt",
      "agents/b/local/requirements.txt",
      "README.md",
    ]),
  ).toEqual(["agents/a", "agents/b"]);
  expect(agentFolders(["package.json", "apps/web/package.json", "packages/ui/package.json"])).toEqual([""]);
  expect(agentFolders(["app/requirements.txt"])).toEqual([""]);
});
