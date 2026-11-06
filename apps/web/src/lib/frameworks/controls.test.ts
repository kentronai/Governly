import { FRAMEWORKS, enabledFrameworks, getFramework } from "@/lib/frameworks";
import {
  EQUIVALENT_CONTROLS,
  buildControls,
  controlCodes,
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

  it("keeps every control in its own row, even when an equivalent one is enabled", () => {
    const rows = buildControls([eu, colorado]).flatMap((s) => s.controls);
    const titles = rows.map((c) => c.title);
    expect(titles).toContain("Training and Awareness");
    expect(titles).toContain("We train relevant staff on AI literacy and ethics");
    // ...and each one lists the other as mapped, so saving either fills both.
    const training = rows.find((c) => c.title === "Training and Awareness")!;
    expect(training.members.map((m) => m.framework.slug)).toEqual([
      "colorado-ai-act",
      "eu-ai-act",
    ]);
  });

  it("lists regulations before frameworks and tags each section", () => {
    const aiEthics = getFramework("ai-ethics-governance")!;
    const kinds = buildControls([aiEthics, eu]).map((s) => s.kind);
    expect(kinds[0]).toBe("regulation");
    expect(kinds.indexOf("framework")).toBeGreaterThan(
      kinds.lastIndexOf("regulation"),
    );
  });

  it("gives every leaf of every enabled framework exactly one row, per kind", () => {
    for (const kind of ["regulation", "framework"] as const) {
      const leaves = FRAMEWORKS.filter((f) => f.kind === kind).flatMap((f) =>
        f.sections.flatMap((s) =>
          s.requirements.flatMap((r) =>
            r.subcontrols.length
              ? r.subcontrols.map((c) => `${f.slug}:${c.key}`)
              : [`${f.slug}:${r.key}`],
          ),
        ),
      );
      const placed = buildControls(FRAMEWORKS)
        .filter((s) => s.kind === kind)
        .flatMap((s) => s.controls)
        .filter((c) => !c.parent)
        .map((c) => `${c.primary.framework.slug}:${c.primary.sub?.key ?? c.primary.requirement.key}`);
      expect(new Set(placed).size).toBe(placed.length);
      expect([...placed].sort()).toEqual([...leaves].sort());
    }
  });

  it("numbers regulations and frameworks separately, each from 1", () => {
    const sections = buildControls(FRAMEWORKS);
    for (const kind of ["regulation", "framework"] as const) {
      const own = sections.filter((s) => s.kind === kind);
      expect(own[0].code).toBe("KN0001");
      expect(own[0].no).toBe(1);
      expect(own[0].controls[0].no).toBe(2);
      const nos = own.flatMap((s) => [s.no, ...s.controls.map((c) => c.no)]);
      expect(nos).toEqual(nos.map((_, i) => i + 1));
      const codes = own.map((s) => s.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it("keeps a mapped control of the other kind in members but not in this list", () => {
    const aiEthics = getFramework("ai-ethics-governance")!;
    const sections = buildControls([eu, aiEthics]);
    const own = sections.filter((s) => s.kind === "framework");
    const governance = own
      .flatMap((s) => s.controls)
      .find((c) => c.primary.requirement.key === "3.1")!;
    expect(governance.primary.framework.slug).toBe("ai-ethics-governance");
    expect(governance.members.map((m) => m.framework.slug)).toContain(
      "eu-ai-act",
    );
  });
});

describe("EQUIVALENT_CONTROLS groups", () => {
  it("puts each control in one group, with at most one control per framework", () => {
    const ids = EQUIVALENT_CONTROLS.flat();
    expect(new Set(ids).size).toBe(ids.length);
    for (const group of EQUIVALENT_CONTROLS) {
      const slugs = group.map((id) => id.split(":")[0]);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });
});

describe("permanent control IDs", () => {
  const codesFor = (slugs: string[]) =>
    Object.fromEntries(
      buildControls(FRAMEWORKS.filter((f) => slugs.includes(f.slug)))
        .flatMap((s) => s.controls)
        .filter((c) => !c.parent)
        .map((c) => [
          `${c.primary.framework.slug}:${c.primary.sub?.key ?? c.primary.requirement.key}`,
          c.code,
        ]),
    );
  const all = codesFor(FRAMEWORKS.map((f) => f.slug));

  it("never change when other policies are enabled or disabled", () => {
    for (const slugs of [
      ["gdpr"],
      ["ccpa", "gdpr"],
      ["eu-ai-act", "gdpr", "iso-42001"],
      ["soc-2-type-ii"],
    ])
      for (const [id, code] of Object.entries(codesFor(slugs)))
        expect(code).toBe(all[id]);
  });

  it("start at KN0001 for regulations and, separately, for frameworks", () => {
    const first = (kind: string) =>
      controlCodes().filter((c) => c.kind === kind)[0].code;
    expect(first("regulation")).toBe("KN0001.1.1");
    expect(first("framework")).toBe("KN0001.1");
    // A policy enabled on its own keeps its own, later, ID.
    expect(Object.values(codesFor(["gdpr"]))[0]).not.toBe("KN0001.1");
  });

  it("are unique within each kind", () => {
    for (const kind of ["regulation", "framework"] as const) {
      const codes = controlCodes()
        .filter((c) => c.kind === kind)
        .map((c) => c.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it("match the committed list: only append, never renumber", () => {
    expect(controlCodes()).toMatchSnapshot();
  });
});

describe("enabledFrameworks", () => {
  it("enables a regulation only from the Regulations library and a framework only from the Frameworks library", () => {
    const slugs = (names: string[], fw: string[]) =>
      enabledFrameworks(names, fw).map((f) => f.slug);
    expect(slugs(["GDPR"], [])).toEqual(["gdpr"]);
    expect(slugs([], ["gdpr"])).toEqual([]);
    expect(slugs([], ["iso-42001", "nist-ai-rmf"])).toEqual([
      "iso-42001",
      "nist-ai-rmf",
    ]);
    // A policy that shares a framework's name does not switch the framework on.
    expect(slugs(["ISO/IEC 42001", "FTC AI Guidance"], [])).toEqual([]);
  });
});

describe("mirrorWrites for ISO, NIST, GDPR and CCPA", () => {
  it("saving an ISO 42001 clause fills ISO 27001 and, for roles, NIST and SOC 2", () => {
    expect(
      mirrorWrites("iso-42001", {
        "5.3": { implementation: "<p>RACI</p>", status: "Done" },
      }),
    ).toEqual({
      "iso-27001": { "5.3": { implementation: "<p>RACI</p>", status: "Done" } },
      "soc-2-type-ii": {
        "1.3": { implementation: "<p>RACI</p>", status: "Done" },
      },
      "nist-ai-rmf": {
        "2.1": { implementation: "<p>RACI</p>", status: "Done" },
      },
    });
  });

  it("saving NIST GOVERN 2.2 fills the training clause in both ISO standards", () => {
    const out = mirrorWrites("nist-ai-rmf", {
      "2.2": { evidence: "<p>records</p>" },
    });
    expect(Object.keys(out).sort()).toEqual(["iso-27001", "iso-42001"]);
    expect(out["iso-42001"]["7.2"]).toEqual({ evidence: "<p>records</p>" });
  });

  it("saving a GDPR article fills the matching CCPA requirement, and back", () => {
    expect(
      mirrorWrites("gdpr", { "3.4": { status: "Done" } }),
    ).toEqual({ ccpa: { "3.2": { status: "Done" } } });
    expect(
      mirrorWrites("ccpa", { "1.2": { status: "Done" } }),
    ).toEqual({ gdpr: { "2.3": { status: "Done" } } });
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
