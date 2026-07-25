import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createDatabricksConnection,
  triggerDatabricksDiscovery,
} from "@/lib/actions/databricks-integration";
import {
  createKubernetesConnection,
  triggerKubernetesDiscovery,
} from "@/lib/actions/kubernetes-integration";
import { fetchIntegrations } from "@/lib/api/integrations";
import IntegrationsPage from "./page";

jest.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({
    tenant: { id: "tenant-1", slug: "tenant-slug" },
  }),
}));

jest.mock("@/lib/utils/toast", () => ({
  successToast: jest.fn(),
  errorToast: jest.fn(),
}));

jest.mock("@/lib/api/integrations", () => ({
  addEncryptedIntegrationCredentials: jest.fn(),
  addIntegrationCredentials: jest.fn(),
  fetchIntegrations: jest.fn(async () => [
    {
      id: "databricks-1",
      tenantId: "tenant-1",
      name: "Databricks Unity Catalog",
      category: "data_platforms",
      description: "Databricks agent discovery",
      isEnabled: false,
      isCredentialsAdded: false,
      configuration: {},
      metadata: {},
      logoUrl: null,
      lastSyncAt: null,
      syncStatus: null,
      errorMessage: null,
    },
  ]),
  removeIntegrationCredentials: jest.fn(),
}));

jest.mock("@/lib/actions/aws-integration", () => ({
  createAwsConnection: jest.fn(),
  deleteAwsConnection: jest.fn(),
  ensureAwsIntegrationCatalogEntry: jest.fn(async () => undefined),
  testAwsIntegrationConnection: jest.fn(),
}));

jest.mock("@/lib/actions/aws-discovery", () => ({
  triggerManualScan: jest.fn(),
}));

jest.mock("@/lib/actions/azure-integration", () => ({
  createAzureConnection: jest.fn(),
  deleteAzureConnection: jest.fn(),
  ensureAzureIntegrationCatalogEntry: jest.fn(async () => undefined),
  testAzureIntegrationConnection: jest.fn(),
  triggerAzureDiscovery: jest.fn(),
}));

jest.mock("@/lib/actions/gcp-integration", () => ({
  createGoogleCloudConnection: jest.fn(),
  deleteGoogleCloudConnection: jest.fn(),
  ensureGoogleCloudIntegrationCatalogEntry: jest.fn(async () => undefined),
  testGoogleCloudIntegrationConnection: jest.fn(),
  triggerGoogleCloudDiscovery: jest.fn(),
}));

jest.mock("@/lib/actions/databricks-integration", () => ({
  createDatabricksConnection: jest.fn(async () => ({
    id: "databricks-1",
    hostUrl: "https://dbc-1234.cloud.databricks.com",
  })),
  deleteDatabricksConnection: jest.fn(),
  ensureDatabricksIntegrationCatalogEntry: jest.fn(async () => undefined),
  testDatabricksIntegrationConnection: jest.fn(async () => ({ ok: true })),
  triggerDatabricksDiscovery: jest.fn(async () => ({
    scanId: "scan-1",
    status: "completed",
    agentsDiscovered: 3,
    resourcesScanned: { databricks_app: 2, databricks_genie_space: 1 },
  })),
}));

jest.mock("@/lib/actions/kubernetes-integration", () => ({
  createKubernetesConnection: jest.fn(async () => ({
    id: "kubernetes-1",
    clusterName: "prod-agents-cluster",
  })),
  deleteKubernetesConnection: jest.fn(),
  testKubernetesIntegrationConnection: jest.fn(async () => ({ ok: true })),
  triggerKubernetesDiscovery: jest.fn(async () => ({
    scanId: "scan-k8s",
    status: "completed",
    agentsDiscovered: 2,
    resourcesScanned: { kubernetes_workload: 2 },
  })),
}));

