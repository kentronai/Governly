/**
 * Minimal client for the CrewAI Enterprise / AMP platform API (app.crewai.com).
 *
 * Auth is a single Bearer token (a CrewAI personal or organization access
 * token). The managed platform's API base is well-known, so the connection
 * form only asks the user for the token; the base URL is defaulted here and
 * kept overridable for self-hosted installs.
 */

export interface CrewAICredentials {
  /** API base, e.g. https://app.crewai.com. No trailing slash, no path. */
  baseUrl: string;
  /** Bearer access token. */
  accessToken: string;
}

/** Default base for the managed CrewAI Enterprise / AMP cloud. */
export const CREWAI_DEFAULT_BASE_URL = "https://app.crewai.com";

/**
 * Discovery endpoints, isolated so they are easy to adjust against a real
 * CrewAI org without touching call sites. The org-scoped deployments listing
 * is the primary discovery source.
 */
export const CREWAI_ENDPOINTS = {
  /** Verifies the token and identifies the caller's organization. */
  me: "/crewai_plus/api/v1/me",
  /** Lists the organization's crew deployments. */
  deployments: "/crewai_plus/api/v1/deployments",
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

export async function crewaiApi<T>(
  credentials: CrewAICredentials,
  path: string,
): Promise<T> {
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
