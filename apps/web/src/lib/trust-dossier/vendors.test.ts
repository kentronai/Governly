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
