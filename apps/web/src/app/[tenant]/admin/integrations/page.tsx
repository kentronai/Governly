"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  addEncryptedIntegrationCredentials,
  addIntegrationCredentials,
  fetchIntegrations,
  removeIntegrationCredentials,
  type Integration,
} from "@/lib/api/integrations";
import {
  createAwsConnection,
  deleteAwsConnection,
  testAwsIntegrationConnection,
} from "@/lib/actions/aws-integration";
import { triggerManualScan } from "@/lib/actions/aws-discovery";
import {
  createAzureConnection,
  deleteAzureConnection,
  testAzureIntegrationConnection,
  triggerAzureDiscovery,
} from "@/lib/actions/azure-integration";
import {
  createGoogleCloudConnection,
  deleteGoogleCloudConnection,
  testGoogleCloudIntegrationConnection,
  triggerGoogleCloudDiscovery,
} from "@/lib/actions/gcp-integration";
import {
  createDatabricksConnection,
  deleteDatabricksConnection,
  testDatabricksIntegrationConnection,
  triggerDatabricksDiscovery,
} from "@/lib/actions/databricks-integration";
import {
  createKubernetesConnection,
  deleteKubernetesConnection,
  triggerKubernetesDiscovery,
} from "@/lib/actions/kubernetes-integration";
import {
  createCrewAIConnection,
  deleteCrewAIConnection,
  testCrewAIIntegrationConnection,
  triggerCrewAIDiscovery,
} from "@/lib/actions/crewai-integration";

const CATEGORY_LABELS: Record<string, string> = {
  data_platforms: "Data Platforms",
  ml_platforms: "ML Platforms",
  llm_providers: "LLM Providers",
  ai_security: "AI Security & Governance",
  vector_databases: "Vector Databases",
  cloud_providers: "Cloud Providers",
  runtime_platforms: "Runtime Platforms",
  agent_frameworks: "Agent Frameworks",
};

