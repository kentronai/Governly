/**
 * Syncs execution runs/traces a customer has recorded in LangSmith and persists
 * them as NORIX `langsmith_runs`, so the Observability dashboard can display
 * traces, prompts, tool calls, tokens, cost, latency and errors without calling
 * the provider on every render. Mirrors the CrewAI discovery orchestrator's
 * credential handling and integration-row bookkeeping.
 */

import { and, eq } from "drizzle-orm";
import { db, integrations, langsmithRuns } from "@db";
import { decryptSecret } from "@/lib/server/crypto";
import { getConnectionCredentials } from "@/lib/server/nango/client";
import {
  LANGSMITH_APP_BASE_URL,
  LANGSMITH_DEFAULT_BASE_URL,
  LANGSMITH_ENDPOINTS,
  LangSmithApiError,
  langsmithApi,
  resolveLangSmithAccess,
  normalizeLangSmithBaseUrl,
  type LangSmithCredentials,
  type LangSmithDirectCredentials,
} from "./api-client";

/** The integration row that stores a LangSmith connection. */
export interface LangSmithConnection {
  id: string;
  name: string;
  configuration: unknown;
  credentialsEncrypted: string | null;
  nangoConnectionId?: string | null;
  nangoProviderConfigKey?: string | null;
}

/** A LangSmith run as returned by POST /runs/query. Parsed defensively. */
interface LangSmithRunRaw {
  id?: string;
  trace_id?: string;
  parent_run_id?: string | null;
  name?: string;
  run_type?: string;
  status?: string;
  error?: string | null;
  start_time?: string;
  end_time?: string;
  latency?: number;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  serialized?: Record<string, unknown>;
  events?: unknown[];
  session_id?: string;
  session_name?: string;
  /** Path to this run in the LangSmith web app, e.g. /o/<org>/projects/…/r/<id>. */
  app_path?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  total_cost?: number | string;
  [key: string]: unknown;
}

/**
 * Pull the LangSmith API key out of the credential object Nango stores for the
 * connection. Nango's field name varies by auth template (an API_KEY template
 * uses `apiKey`; a BASIC-auth template stores it under `password`), so read
 * every likely field defensively — same idea as the AWS credential picker.
 */
