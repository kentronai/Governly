"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Blocks,
  Cloud,
  Filter,
  Info,
  Loader2,
  PlayCircle,
  Search,
  X,
} from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { successToast, errorToast, infoToast } from "@/lib/utils/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Integration } from "@/lib/api/integrations";
import { NangoConnectButton } from "@/components/integrations/NangoConnectButton";

const CATEGORY_LABELS: Record<string, string> = {
  data_platforms: "Data Platforms",
  ml_platforms: "ML Platforms",
  llm_providers: "LLM Providers",
  ai_security: "AI Security & Governance",
  vector_databases: "Vector Databases",
  cloud_providers: "Cloud Providers",
  runtime_platforms: "Runtime Platforms",
  agent_frameworks: "Agent Frameworks",
  observability: "Observability & Tracing",
};

const CLOUD_PROVIDERS = new Set(["AWS", "Azure", "Google Cloud"]);
const DATABRICKS_UNITY_CATALOG = "Databricks Unity Catalog";
const CREWAI = "CrewAI";
const LANGSMITH = "LangSmith";
// Observability providers expose a Test Connection control; LangSmith also
// exposes a Configure control to pick the tracing project it should sync.
const OBSERVABILITY_INTEGRATIONS = new Set([LANGSMITH]);
const DISCOVERY_INTEGRATIONS = new Set([
  "AWS",
  "Azure",
  "Google Cloud",
  DATABRICKS_UNITY_CATALOG,
  CREWAI,
  LANGSMITH,
]);

// Discovery providers connect through the self-hosted Nango Connect popup.
// Each key maps to a provider config that exists on the Nango server and whose
// popup collects every field discovery needs:
//   aws        -> aws-iam                 (access key/secret + region)
//   azure      -> azure-service-principal (client id/secret + tenant/subscription)
//   google     -> google-service-account  (SA email + private key)
//   databricks -> databricks-workspace    (instance + OAuth client credentials)
//   crewai     -> private-api-bearer      (AMP bearer token)
// After the popup succeeds, NORIX records the connection (webhook-independent,
// see /api/integrations/action `nangoConnected`), reads the vaulted credential
// back, and immediately runs its own discovery engine so agents land in the
// Agent Inventory without any further step.
const NANGO_PROVIDERS: Record<string, { providerConfigKey: string }> = {
  AWS: { providerConfigKey: "aws" },
  Azure: { providerConfigKey: "azure" },
  "Google Cloud": { providerConfigKey: "google" },
  [DATABRICKS_UNITY_CATALOG]: { providerConfigKey: "databricks" },
  [CREWAI]: { providerConfigKey: "crewai" },
  [LANGSMITH]: { providerConfigKey: "langsmith" },
};

type AwsMethod = "iam_role" | "access_key" | "cross_account";

type CredentialState = {
  apiKey: string;
  apiSecret: string;
  hostUrl: string;
  json: string;
  awsMethod: AwsMethod;
  awsRegion: string;
  awsRoleArn: string;
  awsExternalId: string;
  awsCrossAccountRoleArn: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  azureTenantId: string;
  azureSubscriptionId: string;
  azureClientId: string;
  azureClientSecret: string;
  gcpProjectId: string;
  gcpServiceAccountJson: string;
};

const EMPTY_CREDENTIALS: CredentialState = {
  apiKey: "",
  apiSecret: "",
  hostUrl: "",
  json: "",
  awsMethod: "iam_role",
  awsRegion: "us-east-1",
  awsRoleArn: "",
  awsExternalId: "",
  awsCrossAccountRoleArn: "",
  awsAccessKeyId: "",
  awsSecretAccessKey: "",
  azureTenantId: "",
  azureSubscriptionId: "",
  azureClientId: "",
  azureClientSecret: "",
  gcpProjectId: "",
  gcpServiceAccountJson: "",
};