const CLOUD_PROVIDERS = new Set(["AWS", "Azure", "Google Cloud"]);
const DATABRICKS_UNITY_CATALOG = "Databricks Unity Catalog";
const KUBERNETES_CLUSTER = "Kubernetes Cluster";
const CREWAI = "CrewAI";
const DISCOVERY_INTEGRATIONS = new Set([
  "AWS",
  "Azure",
  "Google Cloud",
  DATABRICKS_UNITY_CATALOG,
  KUBERNETES_CLUSTER,
  CREWAI,
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
  kubernetesClusterName: string;
  kubernetesApiServer: string;
  kubernetesBearerToken: string;
  kubernetesCaCertificate: string;
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
  kubernetesClusterName: "",
  kubernetesApiServer: "",
  kubernetesBearerToken: "",
  kubernetesCaCertificate: "",
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
    if (selected.name === CREWAI) {
      return Boolean(credentials.apiKey.trim());
    }
    if (selected.name === KUBERNETES_CLUSTER) {
      return Boolean(
        credentials.kubernetesClusterName.trim() &&
          credentials.kubernetesApiServer.trim() &&
          credentials.kubernetesBearerToken.trim() &&
          credentials.kubernetesCaCertificate.trim(),
      );
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
      } else if (selected.name === CREWAI) {
        const connection = await createCrewAIConnection({
          tenantSlugOrId: tenant.id,
          accessToken: credentials.apiKey,
        });
        const tested = await testCrewAIIntegrationConnection(
          tenant.id,
          connection.id,
        );
        if (!tested.ok) throw new Error(tested.error);
        setRunning(selected.id);
        const scan = await triggerCrewAIDiscovery(tenant.id, connection.id);
        if (scan.status === "failed") {
          throw new Error(scan.errorMessage || "CrewAI discovery failed");
        }
        successToast(
          "",
          "",
          "",
          `CrewAI connected — ${scan.agentsDiscovered} deployed crews discovered`,
        );
      } else if (selected.name === KUBERNETES_CLUSTER) {
        const connection = await createKubernetesConnection({
          tenantSlugOrId: tenant.id,
          integrationId: selected.id,
          clusterName: credentials.kubernetesClusterName.trim(),
          apiServer: credentials.kubernetesApiServer.trim(),
          bearerToken: credentials.kubernetesBearerToken,
          caCertificate: credentials.kubernetesCaCertificate,
        });
        setRunning(selected.id);
        const scan = await triggerKubernetesDiscovery(tenant.id, connection.id);
        if (scan.status === "failed") {
          throw new Error(scan.errorMessage || "Kubernetes discovery failed");
        }
        successToast(
          "",
          "",
          "",
          `Kubernetes Cluster connected — ${scan.agentsDiscovered} agents discovered`,
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
      await load();
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
      } else if (integration.name === KUBERNETES_CLUSTER) {
        await deleteKubernetesConnection(tenant.id, integration.id);
      } else if (integration.name === CREWAI) {
        await deleteCrewAIConnection(tenant.id, integration.id);
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
      } else if (integration.name === KUBERNETES_CLUSTER) {
        result = await triggerKubernetesDiscovery(tenant.id, integration.id);
      } else if (integration.name === CREWAI) {
        result = await triggerCrewAIDiscovery(tenant.id, integration.id);
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1600px] space-y-4 p-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Integrations</h1>
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
              const connectionFailed = integration.syncStatus === "failed";
              const connectionPending = integration.syncStatus === "pending";
              const partialWarning =
                integration.syncStatus === "success" &&
                Boolean(integration.errorMessage);
              const connected =
                integration.isCredentialsAdded &&
                !connectionFailed &&
                !connectionPending;

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
                        {integration.errorMessage ? (
                          <div
                            className={
                              partialWarning
                                ? "rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900"
                                : "rounded-md border border-destructive/30 bg-destructive/5 p-2 text-destructive"
                            }
                          >
                            {integration.errorMessage}
                          </div>
                        ) : null}
                      </div>
                    </CardContent>
                  ) : null}
                  <CardFooter className="justify-start gap-3 px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {!connected ? (
                        <Button
                          size="sm"
                          className="h-8"
                          onClick={() => openCredentials(integration)}
                        >
                          {connectionFailed ? "Reconnect" : "Add credentials"}
                        </Button>
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
                              Discover
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
              <DialogTitle>
                Add {selected?.name} credentials
              </DialogTitle>
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
                      Grant Cloud Asset Viewer and Project Viewer. NORIX
                      discovers Vertex AI Agent Engine plus identified agent
                      workloads on Cloud Run, Compute Engine, GKE, and Cloud
                      Functions.
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
                  <Alert className="py-3">
                    <Info className="h-4 w-4" />
                    <AlertTitle>Databricks Unity Catalog</AlertTitle>
                    <AlertDescription className="text-xs leading-5">
                      NORIX validates the workspace, then discovers Mosaic AI
                      and Responses agents on Model Serving, Databricks Apps,
                      Genie Agents, agent Jobs, referenced notebooks, and their
                      Unity Catalog models and data. The token needs read access
                      to Unity Catalog, Model Serving, Apps, Genie, Jobs, and
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
              ) : selected?.name === CREWAI ? (
                <>
                  <Alert className="py-3">
                    <Info className="h-4 w-4" />
                    <AlertTitle>CrewAI Enterprise</AlertTitle>
                    <AlertDescription className="text-xs leading-5">
                      Paste a CrewAI Enterprise (AMP) access token with
                      read access to your organization&apos;s deployments. NORIX
                      lists every deployed crew and governs each as an
                      autonomous multi-agent workload. Create a token in CrewAI
                      under Settings → API keys.
                    </AlertDescription>
                  </Alert>
                  <FormField
                    label="Access Token"
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
                      placeholder="crewai_..."
                    />
                  </FormField>
                </>
              ) : selected?.name === KUBERNETES_CLUSTER ? (
                <>
                  <Alert className="py-3">
                    <Info className="h-4 w-4" />
                    <AlertTitle>Kubernetes cluster access</AlertTitle>
                    <AlertDescription className="text-xs leading-5">
                      Connect a cluster-scoped service account that can read
                      Deployments, StatefulSets, Jobs, Pods, Services,
                      Namespaces, and labels. NORIX uses this runtime
                      integration for Kubernetes-hosted agent workloads.
                    </AlertDescription>
                  </Alert>
                  <FormField label="Cluster Name" required>
                    <Input
                      value={credentials.kubernetesClusterName}
                      onChange={(event) =>
                        setCredential(
                          "kubernetesClusterName",
                          event.target.value,
                        )
                      }
                      placeholder="prod-agents-cluster"
                    />
                  </FormField>
                  <FormField
                    label="API Server URL"
                    required
                    help="Use the Kubernetes API server endpoint for this cluster."
                  >
                    <Input
                      value={credentials.kubernetesApiServer}
                      onChange={(event) =>
                        setCredential("kubernetesApiServer", event.target.value)
                      }
                      placeholder="https://kubernetes.example.com:6443"
                    />
                  </FormField>
                  <FormField
                    label="Bearer Token"
                    required
                    help="Stored encrypted and never returned to the browser."
                  >
                    <Input
                      type="password"
                      value={credentials.kubernetesBearerToken}
                      onChange={(event) =>
                        setCredential(
                          "kubernetesBearerToken",
                          event.target.value,
                        )
                      }
                      autoComplete="new-password"
                    />
                  </FormField>
                  <FormField
                    label="Cluster CA Certificate"
                    required
                    help="Paste the PEM certificate for the Kubernetes API server CA."
                  >
                    <Textarea
                      rows={4}
                      value={credentials.kubernetesCaCertificate}
                      onChange={(event) =>
                        setCredential(
                          "kubernetesCaCertificate",
                          event.target.value,
                        )
                      }
                      placeholder="-----BEGIN CERTIFICATE-----"
                      className="font-mono text-xs"
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
                Save
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
