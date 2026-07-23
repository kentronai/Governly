"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Blocks,
  CheckCircle2,
  Cloud,
  Filter,
  Info,
  Loader2,
  PlayCircle,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { successToast, errorToast } from "@/lib/utils/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import {
  addEncryptedIntegrationCredentials,
  addIntegrationCredentials,
  fetchIntegrations,
  removeIntegrationCredentials,
  toggleIntegrationStatus,
  type Integration,
} from "@/lib/api/integrations";
import {
  createAwsConnection,
  deleteAwsConnection,
  ensureAwsIntegrationCatalogEntry,
  testAwsIntegrationConnection,
} from "@/lib/actions/aws-integration";
import { triggerManualScan } from "@/lib/actions/aws-discovery";
import {
  createAzureConnection,
  deleteAzureConnection,
  ensureAzureIntegrationCatalogEntry,
  testAzureIntegrationConnection,
  triggerAzureDiscovery,
} from "@/lib/actions/azure-integration";
import {
  createGoogleCloudConnection,
  deleteGoogleCloudConnection,
  ensureGoogleCloudIntegrationCatalogEntry,
  testGoogleCloudIntegrationConnection,
  triggerGoogleCloudDiscovery,
} from "@/lib/actions/gcp-integration";
import {
  createDatabricksConnection,
  deleteDatabricksConnection,
  ensureDatabricksIntegrationCatalogEntry,
  testDatabricksIntegrationConnection,
  triggerDatabricksDiscovery,
} from "@/lib/actions/databricks-integration";
import { ensureUniversalAgentIntegrationCatalogEntry } from "@/lib/actions/universal-agent-integration";

const CATEGORY_LABELS: Record<string, string> = {
  data_platforms: "Data Platforms",
  ml_platforms: "ML Platforms",
  llm_providers: "LLM Providers",
  ai_security: "AI Security & Governance",
  vector_databases: "Vector Databases",
  cloud_providers: "Cloud Providers",
};

const CLOUD_PROVIDERS = new Set(["AWS", "Azure", "Google Cloud"]);
const DATABRICKS_UNITY_CATALOG = "Databricks Unity Catalog";
const DISCOVERY_INTEGRATIONS = new Set([
  "AWS",
  "Azure",
  "Google Cloud",
  DATABRICKS_UNITY_CATALOG,
]);

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

