jest.mock("@aws-sdk/client-ecr", () => ({}));

import {
  analyzeCodeBundle,
  detectDeployTargets,
  extractIacAppNames,
  sameIacApp,
  llmCompanies,
  detectProvidersFromSource,
  analyzeStartupScript,
  buildCloudProfile,
  buildRepoProfile,
  detectFramework,
  importedPackages,
  policyViolations,
  extractModelIds,
  extractToolNames,
  isAgentRepo,
  matchRepoToAgent,
  mergeProfiles,
  normalizeRepoRef,
  parseManifest,
  type RepoEvidence,
} from "./agent-profile";
import type { CorrelatedAgent } from "../aws/correlation";

describe("extractModelIds", () => {
  it("finds Bedrock, OpenAI and Gemini ids and ignores look-alikes", () => {
    const text = `arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0
      MODEL="gpt-4o-mini" other=us.anthropic.claude-3-haiku-20240307-v1:0 g='gemini-1.5-pro'
      claude-code o1 variable_o3 llama`;
    const ids = extractModelIds(text);
    expect(ids).toEqual(
      expect.arrayContaining([
        "anthropic.claude-3-5-sonnet-20241022-v2:0",
        "gpt-4o-mini",
        "anthropic.claude-3-haiku-20240307-v1:0",
        "gemini-1.5-pro",
      ]),
    );
    expect(ids.some((i) => i === "o1" || i.includes("claude-code"))).toBe(false);
  });
});

describe("manifests", () => {
  it("parses requirements, pyproject and package.json", () => {
    expect(parseManifest("requirements.txt", "crewai==0.80.0\n# c\nlangsmith>=0.1\n-r x")).toEqual([
      { name: "crewai", version: "0.80.0" },
      { name: "langsmith", version: "0.1" },
    ]);
    expect(
      parseManifest("pyproject.toml", 'dependencies = ["langgraph>=0.2", "slack_sdk"]').map((p) => p.name),
    ).toEqual(["langgraph", "slack-sdk"]);
    expect(
      parseManifest("web/package.json", '{"dependencies":{"@langchain/core":"^0.3.1"}}'),
    ).toEqual([{ name: "@langchain/core", version: "0.3.1" }]);
  });

  it("picks the most specific framework", () => {
    expect(detectFramework(["langchain", "langgraph"])).toBe("LangGraph");
    expect(detectFramework(["flask"])).toBeNull();
  });
});

describe("extractToolNames", () => {
  it("reads python decorators and ts tool definitions", () => {
    const py = "@tool\ndef search_docs(q):\n  pass\n@mcp.tool()\nasync def create_ticket(): ...";
    expect(extractToolNames(py)).toEqual(["search_docs", "create_ticket"]);
    expect(extractToolNames('tool({ description: "x", name: "lookup_order" })')).toEqual(["lookup_order"]);
  });
});

const repo = (over: Partial<RepoEvidence> = {}): RepoEvidence => ({
  fullName: "acme/support-agent",
  description: null,
  topics: [],
  packages: [
    { name: "crewai", version: "0.80.0" },
    { name: "langsmith", version: null },
    { name: "slack-sdk", version: null },
  ],
  envKeys: ["SLACK_BOT_TOKEN"],
  sourceTexts: ['llm = "claude-3-5-sonnet-20241022"\n@tool\ndef refund(order): ...'],
  mcpServers: [],
  skillNames: [],
  developer: "alice",
  deployer: "bob",
  deployed: true,
  deployedAt: "2026-01-01T00:00:00Z",
  deployedOn: "GitHub production",
  ...over,
});

describe("repo profile", () => {
  it("fills all registry fields", () => {
    const p = buildRepoProfile(repo());
    expect(p).toMatchObject({
      framework: "CrewAI",
      llms: ["claude-3-5-sonnet-20241022"],
      developer: "alice",
      deployer: "bob",
      deployed: true,
      repository: "acme/support-agent",
    });
    expect(p.observability).toContain("LangSmith");
    expect(p.applicationsAccess).toContain("Slack");
    expect(p.skills).toContain("refund");
    expect(p.packages).toContain("crewai@0.80.0");
  });

  it("does not count a plain LLM-SDK app as an agent", () => {
    expect(
      isAgentRepo(repo({ fullName: "acme/billing-portal", packages: [{ name: "openai", version: null }], sourceTexts: [] })),
    ).toBe(false);
    expect(
      isAgentRepo(repo({ fullName: "acme/helper-bot", packages: [{ name: "openai", version: null }], sourceTexts: [] })),
    ).toBe(true);
  });
});

