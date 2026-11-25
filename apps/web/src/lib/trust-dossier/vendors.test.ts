import { GRADE_SCALE, gradeFor } from "./grades";
import {
  TRUST_DOSSIER_VENDORS,
  getTrustDossierScorecard,
  getTrustDossierVendor,
} from "./vendors";

const neo = TRUST_DOSSIER_VENDORS.filter((v) => v.collection === "neo-cloud");
const apps = TRUST_DOSSIER_VENDORS.filter((v) => v.collection === "ai-apps");

describe("Trust Dossier catalog", () => {
  it("uses sentence case for section item labels in both collections", () => {
    const lower = TRUST_DOSSIER_VENDORS.flatMap((v) =>
      v.sections.flatMap((s) => s.items.map((i) => i.label)),
    ).filter((l) => /^[a-z]/.test(l));
    expect(lower).toEqual([]);
  });

  it("has the 46 Neo Cloud providers numbered 1-46 in 4 groups", () => {
    expect(neo.map((v) => v.number)).toEqual(
      Array.from({ length: 46 }, (_, i) => i + 1),
    );
    expect(new Set(neo.map((v) => v.group)).size).toBe(4);
    expect(neo[0].name).toBe("CoreWeave");
    expect(neo[45].name).toBe("Bitdeer");
  });

  it("has the AI Trust Index apps (216 minus 2 shared with Neo Cloud)", () => {
    expect(apps).toHaveLength(214);
  });

  it("has unique slugs and a complete dossier for every vendor", () => {
    expect(new Set(TRUST_DOSSIER_VENDORS.map((v) => v.slug)).size).toBe(
      TRUST_DOSSIER_VENDORS.length,
    );
    for (const v of TRUST_DOSSIER_VENDORS) {
      expect(v.summary).toBeTruthy();
      expect(v.highlights.length).toBeGreaterThanOrEqual(4);
      expect(v.sections.flatMap((s) => s.items).length).toBeGreaterThanOrEqual(
        25,
      );
      expect(v.score).toBeGreaterThanOrEqual(0);
      expect(v.score).toBeLessThanOrEqual(100);
      expect(GRADE_SCALE.map((g) => g.grade)).toContain(v.grade);
      expect(v.logoUrl).toMatch(/^https:\/\//);
    }
  });

  it("ranks within the vendor's collection", () => {
    const card = getTrustDossierScorecard(apps[0].slug)!;
    expect(card.total).toBe(214);
    expect(card.rank).toBeGreaterThan(0);
    expect(getTrustDossierScorecard("nope")).toBeUndefined();
    expect(getTrustDossierVendor("sambanova")?.collection).toBe("neo-cloud");
  });

  it("maps scores onto the grade scale", () => {
    expect(
      [100, 70, 69, 60, 59, 48, 47, 35, 34, 0].map(gradeFor).join(""),
    ).toBe("AABBCCDDFF");
  });
});
