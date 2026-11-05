/**
 * Minimal client for the LangSmith API (smith.langchain.com).
 *
 * Auth is a single API key sent as the `x-api-key` header. Access is resolved
 * two ways, mirroring the CrewAI client:
 *  - `direct`: NORIX holds the API key (legacy / pre-Nango rows).
 *  - `nango`:  the key lives in the self-hosted Nango vault; calls go through
 *    the Nango Proxy which injects the `x-api-key` header. Both carry the API
 *    `baseUrl`.
 *
 * The managed cloud base is well-known and defaulted here; `baseUrl` stays
 * overridable for the EU host or self-hosted LangSmith.
 */

import { proxy, NangoError } from "@/lib/server/nango/client";

export interface LangSmithDirectCredentials {
  mode?: "direct";
  /** API base, e.g. https://api.smith.langchain.com. No trailing slash. */
  baseUrl: string;
  /** LangSmith API key (ls__…). */
  apiKey: string;
  /** LangSmith workspace (tenant) id — see WORKSPACE_HEADER. */
  workspaceId?: string;
}

export interface LangSmithNangoCredentials {
  mode: "nango";
  baseUrl: string;
  connectionId: string;
  providerConfigKey: string;
  /** LangSmith workspace (tenant) id — see WORKSPACE_HEADER. */
  workspaceId?: string;
}

export type LangSmithCredentials =
  | LangSmithDirectCredentials
  | LangSmithNangoCredentials;

/** Default base for the managed LangSmith US cloud. */
export const LANGSMITH_DEFAULT_BASE_URL = "https://api.smith.langchain.com";

/**
 * Managed LangSmith regions. A key issued in one region returns 403 Forbidden
 * on every other, so the region is not optional — and LangSmith gives no way to
 * discover it from the key. We probe these in order. Self-hosted or future
 * regions still work by storing `configuration.baseUrl` explicitly, which always
 * takes precedence over probing.
 */
export const LANGSMITH_KNOWN_BASE_URLS = [
  "https://api.smith.langchain.com", // US
  "https://eu.api.smith.langchain.com", // EU
  "https://aws.api.smith.langchain.com", // AWS (us-east-2)
] as const;
/** Web app base used to build human-clickable trace links. */
export const LANGSMITH_APP_BASE_URL = "https://smith.langchain.com";

export const LANGSMITH_ENDPOINTS = {
  /** Whoami / workspace info — used as the connection test. */
  info: "/api/v1/info",
  /** Lists tracing projects (a.k.a. sessions) for workspace selection. */
  sessions: "/api/v1/sessions",
  /** POST run query — the primary runs/traces source. */
  runsQuery: "/api/v1/runs/query",
  /** Workspaces the key can see — used to resolve the workspace id. */
  workspaces: "/api/v1/workspaces",
} as const;

/**
 * Workspace-scoped endpoints (/sessions, /runs/query) return 403 Forbidden
 * unless the request names a workspace. `/info` and `/workspaces` do not need
 * it, which is why a key can look valid while every data call is refused.
 */
const WORKSPACE_HEADER = "X-Tenant-Id";

const LANGSMITH_HOST_SUFFIXES = [".langchain.com"];

export class LangSmithApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LangSmithApiError";
  }
}

/** Validates and normalizes a LangSmith base URL to `https://host`. */
export function normalizeLangSmithBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid LangSmith base URL");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Use the HTTPS LangSmith base URL without a path, query, or credentials",
    );
  }
  const hostname = url.hostname.toLowerCase();
  if (!LANGSMITH_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw new Error("LangSmith base URL must be a langchain.com host");
  }
  return `https://${hostname}`;
}

/**
 * Flattens an undici fetch rejection into an operator-actionable message.
 * (Same helper shape as the CrewAI client.)
 */
export function describeLangSmithFetchFailure(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") {
    return "request timed out after 30s";
  }
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 5; depth += 1) {
    const code = (current as NodeJS.ErrnoException).code;
    parts.push(code ? `${current.message} (${code})` : current.message);
    current = (current as { cause?: unknown }).cause;
  }
  return parts.join(" <- ") || String(error);
}

type Method = "GET" | "POST";

/** LangSmith request via the Nango Proxy — Nango injects the x-api-key header. */
async function langsmithApiViaNango<T>(
  credentials: LangSmithNangoCredentials,
  method: Method,
  path: string,
  data?: unknown,
): Promise<T> {
  try {
    const response = await proxy<T & { error?: string; message?: string }>({
      connectionId: credentials.connectionId,
      providerConfigKey: credentials.providerConfigKey,
      method,
      endpoint: path,
      baseUrlOverride: credentials.baseUrl,
      headers: credentials.workspaceId
        ? { [WORKSPACE_HEADER]: credentials.workspaceId }
        : undefined,
      data,
    });
    return response.data as T;
  } catch (error) {
    if (error instanceof NangoError) {
      const body = (error.body ?? {}) as { error?: string; message?: string };
      throw new LangSmithApiError(
        body.message ||
          body.error ||
          `LangSmith API returned HTTP ${error.status}`,
        error.status,
      );
    }
    throw new Error(
      `LangSmith request to ${path} failed: ${describeLangSmithFetchFailure(error)}`,
      { cause: error },
    );
  }
}