describe("aws profile + merge", () => {
  const agent: CorrelatedAgent = {
    externalAgentId: "us-east-1:fn",
    name: "support-agent",
    platform: "aws_lambda",
    region: "us-east-1",
    discoverySource: "lambda_function",
    resources: [
      {
        resourceType: "lambda_function",
        resourceId: "fn",
        resourceArn: "arn:aws:lambda:us-east-1:1:function:fn",
        resourceName: "fn",
        region: "us-east-1",
        tags: { DeployedBy: "ci-bot", repo: "https://github.com/acme/support-agent.git" },
        lastUpdatedAt: "2026-02-01T00:00:00Z",
        metadata: { runtime: "python3.12", modelIds: ["gpt-4o"], tracing: "Active", environmentKeys: ["LANGSMITH_API_KEY"] },
      },
      {
        resourceType: "iam_role",
        resourceId: "r",
        resourceArn: "arn:r",
        resourceName: "r",
        region: "us-east-1",
        tags: {},
        metadata: { actionServices: ["s3", "dynamodb"], bedrockModels: ["anthropic.claude-3-haiku-20240307-v1:0"] },
      },
    ],
  };

  it("derives LLMs from env/IAM, access from IAM, deployer from tags", () => {
    const p = buildCloudProfile(agent);
    expect(p.llms).toEqual(["gpt-4o", "anthropic.claude-3-haiku-20240307-v1:0"]);
    expect(p.applicationsAccess).toEqual(expect.arrayContaining(["Amazon S3", "DynamoDB"]));
    expect(p.observability).toEqual(expect.arrayContaining(["AWS X-Ray", "LangSmith"]));
    expect(p.deployer).toBe("ci-bot");
    expect(p.deployed).toBe(true);
    expect(p.repository).toBe("acme/support-agent");
  });

  it("merge keeps cloud scalars and unions repo lists", () => {
    const merged = mergeProfiles(buildCloudProfile(agent), buildRepoProfile(repo()));
    expect(merged.deployer).toBe("ci-bot");
    expect(merged.developer).toBe("alice");
    expect(merged.framework).toBe("CrewAI");
    expect(merged.sources).toEqual(["aws", "github"]);
    expect(merged.packages).toEqual(expect.arrayContaining(["runtime: python3.12", "crewai@0.80.0"]));
  });

  it("normalizes repo refs", () => {
    expect(normalizeRepoRef("git@github.com:acme/x.git")).toBe("acme/x");
    expect(normalizeRepoRef("acme/x")).toBe("acme/x");
    expect(normalizeRepoRef("nonsense")).toBeNull();
  });
});

describe("matchRepoToAgent", () => {
  const rows = [
    { name: "Support_Agent", profile: {} },
    { name: "other", profile: { repository: "acme/billing" } },
  ];
  it("matches by repo tag, then by normalized name", () => {
    expect(matchRepoToAgent("acme/billing", rows)).toBe(rows[1]);
    expect(matchRepoToAgent("acme/support-agent", rows)).toBe(rows[0]);
    expect(matchRepoToAgent("acme/unrelated", rows)).toBeNull();
  });
});

describe("lambda code bundle", () => {
  it("reads vendored deps, tools and models from a zip listing, and feeds the AWS profile", () => {
    const facts = analyzeCodeBundle(
      ["app.py", "crewai-0.80.0.dist-info/METADATA", "langsmith-0.1.5.dist-info/RECORD", "node_modules/@slack/web-api/index.js"],
      { "app.py": 'MODEL="gpt-4o"\nkey=os.environ["SLACK_BOT_TOKEN"]\n@tool\ndef refund(o): ...' },
    );
    expect(facts.packages).toEqual(
      expect.arrayContaining([
        { name: "crewai", version: "0.80.0" },
        { name: "langsmith", version: "0.1.5" },
        { name: "@slack/web-api", version: null },
      ]),
    );
    expect(facts.tools).toEqual(["refund"]);
    expect(facts.modelIds).toEqual(["gpt-4o"]);
    expect(facts.envKeys).toContain("SLACK_BOT_TOKEN");

    const p = buildCloudProfile({
      externalAgentId: "x", name: "x", platform: "aws_lambda", region: "us-east-1", discoverySource: "lambda_function",
      resources: [{
        resourceType: "lambda_function", resourceId: "x", resourceArn: "arn", resourceName: "x", region: "us-east-1", tags: {},
        metadata: { codePackages: facts.packages, codeTools: facts.tools, codeModelIds: facts.modelIds, codeEnvKeys: facts.envKeys },
      }],
    } as CorrelatedAgent);
    expect(p.framework).toBe("CrewAI");
    expect(p.skills).toContain("refund");
    expect(p.llms).toContain("gpt-4o");
    expect(p.observability).toContain("LangSmith");
    expect(p.applicationsAccess).toContain("Slack");
    expect(p.packages).toContain("crewai@0.80.0");
  });
});

