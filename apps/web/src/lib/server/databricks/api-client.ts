export interface DatabricksCredentials {
  hostUrl: string;
  accessToken: string;
}

const DATABRICKS_HOST_SUFFIXES = [".databricks.com", ".azuredatabricks.net"];

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
  } finally {
    clearTimeout(timeout);
  }
  const payload = (await response.json().catch(() => ({}))) as T & {
    error_code?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(
      payload.message ||
        payload.error_code ||
        `Databricks API returned HTTP ${response.status}`,
    );
  }
  return payload;
}

export async function fetchDatabricksPages<T>(
  credentials: DatabricksCredentials,
  path: string,
  collectionKey: string,
  baseQuery?: Record<string, string>,
): Promise<T[]> {
  const items: T[] = [];
  let pageToken: string | undefined;
  const seenTokens = new Set<string>();
  do {
    const query = new URLSearchParams({ max_results: "0", ...baseQuery });
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
