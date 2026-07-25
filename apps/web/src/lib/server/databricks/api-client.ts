export interface DatabricksCredentials {
  hostUrl: string;
  accessToken: string;
}

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

export async function databricksApi<T>(
  credentials: DatabricksCredentials,
  path: string,
  query?: URLSearchParams,
): Promise<T> {
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
