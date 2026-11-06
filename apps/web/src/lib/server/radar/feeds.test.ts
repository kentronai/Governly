import { parseFeed } from "./feeds";

describe("parseFeed", () => {
  it("reads RSS items with dates and absolute links", () => {
    const xml = `<?xml version="1.0"?><rss><channel><title>x</title>
      <item><title><![CDATA[AI Act guidance]]></title><link>/en/news/1</link>
      <pubDate>Thu, 05 Nov 2026 09:43:57 GMT</pubDate><description>&lt;p&gt;General-purpose AI&lt;/p&gt;</description></item>
    </channel></rss>`;
    expect(parseFeed(xml, "application/rss+xml", "https://ec.europa.eu/feed")).toEqual([
      { title: "AI Act guidance", url: "https://ec.europa.eu/en/news/1", date: "2026-11-05", snippet: "General-purpose AI" },
    ]);
  });

  it("reads Atom href links and JSON listing APIs; plain pages are not feeds", () => {
    const atom = `<feed><entry><title>AI minister</title><link href="https://canada.ca/a"/><updated>2026-11-03T17:57:36-05:00</updated></entry></feed>`;
    expect(parseFeed(atom, "application/atom+xml", "https://api.io.canada.ca/x")?.[0]).toMatchObject({ url: "https://canada.ca/a", date: "2026-11-03" });

    const json = JSON.stringify({ results: [{ title: "AI rule", link: "/government/x", public_timestamp: "2026-11-05T17:02:46Z", description: "d" }] });
    expect(parseFeed(json, "application/json", "https://www.gov.uk/api/search.json")?.[0]).toEqual({
      title: "AI rule", url: "https://www.gov.uk/government/x", date: "2026-11-05", snippet: "d",
    });

    expect(parseFeed("<html><body>hi</body></html>", "text/html", "https://x.gov")).toBeNull();
  });
});
