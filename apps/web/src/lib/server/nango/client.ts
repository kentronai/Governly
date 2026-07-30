/**
 * Thin server-side client for self-hosted Nango (Auth + Proxy).
 *
 * NORIX never reads the Nango database directly. It talks to the Nango server
 * over HTTP: it mints Connect session tokens (so the browser widget can let a
 * user authorize an account), and it calls the Nango Proxy so provider API
 * requests are made with credentials Nango stores and auto-refreshes. The
 * secret itself never touches NORIX — we only ever hold a `connectionId`.
 *
 * Uses plain fetch against the Nango REST API (no extra server SDK needed).
 * Config comes from env: NANGO_HOST (e.g. http://nango-server:3003) and
 * NANGO_SECRET_KEY (from the self-hosted Nango dashboard).
 */

const NANGO_HOST = (process.env.NANGO_HOST ?? "http://nango-server:3003").replace(
  /\/+$/,
  "",
);
const NANGO_SECRET_KEY = process.env.NANGO_SECRET_KEY ?? "";

function assertConfigured() {
  if (!NANGO_SECRET_KEY) {
    throw new Error(
      "NANGO_SECRET_KEY is not set. Configure it from the self-hosted Nango dashboard (Environment Settings).",
    );
  }
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${NANGO_SECRET_KEY}`,
    "Content-Type": "application/json",
    ...(extra ?? {}),
  };
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class NangoError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "NangoError";
    this.status = status;
    this.body = body;
  }
}

export interface ConnectSessionInput {
  /** Stable id of the end user authorizing — we use the NORIX tenant id. */
  endUserId: string;
  endUserEmail?: string;
  endUserDisplayName?: string;
  organizationId?: string;
  organizationDisplayName?: string;
  /** Restrict the widget to specific provider-config keys, e.g. ["databricks"]. */
  allowedIntegrations?: string[];
  /** Extra identifiers echoed back by Nango webhooks when supported. */
  tags?: Record<string, string>;
}

/**
 * Create a Connect session token for the browser widget (@nangohq/frontend).
 * Returns the short-lived token the widget exchanges to run the auth flow.
 */
export async function createConnectSession(
  input: ConnectSessionInput,
): Promise<{ token: string; expiresAt: string | null }> {
  assertConfigured();
  const res = await fetch(`${NANGO_HOST}/connect/sessions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      end_user: {
        id: input.endUserId,
        ...(input.endUserEmail ? { email: input.endUserEmail } : {}),
        ...(input.endUserDisplayName
          ? { display_name: input.endUserDisplayName }
          : {}),
      },
      ...(input.organizationId
        ? {
            organization: {
              id: input.organizationId,
              ...(input.organizationDisplayName
                ? { display_name: input.organizationDisplayName }
                : {}),
            },
          }
        : {}),
      ...(input.allowedIntegrations?.length
        ? { allowed_integrations: input.allowedIntegrations }
        : {}),
      ...(input.tags ? { tags: input.tags } : {}),
    }),
    cache: "no-store",
  });

  const body = (await parseBody(res)) as
    | { data?: { token?: string; expires_at?: string } }
    | null;
  if (!res.ok || !body?.data?.token) {
    throw new NangoError(
      "Failed to create Nango connect session",
      res.status,
      body,
    );
  }
  return { token: body.data.token, expiresAt: body.data.expires_at ?? null };
}

export interface NangoConnection {
  connectionId: string;
  providerConfigKey: string;
  provider?: string;
  errors?: unknown[];
  raw: unknown;
}

/** Fetch connection metadata (status, provider). Does not expose secrets to NORIX logic. */
export async function getConnection(
  connectionId: string,
  providerConfigKey: string,
): Promise<NangoConnection> {
  assertConfigured();
  const url = new URL(`${NANGO_HOST}/connection/${encodeURIComponent(connectionId)}`);
  url.searchParams.set("provider_config_key", providerConfigKey);
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: authHeaders(),
    cache: "no-store",
  });
  const body = (await parseBody(res)) as any;
  if (!res.ok) {
    throw new NangoError("Failed to fetch Nango connection", res.status, body);
  }
  return {
    connectionId: body?.connection_id ?? connectionId,
    providerConfigKey: body?.provider_config_key ?? providerConfigKey,
    provider: body?.provider,
    errors: body?.errors,
    raw: body,
  };
}

