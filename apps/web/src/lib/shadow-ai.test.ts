import { aiServiceForHost, parseAiUsageLog } from "./shadow-ai";

describe("aiServiceForHost", () => {
  it("matches a domain and its subdomains, not look-alikes", () => {
    expect(aiServiceForHost("chatgpt.com")?.service).toBe("ChatGPT");
    expect(aiServiceForHost("www.perplexity.ai.")?.service).toBe("Perplexity");
    expect(aiServiceForHost("notclaude.ai")).toBeNull();
  });
});

describe("parseAiUsageLog", () => {
  it("keeps only company laptops and ignores every other device on the network", () => {
    const log = [
      '"2026-11-27 10:00:01","DAKSHs-MacBook-Air","alice@acme.com","https://chatgpt.com/c/1"',
      '"2026-11-27 10:00:02","dakshs-macbook-air","alice@acme.com","https://chatgpt.com/c/2"',
      '"2026-11-27 10:00:03","Alices-iPhone","alice@acme.com","https://claude.ai/new"',
      '"2026-11-27 10:00:04","DAKSHs-MacBook-Air","alice@acme.com","https://intranet.acme.com/"',
      "27-Nov-2026 10:01 query: gemini.google.com IN A + (10.0.0.5)",
      '"2026-11-27 10:00:05","DAKSHs-MacBook-Air-2","bob@acme.com","https://claude.ai/"',
    ].join("\n");
    expect(parseAiUsageLog(log, ["DAKSHs-MacBook-Air.local"])).toEqual([
      {
        user: "dakshs-macbook-air",
        tools: [{ name: "ChatGPT (chatgpt.com)", hits: 2 }],
      },
    ]);
  });
});
