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

/**
 * Resolve the workspace (tenant) id a key belongs to. `/api/v1/workspaces`
 * needs no workspace header itself, so this works before one is known. Returns
 * null when the key can see no workspace, or more than one and none is stored —
 * the caller then has to pick.
 */
export async function fetchLangSmithWorkspaceId(
  credentials: LangSmithCredentials,
): Promise<string | null> {
  const workspaces = await langsmithApi<
    Array<{ id?: string; tenant_id?: string }>
  >(credentials, "GET", LANGSMITH_ENDPOINTS.workspaces);
  if (!Array.isArray(workspaces) || workspaces.length !== 1) return null;
  const only = workspaces[0];
  const id = only?.id ?? only?.tenant_id;
  return typeof id === "string" && id ? id : null;
}

/**
 * Find which managed region a key belongs to, and the workspace within it, by
 * probing `/api/v1/workspaces` on each known base. That endpoint needs the key
 * but no workspace header, so it is the one call that can succeed before either
 * value is known. `preferredBaseUrl` (an explicitly configured or previously
 * detected base) is tried first so the common path is a single request.
 *
 * Returns null when no region accepts the key — a genuinely invalid key, or a
 * self-hosted install, which must configure `baseUrl` manually.
 */
export async function detectLangSmithRegion(
  apiKey: string,
  preferredBaseUrl?: string,
): Promise<{ baseUrl: string; workspaceId: string | null } | null> {
  const candidates = [
    ...(preferredBaseUrl ? [preferredBaseUrl] : []),
    ...LANGSMITH_KNOWN_BASE_URLS.filter((url) => url !== preferredBaseUrl),
  ];

  for (const baseUrl of candidates) {
    try {
      const workspaceId = await fetchLangSmithWorkspaceId({
        mode: "direct",
        baseUrl,
        apiKey,
      });
      // Reaching here means the key authenticated against this region, even if
      // it sees several workspaces (workspaceId null) and the user must choose.
      return { baseUrl, workspaceId };
    } catch {
      // 403/401 here just means "wrong region" — keep probing.
    }
  }
  return null;
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
      body: method === "POST" && data !== undefined ? JSON.stringify(data) : undefined,
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