function pickLangSmithKey(
  credentials: Record<string, unknown>,
): string | undefined {
  const candidates = [
    credentials.apiKey,
    credentials.api_key,
    credentials.apiKeyValue,
    credentials.key,
    credentials.secret,
    credentials.token,
    credentials.password,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return undefined;
}

/**
 * Resolve the credentials NORIX uses to call LangSmith.
 *
 * Nango is only the authenticator/vault: when the connection was authorized
 * through the Nango popup we read the stored API key back with the Nango
 * connection API and then call LangSmith *directly* — NORIX is its own proxy, so
 * no Nango Proxy provider config is required. This mirrors the read-back pattern
 * AWS/Azure/GCP already use. Legacy pre-Nango rows fall back to the API key
 * NORIX itself encrypted.
 */
export async function resolveLangSmithCredentials(
  connection: LangSmithConnection,
): Promise<LangSmithCredentials> {
  const config = (connection.configuration ?? {}) as Record<string, unknown>;
  const configuredBaseUrl =
    typeof config.baseUrl === "string" && config.baseUrl.trim()
      ? normalizeLangSmithBaseUrl(config.baseUrl)
      : LANGSMITH_DEFAULT_BASE_URL;
  // Workspace-scoped endpoints 403 without this; see WORKSPACE_HEADER.
  const workspaceId =
    typeof config.workspaceId === "string" && config.workspaceId.trim()
      ? config.workspaceId.trim()
      : undefined;

  if (connection.nangoConnectionId && connection.nangoProviderConfigKey) {
    const { credentials, connectionConfig } = await getConnectionCredentials(
      connection.nangoConnectionId,
      connection.nangoProviderConfigKey,
    );
    const apiKey = pickLangSmithKey(credentials);
    if (!apiKey) {
      throw new Error("LangSmith API key was not found on the Nango connection");
    }
    const baseUrlValue = connectionConfig.baseUrl ?? credentials.baseUrl;
    const baseUrl =
      typeof baseUrlValue === "string" && baseUrlValue.trim()
        ? normalizeLangSmithBaseUrl(baseUrlValue)
        : configuredBaseUrl;
    return { mode: "direct", baseUrl, apiKey, workspaceId };
  }

  if (!connection.credentialsEncrypted) {
    throw new Error("LangSmith connection has no stored credentials");
  }
  let parsed: Partial<LangSmithDirectCredentials>;
  try {
    parsed = JSON.parse(
      decryptSecret(connection.credentialsEncrypted),
    ) as Partial<LangSmithDirectCredentials>;
  } catch {
    throw new Error("Stored LangSmith credentials could not be decrypted");
  }
  const apiKey = parsed.apiKey?.trim();
  if (!apiKey) throw new Error("LangSmith API key is missing");
  return {
    mode: "direct",
    baseUrl: parsed.baseUrl?.trim() || LANGSMITH_DEFAULT_BASE_URL,
    apiKey,
    workspaceId,
  };
}

/** The LangSmith session/project id used to filter the runs query. */
function projectFilterId(connection: LangSmithConnection): string | undefined {
  const config = (connection.configuration ?? {}) as Record<string, unknown>;
  return typeof config.project === "string" && config.project.trim()
    ? config.project.trim()
    : undefined;
}

/** The human-friendly project label for display fallbacks. */
function projectDisplayName(
  connection: LangSmithConnection,
): string | undefined {
  const config = (connection.configuration ?? {}) as Record<string, unknown>;
  const value = config.projectName ?? config.project;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * A connection's resolved credentials plus the configuration they were resolved
 * against. Callers that write `configuration` back MUST spread this copy rather
 * than `connection.configuration`, which is the pre-resolution snapshot — doing
 * otherwise erases the region/workspace we just discovered and sends the next
 * sync straight back to 403.
 */
interface LangSmithAccessContext {
  credentials: LangSmithCredentials;
  configuration: Record<string, unknown>;
}

/**
 * Ensure the connection knows how to reach its LangSmith data: the region, and
 * whether workspace-scoped calls need an `X-Tenant-Id` header and with what
 * value. Both are discovered once and persisted; without them every call to
 * /sessions and /runs/query returns 403 Forbidden.
 *
 * `force` re-runs the probe even when a value is already stored, so a workspace
 * id that has gone stale (rotated key, key moved workspace) repairs itself
 * instead of failing forever.
 */
async function ensureAccess(
  connection: LangSmithConnection,
  credentials: LangSmithCredentials,
  force = false,
): Promise<LangSmithAccessContext> {
  const config = (connection.configuration ?? {}) as Record<string, unknown>;
  if (!force && (credentials.workspaceId || config.workspaceProbed === true)) {
    return { credentials, configuration: config };
  }
  // Only the direct path carries the key, and every path resolves to it today.
  if (credentials.mode === "nango" || !credentials.apiKey) {
    return { credentials, configuration: config };
  }

  const explicitBaseUrl =
    typeof config.baseUrl === "string" && config.baseUrl.trim()
      ? normalizeLangSmithBaseUrl(config.baseUrl)
      : undefined;

  const access = await resolveLangSmithAccess(
    credentials.apiKey,
    explicitBaseUrl ?? credentials.baseUrl,
  );

  const configuration: Record<string, unknown> = { ...config };
  // Never overwrite an operator-configured base (e.g. a self-hosted install).
  if (!explicitBaseUrl) configuration.baseUrl = access.baseUrl;
  // Records that the probe ran, so a key that legitimately needs no workspace
  // header (a workspace-scoped service key) is not re-probed on every sync.
  configuration.workspaceProbed = true;
  if (access.workspaceId) configuration.workspaceId = access.workspaceId;
  else delete configuration.workspaceId;

  await db
    .update(integrations)
    .set({ configuration, updatedAt: new Date().toISOString() })
    .where(eq(integrations.id, connection.id));

  return {
    credentials: {
      ...credentials,
      baseUrl: explicitBaseUrl ?? access.baseUrl,
      workspaceId: access.workspaceId ?? undefined,
    },
    configuration,
  };
}

/**
 * Run a LangSmith call, and on 401/403 re-probe the region/workspace once and
 * retry. Scoping that was correct at connect time can stop being correct later,
 * and a stored-but-wrong workspace id is otherwise a permanent Forbidden.
 */
async function withAccess<T>(
  connection: LangSmithConnection,
  call: (context: LangSmithAccessContext) => Promise<T>,
): Promise<T> {
  const credentials = await resolveLangSmithCredentials(connection);
  const context = await ensureAccess(connection, credentials);
  try {
    return await call(context);
  } catch (error) {
    const denied =
      error instanceof LangSmithApiError &&
      (error.status === 401 || error.status === 403);
    if (!denied) throw error;
    return call(await ensureAccess(connection, credentials, true));
  }
}

/**
 * Verifies the key really works. Deliberately does NOT use `/api/v1/info` —
 * that endpoint is public and answers 200 for an invalid or revoked key, which
 * made connections report healthy while every data call returned 403.
 */
export async function testLangSmithConnection(
  connection: LangSmithConnection,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await withAccess(connection, ({ credentials }) =>
      langsmithApi(credentials, "GET", `${LANGSMITH_ENDPOINTS.sessions}?limit=1`),
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export interface LangSmithProject {
  id: string;
  name: string;
}

async function fetchLangSmithProjects(
  credentials: LangSmithCredentials,
): Promise<LangSmithProject[]> {
  const payload = await langsmithApi<unknown>(
    credentials,
    "GET",
    `${LANGSMITH_ENDPOINTS.sessions}?limit=100`,
  );
  const rows = Array.isArray(payload)
    ? (payload as Record<string, unknown>[])
    : [];
  return rows
    .map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? row.id ?? ""),
    }))
    .filter((row) => row.id && row.name);
}