/**
 * Fetch the stored credential object for a connection from the Nango vault.
 *
 * Unlike the Proxy (which injects credentials into a provider call without ever
 * revealing them), this returns the raw credential fields to NORIX server code.
 * It exists for providers whose discovery is SDK/signature-based (AWS SigV4,
 * Azure AD, GCP service-account JWT) and therefore cannot be routed through the
 * Proxy — the discovery engine reads the secret back here and drives its own SDK
 * calls. Never expose the result to the browser.
 *
 * Nango stores multi-field secrets under a credentials object whose shape
 * depends on the provider config's `auth_mode`. For these providers NORIX
 * expects a flat credential object (auth_mode `API_KEY` with extra fields, or a
 * custom credentials type) plus non-secret settings echoed in `connection_config`.
 */
export async function getConnectionCredentials(
  connectionId: string,
  providerConfigKey: string,
): Promise<{
  credentials: Record<string, unknown>;
  connectionConfig: Record<string, unknown>;
  raw: unknown;
}> {
  const connection = await getConnection(connectionId, providerConfigKey);
  const body = connection.raw as
    | {
        credentials?: Record<string, unknown>;
        connection_config?: Record<string, unknown>;
        connectionConfig?: Record<string, unknown>;
      }
    | null;
  return {
    credentials: body?.credentials ?? {},
    connectionConfig: body?.connection_config ?? body?.connectionConfig ?? {},
    raw: connection.raw,
  };
}

export interface NangoConnectionListItem {
  connectionId: string;
  providerConfigKey: string;
  provider?: string;
  /** The Nango end-user id — NORIX sets this to the tenant id at session time. */
  endUserId?: string | null;
  createdAt?: string | null;
  raw: unknown;
}

/**
 * List connections known to Nango, optionally scoped to a provider-config key
 * and/or end user (the NORIX tenant id). This lets NORIX *pull* a freshly
 * authorized connection straight after the Connect popup instead of waiting for
 * the connection webhook to be pushed — the webhook is often undeliverable in
 * local/self-hosted setups, so relying on it alone left connections unrecorded
 * and discovery unable to run. Field names are read defensively because Nango's
 * payload keys have varied across versions.
 */
export async function listConnections(params?: {
  providerConfigKey?: string;
  endUserId?: string;
  connectionId?: string;
}): Promise<NangoConnectionListItem[]> {
  assertConfigured();
  const url = new URL(`${NANGO_HOST}/connection`);
  if (params?.providerConfigKey) {
    url.searchParams.set("provider_config_key", params.providerConfigKey);
  }
  if (params?.endUserId) url.searchParams.set("endUserId", params.endUserId);
  if (params?.connectionId) {
    url.searchParams.set("connectionId", params.connectionId);
  }
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: authHeaders(),
    cache: "no-store",
  });
  const body = (await parseBody(res)) as any;
  if (!res.ok) {
    throw new NangoError("Failed to list Nango connections", res.status, body);
  }
  const items: any[] = Array.isArray(body?.connections)
    ? body.connections
    : Array.isArray(body?.data)
      ? body.data
      : Array.isArray(body)
        ? body
        : [];
  return items
    .map((item) => ({
      connectionId: item?.connection_id ?? item?.connectionId ?? item?.id,
      providerConfigKey:
        item?.provider_config_key ?? item?.providerConfigKey ?? "",
      provider: item?.provider,
      endUserId:
        item?.end_user_id ??
        item?.endUserId ??
        item?.end_user?.id ??
        item?.endUser?.endUserId ??
        item?.endUser?.id ??
        null,
      createdAt: item?.created_at ?? item?.created ?? item?.createdAt ?? null,
      raw: item,
    }))
    .filter(
      (item) =>
        typeof item.connectionId === "string" && item.connectionId.length > 0,
    );
}

