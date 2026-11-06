import { guessCategory } from "@/lib/radar-categories";
import {
  AI_TEXT_RE,
  LEGAL_RE,
  htmlLinks,
  htmlToText,
  isNoiseTitle,
  isOfficialHost,
  jsonToText,
  isPrivateHost,
  parseModelJson,
  quoteInText,
} from "./text";

describe("AI Radar helpers", () => {
  it("strips markup, scripts and entities", () => {
    expect(
      htmlToText("<nav>menu</nav><script>x()</script><p>AI&nbsp;Act &amp; <b>rules</b></p>"),
    ).toBe("AI Act & rules");
  });

  it("blocks private hosts, allows public ones", () => {
    for (const h of ["localhost", "127.0.0.1", "10.0.0.5", "192.168.1.1", "172.20.0.1", "169.254.169.254", "[::1]"])
      expect(isPrivateHost(h)).toBe(true);
    for (const h of ["eur-lex.europa.eu", "172.32.0.1", "8.8.8.8"])
      expect(isPrivateHost(h)).toBe(false);
  });

  it("accepts a quote present in the source and rejects an invented one", () => {
    const page = "The  Regulation shall apply from 2 August 2026, except for Article 6(1).";
    expect(quoteInText("shall apply from 2 August\n2026", page)).toBe(true);
    expect(quoteInText("shall apply from 1 January 2027", page)).toBe(false);
    expect(quoteInText("too short", "too short")).toBe(false);
  });

  it("parses JSON wrapped in fences/prose and throws when absent", () => {
    expect(parseModelJson('```json\n{"updates":[]}\n```')).toEqual({ updates: [] });
    expect(() => parseModelJson("no json here")).toThrow();
  });

  it("flattens JSON to quotable lines with unescaped strings", () => {
    const t = jsonToText(JSON.stringify({ results: [{ title: 'The "AI" Act', date: "2026-01-02", skip: null, n: { url: "https://x.test/a" } }] }));
    expect(t).toContain('title: The "AI" Act | date: 2026-01-02');
    expect(t).toContain("url: https://x.test/a");
    expect(jsonToText("not json")).toBe("not json");
  });

  it("recognises AI text in several languages and rejects unrelated pages", () => {
    for (const s of ["Artificial Intelligence Act", "Lei da inteligência artificial", "人工知能", "Gesetz über künstliche Intelligenz"])
      expect(AI_TEXT_RE.test(s)).toBe(true);
    expect(AI_TEXT_RE.test("Ministry of Agriculture news and tenders")).toBe(false);
  });

  it("lists page links as absolute URLs with their visible text", () => {
    const html = '<a href="/ai/act-2024">The <b>AI</b> Act</a><a href="#top">skip</a><a href="mailto:x@y.z">mail</a>';
    expect(htmlLinks(html, "https://gov.example/news/")).toEqual([
      { text: "The AI Act", href: "https://gov.example/ai/act-2024" },
    ]);
  });

  it("accepts official hosts only and spots legal titles", () => {
    for (const h of ["www.gov.uk", "eur-lex.europa.eu", "www.congress.gov", "www.bundestag.de", "www.meti.go.jp", "oecd.ai".replace("oecd.ai", "www.oecd.org")])
      expect(isOfficialHost(h)).toBe(true);
    for (const h of ["www.lexology.com", "techcrunch.com", "nogov.example.com"]) expect(isOfficialHost(h)).toBe(false);
    expect(LEGAL_RE.test("Artificial Intelligence Act")).toBe(true);
    expect(LEGAL_RE.test("Minister visits AI lab")).toBe(false);
  });

  it("guesses a topic from keywords", () => {
    expect(guessCategory("AI in hiring and employment")).toBe("Employment & hiring");
    expect(guessCategory("Artificial Intelligence Act")).toBe("Risk-based AI regulation");
    expect(guessCategory("Weather report")).toBe("Other");
  });

  it("drops PDF renditions and old-year titles, keeps current ones", () => {
    const now = new Date("2026-11-05");
    expect(isNoiseTitle("A pro-innovation approach to AI regulation (web-ready PDF)", now)).toBe(true);
    expect(isNoiseTitle("National AI Strategy 2019-2021", now)).toBe(true);
    expect(isNoiseTitle("National AI Strategy 2025-2030", now)).toBe(false);
    expect(isNoiseTitle("Artificial Intelligence Act", now)).toBe(false);
  });
});
