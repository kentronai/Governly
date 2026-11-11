import {
  TRUST_DOSSIER_CATEGORIES,
  TRUST_DOSSIER_VENDORS,
  getTrustDossierVendor,
} from "./vendors";

describe("Trust Dossier vendor directory", () => {
  it("contains the 46 providers in the requested categories", () => {
    expect(
      TRUST_DOSSIER_CATEGORIES.map(({ vendors }) => vendors.length),
    ).toEqual([20, 10, 12, 4]);
    expect(TRUST_DOSSIER_VENDORS).toHaveLength(46);
    expect(TRUST_DOSSIER_VENDORS.map(({ number }) => number)).toEqual(
      Array.from({ length: 46 }, (_, index) => index + 1),
    );
    expect(TRUST_DOSSIER_CATEGORIES.map(({ name }) => name)).toEqual([
      "Neoclouds and GPU-cloud providers",
      "GPU marketplaces, aggregators, and distributed platforms",
      "AI inference and serverless-compute platforms",
      "Foreign-headquartered providers relevant to the U.S. market",
    ]);
    expect(TRUST_DOSSIER_VENDORS.map(({ name }) => name)).toEqual([
      "CoreWeave",
      "Crusoe / Crusoe Cloud",
      "Lambda",
      "Fluidstack",
      "GMI Cloud",
      "TensorWave",
      "RunPod",
      "Lightning AI / Voltage Park",
      "Vultr",
      "WhiteFiber",
      "Boostrun",
      "QumulusAI",
      "Cirrascale Cloud Services",
      "Massed Compute",
      "Thunder Compute",
      "Hot Aisle",
      "DigitalOcean / Paperspace",
      "Liquid Web",
      "Rackspace Technology",
      "Soluna Computing",
      "Vast.ai",
      "TensorDock",
      "Shadeform",
      "Hyperbolic",
      "Prime Intellect",
      "SaladCloud",
      "Exabits",
      "NodeShift",
      "Qubrid",
      "VALDI",
      "Together AI",
      "Fireworks AI",
      "Modal",
      "Baseten",
      "DeepInfra",
      "fal",
      "Beam",
      "Anyscale",
      "Cloudflare Workers AI",
      "Groq",
      "Cerebras",
      "SambaNova",
      "Nebius",
      "Nscale",
      "IREN",
      "Bitdeer",
    ]);
  });

  it("gives every vendor a unique detail slug and official website URL", () => {
    const slugs = TRUST_DOSSIER_VENDORS.map(({ slug }) => slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const vendor of TRUST_DOSSIER_VENDORS) {
      expect(vendor.websites.length).toBeGreaterThan(0);
      for (const website of vendor.websites) {
        expect(website.url).toMatch(/^https:\/\//);
      }
      expect(getTrustDossierVendor(vendor.slug)).toBe(vendor);
    }
  });

  it("includes the verified Fireworks AI privacy policy URL", () => {
    expect(getTrustDossierVendor("fireworks-ai")?.privacyPolicyUrl).toBe(
      "https://fireworks.ai/privacy-policy",
    );
  });
});

import {
  TRUST_DOSSIER_RUBRIC,
  getTrustDossierDetails,
  getTrustDossierScorecard,
  gradeFor,
  scoreChecks,
} from "./vendors";

describe("Trust Dossier scoring", () => {
  it("scores Disclosed=1, Partial=0.5, Silent=0 and skips Not applicable", () => {
    expect(scoreChecks({})).toBe(0);
    const all = Object.fromEntries(
      TRUST_DOSSIER_RUBRIC.flatMap((s) => s.items).map((i) => [
        i.id,
        "Disclosed" as const,
      ]),
    );
    expect(scoreChecks(all)).toBe(100);
    const [first, second] = Object.keys(all);
    expect(
      scoreChecks({ ...all, [first]: "Partial", [second]: "Not applicable" }),
    ).toBe(
      Math.round(
        ((Object.keys(all).length - 1.5) / (Object.keys(all).length - 1)) * 100,
      ),
    );
  });

  it("maps scores onto the grade scale", () => {
    expect(
      [100, 70, 69, 60, 59, 48, 47, 35, 34, 0].map(gradeFor).join(""),
    ).toBe("AABBCCDDFF");
  });

  it("has a complete dossier and scorecard for every vendor", () => {
    for (const vendor of TRUST_DOSSIER_VENDORS) {
      const details = getTrustDossierDetails(vendor.slug);
      expect(details?.summary).toBeTruthy();
      expect(details?.highlights).toHaveLength(4);
      expect(getTrustDossierScorecard(vendor.slug)?.rank).toBeGreaterThan(0);
    }
  });
});