/** Delete a connection (e.g. when a user disconnects an integration). */
export async function deleteConnection(
  connectionId: string,
  providerConfigKey: string,
): Promise<void> {
  assertConfigured();
  const url = new URL(`${NANGO_HOST}/connection/${encodeURIComponent(connectionId)}`);
  url.searchParams.set("provider_config_key", providerConfigKey);
  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok && res.status !== 404) {
    const body = await parseBody(res);
    throw new NangoError("Failed to delete Nango connection", res.status, body);
  }
}

/**
 * Create a connection directly with credentials (no hosted Connect UI popup).
 * This lets NORIX collect credentials in its own shadcn forms and store them in
 * the Nango vault via the API. The `credentials` shape depends on the provider's
 * auth_mode (API_KEY -> {type:"API_KEY",apiKey}, BASIC -> {type:"BASIC",username,
 * password}, TWO_STEP -> {type:"TWO_STEP",...}, etc.). `connectionConfig` carries
 * non-secret per-connection settings (region, organizationUrl, databricksInstance…).
 */
export async function createConnectionWithCredentials(input: {
  connectionId: string;
  providerConfigKey: string;
  credentials: Record<string, unknown>;
  connectionConfig?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Promise<{ connectionId: string; raw: unknown }> {
  assertConfigured();
  const res = await fetch(`${NANGO_HOST}/connections`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      connection_id: input.connectionId,
      provider_config_key: input.providerConfigKey,
      credentials: input.credentials,
      ...(input.connectionConfig
        ? { connection_config: input.connectionConfig }
        : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    }),
    cache: "no-store",
  });
  const body = (await parseBody(res)) as any;
  if (!res.ok) {
    throw new NangoError(
      body?.error?.message || "Failed to create Nango connection",
      res.status,
      body,
    );
  }
  return { connectionId: body?.connection_id ?? input.connectionId, raw: body };
}

export interface NangoProxyInput {
  connectionId: string;
  providerConfigKey: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Path on the provider API, e.g. "/api/2.0/serving-endpoints". */
  endpoint: string;
  /** Provider base URL override when the connection doesn't imply one. */
  baseUrlOverride?: string;
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  data?: unknown;
  retries?: number;
}

export interface NangoProxyResponse<T = unknown> {
  status: number;
  ok: boolean;
  data: T;
}

/**
 * Make an authenticated call to a provider through the Nango Proxy. Nango
 * injects the stored credential (and refreshes it if needed) — NORIX supplies
 * only the connectionId + provider-config key and the provider endpoint.
 */
export async function proxy<T = unknown>(
  input: NangoProxyInput,
): Promise<NangoProxyResponse<T>> {
  assertConfigured();

  const path = input.endpoint.startsWith("/")
    ? input.endpoint.slice(1)
    : input.endpoint;
  const url = new URL(`${NANGO_HOST}/proxy/${path}`);
  if (input.params) {
    for (const [k, v] of Object.entries(input.params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const headers = authHeaders({
    "Connection-Id": input.connectionId,
    "Provider-Config-Key": input.providerConfigKey,
    ...(input.baseUrlOverride
      ? { "Base-Url-Override": input.baseUrlOverride }
      : {}),
    ...(input.retries !== undefined
      ? { Retries: String(input.retries) }
      : {}),
    ...(input.headers ?? {}),
  });

  const method = input.method ?? "GET";
  const res = await fetch(url.toString(), {
    method,
    headers,
    body:
      method === "GET" || input.data === undefined
        ? undefined
        : JSON.stringify(input.data),
    cache: "no-store",
  });

  const data = (await parseBody(res)) as T;
  if (!res.ok) {
    throw new NangoError(
      `Nango proxy ${method} ${input.endpoint} failed (${res.status})`,
      res.status,
      data,
    );
  }
  return { status: res.status, ok: res.ok, data };
}

export const nango = {
  createConnectSession,
  getConnection,
  getConnectionCredentials,
  listConnections,
  deleteConnection,
  proxy,
};
