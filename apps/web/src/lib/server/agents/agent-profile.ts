/**
 * The Agent Registry "profile": the ten facts every agent must carry no matter
 * which provider discovered it — id, applications access, developer, deployer,
 * deployed, observability, framework, LLMs, skills, packages.
 *
 * Everything here is pure. AWS discovery feeds it cloud resources
 * (`buildAwsProfile`), GitHub discovery feeds it repository files
 * (`buildRepoProfile`), and `mergeProfiles` fuses the two when a repository is
 * the source of a deployed cloud agent. The agent's UUID is `agents.id`.
 */

import type { CorrelatedAgent } from "../aws/correlation";

export interface AgentProfile {
  applicationsAccess: string[];
  developer: string | null;
  deployer: string | null;
  deployed: boolean;
  deployedAt: string | null;
  deployedOn: string | null;
  observability: string[];
  framework: string | null;
  llms: string[];
  skills: string[];
  packages: string[];
  /** Providers that contributed evidence, e.g. ["aws", "github"]. */
  sources: string[];
  /** "owner/repo" when the agent's source code is known. */
  repository: string | null;
  /** Owner named by a provider tag (Owner / Team / Email) even when no NORIX user matches it. */
  ownerHint: string | null;
  /** IaC app that created it: SST app, CloudFormation stack, Serverless service, Render/Fly app. Links code to cloud agents. */
  iacApp: string | null;
}

export const EMPTY_PROFILE: AgentProfile = {
  applicationsAccess: [],
  developer: null,
  deployer: null,
  deployed: false,
  deployedAt: null,
  deployedOn: null,
  observability: [],
  framework: null,
  llms: [],
  skills: [],
  packages: [],
  sources: [],
  repository: null,
  ownerHint: null,
  iacApp: null,
};

const LIST_CAP = 40;

const uniq = (values: Array<string | null | undefined>, cap = LIST_CAP) =>
  Array.from(new Set(values.filter((v): v is string => Boolean(v?.trim())))).slice(
    0,
    cap,
  );

/** Reads a stored jsonb profile defensively (older rows are `{}`). */
export function readProfile(value: unknown): AgentProfile {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<AgentProfile>;
  const list = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    applicationsAccess: list(raw.applicationsAccess),
    developer: raw.developer ?? null,
    deployer: raw.deployer ?? null,
    deployed: raw.deployed === true,
    deployedAt: raw.deployedAt ?? null,
    deployedOn: raw.deployedOn ?? null,
    observability: list(raw.observability),
    framework: raw.framework ?? null,
    llms: list(raw.llms),
    skills: list(raw.skills),
    packages: list(raw.packages),
    sources: list(raw.sources),
    repository: raw.repository ?? null,
    ownerHint: raw.ownerHint ?? null,
    iacApp: raw.iacApp ?? null,
  };
}

/**
 * Fuses two profiles. Lists are unioned; for single values `base` wins, so a
 * cloud-side fact (who actually deployed it) outranks a repo-side guess, while
 * repo-only facts (packages, developer) fill the gaps the cloud cannot see.
 */
export function mergeProfiles(base: AgentProfile, extra: AgentProfile): AgentProfile {
  return {
    applicationsAccess: uniq([...base.applicationsAccess, ...extra.applicationsAccess]),
    // A repo owner is only a guess; real GitHub contributors win over it.
    developer: base.developer && !base.developer.endsWith("(repo owner)") ? base.developer : (extra.developer ?? base.developer),
    deployer: base.deployer ?? extra.deployer,
    deployed: base.deployed || extra.deployed,
    deployedAt: base.deployedAt ?? extra.deployedAt,
    deployedOn: base.deployedOn ?? extra.deployedOn,
    observability: uniq([...base.observability, ...extra.observability]),
    framework: base.framework ?? extra.framework,
    llms: mergeAllLlms([...base.llms, ...extra.llms]),
    skills: uniq([...base.skills, ...extra.skills]),
    packages: uniq([...base.packages, ...extra.packages], 200),
    sources: uniq([...base.sources, ...extra.sources]),
    repository: base.repository ?? extra.repository,
    ownerHint: base.ownerHint ?? extra.ownerHint,
    iacApp: base.iacApp ?? extra.iacApp,
  };
}

// ---------------------------------------------------------------------------
// LLM detection
// ---------------------------------------------------------------------------

// Concrete model ids only (a version digit or a tier word must follow the
// family) so "claude-code" or a variable named "o1" never counts as an LLM.
const MODEL_ID = new RegExp(
  "(?<![\\w-])(?:(?:us|eu|apac|global)\\.)?(?:" +
    [
      "anthropic\\.claude-[a-z0-9.-]+(?::\\d+)?",
      "claude-(?:\\d|opus|sonnet|haiku|instant)[a-z0-9.-]*",
      "amazon\\.(?:nova|titan)-[a-z0-9.-]+(?::\\d+)?",
      "meta\\.llama[a-z0-9.-]+(?::\\d+)?",
      "mistral\\.(?:mistral|mixtral|pixtral|ministral)-[a-z0-9.-]+(?::\\d+)?",
      "cohere\\.command[a-z0-9.-]+(?::\\d+)?",
      "gpt-(?:\\d|oss)[a-z0-9.-]*",
      "o\\d-(?:mini|pro|preview)",
      "gemini-\\d[a-z0-9.-]*",
      "llama-?\\d[a-z0-9.-]*",
      "mistral-(?:large|medium|small|tiny|nemo)[a-z0-9.-]*",
      "deepseek-[a-z0-9.-]+",
      "grok-\\d[a-z0-9.-]*",
      "command-r[a-z0-9+.-]*",
    ].join("|") +
    ")",
  "gi",
);

/** Pulls normalized model ids out of arbitrary text (ARNs, env values, code). */
export function extractModelIds(text: string | null | undefined): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const match of text.matchAll(MODEL_ID)) {
    const id = match[0]
      .toLowerCase()
      .replace(/^(us|eu|apac|global)\./, "")
      .replace(/[-.]+$/, "");
    if (id.length > 4) found.add(id);
  }
  return Array.from(found);
}

const LLM_PROVIDER_PACKAGES: Array<[string, RegExp]> = [
  ["OpenAI", /^(openai|langchain-openai|@langchain\/openai|@ai-sdk\/openai)$/],
  ["Anthropic", /^(anthropic|langchain-anthropic|@anthropic-ai\/sdk|@langchain\/anthropic|@ai-sdk\/anthropic|claude-agent-sdk|@anthropic-ai\/claude-agent-sdk)$/],
  ["Google Gemini", /^(google-generativeai|google-genai|@google\/generative-ai|@google\/genai|langchain-google-genai|@ai-sdk\/google)$/],
  ["Vertex AI", /^(google-cloud-aiplatform|vertexai|langchain-google-vertexai)$/],
  ["AWS Bedrock", /^(langchain-aws|@langchain\/aws|@aws-sdk\/client-bedrock-runtime|@aws-sdk\/client-bedrock-agent-runtime|strands-agents|@ai-sdk\/amazon-bedrock)$/],
  ["Mistral", /^(mistralai|langchain-mistralai|@mistralai\/mistralai)$/],
  ["Cohere", /^(cohere|@langchain\/cohere|langchain-cohere)$/],
  ["Groq", /^(groq|langchain-groq|groq-sdk)$/],
  ["Ollama", /^(ollama|langchain-ollama)$/],
  ["xAI", /^(xai-sdk|@ai-sdk\/xai|langchain-xai|@langchain\/xai)$/],
  ["OpenRouter", /^(@openrouter\/ai-sdk-provider|@openrouter\/sdk|langchain-openrouter)$/],
  ["DeepSeek", /^(@ai-sdk\/deepseek|langchain-deepseek|@langchain\/deepseek)$/],
  ["LiteLLM", /^litellm$/],
];