/** Lists the workspaces a key can see. Needs no workspace header itself. */
export async function fetchLangSmithWorkspaces(
  credentials: LangSmithCredentials,
): Promise<Array<{ id: string; name: string }>> {
  const rows = await langsmithApi<
    Array<{
      id?: string;
      tenant_id?: string;
      display_name?: string;
      is_deleted?: boolean;
    }>
  >(credentials, "GET", LANGSMITH_ENDPOINTS.workspaces);
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => !row?.is_deleted)
    .map((row) => ({
      id: String(row?.id ?? row?.tenant_id ?? ""),
      name: String(row?.display_name ?? row?.id ?? ""),
    }))
    .filter((row) => row.id);
}

/** True when the failure means "these credentials are not accepted here". */
function isAuthFailure(error: unknown): boolean {
  return (
    error instanceof LangSmithApiError &&
    (error.status === 401 || error.status === 403)
  );
}

export interface LangSmithAccess {
  /** The managed region (or self-hosted base) that accepts the key. */
  baseUrl: string;
  /**
   * Workspace to send as `X-Tenant-Id`, or null when the key is already
   * workspace-scoped and the header must be omitted.
   */
  workspaceId: string | null;
}

/**
 * Work out how to reach a customer's LangSmith data: which region the key
 * belongs to, and whether workspace-scoped calls need an `X-Tenant-Id` header
 * and with what value. Neither is derivable from the key itself, and getting
 * either wrong returns 403 Forbidden on every data call.
 *
 * Per region we walk a ladder against `/sessions`, the cheapest genuinely
 * workspace-scoped endpoint:
 *  1. no header — a workspace-scoped service key (`lsv2_sk_…`) is already bound
 *     to one workspace and 403s if you send a header naming another;
 *  2. otherwise list `/workspaces` (org-scoped, needs no header) and retry
 *     `/sessions` per workspace — a personal access token (`lsv2_pt_…`) sees
 *     every workspace in the org, so "exactly one" is not a safe assumption and
 *     the only reliable test is which one actually answers.
 *
 * `preferredBaseUrl` (explicitly configured, or previously detected) is tried
 * first so the steady-state path is a single request. Throws when no region
 * accepts the key, carrying the last error so the operator sees why.
 */
export async function resolveLangSmithAccess(
  apiKey: string,
  preferredBaseUrl?: string,
): Promise<LangSmithAccess> {
  const candidates = [
    ...(preferredBaseUrl ? [preferredBaseUrl] : []),
    ...LANGSMITH_KNOWN_BASE_URLS.filter((url) => url !== preferredBaseUrl),
  ];
  const probe = `${LANGSMITH_ENDPOINTS.sessions}?limit=1`;
  let lastError: unknown;

  for (const baseUrl of candidates) {
    try {
      await langsmithApi({ mode: "direct", baseUrl, apiKey }, "GET", probe);
      return { baseUrl, workspaceId: null };
    } catch (error) {
      lastError = error;
      // Only 401/403 means "right host, wrong scoping" and is worth the
      // workspace ladder below. Network errors and 5xx say nothing about the
      // region, so move straight on to the next one.
      if (!isAuthFailure(error)) continue;
    }

    let workspaces: Array<{ id: string; name: string }>;
    try {
      workspaces = await fetchLangSmithWorkspaces({
        mode: "direct",
        baseUrl,
        apiKey,
      });
    } catch (error) {
      lastError = error;
      continue; // Wrong region, or a key with no org-level read — try the next.
    }

    for (const workspace of workspaces) {
      try {
        await langsmithApi(
          { mode: "direct", baseUrl, apiKey, workspaceId: workspace.id },
          "GET",
          probe,
        );
        return { baseUrl, workspaceId: workspace.id };
      } catch (error) {
        lastError = error;
      }
    }
  }

  const detail =
    lastError instanceof Error ? lastError.message : String(lastError ?? "");
  throw new LangSmithApiError(
    `LangSmith rejected this API key on every known region (US, EU, AWS)${
      detail ? `: ${detail}` : ""
    }. Check the key is valid and, for a self-hosted LangSmith, set the base URL explicitly.`,
    lastError instanceof LangSmithApiError ? lastError.status : 403,
  );
}

export async function langsmithApi<T>(
  credentials: LangSmithCredentials,
  method: Method,
  path: string,
  data?: unknown,
): Promise<T> {
  if (credentials.mode === "nango") {
    return langsmithApiViaNango<T>(credentials, method, path, data);
  }
  const url = `${credentials.baseUrl}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        "x-api-key": credentials.apiKey,
        Accept: "application/json",
        ...(credentials.workspaceId
          ? { [WORKSPACE_HEADER]: credentials.workspaceId }
          : {}),
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      body:
        method === "POST" && data !== undefined
          ? JSON.stringify(data)
          : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(
      `LangSmith request to ${path} failed: ${describeLangSmithFetchFailure(error)}`,
      { cause: error },
    );
  } finally {
    clearTimeout(timeout);
  }
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    message?: string;
    detail?: string;
  };
  if (!response.ok) {
    throw new LangSmithApiError(
      payload.message ||
        payload.error ||
        payload.detail ||
        `LangSmith API returned HTTP ${response.status}`,
      response.status,
    );
  }
  return payload;
}
