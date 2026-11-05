import {
  htmlToText,
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
});
