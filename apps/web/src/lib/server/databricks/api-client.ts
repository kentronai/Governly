import { proxy, NangoError } from "@/lib/server/nango/client";

/**
 * Databricks access can be resolved two ways:
 *  - `direct`: NORIX holds the PAT (legacy / pre-Nango rows).
 *  - `nango`:  the PAT lives in the self-hosted Nango vault; we call the
 *    Databricks API through the Nango Proxy, which injects it for us. Both
 *    variants carry the workspace `hostUrl` (not a secret).
 */
export interface DatabricksDirectCredentials {
  mode?: "direct";
  hostUrl: string;
  accessToken: string;
}

export interface DatabricksNangoCredentials {
  mode: "nango";
  hostUrl: string;
  connectionId: string;
  providerConfigKey: string;
}

export type DatabricksCredentials =
  | DatabricksDirectCredentials
  | DatabricksNangoCredentials;

export class DatabricksApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errorCode?: string,
  ) {
    super(message);
    this.name = "DatabricksApiError";
  }
}

const DATABRICKS_HOST_SUFFIXES = [".databricks.com", ".azuredatabricks.net"];

/** Flattens an undici fetch rejection into something an operator can act on. */
export function describeFetchFailure(error: unknown): string {
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

export function normalizeDatabricksHost(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid Databricks workspace URL");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Use the HTTPS Databricks workspace root URL without a path, query, or credentials",
    );
  }
  const hostname = url.hostname.toLowerCase();
  if (!DATABRICKS_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw new Error(
      "Workspace URL must be an official databricks.com or azuredatabricks.net host",
    );
  }
  return `https://${hostname}`;
}

/**
 * Databricks GET via the Nango Proxy. Nango injects the stored PAT and (if
 * configured) refreshes it. Errors are re-mapped to DatabricksApiError so all
 * downstream handling (status/error_code) is identical to the direct path.
 */
async function databricksApiViaNango<T>(
  credentials: DatabricksNangoCredentials,
  path: string,
  query?: URLSearchParams,
): Promise<T> {
  const params: Record<string, string> = {};
  if (query) {
    for (const [key, value] of query.entries()) params[key] = value;
  }
  try {
    const response = await proxy<T & { error_code?: string; message?: string }>(
      {
        connectionId: credentials.connectionId,
        providerConfigKey: credentials.providerConfigKey,
        method: "GET",
        endpoint: path,
        // Only override when NORIX knows the workspace URL; otherwise let the
        // Nango databricks provider-config supply the base URL itself.
        ...(credentials.hostUrl
          ? { baseUrlOverride: credentials.hostUrl }
          : {}),
        params,
      },
    );
    return response.data as T;
  } catch (error) {
    if (error instanceof NangoError) {
      const body = (error.body ?? {}) as {
        error_code?: string;
        message?: string;
      };
      throw new DatabricksApiError(
        body.message ||
          body.error_code ||
          `Databricks API returned HTTP ${error.status}`,
        error.status,
        body.error_code,
      );
    }
    throw new Error(
      `Databricks request to ${path} failed: ${describeFetchFailure(error)}`,
      { cause: error },
    );
  }
}

export async function databricksApi<T>(
  credentials: DatabricksCredentials,
  path: string,
  query?: URLSearchParams,
): Promise<T> {
  if (credentials.mode === "nango") {
    return databricksApiViaNango<T>(credentials, path, query);
  }
  const queryString = query?.toString();
  const url = `${credentials.hostUrl}${path}${
    queryString ? `?${queryString}` : ""
  }`;
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
    // undici reports every transport-level failure as the bare string
    // "fetch failed" and hides the real reason (ECONNRESET, UND_ERR_*, TLS,
    // abort) on `cause`. Unwrap it — a scan that dies with "fetch failed" is
    // undiagnosable, which is exactly how these rows sat stale.
    throw new Error(
      `Databricks request to ${path} failed: ${describeFetchFailure(error)}`,
      { cause: error },
    );
  } finally {
    clearTimeout(timeout);
  }
  const payload = (await response.json().catch(() => ({}))) as T & {
    error_code?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new DatabricksApiError(
      payload.message ||
        payload.error_code ||
        `Databricks API returned HTTP ${response.status}`,
      response.status,
      payload.error_code,
    );
  }
  return payload;
}

export async function fetchDatabricksPages<T>(
  credentials: DatabricksCredentials,
  path: string,
  collectionKey: string,
  baseQuery?: Record<string, string>,
  pagination: {
    pageSizeParam?: string;
    pageSizeValue?: string;
  } = {},
): Promise<T[]> {
  const items: T[] = [];
  let pageToken: string | undefined;
  const seenTokens = new Set<string>();
  do {
    const query = new URLSearchParams({
      [pagination.pageSizeParam || "max_results"]:
        pagination.pageSizeValue || "0",
      ...baseQuery,
    });
    if (pageToken) query.set("page_token", pageToken);
    const payload = await databricksApi<Record<string, unknown>>(
      credentials,
      path,
      query,
    );
    const page = payload[collectionKey];
    if (Array.isArray(page)) items.push(...(page as T[]));
    const next =
      typeof payload.next_page_token === "string"
        ? payload.next_page_token
        : undefined;
    if (next && seenTokens.has(next)) {
      throw new Error(
        `Databricks returned a repeated pagination token for ${path}`,
      );
    }
    if (next) seenTokens.add(next);
    pageToken = next;
  } while (pageToken);
  return items;
}