function formatUtc(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

async function fetchIntegrations(tenantSlugOrId: string): Promise<Integration[]> {
  const response = await fetch(
    `/api/integrations?tenant=${encodeURIComponent(tenantSlugOrId)}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(body.error || "Integrations could not be loaded");
  }
  const body = (await response.json()) as { integrations?: Integration[] };
  return body.integrations ?? [];
}

async function runIntegrationAction<T>(
  action: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const response = await fetch("/api/integrations/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error || "Integration action failed");
  }
  return body as T;
}

function IntegrationLogo({ integration }: { integration: Integration }) {
  if (integration.logoUrl) {
    return (
      <Image
        src={integration.logoUrl}
        width={28}
        height={28}
        alt=""
        className="h-5 w-5 object-contain"
      />
    );
  }
  return CLOUD_PROVIDERS.has(integration.name) ? (
    <Cloud className="h-5 w-5" />
  ) : (
    <Blocks className="h-5 w-5" />
  );
}

function FormField({
  label,
  required,
  help,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}
        {required ? "*" : ""}
      </Label>
      {children}
      {help ? (
        <p className="text-xs leading-5 text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}

export default function IntegrationsPage() {
  const { tenant } = useTenant();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Integration | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [projectConfig, setProjectConfig] = useState<{
    integration: Integration;
    projects: { id: string; name: string }[];
    selected: string;
    loading: boolean;
    saving: boolean;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [credentials, setCredentials] =
    useState<CredentialState>(EMPTY_CREDENTIALS);

  const setCredential = <K extends keyof CredentialState>(
    key: K,
    value: CredentialState[K],
  ) => setCredentials((current) => ({ ...current, [key]: value }));

  const load = async () => {
    if (!tenant?.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      setIntegrations(await fetchIntegrations(tenant.id));
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Failed to load integrations",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id]);

  // Surface integration failures as a toast instead of a permanent red banner on
  // the card. Keyed by integration id + message so a re-render, a refetch, or an
  // unrelated state change never re-notifies; a *changed* message does.
  const reportedErrorsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const integration of integrations) {
      if (!integration.errorMessage) continue;
      const key = `${integration.id}:${integration.errorMessage}`;
      if (reportedErrorsRef.current.has(key)) continue;
      reportedErrorsRef.current.add(key);
      const partial = integration.syncStatus === "success";
      const label = partial ? "completed with warnings" : "connection failed";
      errorToast(`${integration.name} ${label}: ${integration.errorMessage}`);
    }
  }, [integrations]);

  const categories = useMemo(
    () =>
      Object.keys(CATEGORY_LABELS).filter((value) =>
        integrations.some((integration) => integration.category === value),
      ),
    [integrations],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return integrations
      .filter(
        (integration) =>
          category === "all" || integration.category === category,
      )
      .filter(
        (integration) =>
          status === "all" ||
          (status === "enabled"
            ? integration.isEnabled
            : !integration.isEnabled),
      )
      .filter(
        (integration) =>
          !query ||
          integration.name.toLowerCase().includes(query) ||
          integration.description?.toLowerCase().includes(query),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [integrations, category, status, search]);

  const openCredentials = (integration: Integration) => {
    setSelected(integration);
    setCredentials(EMPTY_CREDENTIALS);
    setDialogOpen(true);
  };

  const closeCredentials = () => {
    if (saving) return;
    setDialogOpen(false);
    setSelected(null);
    setCredentials(EMPTY_CREDENTIALS);
  };

  // After the Nango popup succeeds: record the connection server-side (pull
  // from Nango directly — no webhook dependency), then run discovery so agents
  // appear in the Agent Inventory immediately.
  const handleNangoConnected = async (
    integration: Integration,
    connectionId?: string,
  ) => {
    if (!tenant?.id) return;
    setRunning(integration.id);
    try {
      const result = await runIntegrationAction<{
        status: "completed" | "failed";
        agentsDiscovered: number;
        errorMessage?: string;
      }>("nangoConnected", {
        tenantSlugOrId: tenant.id,
        integrationId: integration.id,
        providerName: integration.name,
        connectionId,
      });
      if (result?.status === "failed") {
        throw new Error(result.errorMessage || "Discovery failed");
      }
      successToast(
        "",
        "",
        "",
        `${integration.name} connected — ${result?.agentsDiscovered ?? 0} agents discovered`,
      );
    } catch (error) {
      errorToast(
        error instanceof Error
          ? error.message
          : "Connected, but discovery could not be started",
      );
    } finally {
      setRunning(null);
      await load();
    }
  };

  const valid = useMemo(() => {
    if (!selected) return false;
    if (selected.name === "AWS") {
      if (!credentials.awsRegion.trim()) return false;
      if (credentials.awsMethod === "iam_role")
        return Boolean(credentials.awsRoleArn.trim());
      if (credentials.awsMethod === "cross_account")
        return Boolean(credentials.awsCrossAccountRoleArn.trim());
      return Boolean(
        credentials.awsAccessKeyId.trim() &&
          credentials.awsSecretAccessKey.trim(),
      );
    }
    if (selected.name === "Azure") {
      return Boolean(
        credentials.azureTenantId.trim() &&
          credentials.azureSubscriptionId.trim() &&
          credentials.azureClientId.trim() &&
          credentials.azureClientSecret.trim(),
      );
    }
    if (selected.name === "Google Cloud") {
      return Boolean(
        credentials.gcpProjectId.trim() &&
          credentials.gcpServiceAccountJson.trim(),
      );
    }
    if (["OpenAI", "Anthropic", "Cohere"].includes(selected.name)) {
      return Boolean(credentials.apiKey.trim());
    }
    if (selected.name === DATABRICKS_UNITY_CATALOG) {
      return Boolean(credentials.hostUrl.trim() && credentials.apiKey.trim());
    }
    if (selected.name === CREWAI) {
      return Boolean(credentials.apiKey.trim());
    }
    if (selected.name === "Snowflake") {
      return Boolean(credentials.hostUrl.trim() && credentials.apiKey.trim());
    }
    try {
      return Boolean(
        credentials.json.trim() && JSON.parse(credentials.json.trim()),
      );
    } catch {
      return false;
    }
  }, [selected, credentials]);

  const save = async () => {
    if (!tenant?.id || !selected || !valid) return;
    setSaving(true);
    try {
      if (selected.name === "AWS") {
        const scan = await runIntegrationAction<{
          status: "completed" | "failed";
          agentsDiscovered: number;
          errorMessage?: string;
          optionalNotice?: string;
        }>("connectAws", {
          tenantSlug: tenant.id,
          integrationId: selected.id,
          name: "AWS",
          authMethod: credentials.awsMethod,
          region: credentials.awsRegion.trim(),
          roleArn: credentials.awsRoleArn.trim() || undefined,
          externalId: credentials.awsExternalId.trim() || undefined,
          crossAccountRoleArn:
            credentials.awsCrossAccountRoleArn.trim() || undefined,
          accessKeyId: credentials.awsAccessKeyId.trim() || undefined,
          secretAccessKey: credentials.awsSecretAccessKey.trim() || undefined,
        });
        setRunning(selected.id);
        if (scan.status === "failed")
          throw new Error(scan.errorMessage || "AWS discovery failed");
        if (scan.optionalNotice) {
          // Surfaced once here, on connect. It is intentionally not persisted
          // to the integration, so it will not reappear as a card banner on
          // every subsequent scheduled scan.
          infoToast(
            `AWS connected — ${scan.agentsDiscovered} agents discovered. ${scan.optionalNotice}`,
          );
        } else {
          successToast(
            "",
            "",
            "",
            `AWS connected — ${scan.agentsDiscovered} agents discovered`,
          );
        }
      } else if (selected.name === "Azure") {
        const scan = await runIntegrationAction<{
          status: "completed" | "failed";
          agentsDiscovered: number;
          errorMessage?: string;
        }>("connectAzure", {
          tenantSlugOrId: tenant.id,
          integrationId: selected.id,
          azureTenantId: credentials.azureTenantId.trim(),
          subscriptionId: credentials.azureSubscriptionId.trim(),
          clientId: credentials.azureClientId.trim(),
          clientSecret: credentials.azureClientSecret,
        });
        setRunning(selected.id);
        if (scan.status === "failed")
          throw new Error(scan.errorMessage || "Azure discovery failed");
        successToast(
          "",
          "",
          "",
          `Azure connected — ${scan.agentsDiscovered} agents discovered`,
        );
      } else if (selected.name === "Google Cloud") {
        const scan = await runIntegrationAction<{
          status: "completed" | "failed";
          agentsDiscovered: number;
          errorMessage?: string;
        }>("connectGoogleCloud", {
          tenantSlugOrId: tenant.id,
          integrationId: selected.id,
          projectId: credentials.gcpProjectId.trim(),
          serviceAccountJson: credentials.gcpServiceAccountJson,
        });
        setRunning(selected.id);
        if (scan.status === "failed")
          throw new Error(scan.errorMessage || "Google Cloud discovery failed");
        successToast(
          "",
          "",
          "",
          `Google Cloud connected — ${scan.agentsDiscovered} agents discovered`,
        );
      } else if (selected.name === DATABRICKS_UNITY_CATALOG) {
        const scan = await runIntegrationAction<{
          status: "completed" | "failed";
          agentsDiscovered: number;
          errorMessage?: string;
          resourcesScanned?: Record<string, number>;
        }>("connectDatabricks", {
          tenantSlugOrId: tenant.id,
          integrationId: selected.id,
          workspaceUrl: credentials.hostUrl,
          accessToken: credentials.apiKey,
        });
        setRunning(selected.id);
        if (scan.status === "failed") {
          throw new Error(scan.errorMessage || "Databricks discovery failed");
        }
        successToast(
          "",
          "",
          "",
          `Databricks Unity Catalog connected — ${scan.agentsDiscovered} agents and ${Object.values(
            scan.resourcesScanned ?? {},
          ).reduce(
            (sum, count) => sum + Number(count),
            0,
          )} Unity Catalog resources discovered`,
        );
      } else if (selected.name === CREWAI) {
        const scan = await runIntegrationAction<{
          status: "completed" | "failed";
          agentsDiscovered: number;
          errorMessage?: string;
        }>("connectCrewAI", {
          tenantSlugOrId: tenant.id,
          integrationId: selected.id,
          accessToken: credentials.apiKey,
        });
        setRunning(selected.id);
        if (scan.status === "failed") {
          throw new Error(scan.errorMessage || "CrewAI discovery failed");
        }
        successToast(
          "",
          "",
          "",
          `CrewAI connected — ${scan.agentsDiscovered} deployed crews discovered`,
        );
      } else {
        let secret: Record<string, unknown>;
        if (["OpenAI", "Anthropic", "Cohere"].includes(selected.name)) {
          secret = { apiKey: credentials.apiKey };
        } else if (selected.name === "Snowflake") {
          secret = {
            hostUrl: credentials.hostUrl,
            apiKey: credentials.apiKey,
          };
        } else {
          secret = JSON.parse(credentials.json);
        }
        await runIntegrationAction("saveEncryptedCredentials", {
          tenantSlugOrId: tenant.id,
          integrationId: selected.id,
          credentials: secret,
        });
        successToast("", "Integration", "connected");
      }
      setDialogOpen(false);
      setSelected(null);
      setCredentials(EMPTY_CREDENTIALS);
      await load();
    } catch (error) {
      errorToast(
        error instanceof Error
          ? error.message
          : "Failed to connect integration",
      );
      await load();
    } finally {
      setSaving(false);
      setRunning(null);
    }
  };

  const revoke = async (integration: Integration) => {
    if (!tenant?.id) return;
    try {
      await runIntegrationAction("revoke", {
        tenantSlugOrId: tenant.id,
        integrationId: integration.id,
        providerName: integration.name,
        configuration: integration.configuration,
      });
      successToast("", "Integration", "connection revoked");
      await load();
    } catch (error) {
      errorToast(
        error instanceof Error ? error.message : "Failed to revoke connection",
      );
    }
  };

  const runDiscovery = async (integration: Integration) => {
    if (!tenant?.id) return;
    setRunning(integration.id);
    try {
      let result:
        | {
            status: "completed" | "failed";
            agentsDiscovered: number;
            errorMessage?: string;
          }
        | undefined;
      result = await runIntegrationAction("runDiscovery", {
        tenantSlugOrId: tenant.id,
        integrationId: integration.id,
        providerName: integration.name,
        configuration: integration.configuration,
      });
      if (!result) return;
      if (result.status === "failed")
        throw new Error(result.errorMessage || "Discovery failed");
      successToast(
        "",
        "",
        "",
        `Discovery complete — ${result.agentsDiscovered} agents found`,
      );
      await load();
    } catch (error) {
      errorToast(error instanceof Error ? error.message : "Discovery failed");
    } finally {
      setRunning(null);
    }
  };

  const testConnection = async (integration: Integration) => {
    if (!tenant?.id) return;
    setTesting(integration.id);
    try {
      const result = await runIntegrationAction<{
        ok: boolean;
        error?: string;
      }>("testConnection", {
        tenantSlugOrId: tenant.id,
        integrationId: integration.id,
        providerName: integration.name,
      });
      if (result.ok) {
        successToast("", "", "", `${integration.name} connection is healthy`);
      } else {
        errorToast(result.error || "Connection test failed");
      }
    } catch (error) {
      errorToast(
        error instanceof Error ? error.message : "Connection test failed",
      );
    } finally {
      setTesting(null);
    }
  };

  const openProjectConfig = async (integration: Integration) => {
    if (!tenant?.id) return;
    const currentProject =
      typeof integration.configuration?.project === "string"
        ? integration.configuration.project
        : "";
    setProjectConfig({
      integration,
      projects: [],
      selected: currentProject,
      loading: true,
      saving: false,
    });
    try {
      const result = await runIntegrationAction<{
        projects: { id: string; name: string }[];
      }>("listLangSmithProjects", {
        tenantSlugOrId: tenant.id,
        integrationId: integration.id,
      });
      setProjectConfig((current) =>
        current
          ? { ...current, projects: result.projects ?? [], loading: false }
          : current,
      );
    } catch (error) {
      errorToast(
        error instanceof Error ? error.message : "Could not load projects",
      );
      setProjectConfig((current) =>
        current ? { ...current, loading: false } : current,
      );
    }
  };

  const saveProject = async () => {
    if (!tenant?.id || !projectConfig || !projectConfig.selected) return;
    setProjectConfig((current) =>
      current ? { ...current, saving: true } : current,
    );
    try {
      const projectName =
        projectConfig.projects.find(
          (project) => project.id === projectConfig.selected,
        )?.name ?? projectConfig.selected;
      await runIntegrationAction("setLangSmithProject", {
        tenantSlugOrId: tenant.id,
        integrationId: projectConfig.integration.id,
        project: projectConfig.selected,
        projectName,
      });
      successToast("", "", "", "LangSmith project updated");
      setProjectConfig(null);
      await load();
    } catch (error) {
      errorToast(
        error instanceof Error ? error.message : "Could not save project",
      );
      setProjectConfig((current) =>
        current ? { ...current, saving: false } : current,
      );
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1600px] space-y-4 p-5">
        <div>
          <h1 className="text-2xl font-bold">Integrations</h1>
          <p className="text-muted-foreground">
            Connect providers, discover deployed agents, and bring them under
            NORIX policy and compliance evaluation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b">
          <Button
            variant="ghost"
            className={
              category === "all"
                ? "h-9 rounded-none border-b-2 border-foreground px-3"
                : "h-9 rounded-none px-3 text-muted-foreground"
            }
            onClick={() => setCategory("all")}
          >
            All
            <Badge variant="secondary">{integrations.length}</Badge>
          </Button>
          {categories.map((value) => (
            <Button
              key={value}
              variant="ghost"
              className={
                category === value
                  ? "h-9 rounded-none border-b-2 border-foreground px-3"
                  : "h-9 rounded-none px-3 text-muted-foreground"
              }
              onClick={() => setCategory(value)}
            >
              {CATEGORY_LABELS[value]}
              <Badge variant="secondary">
                {
                  integrations.filter(
                    (integration) => integration.category === value,
                  ).length
                }
              </Badge>
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative max-w-xl flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search integrations"
              className="h-9 pl-9 pr-9"
            />
            {search ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <Button
            variant="outline"
            className="h-9"
            onClick={() => setShowFilters((value) => !value)}
          >
            <Filter className="mr-2 h-4 w-4" />
            Filters
          </Button>
        </div>

        {showFilters ? (
          <Card className="gap-0 py-0 shadow-none">
            <CardContent className="flex flex-wrap items-end gap-3 p-3">
              <div className="w-52 space-y-1.5">
                <Label className="text-sm">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All integrations</SelectItem>
                    <SelectItem value="enabled">Enabled</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="ghost"
                className="h-9"
                onClick={() => {
                  setStatus("all");
                  setSearch("");
                  setCategory("all");
                }}
              >
                Clear filters
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {loading ? (
          <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading integrations
          </div>
        ) : loadError ? (
          <Alert variant="destructive">
            <Info />
            <AlertTitle>Integrations could not be loaded</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : filtered.length === 0 ? (
          <Card className="items-center py-12 text-center shadow-none">
            <CardHeader>
              <CardTitle>No integrations found</CardTitle>
              <CardDescription>
                Adjust the current search or filter.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((integration) => {
              const hasDetails =
                Boolean(integration.lastSyncAt) ||
                Boolean(integration.errorMessage);
              const hasProviderConnection =
                integration.isCredentialsAdded ||
                Boolean(integration.nangoConnectionId);
              const connectionFailed =
                !hasProviderConnection && integration.syncStatus === "failed";
              const connectionPending =
                !hasProviderConnection && integration.syncStatus === "pending";
              const connected = hasProviderConnection && !connectionFailed;

              return (
                <Card
                  key={integration.id}
                  className="gap-0 overflow-hidden py-0 shadow-none"
                >
                  <CardHeader className="border-b p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/40">
                        <IntegrationLogo integration={integration} />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="truncate text-sm font-semibold">
                            {integration.name}
                          </CardTitle>
                          <Badge
                            className="shrink-0 text-[11px]"
                            variant={
                              connectionFailed
                                ? "destructive"
                                : connected
                                  ? "default"
                                  : "secondary"
                            }
                          >
                            {connectionFailed
                              ? "Failed"
                              : connectionPending
                                ? "Checking"
                                : connected
                                  ? "Connected"
                                  : "Not connected"}
                          </Badge>
                        </div>
                        <CardDescription className="line-clamp-2 text-xs leading-5">
                          {integration.description ||
                            "Connect this provider to NORIX."}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  {hasDetails ? (
                    <CardContent className="border-b px-4 py-3">
                      <div className="space-y-1.5 text-xs">
                        {integration.lastSyncAt ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">
                              Last sync
                            </span>
                            <span className="text-right font-medium">
                              {formatUtc(integration.lastSyncAt)}
                            </span>
                          </div>
                        ) : null}
                        {/* Failures surface as a one-time toast (see the
                            reportedErrorsRef effect) rather than a permanent
                            banner on every card. */}
                      </div>
                    </CardContent>
                  ) : null}
                  <CardFooter className="justify-start gap-3 px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {!connected ? (
                        NANGO_PROVIDERS[integration.name] ? (
                          <NangoConnectButton
                            tenant={tenant?.id ?? ""}
                            integrationId={integration.id}
                            providerConfigKey={
                              NANGO_PROVIDERS[integration.name]
                                .providerConfigKey
                            }
                            size="sm"
                            className="h-8"
                            disabled={running === integration.id}
                            onConnected={(connectionId) =>
                              void handleNangoConnected(
                                integration,
                                connectionId,
                              )
                            }
                          >
                            {running === integration.id ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Discovering…
                              </>
                            ) : connectionFailed ? (
                              "Reconnect"
                            ) : (
                              "Connect"
                            )}
                          </NangoConnectButton>
                        ) : (
                          <Button
                            size="sm"
                            className="h-8"
                            onClick={() => openCredentials(integration)}
                          >
                            {connectionFailed ? "Reconnect" : "Connect"}
                          </Button>
                        )
                      ) : (
                        <>
                          {DISCOVERY_INTEGRATIONS.has(integration.name) ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8"
                              disabled={running === integration.id}
                              onClick={() => void runDiscovery(integration)}
                            >
                              {running === integration.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <PlayCircle className="mr-2 h-4 w-4" />
                              )}
                              {integration.name === LANGSMITH
                                ? "Sync"
                                : "Discover"}
                            </Button>
                          ) : null}
                          {OBSERVABILITY_INTEGRATIONS.has(integration.name) ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8"
                              disabled={testing === integration.id}
                              onClick={() => void testConnection(integration)}
                            >
                              {testing === integration.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : null}
                              Test Connection
                            </Button>
                          ) : null}
                          {integration.name === LANGSMITH ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8"
                              onClick={() => void openProjectConfig(integration)}
                            >
                              Configure
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-destructive hover:text-destructive"
                            onClick={() => void revoke(integration)}
                          >
                            Revoke
                          </Button>
                        </>
                      )}
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeCredentials();
        }}
        modal={true}
      >
        <DialogContent className="max-h-[88vh] overflow-hidden p-0 sm:max-w-lg dialog-content">
          <div className="flex max-h-[88vh] flex-col p-6">
            <DialogHeader className="mb-4">
              <DialogTitle>Add {selected?.name} credentials</DialogTitle>
              <DialogDescription className="sr-only">
                Add credentials, verify provider access, and save the
                integration.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 overflow-y-auto pr-1">
              {selected?.name === "AWS" ? (
                <>
                  <Alert className="py-3">
                    <Info className="h-4 w-4" />
                    <AlertTitle>AWS discovery access</AlertTitle>
                    <AlertDescription className="text-xs leading-5">
                      IAM role is recommended. NORIX reads Bedrock, AgentCore,
                      Lambda, EC2, IAM, and related resource metadata; secrets
                      are encrypted at rest.
                    </AlertDescription>
                  </Alert>
                  <FormField label="Authentication Method" required>
                    <Select
                      value={credentials.awsMethod}
                      onValueChange={(value) =>
                        setCredential("awsMethod", value as AwsMethod)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="iam_role">
                          IAM role (recommended)
                        </SelectItem>
                        <SelectItem value="cross_account">
                          Cross-account role
                        </SelectItem>
                        <SelectItem value="access_key">
                          Access key and secret
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="AWS Region" required>
                    <Input
                      value={credentials.awsRegion}
                      onChange={(event) =>
                        setCredential("awsRegion", event.target.value)
                      }
                      placeholder="us-east-1"
                    />
                  </FormField>
                  {credentials.awsMethod === "iam_role" ? (
                    <FormField label="Role ARN" required>
                      <Input
                        value={credentials.awsRoleArn}
                        onChange={(event) =>
                          setCredential("awsRoleArn", event.target.value)
                        }
                        placeholder="arn:aws:iam::123456789012:role/NorixDiscovery"
                      />
                    </FormField>
                  ) : null}
                  {credentials.awsMethod === "cross_account" ? (
                    <>
                      <FormField label="Cross-account Role ARN" required>
                        <Input
                          value={credentials.awsCrossAccountRoleArn}
                          onChange={(event) =>
                            setCredential(
                              "awsCrossAccountRoleArn",
                              event.target.value,
                            )
                          }
                          placeholder="arn:aws:iam::123456789012:role/NorixDiscovery"
                        />
                      </FormField>
                      <FormField label="External ID">
                        <Input
                          type="password"
                          value={credentials.awsExternalId}
                          onChange={(event) =>
                            setCredential("awsExternalId", event.target.value)
                          }
                        />
                      </FormField>
                    </>
                  ) : null}
                  {credentials.awsMethod === "access_key" ? (
                    <>
                      <FormField label="Access Key ID" required>
                        <Input
                          value={credentials.awsAccessKeyId}
                          onChange={(event) =>
                            setCredential("awsAccessKeyId", event.target.value)
                          }
                          autoComplete="off"
                        />
                      </FormField>
                      <FormField label="Secret Access Key" required>
                        <Input
                          type="password"
                          value={credentials.awsSecretAccessKey}
                          onChange={(event) =>
                            setCredential(
                              "awsSecretAccessKey",
                              event.target.value,
                            )
                          }
                          autoComplete="new-password"
                        />
                      </FormField>
                    </>
                  ) : null}
                </>
              ) : selected?.name === "Azure" ? (
                <>
                  <Alert className="py-3">
                    <Info className="h-4 w-4" />
                    <AlertTitle>Azure service principal</AlertTitle>
                    <AlertDescription className="text-xs leading-5">
                      Grant Resource Graph read access. NORIX discovers Azure
                      AI, Functions, Logic Apps, VMs, Container Apps, and AKS
                      agent workloads.
                    </AlertDescription>
                  </Alert>
                  <FormField label="Tenant ID" required>
                    <Input
                      value={credentials.azureTenantId}
                      onChange={(event) =>
                        setCredential("azureTenantId", event.target.value)
                      }
                    />
                  </FormField>
                  <FormField label="Subscription ID" required>
                    <Input
                      value={credentials.azureSubscriptionId}
                      onChange={(event) =>
                        setCredential("azureSubscriptionId", event.target.value)
                      }
                    />
                  </FormField>
                  <FormField label="Client ID" required>
                    <Input
                      value={credentials.azureClientId}
                      onChange={(event) =>
                        setCredential("azureClientId", event.target.value)
                      }
                    />
                  </FormField>
                  <FormField label="Client Secret" required>
                    <Input
                      type="password"
                      value={credentials.azureClientSecret}
                      onChange={(event) =>
                        setCredential("azureClientSecret", event.target.value)
                      }
                      autoComplete="new-password"
                    />
                  </FormField>
                </>
              ) : selected?.name === "Google Cloud" ? (
                <>
                  <Alert className="py-3">
                    <Info className="h-4 w-4" />
                    <AlertTitle>Google Cloud service account</AlertTitle>
                    <AlertDescription className="text-xs leading-5">
                      Grant Cloud Asset Viewer access. NORIX discovers Vertex
                      AI Agent Engine plus identified agent workloads on Cloud
                      Run, Compute Engine, GKE, and Cloud Functions.
                    </AlertDescription>
                  </Alert>
                  <FormField label="Project ID" required>
                    <Input
                      value={credentials.gcpProjectId}
                      onChange={(event) =>
                        setCredential("gcpProjectId", event.target.value)
                      }
                      placeholder="my-project-id"
                    />
                  </FormField>
                  <FormField
                    label="Service Account JSON"
                    required
                    help="Paste the full key JSON. Stored encrypted; never returned to the browser."
                  >
                    <Textarea
                      rows={6}
                      value={credentials.gcpServiceAccountJson}
                      onChange={(event) =>
                        setCredential(
                          "gcpServiceAccountJson",
                          event.target.value,
                        )
                      }
                      placeholder='{"type":"service_account","project_id":"..."}'
                      className="font-mono text-xs"
                    />
                  </FormField>
                </>
              ) : selected?.name === DATABRICKS_UNITY_CATALOG ? (
                <>
                  <FormField
                    label="Workspace URL"
                    required
                    help="Use the workspace root URL. Do not include /api or another path."
                  >
                    <Input
                      value={credentials.hostUrl}
                      onChange={(event) =>
                        setCredential("hostUrl", event.target.value)
                      }
                      placeholder="https://dbc-12345678-abcd.cloud.databricks.com"
                    />
                  </FormField>
                  <FormField
                    label="Access Token"
                    required
                    help="Personal access token with workspace read access. Stored encrypted."
                  >
                    <Input
                      type="password"
                      value={credentials.apiKey}
                      onChange={(event) =>
                        setCredential("apiKey", event.target.value)
                      }
                      autoComplete="new-password"
                    />
                  </FormField>
                </>
              ) : selected?.name === CREWAI ? (
                <FormField
                  label="Access Token"
                  required
                  help="CrewAI Enterprise (AMP) personal access token. Stored encrypted."
                >
                  <Input
                    type="password"
                    value={credentials.apiKey}
                    onChange={(event) =>
                      setCredential("apiKey", event.target.value)
                    }
                    autoComplete="new-password"
                  />
                </FormField>
              ) : selected &&
                ["OpenAI", "Anthropic", "Cohere"].includes(selected.name) ? (
                <FormField
                  label="API Key"
                  required
                  help="Stored encrypted; the key is never returned to the browser."
                >
                  <Input
                    type="password"
                    value={credentials.apiKey}
                    onChange={(event) =>
                      setCredential("apiKey", event.target.value)
                    }
                    autoComplete="new-password"
                  />
                </FormField>
              ) : selected?.name === "Snowflake" ? (
                <>
                  <FormField label="Host URL" required>
                    <Input
                      value={credentials.hostUrl}
                      onChange={(event) =>
                        setCredential("hostUrl", event.target.value)
                      }
                      placeholder="https://..."
                    />
                  </FormField>
                  <FormField label="API Key" required>
                    <Input
                      type="password"
                      value={credentials.apiKey}
                      onChange={(event) =>
                        setCredential("apiKey", event.target.value)
                      }
                      autoComplete="new-password"
                    />
                  </FormField>
                </>
              ) : (
                <FormField
                  label="Credentials JSON"
                  required
                  help="Enter the provider credential object. NORIX encrypts the complete object at rest."
                >
                  <Textarea
                    rows={6}
                    value={credentials.json}
                    onChange={(event) =>
                      setCredential("json", event.target.value)
                    }
                    placeholder='{"apiKey":"..."}'
                    className="font-mono text-xs"
                  />
                </FormField>
              )}
            </div>

            <DialogFooter className="mt-5 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={closeCredentials}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void save()}
                disabled={!valid || saving}
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Connect
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(projectConfig)}
        onOpenChange={(open) => {
          if (!open && !projectConfig?.saving) setProjectConfig(null);
        }}
        modal={true}
      >
        <DialogContent className="sm:max-w-md dialog-content">
          <DialogHeader>
            <DialogTitle>Configure LangSmith project</DialogTitle>
            <DialogDescription>
              Choose the tracing project NORIX syncs runs from into
              Observability.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-sm font-medium">Workspace / Project</Label>
            {projectConfig?.loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading projects
              </div>
            ) : projectConfig && projectConfig.projects.length > 0 ? (
              <Select
                value={projectConfig.selected}
                onValueChange={(value) =>
                  setProjectConfig((current) =>
                    current ? { ...current, selected: value } : current,
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projectConfig.projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                No projects found. Leave unset to sync the default project.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setProjectConfig(null)}
              disabled={projectConfig?.saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void saveProject()}
              disabled={
                !projectConfig?.selected || Boolean(projectConfig?.saving)
              }
            >
              {projectConfig?.saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