function IntegrationLogo({ integration }: { integration: Integration }) {
  if (integration.logoUrl) {
    return (
      <Image
        src={integration.logoUrl}
        width={28}
        height={28}
        alt=""
        className="h-7 w-7 object-contain"
      />
    );
  }
  return CLOUD_PROVIDERS.has(integration.name) ? (
    <Cloud className="h-6 w-6" />
  ) : (
    <Blocks className="h-6 w-6" />
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
    <div className="space-y-2">
      <Label>
        {label}
        {required ? "*" : ""}
      </Label>
      {children}
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
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
      await Promise.all([
        ensureAwsIntegrationCatalogEntry(tenant.id),
        ensureAzureIntegrationCatalogEntry(tenant.id),
        ensureGoogleCloudIntegrationCatalogEntry(tenant.id),
        ensureDatabricksIntegrationCatalogEntry(tenant.id),
        ensureUniversalAgentIntegrationCatalogEntry(tenant.id),
      ]);
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
        const connection = await createAwsConnection({
          tenantSlug: tenant.id,
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
        const tested = await testAwsIntegrationConnection(
          tenant.id,
          connection.id,
        );
        if (!tested.ok) throw new Error(tested.error);
        await addIntegrationCredentials(tenant.id, selected.id, {
          authMethod: credentials.awsMethod,
          region: credentials.awsRegion.trim(),
          awsConnectionId: connection.id,
        });
        setRunning(selected.id);
        const scan = await triggerManualScan(tenant.id, connection.id);
        if (scan.status === "failed")
          throw new Error(scan.errorMessage || "AWS discovery failed");
        successToast(
          "",
          "",
          "",
          `AWS connected — ${scan.agentsDiscovered} agents discovered`,
        );
      } else if (selected.name === "Azure") {
        const connection = await createAzureConnection({
          tenantSlugOrId: tenant.id,
          azureTenantId: credentials.azureTenantId.trim(),
          subscriptionId: credentials.azureSubscriptionId.trim(),
          clientId: credentials.azureClientId.trim(),
          clientSecret: credentials.azureClientSecret,
        });
        const tested = await testAzureIntegrationConnection(
          tenant.id,
          connection.id,
        );
        if (!tested.ok) throw new Error(tested.error);
        await addIntegrationCredentials(tenant.id, selected.id, {
          azureConnectionId: connection.id,
          subscriptionId: connection.subscriptionId,
          authentication: "service_principal",
        });
        setRunning(selected.id);
        const scan = await triggerAzureDiscovery(tenant.id, connection.id);
        if (scan.status === "failed")
          throw new Error(scan.errorMessage || "Azure discovery failed");
        successToast(
          "",
          "",
          "",
          `Azure connected — ${scan.agentsDiscovered} agents discovered`,
        );
      } else if (selected.name === "Google Cloud") {
        const connection = await createGoogleCloudConnection({
          tenantSlugOrId: tenant.id,
          projectId: credentials.gcpProjectId.trim(),
          serviceAccountJson: credentials.gcpServiceAccountJson,
        });
        const tested = await testGoogleCloudIntegrationConnection(
          tenant.id,
          connection.id,
        );
        if (!tested.ok) throw new Error(tested.error);
        setRunning(selected.id);
        const scan = await triggerGoogleCloudDiscovery(
          tenant.id,
          connection.id,
        );
        if (scan.status === "failed")
          throw new Error(scan.errorMessage || "Google Cloud discovery failed");
        successToast(
          "",
          "",
          "",
          `Google Cloud connected — ${scan.agentsDiscovered} agents discovered`,
        );
      } else if (selected.name === DATABRICKS_UNITY_CATALOG) {
        const connection = await createDatabricksConnection({
          tenantSlugOrId: tenant.id,
          workspaceUrl: credentials.hostUrl,
          accessToken: credentials.apiKey,
        });
        const tested = await testDatabricksIntegrationConnection(
          tenant.id,
          connection.id,
        );
        if (!tested.ok) throw new Error(tested.error);
        setRunning(selected.id);
        const scan = await triggerDatabricksDiscovery(tenant.id, connection.id);
        if (scan.status === "failed") {
          throw new Error(scan.errorMessage || "Databricks discovery failed");
        }
        successToast(
          "",
          "",
          "",
          `Databricks Unity Catalog connected — ${scan.agentsDiscovered} agents and ${Object.values(
            scan.resourcesScanned,
          ).reduce(
            (sum, count) => sum + Number(count),
            0,
          )} Unity Catalog resources discovered`,
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
        await addEncryptedIntegrationCredentials(
          tenant.id,
          selected.id,
          secret,
        );
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
    } finally {
      setSaving(false);
      setRunning(null);
    }
  };

  const revoke = async (integration: Integration) => {
    if (!tenant?.id) return;
    try {
      if (integration.name === "AWS") {
        const connectionId = integration.configuration.awsConnectionId;
        if (connectionId) await deleteAwsConnection(tenant.id, connectionId);
        await removeIntegrationCredentials(tenant.id, integration.id);
      } else if (integration.name === "Azure") {
        const connectionId = integration.configuration.azureConnectionId;
        if (connectionId) await deleteAzureConnection(tenant.id, connectionId);
        await removeIntegrationCredentials(tenant.id, integration.id);
      } else if (integration.name === "Google Cloud") {
        await deleteGoogleCloudConnection(tenant.id, integration.id);
      } else if (integration.name === DATABRICKS_UNITY_CATALOG) {
        await deleteDatabricksConnection(tenant.id, integration.id);
      } else {
        await removeIntegrationCredentials(tenant.id, integration.id);
      }
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
      if (integration.name === "AWS") {
        const id = integration.configuration.awsConnectionId;
        if (!id) throw new Error("AWS connection is missing");
        result = await triggerManualScan(tenant.id, id);
      } else if (integration.name === "Azure") {
        const id = integration.configuration.azureConnectionId;
        if (!id) throw new Error("Azure connection is missing");
        result = await triggerAzureDiscovery(tenant.id, id);
      } else if (integration.name === "Google Cloud") {
        result = await triggerGoogleCloudDiscovery(tenant.id, integration.id);
      } else if (integration.name === DATABRICKS_UNITY_CATALOG) {
        result = await triggerDatabricksDiscovery(tenant.id, integration.id);
      }
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

  const toggle = async (integration: Integration) => {
    if (!tenant?.id) return;
    try {
      const updated = await toggleIntegrationStatus(
        tenant.id,
        integration.id,
        !integration.isEnabled,
      );
      setIntegrations((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (error) {
      errorToast(
        error instanceof Error ? error.message : "Failed to update integration",
      );
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1600px] space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Integrations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect providers, discover deployed agents, and bring them under
            NORIX policy and compliance evaluation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b">
          <Button
            variant="ghost"
            className={
              category === "all"
                ? "rounded-none border-b-2 border-foreground"
                : "rounded-none text-muted-foreground"
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
                  ? "rounded-none border-b-2 border-foreground"
                  : "rounded-none text-muted-foreground"
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

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative max-w-xl flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search integrations"
              className="pl-9 pr-9"
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
            onClick={() => setShowFilters((value) => !value)}
          >
            <Filter className="mr-2 h-4 w-4" />
            Filters
          </Button>
        </div>

        {showFilters ? (
          <Card className="gap-4 py-4 shadow-none">
            <CardContent className="flex flex-wrap items-end gap-3 px-4">
              <div className="w-52 space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
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

        <Alert>
          <ShieldCheck />
          <AlertTitle>Real agent coverage</AlertTitle>
          <AlertDescription>
            Native managed agents are discovered directly. VM and container
            workloads must include an agent-identifying name or tag such as
            <code className="rounded bg-muted px-1 py-0.5">
              norix:agent=true
            </code>
            . Workloads on any other platform can register through the
            authenticated agent discovery ingestion API.
          </AlertDescription>
        </Alert>

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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((integration) => (
              <Card
                key={integration.id}
                className="min-h-64 gap-0 py-0 shadow-sm"
              >
                <CardHeader className="border-b p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
                      <IntegrationLogo integration={integration} />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="truncate text-base">
                          {integration.name}
                        </CardTitle>
                        <Badge
                          variant={
                            integration.isCredentialsAdded
                              ? "default"
                              : "secondary"
                          }
                        >
                          {integration.isCredentialsAdded
                            ? "Connected"
                            : "Not connected"}
                        </Badge>
                      </div>
                      <CardDescription className="line-clamp-2 min-h-10">
                        {integration.description ||
                          "Connect this provider to NORIX."}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-4 p-5">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Category</span>
                      <span className="font-medium">
                        {CATEGORY_LABELS[integration.category] ||
                          integration.category}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        {integration.isEnabled ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : null}
                        {integration.isEnabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    {integration.lastSyncAt ? (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Last sync</span>
                        <span className="font-medium">
                          {formatUtc(integration.lastSyncAt)}
                        </span>
                      </div>
                    ) : null}
                    {integration.name === DATABRICKS_UNITY_CATALOG &&
                    integration.configuration.lastDiscoveryCounts ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            Unity Catalog assets
                          </span>
                          <span className="font-medium">
                            {[
                              "databricks_catalog",
                              "databricks_schema",
                              "databricks_table",
                              "databricks_registered_model",
                            ].reduce(
                              (sum, key) =>
                                sum +
                                Number(
                                  integration.configuration.lastDiscoveryCounts[
                                    key
                                  ] ?? 0,
                                ),
                              0,
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            Genie Agents
                          </span>
                          <span className="font-medium">
                            {Number(
                              integration.configuration.lastDiscoveryCounts
                                .databricks_genie_space ?? 0,
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            Serving endpoints
                          </span>
                          <span className="font-medium">
                            {Number(
                              integration.configuration.lastDiscoveryCounts
                                .databricks_serving_endpoint ?? 0,
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            Apps / Jobs scanned
                          </span>
                          <span className="font-medium">
                            {Number(
                              integration.configuration.lastDiscoveryCounts
                                .databricks_app ?? 0,
                            )}{" "}
                            /{" "}
                            {Number(
                              integration.configuration.lastDiscoveryCounts
                                .databricks_job ?? 0,
                            )}
                          </span>
                        </div>
                      </>
                    ) : null}
                    {integration.name === "Universal Agent Collector" ? (
                      <div className="space-y-1 border-t pt-3">
                        <span className="text-xs text-muted-foreground">
                          Collector integration ID
                        </span>
                        <code className="block break-all rounded bg-muted px-2 py-1.5 text-xs">
                          {integration.id}
                        </code>
                      </div>
                    ) : null}
                  </div>
                </CardContent>
                <CardFooter className="justify-between gap-3 border-t p-4">
                  <div className="flex flex-wrap gap-2">
                    {!integration.isCredentialsAdded ? (
                      <Button
                        size="sm"
                        onClick={() => openCredentials(integration)}
                      >
                        Add credentials
                      </Button>
                    ) : (
                      <>
                        {DISCOVERY_INTEGRATIONS.has(integration.name) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={running === integration.id}
                            onClick={() => void runDiscovery(integration)}
                          >
                            {running === integration.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <PlayCircle className="mr-2 h-4 w-4" />
                            )}
                            Discover
                          </Button>
                        ) : null}
                        {integration.name === "Universal Agent Collector" ? (
                          <Button size="sm" variant="outline" asChild>
                            <Link
                              href={`/${tenant?.slug || tenant?.id}/api-keys`}
                            >
                              Manage API keys
                            </Link>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => void revoke(integration)}
                          >
                            Revoke
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor={`integration-${integration.id}`}
                      className="text-xs text-muted-foreground"
                    >
                      Manage
                    </Label>
                    <Switch
                      id={`integration-${integration.id}`}
                      checked={integration.isEnabled}
                      disabled={!integration.isCredentialsAdded}
                      onCheckedChange={() => void toggle(integration)}
                    />
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeCredentials();
        }}
      >
        <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-[600px]">
          <DialogTitle className="sr-only">
            Connect {selected?.name}
          </DialogTitle>
          <DialogHeader className="border-b p-6 pb-4">
            <div className="flex items-center gap-3">
              {selected ? (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted/40">
                  <IntegrationLogo integration={selected} />
                </div>
              ) : null}
              <div>
                <h3 className="text-lg font-semibold">
                  Connect {selected?.name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Add credentials and verify access before the integration is
                  enabled.
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-6 p-6">
            {selected?.name === "AWS" ? (
              <>
                <Alert>
                  <Info />
                  <AlertTitle>AWS discovery access</AlertTitle>
                  <AlertDescription>
                    IAM role is recommended. NORIX reads Bedrock, AgentCore,
                    Lambda, EC2, IAM, and related resource metadata; secrets are
                    encrypted at rest.
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
                <Alert>
                  <Info />
                  <AlertTitle>Azure service principal</AlertTitle>
                  <AlertDescription>
                    Grant Resource Graph read access. NORIX discovers Azure AI,
                    Functions, Logic Apps, VMs, Container Apps, and AKS agent
                    workloads.
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
                <Alert>
                  <Info />
                  <AlertTitle>Google Cloud service account</AlertTitle>
                  <AlertDescription>
                    Grant Cloud Asset Viewer and Project Viewer. NORIX discovers
                    Vertex AI Agent Engine plus identified agent workloads on
                    Cloud Run, Compute Engine, GKE, and Cloud Functions.
                  </AlertDescription>
                </Alert>
                <FormField label="Project ID" required>
                  <Input
                    value={credentials.gcpProjectId}
                    onChange={(event) =>
                      setCredential("gcpProjectId", event.target.value)
                    }
                    placeholder="my-production-project"
                  />
                </FormField>
                <FormField
                  label="Service Account JSON"
                  required
                  help="The complete downloaded JSON key. It is encrypted before storage."
                >
                  <Textarea
                    rows={9}
                    value={credentials.gcpServiceAccountJson}
                    onChange={(event) =>
                      setCredential("gcpServiceAccountJson", event.target.value)
                    }
                    placeholder='{"type":"service_account","project_id":"..."}'
                    className="font-mono text-xs"
                  />
                </FormField>
              </>
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
            ) : selected?.name === DATABRICKS_UNITY_CATALOG ? (
              <>
                <Alert>
                  <Info />
                  <AlertTitle>Databricks Unity Catalog</AlertTitle>
                  <AlertDescription>
                    NORIX validates the workspace, then discovers Mosaic AI and
                    Responses agents on Model Serving, Databricks Apps, Genie
                    Agents, agent Jobs, referenced notebooks, and their Unity
                    Catalog models and data. The token needs read access to
                    Unity Catalog, Model Serving, Apps, Genie, Jobs, and
                    Workspace.
                  </AlertDescription>
                </Alert>
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
                  label="Personal Access Token"
                  required
                  help="Encrypted before storage and never returned to the browser."
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
                  rows={8}
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

          <DialogFooter className="border-t p-6 pt-4">
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
              Connect and discover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