describe("non-AWS clouds", () => {
  const mk = (platform: CorrelatedAgent["platform"], meta: Record<string, unknown>, tags = {}) =>
    ({
      externalAgentId: "x", name: "x", platform, region: "workspace", discoverySource: "databricks_app",
      resources: [{ resourceType: "databricks_app", resourceId: "x", resourceArn: "x", resourceName: "x", region: "r", tags, metadata: meta }],
    }) as unknown as CorrelatedAgent;

  it("reports stopped apps as not deployed and labels the provider", () => {
    const stopped = buildCloudProfile(mk("databricks_apps", { computeStatus: { state: "STOPPED" } }));
    expect(stopped.deployed).toBe(false);
    expect(stopped.sources).toEqual(["databricks"]);
    const live = buildCloudProfile(mk("azure_container_apps", { provisioningState: "Succeeded" }, { framework: "LangGraph" }));
    expect(live).toMatchObject({ deployed: true, framework: "LangGraph", deployedOn: "Azure workspace" });
  });
});

describe("ec2 startup script", () => {
  it("reads packages, images, models and env names, never values", () => {
    const f = analyzeStartupScript(
      "#!/bin/bash\npip3 install --quiet crewai==0.80.0 langsmith slack_sdk\nexport OPENAI_API_KEY=sk-secret\nMODEL=gpt-4o\ndocker run -d ghcr.io/acme/agent:1.2\n",
    );
    expect(f.packages).toEqual(expect.arrayContaining([
      { name: "crewai", version: "0.80.0" },
      { name: "langsmith", version: null },
      { name: "slack-sdk", version: null },
      { name: "image:ghcr.io/acme/agent:1.2", version: null },
    ]));
    expect(f.modelIds).toContain("gpt-4o");
    expect(f.envKeys).toContain("OPENAI_API_KEY");
    expect(JSON.stringify(f)).not.toContain("sk-secret");
  });
});

describe("databricks app", () => {
  it("takes developer/deployer from the app and the LLM provider from its secret", () => {
    const p = buildCloudProfile({
      externalAgentId: "x", name: "x", platform: "databricks_apps", region: "workspace", discoverySource: "databricks_app",
      resources: [{
        resourceType: "databricks_app", resourceId: "x", resourceArn: "x", resourceName: "x", region: "r", tags: {},
        metadata: {
          creator: "dev@acme.com", updater: "ops@acme.com", computeStatus: { state: "ACTIVE" },
          resources: [{ name: "gemini_api_key", secret: { key: "gemini-api-key" } }, { name: "wh", sql_warehouse: { id: "1" } }],
        },
      }],
    } as unknown as CorrelatedAgent);
    expect(p).toMatchObject({ developer: "dev@acme.com", deployer: "ops@acme.com", deployed: true, llms: ["Google Gemini"] });
    expect(p.applicationsAccess).toContain("SQL Warehouse");
  });
});

describe("provider from source", () => {
  it("names the LLM provider from imports and API hosts when no model id is written", () => {
    expect(detectProvidersFromSource('import boto3\nc = boto3.client("bedrock-runtime")')).toEqual(["Amazon Bedrock"]);
    expect(detectProvidersFromSource("from anthropic import Anthropic\nimport openai")).toEqual(["OpenAI", "Anthropic"]);
    expect(detectProvidersFromSource("print('hello')")).toEqual([]);
    const p = buildRepoProfile(repo({ sourceTexts: ["from groq import Groq"], packages: [{ name: "flask", version: null }] }));
    expect(p.llms).toEqual(["Groq"]);
  });
});

