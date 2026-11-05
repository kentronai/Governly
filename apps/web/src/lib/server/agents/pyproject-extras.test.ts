jest.mock("@aws-sdk/client-ecr", () => ({}));
import {
  buildRepoProfile,
  detectFramework,
  extractEnvKeys,
  importedPackages,
  isAgentRepo,
  llmCompanies,
  parseManifest,
  type RepoEvidence,
} from "./agent-profile";

test("pyproject dependency with extras is read as its package", () => {
  const p = parseManifest("pyproject.toml", `[project]\ndependencies = [\n    "crewai[google-genai,tools]>=1.15.6,<2.0.0",\n]\n`);
  expect(detectFramework(p.map((x) => x.name))).toBe("CrewAI");
});

test("framework is found from what the code imports", () => {
  const names = importedPackages([
    "from crewai import Agent\nimport streamlit as st",
    "from langchain_anthropic import ChatAnthropic",
    'import { generateText } from "ai";\nimport { openai } from "@ai-sdk/openai/x";',
    "from google.adk.agents import Agent",
  ]);
  expect(names).toEqual(expect.arrayContaining(["crewai", "streamlit", "langchain-anthropic", "ai", "@ai-sdk/openai", "google-adk"]));
  expect(detectFramework(importedPackages(["import streamlit as st\nfrom crewai import Crew"]))).toBe("CrewAI");
});

test("a CrewAI repo declared in pyproject + JSONC config gets framework and LLM", () => {
  const pyproject = `[project]\nname = "streamlit-chatbot-agent"\ndependencies = [\n    "crewai[google-genai,tools]>=1.15.6,<2.0.0",\n]\n`;
  const agentConfig = `{ "role": "Helpful Assistant", "llm": "gemini/gemini-3.6-flash", "tools": [] }`;
  const env = "GEMINI_API_KEY=replace-me";
  const e: RepoEvidence = {
    fullName: "Dakshkentron/streamlit-chatbot-crewai",
    description: null,
    topics: [],
    packages: parseManifest("pyproject.toml", pyproject),
    envKeys: extractEnvKeys(env),
    sourceTexts: [agentConfig, env],
    mcpServers: [],
    skillNames: [],
    developer: "Dakshkentron",
    deployer: null,
    deployed: false,
    deployedAt: null,
    deployedOn: null,
  };
  expect(isAgentRepo(e)).toBe(true);
  const profile = buildRepoProfile(e);
  expect(profile.framework).toBe("CrewAI");
  expect(llmCompanies(profile.llms)).toContain("Gemini");
});

test("autonomy follows capabilities", () => {
  const { EMPTY_PROFILE, profileAutonomy } = require("./agent-profile");
  expect(profileAutonomy({ ...EMPTY_PROFILE, llms: ["gpt-4o"] }).level).toBe("L1");
  expect(profileAutonomy({ ...EMPTY_PROFILE, skills: ["search_web"] }).level).toBe("L2");
  expect(profileAutonomy({ ...EMPTY_PROFILE, framework: "CrewAI", skills: ["a"], applicationsAccess: ["Slack"] }).level).toBe("L3");
  expect(profileAutonomy({ ...EMPTY_PROFILE, packages: ["playwright@1.4"] }).level).toBe("L4");
  expect(profileAutonomy({ ...EMPTY_PROFILE, skills: ["a", "b", "c", "d", "e"], applicationsAccess: ["x", "y", "z"] }).level).toBe("L4");
});
