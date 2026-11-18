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

/** API keys issued from the Shadow AI page carry only this permission. */
export const SHADOW_AI_SCAN_PERMISSION = "shadow-ai:scan";
