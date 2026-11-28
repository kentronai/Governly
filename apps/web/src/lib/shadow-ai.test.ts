import { aiServiceForHost, parseAiUsageLog } from "./shadow-ai";

describe("aiServiceForHost", () => {
  it("matches a domain and its subdomains, not look-alikes", () => {
    expect(aiServiceForHost("chatgpt.com")?.service).toBe("ChatGPT");
    expect(aiServiceForHost("www.perplexity.ai.")?.service).toBe("Perplexity");
    expect(aiServiceForHost("notclaude.ai")).toBeNull();
  });
});

describe("parseAiUsageLog", () => {
  it("groups AI hits per user across Zscaler CSV and DNS lines", () => {
    const log = [
      '"2026-11-27 10:00:01","alice@acme.com","https://chatgpt.com/c/1","Allowed"',
      '"2026-11-27 10:00:02","alice@acme.com","https://chatgpt.com/c/2","Allowed"',
      '"2026-11-27 10:00:03","bob@acme.com","https://claude.ai/new","Allowed"',
      '"2026-11-27 10:00:04","bob@acme.com","https://intranet.acme.com/","Allowed"',
      "27-Nov-2026 10:01 query: gemini.google.com IN A + (10.0.0.5)",
    ].join("\n");
    const byUser = Object.fromEntries(parseAiUsageLog(log).map((u) => [u.user, u.tools]));
    expect(byUser["alice@acme.com"]).toEqual([{ name: "ChatGPT (chatgpt.com)", hits: 2 }]);
    expect(byUser["bob@acme.com"]).toEqual([{ name: "Claude (claude.ai)", hits: 1 }]);
    expect(byUser.unattributed).toEqual([{ name: "Gemini (gemini.google.com)", hits: 1 }]);
  });
});
