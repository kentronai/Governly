import { mapRepoIps, siteUrl } from "./repo-hosts";

describe("repo -> EC2 link by site IP", () => {
  it("reads the site URL from deployedOn", () => {
    expect(siteUrl("https://aigov.kentron.ai")).toBe("https://aigov.kentron.ai");
    expect(siteUrl("Render · https://x.onrender.com")).toBe("https://x.onrender.com");
    expect(siteUrl("AWS (CDK) (declared in repo)")).toBeNull();
    expect(siteUrl(null)).toBeNull();
  });

  it("maps each resolved IP to the repo, ignoring repos that don't resolve", async () => {
    const resolve = async (host: string) => {
      if (host === "aigov.kentron.ai") return ["98.88.103.48"];
      throw new Error("ENOTFOUND");
    };
    const map = await mapRepoIps(
      [
        { repository: "kentronai/Norix", deployedOn: "https://aigov.kentron.ai" },
        { repository: "acme/gone", deployedOn: "https://gone.example.com" },
        { repository: "acme/no-site", deployedOn: null },
      ],
      resolve,
    );
    expect([...map]).toEqual([["98.88.103.48", "kentronai/Norix"]]);
  });
});
