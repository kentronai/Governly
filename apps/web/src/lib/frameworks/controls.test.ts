import { FRAMEWORKS, getFramework } from "@/lib/frameworks";
import {
  EQUIVALENT_CONTROLS,
  buildControls,
  mirrorWrites,
} from "@/lib/frameworks/controls";

const hasLeaf = (slug: string, key: string) =>
  !!getFramework(slug)?.sections.some((s) =>
    s.requirements.some(
      (r) =>
        (r.subcontrols.length
          ? r.subcontrols.some((c) => c.key === key)
          : r.key === key),
    ),
  );

describe("equivalent controls", () => {
  const ids = EQUIVALENT_CONTROLS.flat();

  it.each(ids)("%s is a real leaf (subcontrol or flat requirement)", (id) => {
    const [slug, key] = id.split(":");
    expect(hasLeaf(slug, key)).toBe(true);
  });

  it("lists a leaf once, one per framework per group", () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const group of EQUIVALENT_CONTROLS) {
      const slugs = group.map((id) => id.split(":")[0]);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });
});

describe("buildControls", () => {
  const eu = getFramework("eu-ai-act")!;
  const colorado = getFramework("colorado-ai-act")!;

  it("numbers sections KN0001, requirements KN0001.1 and subcontrols KN0001.1.1", () => {
    const [first, second] = buildControls([eu]);
    expect([first.code, first.title, first.no]).toEqual([
      "KN0001",
      "AI literacy",
      1,
    ]);
    expect(first.controls.map((c) => [c.code, c.parent, c.no])).toEqual([
      ["KN0001.1", true, 2],
      ["KN0001.1.1", false, 3],
      ["KN0001.1.2", false, 4],
      ["KN0001.1.3", false, 5],
      ["KN0001.2", true, 6],
      ["KN0001.2.1", false, 7],
      ["KN0001.2.2", false, 8],
    ]);
    expect(second.code).toBe("KN0002");
  });

  it("gives every subcontrol its own name and description", () => {
    const rows = buildControls([eu])[0].controls.filter((c) => !c.parent);
    expect(rows.slice(0, 3).map((c) => c.title)).toEqual([
      "We assign leadership accountability for AI risk decisions",
      "We train relevant staff on AI literacy and ethics",
      "We inform workers about high-risk AI used in the workplace",
    ]);
    expect(new Set(rows.map((c) => c.description)).size).toBe(rows.length);
  });

  it("maps a subcontrol to the other policies that ask for it, even if not enabled", () => {
    const training = buildControls([eu])[0].controls.find(
      (c) => c.code === "KN0001.1.2",
    )!;
    expect(training.members.map((m) => m.framework.slug)).toEqual([
      "eu-ai-act",
      "colorado-ai-act",
    ]);
  });

  it("merges an enabled policy's equivalent requirement into the same row", () => {
    const sections = buildControls([eu, colorado]);
    const titles = sections.flatMap((s) => s.controls.map((c) => c.title));
    expect(titles).not.toContain("Training and Awareness");
    expect(titles).toContain("Compliance Program");
  });

  it("lists regulations before frameworks and tags each section", () => {
    const aiEthics = getFramework("ai-ethics-governance")!;
    const kinds = buildControls([aiEthics, eu]).map((s) => s.kind);
    expect(kinds[0]).toBe("regulation");
    expect(kinds.indexOf("framework")).toBeGreaterThan(
      kinds.lastIndexOf("regulation"),
    );
  });

  it("covers every leaf of every enabled framework exactly once", () => {
    const leaves = FRAMEWORKS.flatMap((f) =>
      f.sections.flatMap((s) =>
        s.requirements.flatMap((r) =>
          r.subcontrols.length
            ? r.subcontrols.map((c) => `${f.slug}:${c.key}`)
            : [`${f.slug}:${r.key}`],
        ),
      ),
    );
    const placed = buildControls(FRAMEWORKS)
      .flatMap((s) => s.controls)
      .flatMap((c) => c.members)
      .map((m) => `${m.framework.slug}:${m.sub?.key ?? m.requirement.key}`);
    expect(new Set(placed).size).toBe(placed.length);
    expect([...placed].sort()).toEqual([...leaves].sort());
  });
});

describe("mirrorWrites", () => {
  it("copies a subcontrol's details to the mapped flat requirement", () => {
    expect(
      mirrorWrites("eu-ai-act", {
        "1.1.2": { implementation: "<p>done</p>", status: "Done" },
        "1.1.3": { implementation: "", status: "" },
      }),
    ).toEqual({
      "colorado-ai-act": {
        "8.3": { implementation: "<p>done</p>", status: "Done" },
      },
    });
  });

  it("copies owner and due date from the requirement to each mapped requirement", () => {
    const out = mirrorWrites("eu-ai-act", {
      "1.1": { owner: "u1", dueDate: "2026-12-01" },
    });
    expect(out["colorado-ai-act"]["8.3"]).toEqual({
      owner: "u1",
      dueDate: "2026-12-01",
    });
    // 1.1.1 is also mapped (governance), so those frameworks get it too.
    expect(out["texas-traiga"]["10.1"]).toEqual({
      owner: "u1",
      dueDate: "2026-12-01",
    });
  });

  it("works the other way: a flat requirement fills the EU subcontrol", () => {
    expect(
      mirrorWrites("colorado-ai-act", {
        "8.3": { owner: "u2", evidence: "<p>cert</p>", status: "Done" },
      }),
    ).toEqual({
      "eu-ai-act": {
        "1.1": { owner: "u2" },
        "1.1.2": { evidence: "<p>cert</p>", status: "Done" },
      },
    });
  });

  it("writes nothing for unmapped or empty entries", () => {
    expect(mirrorWrites("eu-ai-act", { "1.1.3": { status: "Done" } })).toEqual(
      {},
    );
    expect(mirrorWrites("eu-ai-act", { "1.1.2": { evidence: "  " } })).toEqual(
      {},
    );
  });
});