describe("every supported LLM provider is reported", () => {
  it("keeps providers a model id does not cover instead of showing only the model's company", () => {
    const source = [
      'const DEFAULT = "gemini-3.6-flash";',
      'fetch("https://api.openai.com/v1"); fetch("https://openrouter.ai/api/v1"); fetch("https://api.x.ai/v1");',
      'fetch("https://api.mistral.ai/v1"); fetch("https://api.deepseek.com/v1"); fetch("http://localhost:11434");',
    ].join("\n");
    const p = buildRepoProfile(repo({ sourceTexts: [source], packages: [{ name: "next", version: null }] }));
    expect(p.llms).toEqual(
      expect.arrayContaining(["gemini-3.6-flash", "OpenAI", "OpenRouter", "xAI", "Mistral", "DeepSeek", "Ollama"]),
    );
    expect(p.llms).not.toContain("Google Gemini");
  });

  it("does not list a provider twice once cloud and repo profiles merge", () => {
    const a = { ...buildRepoProfile(repo({ sourceTexts: ["gemini-2.5-pro"] })), llms: ["gemini-2.5-pro"] };
    const b = { ...a, llms: ["Google Gemini", "OpenAI"] };
    expect(mergeProfiles(a, b).llms).toEqual(["gemini-2.5-pro", "OpenAI"]);
  });
});

describe("LangChain detection", () => {
  it("ignores a declared-but-unused langchain-community, keeps real LangChain use", () => {
    expect(detectFramework(["langchain-community", "openai"])).toBeNull();
    expect(detectFramework(["@langchain/community"])).toBeNull();
    expect(detectFramework(["langchain-community", "langchain-openai"])).toBe("LangChain");
    expect(detectFramework(importedPackages(["from langchain_community.llms import X"]))).toBe("LangChain");
  });
});

describe("Databricks App framework", () => {
  it("reads Streamlit from the start command and from imports when requirements.txt omits it", () => {
    const facts = analyzeCodeBundle(["app.py", "requirements.txt"], {
      "app.py": "import streamlit as st\nimport google.generativeai as genai",
      "requirements.txt": "google-generativeai\n",
    });
    expect(detectFramework(facts.packages.map((x) => x.name))).toBe("Streamlit");
    const p = buildCloudProfile({
      externalAgentId: "x", name: "streamlit-chatbot", platform: "databricks_apps", region: "r", discoverySource: "databricks_app",
      resources: [{ resourceType: "databricks_app", resourceId: "a", resourceArn: "a", resourceName: "x", region: "r", tags: {}, metadata: { activeDeployment: { command: ["streamlit", "run", "app.py"] } } }],
    } as unknown as CorrelatedAgent);
    expect(p.framework).toBe("Streamlit");
  });
});

describe("iac tags and compose images", () => {
  it("names the SST stack as deployer, keeps the Owner tag as a hint, and lists compose images", () => {
    const p = buildCloudProfile({
      externalAgentId: "x", name: "x", platform: "aws_ec2", region: "us-east-1", discoverySource: "ec2_instance",
      resources: [{ resourceType: "ec2_instance", resourceId: "i", resourceArn: "a", resourceName: "x", region: "r",
        tags: { "sst:app": "receipt-factory", "sst:stage": "factory-lite", Owner: "platform@kentron.ai" }, metadata: { state: "stopped" } }],
    } as unknown as CorrelatedAgent);
    expect(p.deployer).toBeNull();
    expect(p.ownerHint).toBe("platform@kentron.ai");
    const f = analyzeStartupScript("dnf install -y --allowerasing docker git\ncat >c <<'X'\nservices:\n  redis:\n    image: redis:7-alpine\n  api:\n    image: 1.dkr.ecr.us-east-1.amazonaws.com/app/runtime:abc\nX\n");
    expect(f.packages.map((x) => x.name)).toEqual(expect.arrayContaining(["docker", "git", "image:redis:7-alpine", "image:1.dkr.ecr.us-east-1.amazonaws.com/app/runtime:abc"]));
  });
});

describe("container image", () => {
  it("reads tar entries and picks up skills and models from an image layer", () => {
    // Build a tiny tar in memory: skills/foo/SKILL.md + src/a.ts
    const entry = (name: string, body: string) => {
      const h = Buffer.alloc(512);
      h.write(name, 0);
      h.write(body.length.toString(8).padStart(11, "0") + "\0", 124);
      h.write("0", 156);
      const data = Buffer.alloc(Math.ceil(body.length / 512) * 512);
      data.write(body);
      return Buffer.concat([h, data]);
    };
    const tar = Buffer.concat([
      entry("app/skills/factory-deep-research/SKILL.md", "# skill"),
      entry("app/.cursor/skills/building-components/SKILL.md", "# ide"),
      entry("app/src/run.ts", 'const model = "gpt-5.4"; import OpenAI from "openai";'),
      Buffer.alloc(1024),
    ]);
    const { tarEntries } = jest.requireActual("../aws/discovery/ecr-image");
    const paths = [...tarEntries(tar)].map((e: { path: string }) => e.path);
    expect(paths).toEqual(["app/skills/factory-deep-research/SKILL.md", "app/.cursor/skills/building-components/SKILL.md", "app/src/run.ts"]);
    const facts = analyzeCodeBundle(paths, { "app/src/run.ts": 'const model = "gpt-5.4"; import OpenAI from "openai";' });
    expect(facts.modelIds).toContain("gpt-5.4");
    expect(facts.providers).toContain("OpenAI");
  });
});


