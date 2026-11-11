export interface TrustDossierVendor {
  number: number;
  name: string;
  slug: string;
  category: string;
  websites: { label: string; url: string }[];
  privacyPolicyUrl?: string;
  subprocessorsUrl?: string;
}

export interface TrustDossierCategory {
  name: string;
  description: string;
  vendors: TrustDossierVendor[];
}

const vendor = (
  number: number,
  name: string,
  slug: string,
  category: string,
  websites: [string, string][],
  documents: { privacyPolicyUrl?: string; subprocessorsUrl?: string } = {},
): TrustDossierVendor => ({
  number,
  name,
  slug,
  category,
  websites: websites.map(([label, url]) => ({ label, url: `https://${url}` })),
  ...documents,
});

export const TRUST_DOSSIER_CATEGORIES: TrustDossierCategory[] = [
  {
    name: "Neoclouds and GPU-cloud providers",
    description:
      "Dedicated AI-cloud providers and broader cloud and hosting companies with GPU offerings.",
    vendors: [
      vendor(1, "CoreWeave", "coreweave", "Neocloud and GPU cloud", [
        ["coreweave.com", "coreweave.com"],
      ]),
      vendor(2, "Crusoe / Crusoe Cloud", "crusoe", "Neocloud and GPU cloud", [
        ["crusoe.ai", "crusoe.ai"],
      ]),
      vendor(3, "Lambda", "lambda", "Neocloud and GPU cloud", [
        ["lambda.ai", "lambda.ai"],
      ]),
      vendor(4, "Fluidstack", "fluidstack", "Neocloud and GPU cloud", [
        ["fluidstack.io", "fluidstack.io"],
      ]),
      vendor(5, "GMI Cloud", "gmi-cloud", "Neocloud and GPU cloud", [
        ["gmicloud.ai", "gmicloud.ai"],
      ]),
      vendor(6, "TensorWave", "tensorwave", "Neocloud and GPU cloud", [
        ["tensorwave.com", "tensorwave.com"],
      ]),
      vendor(7, "RunPod", "runpod", "Neocloud and GPU cloud", [
        ["runpod.io", "runpod.io"],
      ]),
      vendor(
        8,
        "Lightning AI / Voltage Park",
        "lightning-ai-voltage-park",
        "Neocloud and GPU cloud",
        [
          ["lightning.ai", "lightning.ai"],
          ["voltagepark.com", "voltagepark.com"],
        ],
      ),
      vendor(9, "Vultr", "vultr", "Neocloud and GPU cloud", [
        ["vultr.com", "vultr.com"],
      ]),
      vendor(10, "WhiteFiber", "whitefiber", "Neocloud and GPU cloud", [
        ["whitefiber.com", "whitefiber.com"],
      ]),
      vendor(11, "Boostrun", "boostrun", "Neocloud and GPU cloud", [
        ["boostrun.com", "boostrun.com"],
      ]),
      vendor(12, "QumulusAI", "qumulusai", "Neocloud and GPU cloud", [
        ["qumulus.ai", "qumulus.ai"],
      ]),
      vendor(
        13,
        "Cirrascale Cloud Services",
        "cirrascale-cloud-services",
        "Neocloud and GPU cloud",
        [["cirrascale.com", "cirrascale.com"]],
      ),
      vendor(14, "Massed Compute", "massed-compute", "Neocloud and GPU cloud", [
        ["massedcompute.com", "massedcompute.com"],
      ]),
      vendor(
        15,
        "Thunder Compute",
        "thunder-compute",
        "Neocloud and GPU cloud",
        [["thundercompute.com", "thundercompute.com"]],
      ),
      vendor(16, "Hot Aisle", "hot-aisle", "Neocloud and GPU cloud", [
        ["hotaisle.xyz", "hotaisle.xyz"],
      ]),
      vendor(
        17,
        "DigitalOcean / Paperspace",
        "digitalocean-paperspace",
        "Neocloud and GPU cloud",
        [
          ["digitalocean.com", "digitalocean.com"],
          ["paperspace.com", "paperspace.com"],
        ],
      ),
      vendor(18, "Liquid Web", "liquid-web", "Neocloud and GPU cloud", [
        ["liquidweb.com", "liquidweb.com"],
      ]),
      vendor(
        19,
        "Rackspace Technology",
        "rackspace-technology",
        "Neocloud and GPU cloud",
        [["rackspace.com", "rackspace.com"]],
      ),
      vendor(
        20,
        "Soluna Computing",
        "soluna-computing",
        "Neocloud and GPU cloud",
        [["solunacomputing.com", "solunacomputing.com"]],
      ),
    ],
  },
  {
    name: "GPU marketplaces, aggregators, and distributed platforms",
    description:
      "Platforms that provide or aggregate GPU capacity through marketplace or distributed infrastructure models.",
    vendors: [
      vendor(21, "Vast.ai", "vast-ai", "GPU marketplace", [
        ["vast.ai", "vast.ai"],
      ]),
      vendor(22, "TensorDock", "tensordock", "GPU marketplace", [
        ["tensordock.com", "tensordock.com"],
      ]),
      vendor(23, "Shadeform", "shadeform", "GPU marketplace", [
        ["shadeform.ai", "shadeform.ai"],
      ]),
      vendor(24, "Hyperbolic", "hyperbolic", "GPU marketplace", [
        ["hyperbolic.xyz", "hyperbolic.xyz"],
      ]),
      vendor(25, "Prime Intellect", "prime-intellect", "GPU marketplace", [
        ["primeintellect.ai", "primeintellect.ai"],
      ]),
      vendor(26, "SaladCloud", "saladcloud", "Distributed compute platform", [
        ["salad.com", "salad.com"],
      ]),
      vendor(27, "Exabits", "exabits", "GPU marketplace", [
        ["exabits.ai", "exabits.ai"],
      ]),
      vendor(28, "NodeShift", "nodeshift", "GPU marketplace", [
        ["nodeshift.com", "nodeshift.com"],
      ]),
      vendor(29, "Qubrid", "qubrid", "GPU marketplace", [
        ["qubrid.com", "qubrid.com"],
      ]),
      vendor(30, "VALDI", "valdi", "Distributed compute platform", [
        ["valdi.ai", "valdi.ai"],
      ]),
    ],
  },
  {
    name: "AI inference and serverless-compute platforms",
    description:
      "Companies focused on managed AI execution, inference, or specialized AI computing rather than exclusively renting conventional GPU clusters.",
    vendors: [
      vendor(31, "Together AI", "together-ai", "AI inference", [
        ["together.ai", "together.ai"],
      ]),
      vendor(
        32,
        "Fireworks AI",
        "fireworks-ai",
        "AI inference",
        [["fireworks.ai", "fireworks.ai"]],
        {
          privacyPolicyUrl: "https://fireworks.ai/privacy-policy",
        },
      ),
      vendor(33, "Modal", "modal", "Serverless compute", [
        ["modal.com", "modal.com"],
      ]),
      vendor(34, "Baseten", "baseten", "AI inference", [
        ["baseten.co", "baseten.co"],
      ]),
      vendor(35, "DeepInfra", "deepinfra", "AI inference", [
        ["deepinfra.com", "deepinfra.com"],
      ]),
      vendor(36, "fal", "fal", "AI inference", [["fal.ai", "fal.ai"]]),
      vendor(37, "Beam", "beam", "Serverless compute", [
        ["beam.cloud", "beam.cloud"],
      ]),
      vendor(38, "Anyscale", "anyscale", "AI inference", [
        ["anyscale.com", "anyscale.com"],
      ]),
      vendor(
        39,
        "Cloudflare Workers AI",
        "cloudflare-workers-ai",
        "AI inference",
        [
          [
            "cloudflare.com/developer-platform/workers-ai",
            "cloudflare.com/developer-platform/workers-ai",
          ],
        ],
      ),
      vendor(40, "Groq", "groq", "AI inference", [["groq.com", "groq.com"]]),
      vendor(41, "Cerebras", "cerebras", "AI inference", [
        ["cerebras.ai", "cerebras.ai"],
      ]),
      vendor(42, "SambaNova", "sambanova", "AI inference", [
        ["sambanova.ai", "sambanova.ai"],
      ]),
    ],
  },
  {
    name: "Foreign-headquartered providers relevant to the U.S. market",
    description:
      "Providers included separately because U.S. infrastructure activity is not the same as U.S. headquarters.",
    vendors: [
      vendor(43, "Nebius", "nebius", "International cloud provider", [
        ["nebius.com", "nebius.com"],
      ]),
      vendor(44, "Nscale", "nscale", "International cloud provider", [
        ["nscale.com", "nscale.com"],
      ]),
      vendor(45, "IREN", "iren", "International cloud provider", [
        ["iren.com", "iren.com"],
      ]),
      vendor(46, "Bitdeer", "bitdeer", "International cloud provider", [
        ["bitdeer.com", "bitdeer.com"],
      ]),
    ],
  },
];

export const TRUST_DOSSIER_VENDORS = TRUST_DOSSIER_CATEGORIES.flatMap(
  ({ vendors }) => vendors,
);

export const getTrustDossierVendor = (slug: string) =>
  TRUST_DOSSIER_VENDORS.find((item) => item.slug === slug);