const SOURCE_PROVIDERS: Array<[string, RegExp]> = [
  ["Amazon Bedrock", /bedrock-runtime|bedrock_runtime|ChatBedrock|BedrockRuntime|langchain_aws|@aws-sdk\/client-bedrock-runtime/],
  ["Azure OpenAI", /AzureOpenAI|AzureChatOpenAI|openai\.azure\.com/],
  ["OpenAI", /api\.openai\.com|from openai import|import openai|ChatOpenAI|require\(["']openai["']\)|from ["']openai["']/],
  ["Anthropic", /api\.anthropic\.com|from anthropic import|import anthropic|ChatAnthropic|@anthropic-ai\/sdk/],
  ["Google Gemini", /generativelanguage\.googleapis|google\.generativeai|google\.genai|ChatGoogleGenerativeAI|@google\/generative-ai|@google\/genai/],
  ["Vertex AI", /aiplatform\.googleapis|vertexai|ChatVertexAI/],
  ["Mistral", /api\.mistral\.ai|from mistralai|@mistralai/],
  ["Groq", /api\.groq\.com|from groq import|groq-sdk/],
  ["Cohere", /api\.cohere|import cohere|cohere-ai/],
  ["Ollama", /localhost:11434|ChatOllama|from ollama import/],
  ["xAI", /api\.x\.ai|from xai_sdk|ChatXAI/],
  ["OpenRouter", /openrouter\.ai|ChatOpenRouter/],
  ["DeepSeek", /api\.deepseek\.com|ChatDeepSeek/],
];

/** LLM providers a source file visibly calls (imports, SDK classes, API hosts). */
export function detectProvidersFromSource(text: string): string[] {
  return SOURCE_PROVIDERS.filter(([, re]) => re.test(text)).map(([label]) => label);
}

const MODEL_COMPANIES: Array<[RegExp, string]> = [
  [/^(gpt|o\d|chatgpt|codex|text-embedding|davinci|openai)/i, "OpenAI"],
  [/^(claude|anthropic)/i, "Anthropic"],
  [/^(gemini|gemma|google)/i, "Gemini"],
  [/^(llama|meta)/i, "Meta"],
  [/^(mistral|mixtral|codestral)/i, "Mistral"],
  [/^(grok|xai)/i, "xAI"],
  [/^(amazon|nova|titan)/i, "Amazon"],
  [/^(command|cohere)/i, "Cohere"],
  [/^deepseek/i, "DeepSeek"],
  [/^openrouter/i, "OpenRouter"],
];

/**
 * LLM companies for display, most-used first. Entries that are already a
 * provider name (e.g. "Google Gemini") are kept as they are.
 */
export function llmCompanies(llms: string[]): string[] {
  return uniq(
    llms.map((id) => {
      const bare = id.replace(/^(us|eu|apac)\./, "");
      return MODEL_COMPANIES.find(([re]) => re.test(bare))?.[1] ?? id;
    }),
  );
}

/**
 * Models plus the providers the code calls. A provider is dropped only when a
 * listed model already names its company, so one "gemini-…" string can no longer
 * hide every other provider the agent supports.
 */
export function mergeLlms(models: string[], providers: string[], max = 12): string[] {
  const covered = new Set(llmCompanies(models));
  return uniq([...models, ...providers.filter((p) => !covered.has(llmCompanies([p])[0]))], max);
}

/** Splits a mixed list into model ids and provider names (the same test policyViolations uses), then merges. */
const mergeAllLlms = (all: string[]) => {
  const isModel = (m: string) => /[-.\d]/.test(m) && !/\s/.test(m);
  const u = uniq(all);
  return mergeLlms(u.filter(isModel), u.filter((m) => !isModel(m)));
};

// Packages that let an agent execute code, drive a browser or run a sandbox.
const EXECUTION_PACKAGE = /^(playwright|puppeteer|selenium|e2b(-code-interpreter)?|@e2b\/.+|docker|dockerode|@openai\/codex|@anthropic-ai\/claude-code|claude-agent-sdk|@anthropic-ai\/claude-agent-sdk|opensandbox.*|daytona.*|modal)(@.*)?$/i;
const MULTI_AGENT = /^(CrewAI|LangGraph|AutoGen|Google ADK|OpenAI Agents SDK|Claude Agent SDK|Agno|Mastra|Strands Agents|smolagents)$/;

/**
 * Autonomy from what the agent can actually do, read from its profile:
 * L1 answers only (LLM, no tools) · L2 uses tools or reads apps ·
 * L3 an agent framework with tools acting on apps · L4 executes code /
 * browser / sandbox, or a broad toolset across many apps.
 * ponytail: capability heuristic; a per-tool read/write audit is the upgrade.
 */
export function profileAutonomy(p: AgentProfile): { level: "L1" | "L2" | "L3" | "L4"; reason: string } {
  const tools = p.skills.length;
  const apps = p.applicationsAccess.length;
  const exec = p.packages.filter((x) => EXECUTION_PACKAGE.test(x.replace(/@[^@/]*$/, "")));
  if (exec.length || (tools >= 5 && apps >= 3)) {
    return {
      level: "L4",
      reason: exec.length
        ? `Can execute code or drive a browser/sandbox (${exec.slice(0, 3).join(", ")}).`
        : `Broad autonomy: ${tools} skills/tools across ${apps} applications.`,
    };
  }
  if (tools && apps && p.framework && MULTI_AGENT.test(p.framework)) {
    return { level: "L3", reason: `${p.framework} agent with ${tools} tools acting on ${apps} applications.` };
  }
  if (tools || apps) {
    return { level: "L2", reason: tools ? `Uses ${tools} tools/skills.` : `Has access to ${apps} applications.` };
  }
  return { level: "L1", reason: "Answers with an LLM only; no tools or application access found." };
}

export interface PolicyViolation {
  policy: string;
  reason: string;
}

/** Strips a region / provider prefix so "us.anthropic.claude-x" or "openai/gpt-x" compare as "claude-x" / "gpt-x". */
const bareModel = (id: string) =>
  id.toLowerCase().replace(/^(us|eu|apac)\./, "").replace(/^[a-z0-9-]+[/.](?=[a-z])/, "");

/**
 * Governance checks on a registry profile: observability must be set up, and
 * every model the agent uses must be approved in the tenant's Model Registry.
 * Provider names ("OpenAI") are not model ids and are not checked.
 */
export function policyViolations(
  observability: string[],
  llms: string[],
  approvedModels: string[],
): PolicyViolation[] {
  const out: PolicyViolation[] = [];
  if (observability.length === 0) {
    out.push({
      policy: "Observability required",
      reason:
        "No observability found in the agent's code, packages, environment or tags (e.g. LangSmith, Langfuse, OpenTelemetry, Datadog, PostHog, Sentry).",
    });
  }
  const approved = approvedModels.map(bareModel);
  for (const model of llms.filter((m) => /[-.\d]/.test(m) && !/\s/.test(m))) {
    const id = bareModel(model);
    if (!approved.some((a) => id === a || id.startsWith(`${a}-`) || id.startsWith(`${a}@`))) {
      out.push({
        policy: "Unapproved model",
        reason: `${model} is not an approved model in the Model Registry.`,
      });
    }
  }
  return out;
}

export function detectLlmProviders(packageNames: string[]): string[] {
  return LLM_PROVIDER_PACKAGES.filter(([, re]) =>
    packageNames.some((p) => re.test(p)),
  ).map(([label]) => label);
}

// ---------------------------------------------------------------------------
// Framework / observability / applications
// ---------------------------------------------------------------------------

// Order matters: the first match wins, so specific orchestrators come before
// the general libraries they are built on (LangGraph before LangChain).
const FRAMEWORKS: Array<[string, RegExp]> = [
  ["CrewAI", /^crewai(-tools)?$/],
  ["LangGraph", /^(langgraph(-[a-z]+)?|@langchain\/langgraph(-[a-z]+)?)$/],
  ["AutoGen", /^(autogen|pyautogen|ag2|autogen-agentchat|@autogenai\/autogen)$/],
  ["Strands Agents", /^(strands-agents(-tools)?|@strands-agents\/sdk)$/],
  ["OpenAI Agents SDK", /^(openai-agents|@openai\/agents)$/],
  ["Claude Agent SDK", /^(claude-agent-sdk|claude-code-sdk|@anthropic-ai\/claude-agent-sdk|@anthropic-ai\/claude-code)$/],
  ["Google ADK", /^google-adk$/],
  ["Pydantic AI", /^pydantic-ai(-slim)?$/],
  ["Semantic Kernel", /^(semantic-kernel|@microsoft\/semantic-kernel)$/],
  ["LlamaIndex", /^(llama-index(-[a-z0-9-]+)?|llamaindex|@llamaindex\/.+)$/],
  ["Haystack", /^(haystack-ai|farm-haystack)$/],
  ["smolagents", /^smolagents$/],
  ["Agno", /^(agno|phidata)$/],
  ["DSPy", /^(dspy|dspy-ai)$/],
  ["ScrapeGraphAI", /^scrapegraphai$/],
  ["Mastra", /^@mastra\/.+$/],
  ["Bedrock AgentCore", /^(bedrock-agentcore|bedrock-agentcore-starter-toolkit)$/],
  // Any LangChain integration package (@langchain/openai, langchain-anthropic, ...).
  // Not the bare "community" grab-bag: repos pin it without ever using LangChain
  // (Norix lists langchain-community but never imports it). Real use imports a
  // submodule ("langchain_community.llms"), which still matches.
  ["LangChain", /^(langchain(?!-community$)(-[a-z0-9-]+)?|@langchain\/(?!community$).+)$/],
  // Broad TS agent/LLM library: only when no dedicated agent framework above matched.
  ["Vercel AI SDK", /^(ai|@ai-sdk\/.+)$/],
  // App frameworks that host an LLM chat/agent directly, when no agent framework is used.
  ["Streamlit", /^streamlit$/],
  ["Gradio", /^gradio$/],
  ["Chainlit", /^chainlit$/],
];

const normalizePkg = (name: string) => name.trim().toLowerCase().replace(/_/g, "-");

/**
 * Package names a source file imports, so a framework is found from the code
 * even when no dependency manifest lists it (or it can't be parsed).
 * Python `google.adk` yields both "google" and "google-adk"; JS keeps the
 * package part of a specifier ("@ai-sdk/openai/x" -> "@ai-sdk/openai").
 */
export function importedPackages(texts: string[]): string[] {
  const out = new Set<string>();
  for (const text of texts) {
    for (const m of text.matchAll(/^[ \t]*(?:from|import)[ \t]+([A-Za-z_][\w.]*)/gm)) {
      const parts = m[1].split(".");
      out.add(normalizePkg(parts[0]));
      if (parts[1]) out.add(normalizePkg(`${parts[0]}-${parts[1]}`));
    }
    for (const m of text.matchAll(/(?:from\s+|require\(\s*|import\(\s*)["']([^"'.][^"']*)["']/g)) {
      const segs = m[1].split("/");
      out.add(normalizePkg(m[1].startsWith("@") ? segs.slice(0, 2).join("/") : segs[0]));
    }
  }
  return Array.from(out);
}

export function detectFramework(packageNames: string[]): string | null {
  const names = packageNames.map(normalizePkg);
  return FRAMEWORKS.find(([, re]) => names.some((n) => re.test(n)))?.[0] ?? null;
}

const OBSERVABILITY_PACKAGES: Array<[string, RegExp]> = [
  ["LangSmith", /^langsmith$/],
  ["Langfuse", /^langfuse$/],
  ["OpenTelemetry", /^(opentelemetry-.+|@opentelemetry\/.+|openllmetry|traceloop-sdk|@traceloop\/.+)$/],
  ["Arize Phoenix", /^(arize-phoenix.*|openinference-.+|@arizeai\/.+)$/],
  ["Helicone", /^(helicone.*|@helicone\/.+)$/],
  ["W&B Weave", /^(weave|wandb)$/],
  ["Datadog", /^(ddtrace|dd-trace|datadog.*)$/],
  ["Sentry", /^(sentry-sdk|@sentry\/.+)$/],
  ["New Relic", /^(newrelic|newrelic-.+)$/],
  ["Braintrust", /^braintrust$/],
  ["AgentOps", /^agentops$/],
  ["MLflow", /^mlflow(-.+)?$/],
  ["AWS X-Ray", /^(aws-xray-sdk|aws-xray-sdk-core)$/],
  ["PostHog", /^(posthog|posthog-js|posthog-node|@posthog\/.+)$/],
];

const OBSERVABILITY_ENV: Array<[string, RegExp]> = [
  ["LangSmith", /^(LANGSMITH_|LANGCHAIN_(TRACING|API_KEY|PROJECT))/],
  ["Langfuse", /^LANGFUSE_/],
  ["OpenTelemetry", /^OTEL_/],
  ["Datadog", /^(DD_|DATADOG_)/],
  ["Sentry", /^SENTRY_/],
  ["Helicone", /^HELICONE_/],
  ["Arize Phoenix", /^(PHOENIX_|ARIZE_)/],
  ["AgentOps", /^AGENTOPS_/],
  ["PostHog", /^POSTHOG_/],
];

export function detectObservability(
  packageNames: string[],
  envKeys: string[],
): string[] {
  const names = packageNames.map(normalizePkg);
  return uniq([
    ...OBSERVABILITY_PACKAGES.filter(([, re]) => names.some((n) => re.test(n))).map(([l]) => l),
    ...OBSERVABILITY_ENV.filter(([, re]) => envKeys.some((k) => re.test(k))).map(([l]) => l),
  ]);
}

const APPLICATION_PACKAGES: Array<[string, RegExp]> = [
  ["Slack", /^(slack-sdk|slack-bolt|@slack\/.+)$/],
  ["Notion", /^(notion-client|@notionhq\/client)$/],
  ["GitHub", /^(pygithub|@octokit\/.+|octokit)$/],
  ["Jira", /^(jira|atlassian-python-api|jira\.js)$/],
  ["Salesforce", /^(simple-salesforce|jsforce)$/],
  ["HubSpot", /^(hubspot-api-client|@hubspot\/api-client)$/],
  ["Stripe", /^stripe$/],
  ["Zendesk", /^(zenpy|node-zendesk)$/],
  ["Twilio", /^twilio$/],
  ["Google Workspace", /^(google-api-python-client|googleapis|gspread)$/],
  ["Microsoft 365", /^(msal|msgraph-sdk|@microsoft\/microsoft-graph-client)$/],
  ["Snowflake", /^(snowflake-connector-python|snowflake-sdk|snowflake-sqlalchemy)$/],
  ["PostgreSQL", /^(psycopg2?(-binary)?|psycopg|asyncpg|pg|postgres|sqlalchemy)$/],
  ["MongoDB", /^(pymongo|motor|mongodb|mongoose)$/],
  ["Redis", /^(redis|ioredis)$/],
  ["Pinecone", /^(pinecone(-client)?|@pinecone-database\/pinecone)$/],
  ["Chroma", /^(chromadb|chromadb-client)$/],
  ["Qdrant", /^(qdrant-client|@qdrant\/js-client-rest)$/],
  ["Weaviate", /^(weaviate-client)$/],
  ["Amazon S3", /^@aws-sdk\/client-s3$/],
  ["Amazon SES", /^@aws-sdk\/client-sesv?2?$/],
  ["Resend", /^resend$/],
  ["Linear", /^@linear\/sdk$/],
  ["AWS", /^(boto3|botocore|aws-sdk|@aws-sdk\/.+)$/],
  ["Azure", /^(azure-.+|@azure\/.+)$/],
  ["Playwright / Browser", /^(playwright|selenium|puppeteer)$/],
];

const APPLICATION_ENV: Array<[string, RegExp]> = [
  ["Slack", /^SLACK_/],
  ["Notion", /^NOTION_/],
  ["GitHub", /^GITHUB_/],
  ["Jira", /^(JIRA_|ATLASSIAN_)/],
  ["Salesforce", /^(SALESFORCE_|SF_)/],
  ["HubSpot", /^HUBSPOT_/],
  ["Stripe", /^STRIPE_/],
  ["Zendesk", /^ZENDESK_/],
  ["Twilio", /^TWILIO_/],
  ["Snowflake", /^SNOWFLAKE_/],
  ["PostgreSQL", /^(DATABASE_URL|POSTGRES|PG(HOST|USER|DATABASE)|SUPABASE_)/],
  ["MongoDB", /^MONGO/],
  ["Redis", /^REDIS_/],
  ["Pinecone", /^PINECONE_/],
  ["Google Workspace", /^(GOOGLE_(CLIENT|CREDENTIALS|SHEETS|DRIVE)|GMAIL_)/],
];

/** Apps the agent can reach: it ships the app's SDK or holds credentials for it. */
export function detectApplications(
  packageNames: string[],
  envKeys: string[],
): string[] {
  const names = packageNames.map(normalizePkg);
  return uniq([
    ...APPLICATION_PACKAGES.filter(([, re]) => names.some((n) => re.test(n))).map(([l]) => l),
    ...APPLICATION_ENV.filter(([, re]) => envKeys.some((k) => re.test(k))).map(([l]) => l),
  ]);
}

// ---------------------------------------------------------------------------
// Repository manifests / source
// ---------------------------------------------------------------------------

export interface ParsedPackage {
  name: string;
  version: string | null;
}

const pkgLabel = (p: ParsedPackage) => (p.version ? `${p.name}@${p.version}` : p.name);

function parseRequirements(text: string): ParsedPackage[] {
  const out: ParsedPackage[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    if (!line || line.startsWith("-") || /^(https?|git\+)/.test(line)) continue;
    const m = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*(?:(?:==|>=|~=|<=|>|<|!=)\s*([0-9][^\s,;]*))?/);
    if (m) out.push({ name: normalizePkg(m[1]), version: m[2] ?? null });
  }
  return out;
}

function parsePyproject(text: string): ParsedPackage[] {
  const out: ParsedPackage[] = [];
  // PEP 621: dependencies = ["pkg>=1", ...] (and optional-dependencies groups).
  // Quoted entries are skipped whole, so extras like "crewai[tools]" don't end the list.
  for (const block of text.matchAll(/dependencies\s*=\s*\[((?:"[^"]*"|'[^']*'|[^\]"'])*)\]/g)) {
    for (const s of block[1].matchAll(/["']([^"']+)["']/g)) {
      out.push(...parseRequirements(s[1]));
    }
  }
  // Poetry: [tool.poetry.dependencies] name = "^1.2" | { version = "^1.2" }
  const poetry = text.match(/\[tool\.poetry(?:\.group\.[\w-]+)?\.dependencies\]([\s\S]*?)(?=\n\[|$)/g);
  for (const section of poetry ?? []) {
    for (const m of section.matchAll(/^([A-Za-z0-9][A-Za-z0-9._-]*)\s*=\s*(?:"([^"]*)"|\{[^}]*?version\s*=\s*"([^"]*)")/gm)) {
      if (m[1].toLowerCase() === "python") continue;
      out.push({ name: normalizePkg(m[1]), version: (m[2] ?? m[3] ?? "").replace(/^[\^~>=<\s]+/, "") || null });
    }
  }
  return out;
}

function parsePackageJson(text: string): ParsedPackage[] {
  try {
    const json = JSON.parse(text) as Record<string, Record<string, string> | undefined>;
    return Object.entries({ ...json.dependencies, ...json.devDependencies }).map(
      ([name, version]) => ({
        name: normalizePkg(name),
        version: typeof version === "string" ? version.replace(/^[\^~>=<\s]+/, "") : null,
      }),
    );
  } catch {
    return [];
  }
}

/** Parses one dependency manifest by filename; unknown files yield nothing. */
export function parseManifest(path: string, text: string): ParsedPackage[] {
  const file = path.split("/").pop()?.toLowerCase() ?? "";
  if (/^requirements.*\.txt$/.test(file)) return parseRequirements(text);
  if (file === "pyproject.toml") return parsePyproject(text);
  if (file === "package.json") return parsePackageJson(text);
  return [];
}

export const isManifestPath = (path: string) =>
  !/(^|\/)(node_modules|vendor|\.venv|venv|dist|build)\//.test(path) &&
  path.split("/").length <= 3 &&
  /(^|\/)(requirements[\w.-]*\.txt|pyproject\.toml|package\.json)$/.test(path);

const TOOL_PATTERNS: RegExp[] = [
  // Python decorators: @tool / @function_tool / @mcp.tool / @server.tool
  /@(?:[\w.]*\.)?(?:tool|function_tool)\b[^\n]*\n(?:[ \t]*@[^\n]*\n)*[ \t]*(?:async\s+)?def\s+(\w+)/g,
  // Python tool classes
  /class\s+(\w+)\((?:\w+\.)?(?:BaseTool|StructuredTool|Tool)\)/g,
  // JS/TS: tool({ name: "x" }), new DynamicTool({ name: "x" }), server.tool("x"
  /\b(?:tool|DynamicTool|DynamicStructuredTool)\(\s*\{[^}]*?name:\s*["'`]([\w.-]+)/g,
  /\.tool\(\s*["'`]([\w.-]+)["'`]/g,
];

/** Names of agent tools declared in a source file. */
export function extractToolNames(text: string): string[] {
  const names = new Set<string>();
  for (const re of TOOL_PATTERNS) {
    for (const m of text.matchAll(re)) names.add(m[1]);
  }
  return Array.from(names);
}

/** Skill folders (`.claude/skills/<name>/SKILL.md`) and MCP servers. */
export function extractSkillsFromPaths(paths: string[]): string[] {
  return uniq(
    paths.flatMap((p) => {
      const m = p.match(/(?:^|\/)skills\/([^/]+)\/SKILL\.md$/i);
      return m ? [m[1]] : [];
    }),
  );
}

export function extractMcpServers(text: string): string[] {
  try {
    const json = JSON.parse(text) as { mcpServers?: Record<string, unknown>; servers?: Record<string, unknown> };
    return Object.keys(json.mcpServers ?? json.servers ?? {}).map((n) => `MCP: ${n}`);
  } catch {
    return [];
  }
}

/** Env var NAMES from an .env.example / workflow / config text (never values). */
export function extractEnvKeys(text: string): string[] {
  const keys = new Set<string>();
  for (const m of text.matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]{2,})\s*[=:]/gm)) keys.add(m[1]);
  for (const m of text.matchAll(/\b(?:os\.environ(?:\.get)?|os\.getenv|process\.env)[.[(]\s*["']?([A-Z][A-Z0-9_]{2,})/g)) keys.add(m[1]);
  return Array.from(keys);
}

export interface RepoEvidence {
  fullName: string;
  description: string | null;
  topics: string[];
  /** Manifest files already parsed into packages. */
  packages: ParsedPackage[];
  /** Env var names seen in .env.example, workflows and source. */
  envKeys: string[];
  /** Raw text of sampled source/config files (for model + tool detection). */
  sourceTexts: string[];
  mcpServers: string[];
  skillNames: string[];
  developer: string | null;
  deployer: string | null;
  deployed: boolean;
  deployedAt: string | null;
  deployedOn: string | null;
  /** Hosts the repo declares it deploys to (render.yaml → Render, sst.config.ts → AWS (SST)…). */
  deployTargets?: string[];
  /** App names inside those deploy configs. */
  iacNames?: string[];
}

// Deploy configs a repo carries, and the host each one targets.
const DEPLOY_FILES: Array<[RegExp, string]> = [
  [/(^|\/)render\.ya?ml$/i, "Render"],
  [/(^|\/)vercel\.json$/i, "Vercel"],
  [/(^|\/)netlify\.toml$/i, "Netlify"],
  [/(^|\/)fly\.toml$/i, "Fly.io"],
  [/(^|\/)railway\.(json|toml)$/i, "Railway"],
  [/(^|\/)Procfile$/, "Heroku"],
  [/(^|\/)sst\.config\.ts$/i, "AWS (SST)"],
  [/(^|\/)serverless\.ya?ml$/i, "AWS (Serverless)"],
  [/(^|\/)cdk\.json$/i, "AWS (CDK)"],
  [/(^|\/)samconfig\.toml$/i, "AWS (SAM)"],
  [/(^|\/)amplify\.ya?ml$/i, "AWS Amplify"],
  [/(^|\/)app\.ya?ml$/i, "Google Cloud"],
  [/(^|\/)azure-pipelines\.ya?ml$/i, "Azure"],
  [/(^|\/)databricks\.ya?ml$/i, "Databricks"],
];

// Dot-folders (.archive, .old…) and archive/legacy folders hold retired configs, not live ones.
export const RETIRED_PATH = /(^|\/)(\.[^/]+|archive[d]?|legacy|deprecated|old)\//i;

export const isDeployConfig = (path: string) =>
  path.split("/").length <= 3 && !RETIRED_PATH.test(path) && DEPLOY_FILES.some(([re]) => re.test(path));

export function detectDeployTargets(paths: string[]): string[] {
  return uniq(DEPLOY_FILES.filter(([re]) => paths.some((p) => isDeployConfig(p) && re.test(p))).map(([, l]) => l));
}

/** App/service names declared in deploy configs (matched against cloud IaC tags). */
export function extractIacAppNames(files: Record<string, string>): string[] {
  const names: string[] = [];
  for (const [path, text] of Object.entries(files)) {
    if (/sst\.config\.ts$/i.test(path)) {
      const m = text.match(/app\s*\([\s\S]*?name:\s*["'`]([\w-]+)["'`]/);
      if (m) names.push(m[1]);
    } else if (/serverless\.ya?ml$/i.test(path)) {
      const m = text.match(/^service:\s*["']?([\w-]+)/m);
      if (m) names.push(m[1]);
    } else if (/render\.ya?ml$/i.test(path)) {
      for (const m of text.matchAll(/^\s*-?\s*name:\s*["']?([\w-]+)/gm)) names.push(m[1]);
    } else if (/fly\.toml$/i.test(path)) {
      const m = text.match(/^app\s*=\s*["']([\w-]+)/m);
      if (m) names.push(m[1]);
    } else if (/vercel\.json$/i.test(path)) {
      const m = text.match(/"name"\s*:\s*"([\w-]+)"/);
      if (m) names.push(m[1]);
    }
  }
  return uniq(names);
}

const STAGE_SUFFIX = /^-(prod|production|staging|stage|dev|development|test|qa|preview|main|live)$/;

/** Same IaC app: equal, or that app plus a stage suffix ("myapp-prod"). */
export const sameIacApp = (a: string, b: string) => {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return true;
  const [long, short] = x.length > y.length ? [x, y] : [y, x];
  return long.startsWith(short) && STAGE_SUFFIX.test(long.slice(short.length));
};

const AGENT_NAME_HINT = /agent|assistant|copilot|\bbot\b|chatbot|crew|swarm|mcp/i;

/**
 * True when a repository is plausibly an AI agent: an agent framework, or an LLM
 * SDK together with tools / MCP / skills or agent-like naming. Plain LLM-SDK
 * usage with no agent signal is deliberately not enough — that is an app that
 * calls a model, not an agent.
 */
export function isAgentRepo(e: RepoEvidence): boolean {
  const names = e.packages.map((p) => p.name);
  if (detectFramework(names)) return true;
  if (detectLlmProviders(names).length === 0 && extractModelIds(e.sourceTexts.join("\n")).length === 0) {
    return false;
  }
  const tools = e.sourceTexts.some((t) => extractToolNames(t).length > 0);
  return (
    tools ||
    e.mcpServers.length > 0 ||
    e.skillNames.length > 0 ||
    AGENT_NAME_HINT.test(`${e.fullName} ${e.description ?? ""} ${e.topics.join(" ")}`)
  );
}

export function buildRepoProfile(e: RepoEvidence): AgentProfile {
  const names = e.packages.map((p) => p.name);
  const source = e.sourceTexts.join("\n");
  const envKeys = e.envKeys;
  const models = extractModelIds(source);
  return {
    // Access = an SDK package or credentials for the app. Product names merely
    // mentioned in code (catalogs, docs, UI copy) are not access.
    applicationsAccess: detectApplications(names, envKeys),
    developer: e.developer,
    deployer: e.deployer,
    deployed: e.deployed,
    deployedAt: e.deployedAt,
    deployedOn:
      e.deployedOn ?? (e.deployTargets?.length ? `${e.deployTargets.join(", ")} (declared in repo)` : null),
    observability: detectObservability(names, envKeys),
    framework: detectFramework(names),
    // Model ids, plus every provider the code calls that no listed model covers.
    llms: mergeLlms(models, [...detectLlmProviders(names), ...detectProvidersFromSource(source)]),
    skills: uniq([
      ...e.skillNames.map((s) => `Skill: ${s}`),
      ...e.mcpServers,
      ...e.sourceTexts.flatMap(extractToolNames),
    ]),
    packages: uniq(e.packages.map(pkgLabel), 200),
    sources: ["github"],
    repository: e.fullName,
    ownerHint: null,
    iacApp: e.iacNames?.[0] ?? null,
  };
}

/** What a deployed code bundle (Lambda zip) reveals about an agent. */
export interface CodeBundleFacts {
  packages: ParsedPackage[];
  tools: string[];
  modelIds: string[];
  envKeys: string[];
  providers: string[];
  apps: string[];
}

export const isSourcePath = (path: string) =>
  !/(^|\/)(node_modules|site-packages|vendor|\.venv|venv)\//.test(path) &&
  /\.(py|js|mjs|cjs|ts)$/.test(path);

/**
 * Reads the dependencies and agent signals out of a bundle's file list.
 * `paths` is every entry; `texts` holds only the manifests and source files
 * worth reading. Vendored deps are recognised from `*.dist-info` /
 * `node_modules/<pkg>` directory names, so no large file is ever opened.
 */
export function analyzeCodeBundle(paths: string[], texts: Record<string, string>): CodeBundleFacts {
  // Zips often omit directory entries, so derive every ancestor directory.
  const all = new Set(paths);
  for (const path of paths) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i += 1) all.add(`${parts.slice(0, i).join("/")}/`);
  }
  const packages = new Map<string, ParsedPackage>();
  const add = (p: ParsedPackage) => {
    if (!packages.has(p.name) || (!packages.get(p.name)!.version && p.version)) packages.set(p.name, p);
  };
  for (const path of all) {
    const dist = path.match(/(?:^|\/)([A-Za-z0-9_.]+)-(\d[\w.]*)\.dist-info\/$/);
    if (dist) add({ name: normalizePkg(dist[1]), version: dist[2] });
    const node = path.match(/(?:^|\/)node_modules\/((?:@[\w.-]+\/)?[\w.-]+)\/$/);
    if (node) add({ name: normalizePkg(node[1]), version: null });
  }
  for (const [path, text] of Object.entries(texts)) {
    if (isManifestPath(path)) parseManifest(path, text).forEach(add);
  }
  const sourceTexts = Object.entries(texts)
    .filter(([path]) => isSourcePath(path))
    .map(([, text]) => text);
  // A framework or LLM SDK the code imports counts even when no manifest lists
  // it (Databricks Apps pre-install streamlit, so requirements.txt omits it).
  for (const name of importedPackages(sourceTexts)) {
    if (detectFramework([name]) || detectLlmProviders([name]).length) add({ name, version: null });
  }
  const source = sourceTexts.join("\n");
  return {
    packages: Array.from(packages.values()),
    tools: extractToolNames(source),
    modelIds: extractModelIds(source),
    envKeys: extractEnvKeys(source),
    providers: uniq([...detectLlmProviders(Array.from(packages.keys())), ...detectProvidersFromSource(source)]),
    apps: detectApplications(Array.from(packages.keys()), extractEnvKeys(source)),
  };
}

/**
 * Reads a VM startup script (EC2 user data). `pip install` / `npm install`
 * targets become packages, `docker run|pull` images are listed as images, and
 * model ids / env var names are lifted out. Values are never kept.
 */
export function analyzeStartupScript(script: string): CodeBundleFacts {
  const packages = new Map<string, ParsedPackage>();
  const add = (name: string, version: string | null) => {
    const n = normalizePkg(name);
    if (n && !packages.has(n)) packages.set(n, { name: n, version });
  };
  for (const m of script.matchAll(/\b(?:pip3?|npm|pnpm|yarn)\s+(?:install|i|add)\b([^\n;&|]*)/g)) {
    for (const tok of m[1].trim().split(/\s+/)) {
      if (!tok || tok.startsWith("-") || /^(\.|\/|git\+|https?:)/.test(tok)) continue;
      const [, name, version] = tok.match(/^(@?[\w.\/-]+?)(?:(?:==|@)([\w.]+))?$/) ?? [];
      if (name) add(name, version ?? null);
    }
  }
  // docker-compose service images, and OS packages installed by the bootstrap
  for (const m of script.matchAll(/^\s*image:\s*["']?([\w.\/-]+(?::[\w.-]+)?)["']?\s*$/gm)) add(`image:${m[1]}`, null);
  for (const m of script.matchAll(/\b(?:dnf|yum|apt(?:-get)?)\s+install\b([^\n;&|]*)/g)) {
    for (const tok of m[1].trim().split(/\s+/)) if (tok && !tok.startsWith("-")) add(tok, null);
  }
  for (const m of script.matchAll(/\bdocker\s+(?:run|pull)\b[^\n]*?\s([\w.-]+(?:\/[\w.-]+)+(?::[\w.-]+)?)\s*$/gm)) {
    add(`image:${m[1]}`, null);
  }
  return {
    packages: Array.from(packages.values()),
    tools: [],
    modelIds: extractModelIds(script),
    envKeys: extractEnvKeys(script),
    providers: uniq([...detectLlmProviders(Array.from(packages.keys())), ...detectProvidersFromSource(script)]),
    apps: [],
  };
}

// ---------------------------------------------------------------------------
// AWS
// ---------------------------------------------------------------------------

const AWS_SERVICE_LABELS: Record<string, string> = {
  s3: "Amazon S3",
  dynamodb: "DynamoDB",
  sqs: "SQS",
  sns: "SNS",
  secretsmanager: "Secrets Manager",
  ssm: "SSM Parameter Store",
  rds: "RDS",
  "rds-data": "RDS",
  athena: "Athena",
  glue: "Glue",
  ses: "SES",
  kinesis: "Kinesis",
  lambda: "Lambda",
  states: "Step Functions",
  "execute-api": "API Gateway",
  es: "OpenSearch",
  aoss: "OpenSearch Serverless",
  sagemaker: "SageMaker",
  textract: "Textract",
  comprehend: "Comprehend",
  events: "EventBridge",
  kms: "KMS",
  redshift: "Redshift",
  "bedrock-agentcore": "Bedrock AgentCore",
};

const TAG_FIRST = (tags: Record<string, string>, keys: string[]) => {
  const lower = new Map(Object.entries(tags).map(([k, v]) => [k.toLowerCase(), v]));
  for (const key of keys) {
    const value = lower.get(key)?.trim();
    if (value) return value;
  }
  return null;
};

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Normalizes "https://github.com/o/r(.git)" or "o/r" to "o/r". */
export function normalizeRepoRef(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.trim().match(/(?:github\.com[/:])?([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i);
  return m ? m[1] : null;
}

const PROVIDERS: Array<[RegExp, string, string]> = [
  [/^(aws_|amazon_q)/, "aws", "AWS"],
  [/^azure_/, "azure", "Azure"],
  [/^gcp_/, "gcp", "Google Cloud"],
  [/^databricks_/, "databricks", "Databricks"],
  [/^crewai/, "crewai", "CrewAI"],
];

const PLATFORM_FRAMEWORK: Record<string, string> = {
  aws_bedrock: "Amazon Bedrock Agents",
  aws_agentcore: "Bedrock AgentCore",
  azure_ai_foundry: "Azure AI Foundry",
  gcp_vertex_ai: "Vertex AI Agent Builder",
  databricks_genie: "Databricks Genie",
  crewai: "CrewAI",
};

const KEY_PROVIDERS: Array<[RegExp, string]> = [
  [/openai/, "OpenAI"],
  [/anthropic|claude/, "Anthropic"],
  [/gemini|google_?ai/, "Google Gemini"],
  [/mistral/, "Mistral"],
  [/groq/, "Groq"],
  [/cohere/, "Cohere"],
  [/xai|grok/, "xAI"],
  [/openrouter/, "OpenRouter"],
  [/deepseek/, "DeepSeek"],
  [/ollama/, "Ollama"],
];

const STOPPED = /stopped|deallocat|deleted|failed|unavailable|disabled|terminated|inactive/i;

/**
 * Builds the profile of a correlated cloud agent (AWS, Azure, GCP, Databricks,
 * CrewAI) from the metadata discovery already collected on its resources.
 * Nothing here calls a provider.
 */
export function buildCloudProfile(agent: CorrelatedAgent): AgentProfile {
  const res = agent.resources;
  const byType = (t: string) => res.filter((r) => r.resourceType === t);
  const anchor = res.find((r) => r.resourceType === agent.discoverySource) ?? res[0];
  const tags = res.reduce<Record<string, string>>((acc, r) => ({ ...acc, ...r.tags }), {});
  const meta = (anchor?.metadata ?? {}) as Record<string, unknown>;

  const envKeys = res.flatMap((r) => strings(r.metadata.environmentKeys));
  const layers = res.flatMap((r) => strings(r.metadata.layers));
  const runtime = typeof meta.runtime === "string" ? meta.runtime : null;
  const roles = byType("iam_role");
  // Databricks Apps carry their own provenance and bound resources.
  const dbxApp = res.find((r) => r.resourceType === ("databricks_app" as string));
  const dbxMeta = (dbxApp?.metadata ?? {}) as Record<string, unknown>;
  const dbxResources = Array.isArray(dbxMeta.resources)
    ? (dbxMeta.resources as Array<Record<string, unknown>>)
    : [];
  // The app's start command names its framework ("streamlit run app.py").
  // Discovery stores the deployment as `activeDeployment`; the raw API shape is `active_deployment`.
  const dbxDeployment = (dbxMeta.activeDeployment ?? dbxMeta.active_deployment ?? dbxMeta.pendingDeployment) as
    | { command?: unknown }
    | undefined;
  const dbxCommand = strings(dbxDeployment?.command);
  const dbxText = dbxResources.map((x) => `${x.name ?? ""} ${(x.secret as { key?: string } | undefined)?.key ?? ""}`).join(" ");

  // Facts read from the deployed code bundle (Lambda zip), when fetchable.
  const codePackages = res.flatMap((r) => (Array.isArray(r.metadata.codePackages) ? (r.metadata.codePackages as ParsedPackage[]) : []));
  const codeNames = codePackages.map((p) => p.name);
  const codeTools = res.flatMap((r) => strings(r.metadata.codeTools));
  const codeEnvKeys = res.flatMap((r) => strings(r.metadata.codeEnvKeys));

  // --- LLMs: every place AWS names a model — agent config, runtime config,
  // Lambda env, Step Functions definitions, and the Bedrock model ARNs the
  // execution role is allowed to invoke.
  const llms = uniq(
    [
      ...res.flatMap((r) => [
        ...extractModelIds(String(r.metadata.foundationModel ?? "")),
        ...extractModelIds(String(r.metadata.modelId ?? "")),
        ...strings(r.metadata.modelIds),
        ...strings(r.metadata.codeModelIds),
        ...strings(r.metadata.appModelIds),
        ...strings(r.metadata.bedrockModels),
      ]),
      ...extractModelIds(TAG_FIRST(tags, ["model", "llm", "models", "model-id"])),
    ],
    12,
  );
  // Also name the providers from the code bundle and bound secret / env key names.
  const hint = `${dbxText} ${envKeys.join(" ")}`.toLowerCase();
  const llmsOut = mergeLlms(llms, [
    ...res.flatMap((r) => strings(r.metadata.codeProviders)),
    ...KEY_PROVIDERS.filter(([re]) => re.test(hint)).map(([, label]) => label),
  ]);

  // Framework = the code library the agent is built with (LangGraph, CrewAI,
  // Vercel AI SDK…). Tools it calls (Codex CLI) or runs code in (OpenSandbox)
  // are not frameworks, so they never appear here.
  const framework =
    TAG_FIRST(tags, ["framework", "agent-framework"]) ??
    detectFramework([...codeNames, ...layers, ...envKeys.map((k) => k.toLowerCase()), ...dbxCommand]) ??
    (PLATFORM_FRAMEWORK[agent.platform] ?? null);

  const services = roles.flatMap((r) => strings(r.metadata.actionServices));
  const secretNames = byType("secrets_manager_secret").map((r) => `Secret: ${r.resourceName}`);
  const applicationsAccess = uniq([
    ...services.map((s) => AWS_SERVICE_LABELS[s]),
    ...detectApplications(codeNames, [...envKeys, ...codeEnvKeys]),
    ...res.flatMap((r) => strings(r.metadata.codeApps)),
    ...byType("knowledge_base").map((r) => `Knowledge Base: ${r.resourceName}`),
    ...secretNames,
    ...dbxResources.map((x) => (x.sql_warehouse ? "SQL Warehouse" : x.serving_endpoint ? "Model Serving" : x.job ? "Databricks Job" : null)),
  ]);

  const skills = uniq([
    ...res.flatMap((r) => strings(r.metadata.codeSkills)),
    ...codeTools,
    ...strings(meta.actionGroupNames).map((n) => `Action group: ${n}`),
    ...byType("lambda_function").map((r) => `Lambda: ${r.resourceName}`),
    ...byType("api_gateway_api").map((r) => `API: ${r.resourceName}`),
    ...byType("step_function").map((r) => `Workflow: ${r.resourceName}`),
    ...byType("knowledge_base").map((r) => `Retrieval: ${r.resourceName}`),
  ]);

  const observability = uniq([
    ...(byType("cloudwatch_log_group").length > 0 || services.includes("logs") ? ["CloudWatch"] : []),
    ...(res.some((r) => r.metadata.tracing === "Active") || services.includes("xray") ? ["AWS X-Ray"] : []),
    ...detectObservability([...codeNames, ...layers], [...envKeys, ...codeEnvKeys]),
  ]);

  const stack = TAG_FIRST(tags, ["aws:cloudformation:stack-name"]);
  // ponytail: no CloudTrail lookup (needs a new SDK dependency); the GitHub
  // deployment actor fills this when the repo is linked (see mergeProfiles).
  // Deployer is a person (or the CI identity) that ran the deploy, never the
  // IaC tool: an explicit tag, else the CloudTrail actor.
  const trail = res.find((r) => typeof r.metadata.deployedBy === "string")?.metadata;
  const deployer =
    TAG_FIRST(tags, ["deployedby", "deployed-by", "deployer", "deployed_by"]) ??
    ((trail?.deployedBy as string | undefined) ?? null);

  const developer = TAG_FIRST(tags, [
    "developer", "author", "createdby", "created-by", "created_by", "creator", "builtby", "built-by", "aws:createdby",
  ]);

  const nested = (v: unknown) => (v && typeof v === "object" ? String((v as { state?: unknown }).state ?? "") : "");
  const status = String(
    meta.status ?? meta.agentStatus ?? meta.state ?? meta.provisioningState ?? meta.powerState ?? "",
  ).toUpperCase();
  const [, providerId, providerLabel] = PROVIDERS.find(([re]) => re.test(agent.platform)) ?? [null, "other", "Cloud"];
  const hasAlias = byType("bedrock_agent_alias").length > 0;
  const deployed =
    agent.platform === "aws_bedrock"
      ? hasAlias || status === "PREPARED"
      : agent.platform === "aws_agentcore"
        ? status === "READY"
        : agent.platform === "aws_ec2"
          ? status === "RUNNING"
          // Everywhere else: deployed unless the platform reports it stopped.
          : !STOPPED.test(`${status} ${nested(meta.appStatus)} ${nested(meta.computeStatus)}`);

  const repository =
    normalizeRepoRef(
      TAG_FIRST(tags, ["repo", "repository", "github-repo", "github", "git-repo", "source-repo", "git_repo"]),
    ) ?? (res.map((r) => r.metadata.codeRepository).find((v): v is string => typeof v === "string") ?? null);
  const developerOut =
    developer ??
    (typeof dbxMeta.creator === "string" ? dbxMeta.creator : null);
  const deployerOut = deployer ?? (typeof dbxMeta.updater === "string" ? dbxMeta.updater : null);

  return {
    applicationsAccess,
    developer: developerOut,
    deployer: deployerOut,
    deployed,
    // Last deployment, whether or not it is running now: the newest of the
    // image push and the resource's launch/update time.
    deployedAt:
      [
        ...res.map((r) => (typeof r.metadata.codeImagePushedAt === "string" ? r.metadata.codeImagePushedAt : null)),
        ...res.map((r) => (typeof r.metadata.deployedByAt === "string" ? r.metadata.deployedByAt : null)),
        anchor?.lastUpdatedAt ?? anchor?.createdAt ?? null,
      ]
        .filter((d): d is string => Boolean(d))
        .sort((a, b) => Date.parse(a) - Date.parse(b))
        .pop() ?? null,
    deployedOn: deployed ? `${providerLabel} ${agent.region}` : null,
    observability,
    framework,
    llms: llmsOut,
    skills,
    packages: uniq(
      [runtime ? `runtime: ${runtime}` : null, ...layers.map((l) => `layer: ${l}`), ...codePackages.map(pkgLabel)],
      200,
    ),
    sources: [providerId],
    ownerHint: TAG_FIRST(tags, ["owner", "owneremail", "owner-email", "email", "team"]),
    iacApp: TAG_FIRST(tags, ["sst:app", "aws:cloudformation:stack-name", "serverless:service", "stage-app", "app"]),
    repository: repository,
  };
}

/**
 * Profile + raw-metadata fragment for one scanned agent. Repo-side facts
 * (rawMetadata.githubProfile) are kept apart from cloud evidence, so every
 * rescan re-merges fresh cloud data instead of accumulating stale values.
 */
export function composeProfile(
  agent: CorrelatedAgent,
  existingRawMetadata: unknown,
): { profile: AgentProfile; rawMetadata: { githubProfile: unknown; cloudProfile: AgentProfile } } {
  const githubProfile = (existingRawMetadata as { githubProfile?: unknown } | null)?.githubProfile ?? null;
  const cloudProfile = buildCloudProfile(agent);
  return {
    profile: githubProfile ? mergeProfiles(cloudProfile, readProfile(githubProfile)) : cloudProfile,
    rawMetadata: { githubProfile, cloudProfile },
  };
}

/**
 * Finds the already-discovered cloud agent a repository is the source of: an
 * explicit `repo` tag first, otherwise an exact name match once case and
 * separators are ignored (`support-agent` == `SupportAgent`).
 */
export function matchRepoToAgent<T extends { name: string; profile?: unknown }>(
  repoFullName: string,
  candidates: T[],
): T | null {
  const squash = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
  const full = repoFullName.toLowerCase();
  const repoName = squash(repoFullName.split("/").pop() ?? "");
  return (
    candidates.find((c) => readProfile(c.profile).repository?.toLowerCase() === full) ??
    (repoName.length >= 4 ? candidates.find((c) => squash(c.name) === repoName) : null) ??
    null
  );
}