describe("llm companies + ai sdk framework", () => {
  it("maps model ids to companies and treats the Vercel AI SDK as the framework of last resort", () => {
    expect(llmCompanies(["gpt-5-mini", "gpt-5.4", "claude-sonnet-4.6", "us.anthropic.claude-3-haiku", "Google Gemini"])).toEqual(["OpenAI", "Anthropic", "Gemini"]);
    expect(detectFramework(["ai", "@ai-sdk/openai"])).toBe("Vercel AI SDK");
    expect(detectFramework(["ai", "@langchain/langgraph"])).toBe("LangGraph");
  });
});

describe("framework = code library only", () => {
  const mk = (codePackages: unknown[], codeFrameworks: string[] = []) =>
    buildCloudProfile({
      externalAgentId: "x", name: "x", platform: "aws_ec2", region: "r", discoverySource: "ec2_instance",
      resources: [{ resourceType: "ec2_instance", resourceId: "i", resourceArn: "a", resourceName: "x", region: "r", tags: {}, metadata: { codePackages, codeFrameworks } }],
    } as unknown as CorrelatedAgent).framework;
  it("reports the library the code is built on, never a CLI or sandbox", () => {
    expect(mk([{ name: "ai" }, { name: "@langchain/langgraph" }], ["OpenAI Codex CLI"])).toBe("LangGraph");
    expect(mk([{ name: "ai" }], ["OpenAI Codex CLI"])).toBe("Vercel AI SDK");
    expect(mk([{ name: "image:opensandbox/execd:v1" }])).toBeNull();
  });
});

describe("deploy targets + iac link", () => {
  it("reads where a repo deploys and the app name that links it to cloud resources", () => {
    expect(detectDeployTargets(["render.yaml", "Dockerfile", "src/a.ts"])).toEqual(["Render"]);
    expect(detectDeployTargets(["sst.config.ts", ".github/workflows/deploy.yml"])).toEqual(["AWS (SST)"]);
    // Archived configs and CI-only files do not say where an app runs.
    expect(detectDeployTargets([".archive/vercel.json", ".archive/netlify.toml", "infra/cloudbuild.yaml"])).toEqual([]);
    expect(detectDeployTargets(["apps/web/vercel.json"])).toEqual(["Vercel"]);
    expect(extractIacAppNames({ "sst.config.ts": 'export default $config({ app(input) { return { name: "receipt-factory", home: "aws" }; } })' })).toEqual(["receipt-factory"]);
    expect(extractIacAppNames({ "render.yaml": "services:\n  - type: web\n    name: owluc-api\n" })).toEqual(["owluc-api"]);
    expect(sameIacApp("receipt-factory", "receipt-factory")).toBe(true);
    expect(sameIacApp("myapp-prod", "myapp")).toBe(true);
    expect(sameIacApp("receipt", "receipt-factory")).toBe(false);
  });
});

test("LangChain integration packages win over the Vercel AI SDK", () => {
  expect(detectFramework(["ai", "@langchain/openai"])).toBe("LangChain");
  expect(detectFramework(["langchain-anthropic"])).toBe("LangChain");
  expect(detectFramework(["ai", "@ai-sdk/openai"])).toBe("Vercel AI SDK");
});

test("policy violations: missing observability and unapproved models", () => {
  const v = policyViolations([], ["OpenAI", "gpt-4o", "us.anthropic.claude-opus-4-7", "gemini-3.6-flash-001"], ["claude-opus-4-7", "gemini-3.6-flash"]);
  expect(v.map((x) => x.policy)).toEqual(["Observability required", "Unapproved model"]);
  expect(v[1].reason).toContain("gpt-4o");
  expect(policyViolations(["PostHog"], ["claude-opus-4-7"], ["claude-opus-4-7"])).toEqual([]);
});

test("a direct LLM app falls back to its app framework", () => {
  expect(detectFramework(["streamlit", "google-generativeai"])).toBe("Streamlit");
  expect(detectFramework(["streamlit", "agno"])).toBe("Agno");
});
