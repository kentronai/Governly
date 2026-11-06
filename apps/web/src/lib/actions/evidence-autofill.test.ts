/** @jest-environment node */

jest.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: "u1", orgId: "org1" }),
}));
const pickRadarModel = jest.fn();
const radarChat = jest.fn();
jest.mock("@/lib/server/radar/llm", () => ({
  pickRadarModel: (...a: unknown[]) => pickRadarModel(...a),
  radarChat: (...a: unknown[]) => radarChat(...a),
}));

import { autofillFromDocument } from "./evidence-autofill";

const items = [{ key: "1.1", title: "Policy", description: "Have a policy" }];
const run = (file: File) => {
  const form = new FormData();
  form.set("file", file);
  form.set("items", JSON.stringify(items));
  return autofillFromDocument(form);
};
const model = { provider: "openai", modelId: "m", baseUrl: "u", apiKey: "k" };
const text = new File(["Our AI policy is approved by the board and reviewed yearly."], "policy.txt");

beforeEach(() => {
  pickRadarModel.mockReset().mockResolvedValue(model);
  radarChat.mockReset();
});

describe("autofillFromDocument never rejects a document", () => {
  it("fills the control when the model finds evidence", async () => {
    radarChat.mockResolvedValue({
      entries: { "1.1": { implementation: "Board approved", evidence: "Section 1", status: "Done" } },
    });
    const out = await run(text);
    expect(out).toMatchObject({ fill: { "1.1": { status: "Done" } } });
    expect("note" in out && out.note).toBeFalsy();
  });

  it.each([
    ["unreadable binary", new File([new Uint8Array(500).map((_, i) => (i % 7) + 1)], "scan.bin")],
    ["an empty-text pdf-like file", new File(["x"], "tiny.dat")],
  ])("attaches %s as evidence instead of erroring", async (_n, file) => {
    const out = await run(file);
    expect(out).toMatchObject({ fill: { "1.1": { status: "In progress" } } });
    expect((out as { fill: Record<string, { evidence: string }> }).fill["1.1"].evidence).toContain(file.name);
    expect(radarChat).not.toHaveBeenCalled();
  });

  it("attaches the document when no AI model is configured", async () => {
    pickRadarModel.mockResolvedValue(null);
    const out = await run(text);
    expect(out).toMatchObject({ fill: { "1.1": { status: "In progress" } } });
    expect((out as { note: string }).note).toMatch(/No AI model/);
  });

  it("attaches the document when the model call fails", async () => {
    radarChat.mockRejectedValue(new Error("quota"));
    const out = await run(text);
    expect(out).toMatchObject({ fill: { "1.1": { status: "In progress" } } });
    expect("error" in out).toBe(false);
  });

  it("attaches the document when the model finds nothing relevant", async () => {
    radarChat.mockResolvedValue({ entries: { "1.1": { implementation: "", evidence: "", status: "Not started" } } });
    const out = await run(text);
    expect((out as { note: string }).note).toMatch(/didn't clearly match/);
    expect(out).toMatchObject({ fill: { "1.1": { status: "In progress" } } });
  });

  it("reads html and csv as text and sends images to the model", async () => {
    radarChat.mockResolvedValue({ entries: { "1.1": { implementation: "ok", evidence: "e" } } });
    await run(new File(["<html><body><p>Our access policy requires MFA for everyone.</p></body></html>"], "a.html"));
    expect(radarChat.mock.calls[0][2]).toContain("Our access policy requires MFA");
    expect(radarChat.mock.calls[0][2]).not.toContain("<p>");
    radarChat.mockClear();
    await run(new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "shot.png"));
    expect(radarChat.mock.calls[0][3]).toHaveLength(1);
    expect(radarChat.mock.calls[0][3][0].mediaType).toBe("image/png");
  });
});
