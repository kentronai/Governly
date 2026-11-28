import { z } from "zod";

/** One machine's AI environment scan, as produced by public/shadow-ai-scan.py. */
const str = z.string().max(4096);
export const MachineScanSchema = z.object({
  scan_id: str,
  scanned_at: str,
  machine_id: z.string().trim().min(1).max(256),
  hostname: z.string().trim().min(1).max(256),
  username: str,
  platform: z.string().max(64),
  applications: z
    .array(
      z.object({
        name: str,
        category: str,
        status: z.enum(["installed", "not_detected"]),
        detection: str.nullable(),
        path: str.nullable(),
      }),
    )
    .max(200),
  mcp_servers: z
    .array(
      z.object({
        name: str,
        source_application: str,
        transport: z.enum(["stdio", "http", "sse", "unknown"]),
        command: str.nullable(),
        args: z.array(str).max(200),
        url: str.nullable(),
        env_var_names: z.array(str).max(200),
        config_path: str,
        status: str,
      }),
    )
    .max(2000),
  cli_tools: z
    .array(z.object({ name: str, installed: z.boolean(), path: str.nullable() }))
    .max(200),
  errors: z.array(str).max(200),
});

export type MachineScanResult = z.infer<typeof MachineScanSchema>;
export type ScanMcpServer = MachineScanResult["mcp_servers"][number];

/** How the organization treats an AI tool. */
export const SHADOW_AI_STATUSES = ["sanctioned", "tolerated", "unsanctioned", "unknown"] as const;
export type ShadowAiStatus = (typeof SHADOW_AI_STATUSES)[number];
export const STATUS_LABEL: Record<ShadowAiStatus, string> = {
  sanctioned: "Sanctioned",
  tolerated: "Tolerated",
  unsanctioned: "Unsanctioned",
  unknown: "Unknown",
};

/**
 * AI service domains, matched against proxy/DNS logs on import.
 * ponytail: duplicated from AI_DOMAINS in public/shadow-ai-scan.py (a standalone script); keep in sync.
 */
export const AI_DOMAINS: Record<string, string> = {
  "chatgpt.com": "ChatGPT", "chat.openai.com": "ChatGPT", "sora.com": "Sora",
  "platform.openai.com": "OpenAI Platform", "claude.ai": "Claude",
  "console.anthropic.com": "Anthropic Console", "gemini.google.com": "Gemini",
  "bard.google.com": "Gemini", "aistudio.google.com": "Google AI Studio",
  "notebooklm.google.com": "NotebookLM", "copilot.microsoft.com": "Microsoft Copilot",
  "perplexity.ai": "Perplexity", "poe.com": "Poe", "chat.mistral.ai": "Mistral Le Chat",
  "chat.deepseek.com": "DeepSeek", "grok.com": "Grok", "meta.ai": "Meta AI",
  "chat.qwen.ai": "Qwen", "kimi.com": "Kimi", "chat.z.ai": "Z.ai", "pi.ai": "Pi",
  "character.ai": "Character.AI", "you.com": "You.com", "phind.com": "Phind",
  "huggingface.co": "Hugging Face", "openrouter.ai": "OpenRouter", "groq.com": "Groq",
  "v0.dev": "v0", "v0.app": "v0", "bolt.new": "Bolt", "lovable.dev": "Lovable",
  "replit.com": "Replit", "manus.im": "Manus", "genspark.ai": "Genspark",
  "midjourney.com": "Midjourney", "leonardo.ai": "Leonardo AI", "ideogram.ai": "Ideogram",
  "runwayml.com": "Runway", "suno.com": "Suno", "elevenlabs.io": "ElevenLabs",
  "otter.ai": "Otter.ai", "fireflies.ai": "Fireflies", "jasper.ai": "Jasper",
  "copy.ai": "Copy.ai", "writesonic.com": "Writesonic", "quillbot.com": "QuillBot",
  "gamma.app": "Gamma", "deepl.com": "DeepL",
};

export function aiServiceForHost(host: string): { service: string; domain: string } | null {
  const h = host.toLowerCase().replace(/\.$/, "");
  for (const [domain, service] of Object.entries(AI_DOMAINS))
    if (h === domain || h.endsWith("." + domain)) return { service, domain };
  return null;
}

/** Tool name a website detection is stored under, same as the scanner's: "ChatGPT (chatgpt.com)". */
export const websiteToolName = (service: string, domain: string) => `${service} (${domain})`;

const HOST_RE = /(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}/gi;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/i;

export type LogUsage = { user: string; tools: { name: string; hits: number }[] };

/**
 * Proxy (Zscaler NSS, Netskope, Palo Alto), DNS (Umbrella, Cloudflare, Infoblox) or any text/CSV log:
 * each line's first email is the user, every AI-service host on it is a hit. Format-agnostic on
 * purpose, so one importer covers every vendor's export. Lines with no email count under "unattributed".
 */
export function parseAiUsageLog(text: string): LogUsage[] {
  const byUser = new Map<string, Map<string, number>>();
  for (const line of text.split(/\r?\n/)) {
    const hosts = line.match(HOST_RE);
    if (!hosts) continue;
    const hits = new Set<string>();
    for (const h of hosts) {
      const hit = aiServiceForHost(h);
      if (hit) hits.add(websiteToolName(hit.service, hit.domain));
    }
    if (!hits.size) continue;
    const user = (line.match(EMAIL_RE)?.[0] ?? "unattributed").toLowerCase();
    const tools = byUser.get(user) ?? new Map<string, number>();
    for (const t of hits) tools.set(t, (tools.get(t) ?? 0) + 1);
    byUser.set(user, tools);
  }
  return [...byUser].map(([user, tools]) => ({
    user,
    tools: [...tools].map(([name, hits]) => ({ name, hits })),
  }));
}

/** API keys issued from the Shadow AI page carry only this permission. */
export const SHADOW_AI_SCAN_PERMISSION = "shadow-ai:scan";