describe("Integration credential dialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("matches the NORIX admin form pattern and Cancel closes it", async () => {
    render(<IntegrationsPage />);

    const addCredentials = await screen.findByRole("button", {
      name: "Add credentials",
    });
    expect(screen.queryByText("Category")).not.toBeInTheDocument();
    expect(screen.queryByText("Status")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByText("Manage")).not.toBeInTheDocument();
    fireEvent.click(addCredentials);

    expect(
      screen.getByRole("heading", {
        name: "Add Databricks Unity Catalog credentials",
      }),
    ).toHaveClass("text-[16px]", "font-semibold");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass(
      "h-9",
      "px-4",
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", {
          name: "Add Databricks Unity Catalog credentials",
        }),
      ).not.toBeInTheDocument(),
    );
  });

  it("saves valid credentials through the real Databricks workflow", async () => {
    render(<IntegrationsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Add credentials" }),
    );

    fireEvent.change(
      screen.getByPlaceholderText(
        "https://dbc-12345678-abcd.cloud.databricks.com",
      ),
      { target: { value: "https://dbc-1234.cloud.databricks.com" } },
    );
    const token = document.querySelector(
      'input[type="password"]',
    ) as HTMLInputElement;
    fireEvent.change(token, { target: { value: "workspace-token" } });

    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() =>
      expect(createDatabricksConnection).toHaveBeenCalledWith({
        tenantSlugOrId: "tenant-1",
        workspaceUrl: "https://dbc-1234.cloud.databricks.com",
        accessToken: "workspace-token",
      }),
    );
    expect(triggerDatabricksDiscovery).toHaveBeenCalledWith(
      "tenant-1",
      "databricks-1",
    );
  });

  it("shows compact Databricks sync and agent summary without resource-count tiles", async () => {
    (fetchIntegrations as jest.Mock).mockResolvedValueOnce([
      {
        id: "databricks-1",
        tenantId: "tenant-1",
        name: "Databricks Unity Catalog",
        category: "data_platforms",
        description: "Databricks agent discovery",
        isEnabled: true,
        isCredentialsAdded: true,
        configuration: {
          lastAgentsDiscovered: 4,
          lastDiscoveryCounts: {
            databricks_catalog: 1,
            databricks_schema: 2,
            databricks_table: 10,
            databricks_registered_model: 3,
            databricks_serving_endpoint: 19,
            databricks_app: 2,
            databricks_job: 1,
            databricks_genie_space: 0,
          },
        },
        metadata: {},
        logoUrl: null,
        lastSyncAt: "2026-07-24T11:06:00.000Z",
        syncStatus: "success",
        errorMessage: null,
      },
    ]);

    render(<IntegrationsPage />);

    expect(await screen.findByText("Agents discovered")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.queryByText("UC assets")).not.toBeInTheDocument();
    expect(screen.queryByText("Serving")).not.toBeInTheDocument();
    expect(screen.queryByText("Apps / Jobs")).not.toBeInTheDocument();
  });

  it("shows Kubernetes Cluster as a first-class integration without Universal collector UI", async () => {
    (fetchIntegrations as jest.Mock).mockResolvedValueOnce([
      {
        id: "kubernetes-1",
        tenantId: "tenant-1",
        name: "Kubernetes Cluster",
        category: "runtime_platforms",
        description: "Kubernetes agent workload discovery",
        isEnabled: false,
        isCredentialsAdded: false,
        configuration: {
          endpoint: "/api/agent-discovery/ingest",
          authentication: "x-api-key",
          provider: "kubernetes",
        },
        metadata: {},
        logoUrl: null,
        lastSyncAt: null,
        syncStatus: null,
        errorMessage: null,
      },
    ]);

    render(<IntegrationsPage />);

    expect(await screen.findByText("Kubernetes Cluster")).toBeInTheDocument();
    expect(screen.getByText("Runtime Platforms")).toBeInTheDocument();
    expect(
      screen.queryByText("Universal Agent Collector"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Collector ID")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add credentials" }));

    expect(
      screen.getByRole("heading", {
        name: "Add Kubernetes Cluster credentials",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Cluster Name*")).toBeInTheDocument();
    expect(screen.getByText("API Server URL*")).toBeInTheDocument();
    expect(screen.getByText("Bearer Token*")).toBeInTheDocument();
    expect(screen.getByText("Cluster CA Certificate*")).toBeInTheDocument();
    expect(screen.queryByText("Kubeconfig")).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("-----BEGIN CERTIFICATE-----"),
    ).toBeInTheDocument();
  });

  it("connects Kubernetes and immediately runs discovery", async () => {
    (fetchIntegrations as jest.Mock).mockResolvedValueOnce([
      {
        id: "kubernetes-1",
        tenantId: "tenant-1",
        name: "Kubernetes Cluster",
        category: "runtime_platforms",
        description: "Kubernetes agent workload discovery",
        isEnabled: false,
        isCredentialsAdded: false,
        configuration: {
          endpoint: "/api/agent-discovery/ingest",
          authentication: "x-api-key",
          provider: "kubernetes",
        },
        metadata: {},
        logoUrl: null,
        lastSyncAt: null,
        syncStatus: null,
        errorMessage: null,
      },
    ]);

    render(<IntegrationsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Add credentials" }),
    );
    fireEvent.change(screen.getByPlaceholderText("prod-agents-cluster"), {
      target: { value: "prod-agents-cluster" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("https://kubernetes.example.com:6443"),
      {
        target: { value: "https://kubernetes.example.com:6443" },
      },
    );
    fireEvent.change(document.querySelector('input[type="password"]')!, {
      target: { value: "service-account-token" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("-----BEGIN CERTIFICATE-----"),
      {
        target: {
          value:
            "-----BEGIN CERTIFICATE-----\ncluster-ca\n-----END CERTIFICATE-----",
        },
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(createKubernetesConnection).toHaveBeenCalledWith({
        tenantSlugOrId: "tenant-1",
        integrationId: "kubernetes-1",
        clusterName: "prod-agents-cluster",
        apiServer: "https://kubernetes.example.com:6443",
        bearerToken: "service-account-token",
        caCertificate:
          "-----BEGIN CERTIFICATE-----\ncluster-ca\n-----END CERTIFICATE-----",
      }),
    );
    expect(triggerKubernetesDiscovery).toHaveBeenCalledWith(
      "tenant-1",
      "kubernetes-1",
    );
  });

  it("shows compact Kubernetes discovered agent summary", async () => {
    (fetchIntegrations as jest.Mock).mockResolvedValueOnce([
      {
        id: "kubernetes-1",
        tenantId: "tenant-1",
        name: "Kubernetes Cluster",
        category: "runtime_platforms",
        description: "Kubernetes agent workload discovery",
        isEnabled: true,
        isCredentialsAdded: true,
        configuration: {
          lastAgentsDiscovered: 2,
          lastDiscoveryCounts: { kubernetes_workload: 2 },
        },
        metadata: {},
        logoUrl: null,
        lastSyncAt: "2026-07-24T12:06:00.000Z",
        syncStatus: "success",
        errorMessage: null,
      },
    ]);

    render(<IntegrationsPage />);

    expect(await screen.findByText("Agents discovered")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Discover/i }),
    ).toBeInTheDocument();
  });

  it("shows a genuine AWS partial-failure warning as a connected banner", async () => {
    (fetchIntegrations as jest.Mock).mockResolvedValueOnce([
      {
        id: "aws-1",
        tenantId: "tenant-1",
        name: "AWS",
        category: "cloud_providers",
        description: "AWS agent discovery",
        isEnabled: true,
        isCredentialsAdded: true,
        configuration: {},
        metadata: {},
        logoUrl: null,
        lastSyncAt: "2026-07-24T17:37:00.000Z",
        syncStatus: "success",
        errorMessage:
          "Scanned 16/17 regions. Skipped: eu-central-1: the request socket did not establish a connection within the configured timeout.",
      },
    ]);

    render(<IntegrationsPage />);

    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(screen.queryByText("Failed")).not.toBeInTheDocument();
    expect(screen.getByText(/Scanned 16\/17 regions/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Discover/i }),
    ).toBeInTheDocument();
  });

  it("does not persist the AgentCore optional-permission notice as a banner", async () => {
    // The optional-permission skip is surfaced once as a toast on connect and
    // must never be written to integrations.errorMessage, so a connected AWS
    // card carries no standing warning for it.
    (fetchIntegrations as jest.Mock).mockResolvedValueOnce([
      {
        id: "aws-1",
        tenantId: "tenant-1",
        name: "AWS",
        category: "cloud_providers",
        description: "AWS agent discovery",
        isEnabled: true,
        isCredentialsAdded: true,
        configuration: {},
        metadata: {},
        logoUrl: null,
        lastSyncAt: "2026-07-24T17:37:00.000Z",
        syncStatus: "success",
        errorMessage: null,
      },
    ]);

    render(<IntegrationsPage />);

    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(
      screen.queryByText(/missing optional IAM permission/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/bedrock-agentcore:ListAgentRuntimes/i),
    ).not.toBeInTheDocument();
  });

  it("does not show a failed Kubernetes integration as connected", async () => {
    (fetchIntegrations as jest.Mock).mockResolvedValueOnce([
      {
        id: "kubernetes-1",
        tenantId: "tenant-1",
        name: "Kubernetes Cluster",
        category: "runtime_platforms",
        description: "Kubernetes agent workload discovery",
        isEnabled: false,
        isCredentialsAdded: false,
        configuration: {},
        metadata: {},
        logoUrl: null,
        lastSyncAt: null,
        syncStatus: "failed",
        errorMessage:
          "Kubernetes API TLS verification failed. Add the cluster CA certificate for this API server.",
      },
    ]);

    render(<IntegrationsPage />);

    expect(await screen.findByText("Failed")).toBeInTheDocument();
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reconnect" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Discover/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/TLS verification failed/i)).toBeInTheDocument();
  });
});
