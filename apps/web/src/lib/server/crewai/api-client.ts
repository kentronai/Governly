/**
 * Minimal client for the CrewAI Enterprise / AMP platform API (app.crewai.com).
 *
 * Auth is a single Bearer token (a CrewAI personal or organization access
 * token). The managed platform's API base is well-known, so the connection
 * form only asks the user for the token; the base URL is defaulted here and
 * kept overridable for self-hosted installs.
 */

import { proxy, NangoError } from "@/lib/server/nango/client";

/**
 * CrewAI access, resolved two ways:
 *  - `direct`: NORIX holds the Bearer token (legacy / pre-Nango rows).
 *  - `nango`:  the token lives in the self-hosted Nango vault; calls go through
 *    the Nango Proxy which injects it. Both carry the API `baseUrl`.
 */
export interface CrewAIDirectCredentials {
  mode?: "direct";
  /** API base, e.g. https://app.crewai.com. No trailing slash, no path. */
  baseUrl: string;
  /** Bearer access token. */
  accessToken: string;
}

export interface CrewAINangoCredentials {
  mode: "nango";
  baseUrl: string;
  connectionId: string;
  providerConfigKey: string;
}

export type CrewAICredentials =
  | CrewAIDirectCredentials
  | CrewAINangoCredentials;

/** Default base for the managed CrewAI Enterprise / AMP cloud. */
export const CREWAI_DEFAULT_BASE_URL = "https://app.crewai.com";

/**
 * Discovery endpoints, verified against the live CrewAI Enterprise API. The
 * org-scoped crews listing is the primary discovery source; each deployed crew
 * is one governed agent. (The account `/me` endpoint uses a different auth
 * context and rejects PATs, so it is intentionally not used.)
 */
export const CREWAI_ENDPOINTS = {
  /** Lists the organization's deployed crews. Returns a JSON array. */
  crews: "/crewai_plus/api/v1/crews",
} as const;

const CREWAI_HOST_SUFFIXES = [".crewai.com"];

export class CrewAIApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CrewAIApiError";
  }
}

/** Validates and normalizes a CrewAI base URL to `https://host`. */
export function normalizeCrewAIBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid CrewAI base URL");
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
      "Use the HTTPS CrewAI base URL without a path, query, or credentials",
    );
  }
  const hostname = url.hostname.toLowerCase();
  // Allow the managed cloud and any *.crewai.com host; self-hosted installs can
  // still be pointed here by relaxing this list, but default to the safe case.
  if (!CREWAI_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw new Error("CrewAI base URL must be an app.crewai.com host");
  }
  return `https://${hostname}`;
}

/**
 * Flattens an undici fetch rejection into an operator-actionable message.
 * undici reports every transport failure as the bare string "fetch failed" and
 * hides the real reason on `cause`.
 */
export function describeCrewAIFetchFailure(error: unknown): string {
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

/** CrewAI GET via the Nango Proxy — Nango injects the stored Bearer token. */
async function crewaiApiViaNango<T>(
  credentials: CrewAINangoCredentials,
  path: string,
): Promise<T> {
  try {
    const response = await proxy<T & { error?: string; message?: string }>({
      connectionId: credentials.connectionId,
      providerConfigKey: credentials.providerConfigKey,
      method: "GET",
      endpoint: path,
      baseUrlOverride: credentials.baseUrl,
    });
    return response.data as T;
  } catch (error) {
    if (error instanceof NangoError) {
      const body = (error.body ?? {}) as { error?: string; message?: string };
      throw new CrewAIApiError(
        body.message ||
          body.error ||
          `CrewAI API returned HTTP ${error.status}`,
        error.status,
      );
    }
    throw new Error(
      `CrewAI request to ${path} failed: ${describeCrewAIFetchFailure(error)}`,
      { cause: error },
    );
  }
}

export async function crewaiApi<T>(
  credentials: CrewAICredentials,
  path: string,
): Promise<T> {
  if (credentials.mode === "nango") {
    return crewaiApiViaNango<T>(credentials, path);
  }
  const url = `${credentials.baseUrl}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(
      `CrewAI request to ${path} failed: ${describeCrewAIFetchFailure(error)}`,
      { cause: error },
    );
  } finally {
    clearTimeout(timeout);
  }
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new CrewAIApiError(
      payload.message ||
        payload.error ||
        `CrewAI API returned HTTP ${response.status}`,
      response.status,
    );
  }
  return payload;
}