/** Lists tracing projects for the Workspace/Project selection dropdown. */
export async function listLangSmithProjects(
  connection: LangSmithConnection,
): Promise<LangSmithProject[]> {
  return withAccess(connection, ({ credentials }) =>
    fetchLangSmithProjects(credentials),
  );
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

function latencyMs(run: LangSmithRunRaw): number | null {
  if (typeof run.latency === "number") return Math.round(run.latency * 1000);
  if (run.start_time && run.end_time) {
    const start = Date.parse(run.start_time);
    const end = Date.parse(run.end_time);
    if (!Number.isNaN(start) && !Number.isNaN(end)) return end - start;
  }
  return null;
}

/** Best-effort extraction of the system prompt from a run's inputs. */
function systemPrompt(run: LangSmithRunRaw): string | null {
  const messages = (run.inputs?.messages ?? run.inputs?.input) as unknown;
  const list = Array.isArray(messages) ? messages : [];
  for (const item of list) {
    if (item && typeof item === "object") {
      const role = (item as Record<string, unknown>).role ?? (item as Record<string, unknown>).type;
      if (typeof role === "string" && role.toLowerCase().includes("system")) {
        const content = (item as Record<string, unknown>).content;
        if (typeof content === "string") return content;
      }
    }
  }
  return null;
}

/** Best-effort extraction of tool calls from a run's outputs. */
function toolCalls(run: LangSmithRunRaw): unknown[] {
  const out = run.outputs ?? {};
  const direct = (out.tool_calls ?? out.toolCalls) as unknown;
  if (Array.isArray(direct)) return direct;
  const generations = out.generations as unknown;
  if (Array.isArray(generations)) {
    const calls: unknown[] = [];
    for (const gen of generations.flat()) {
      const message = (gen as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
      const tc = message?.tool_calls ?? message?.additional_kwargs;
      if (Array.isArray(tc)) calls.push(...tc);
    }
    return calls;
  }
  return [];
}

function modelName(run: LangSmithRunRaw): string | null {
  const meta = (run.extra?.metadata ?? {}) as Record<string, unknown>;
  const candidates = [
    meta.ls_model_name,
    meta.model,
    (run.extra?.invocation_params as Record<string, unknown> | undefined)?.model,
    (run.serialized?.kwargs as Record<string, unknown> | undefined)?.model,
  ];
  const found = candidates.find(
    (value): value is string => typeof value === "string" && !!value,
  );
  return found ?? null;
}

export interface LangSmithSyncResult {
  status: "completed" | "failed";
  runsDiscovered: number;
  errorMessage?: string;
}

export async function syncLangSmithRuns(
  tenantId: string,
  integrationId: string,
  connection: LangSmithConnection,
  options?: { limit?: number },
): Promise<LangSmithSyncResult> {
  const now = new Date().toISOString();
  try {
    // LangSmith caps /runs/query at 100 per page and 422s above it.
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 100);

    const { runs, credentials, configuration, filterId, displayName } =
      await withAccess(connection, async (context) => {
        // /runs/query 400s unless at least one of session/id/parent_run/trace
        // is given — a stored project selection satisfies that, but a fresh
        // connection has none. Auto-pick when there is exactly one project
        // (the common case); otherwise this is a real ambiguity the operator
        // must resolve, so surface it instead of letting LangSmith's opaque
        // 400 through.
        let filterId = projectFilterId(connection);
        let displayName = projectDisplayName(connection);
        let configuration = context.configuration;
        if (!filterId) {
          const projects = await fetchLangSmithProjects(context.credentials);
          if (projects.length === 1) {
            filterId = projects[0].id;
            displayName = projects[0].name;
            configuration = {
              ...configuration,
              project: filterId,
              projectName: displayName,
            };
          } else if (projects.length === 0) {
            throw new Error(
              "No LangSmith tracing projects found in this workspace",
            );
          } else {
            throw new Error(
              `Select a LangSmith project before syncing — ${projects.length} are visible: ${projects.map((p) => p.name).join(", ")}`,
            );
          }
        }

        const query: Record<string, unknown> = {
          limit,
          order: "desc",
          session: [filterId],
        };
        const payload = await langsmithApi<{ runs?: LangSmithRunRaw[] }>(
          context.credentials,
          "POST",
          LANGSMITH_ENDPOINTS.runsQuery,
          query,
        );
        return {
          runs: Array.isArray(payload?.runs) ? payload.runs : [],
          ...context,
          configuration,
          filterId,
          displayName,
        };
      });

    for (const run of runs) {
      const externalRunId = String(run.id ?? "");
      if (!externalRunId) continue;
      const values = {
        tenantId,
        integrationId,
        externalRunId,
        traceId: run.trace_id ?? null,
        parentRunId: run.parent_run_id ?? null,
        name: run.name ?? null,
        runType: run.run_type ?? null,
        status: run.error ? "error" : (run.status ?? "success"),
        projectName: run.session_name ?? displayName ?? null,
        model: modelName(run),
        systemPrompt: systemPrompt(run),
        inputs: run.inputs ?? {},
        outputs: run.outputs ?? {},
        toolCalls: toolCalls(run),
        memory: (run.extra?.metadata as Record<string, unknown>) ?? {},
        context: (run.extra ?? {}) as Record<string, unknown>,
        metadata: {
          sessionId: run.session_id ?? null,
          events: run.events ?? [],
        },
        promptTokens: num(run.prompt_tokens),
        completionTokens: num(run.completion_tokens),
        totalTokens: num(run.total_tokens),
        totalCost: run.total_cost != null ? String(run.total_cost) : null,
        latencyMs: latencyMs(run),
        errorMessage: run.error ?? null,
        startTime: run.start_time ?? null,
        endTime: run.end_time ?? null,
        // LangSmith returns the exact web-app path for the run; a hand-built
        // /o/-/r/<id> link does not resolve without the org and project ids.
        langsmithUrl: run.app_path
          ? `${LANGSMITH_APP_BASE_URL}${run.app_path}`
          : null,
        updatedAt: now,
      };
      await db
        .insert(langsmithRuns)
        .values(values)
        .onConflictDoUpdate({
          target: [langsmithRuns.integrationId, langsmithRuns.externalRunId],
          set: values,
        });
    }

    await db
      .update(integrations)
      .set({
        isEnabled: true,
        isCredentialsAdded: true,
        lastSyncAt: now,
        syncStatus: "success",
        errorMessage: null,
        // Spread the post-resolution configuration, not connection.configuration
        // — the latter predates the region/workspace probe and writing it back
        // would drop the workspace id every sync.
        configuration: {
          ...configuration,
          baseUrl: credentials.baseUrl,
          authentication:
            credentials.mode === "nango" ? "nango" : "api_key",
          lastRunsSynced: runs.length,
        },
        updatedAt: now,
      })
      .where(eq(integrations.id, integrationId));

    return { status: "completed", runsDiscovered: runs.length };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "LangSmith sync failed";
    await db
      .update(integrations)
      .set({ syncStatus: "failed", errorMessage: message, updatedAt: now })
      .where(eq(integrations.id, integrationId));
    return { status: "failed", runsDiscovered: 0, errorMessage: message };
  }
}

/** Loads the integration row for a LangSmith connection, verifying the name. */
export async function loadLangSmithConnection(
  tenantId: string,
  integrationId: string,
): Promise<LangSmithConnection> {
  const row = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.id, integrationId),
      eq(integrations.tenantId, tenantId),
    ),
  });
  if (!row || row.name !== "LangSmith") {
    throw new Error("LangSmith connection not found");
  }
  return row;
}
