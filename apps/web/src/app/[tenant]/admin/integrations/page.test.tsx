import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import IntegrationsPage from "./page";

jest.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({
    tenant: { id: "tenant-1", slug: "tenant-slug" },
  }),
}));

jest.mock("@/lib/utils/toast", () => ({
  successToast: jest.fn(),
  errorToast: jest.fn(),
  infoToast: jest.fn(),
}));

// The Nango Connect widget loads its SDK from a CDN at runtime; stub the
// button so popup-provider cards render and "connect" without network access.
jest.mock("@/components/integrations/NangoConnectButton", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const NangoConnectButton = (props: {
    children?: React.ReactNode;
    onConnected?: (connectionId?: string) => void;
  }) =>
    React.createElement(
      "button",
      { type: "button", onClick: () => props.onConnected?.("conn-1") },
      props.children ?? "Connect with Nango",
    );
  return { NangoConnectButton, default: NangoConnectButton };
});

type IntegrationRow = Record<string, unknown>;

const awsIntegration = (overrides: IntegrationRow = {}): IntegrationRow => ({
  id: "aws-1",
  tenantId: "tenant-1",
  name: "AWS",
  category: "cloud_providers",
  description: "AWS agent discovery",
  isEnabled: false,
  isCredentialsAdded: false,
  configuration: {},
  metadata: {},
  logoUrl: null,
  lastSyncAt: null,
  syncStatus: null,
  errorMessage: null,
  nangoConnectionId: null,
  ...overrides,
});

/**
 * The page talks to /api/integrations (list) and /api/integrations/action
 * (mutations) with plain fetch; install a route-aware mock for both.
 */
function mockFetch(
  integrations: IntegrationRow[],
  actionHandler: (body: Record<string, unknown>) => unknown = () => ({}),
) {
  const fetchMock = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/integrations/action")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<
          string,
          unknown
        >;
        return {
          ok: true,
          json: async () => actionHandler(body),
        } as unknown as Response;
      }
      if (url.startsWith("/api/integrations")) {
        return {
          ok: true,
          json: async () => ({ integrations }),
        } as unknown as Response;
      }
      throw new Error(`Unexpected fetch in test: ${url}`);
    },
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("Integrations page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("connects a provider through the Nango popup and runs discovery immediately", async () => {
    const fetchMock = mockFetch([awsIntegration()], (body) => {
      if (body.action === "nangoConnected") {
        return { status: "completed", agentsDiscovered: 3 };
      }
      return {};
    });
    render(<IntegrationsPage />);

    // AWS is a Nango-popup provider: its card renders the Connect widget
    // button, and completing the popup must immediately run discovery with the
    // connectionId the widget reported.
    fireEvent.click(await screen.findByRole("button", { name: "Connect" }));

    await waitFor(() => {
      const actionCall = fetchMock.mock.calls.find(([input]) =>
        String(input).startsWith("/api/integrations/action"),
      );
      expect(actionCall).toBeDefined();
      const body = JSON.parse(String(actionCall?.[1]?.body));
      expect(body).toMatchObject({
        action: "nangoConnected",
        tenantSlugOrId: "tenant-1",
        integrationId: "aws-1",
        providerName: "AWS",
        connectionId: "conn-1",
      });
    });
  });

  it("opens the credential dialog for non-popup providers and Cancel closes it", async () => {
    mockFetch([
      {
        id: "openai-1",
        tenantId: "tenant-1",
        name: "OpenAI",
        category: "llm_providers",
        description: "OpenAI models",
        isEnabled: false,
        isCredentialsAdded: false,
        configuration: {},
        metadata: {},
        logoUrl: null,
        lastSyncAt: null,
        syncStatus: null,
        errorMessage: null,
        nangoConnectionId: null,
      },
    ]);
    render(<IntegrationsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Connect" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Add OpenAI credentials" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Connect" }),
    ).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("shows compact sync details without resource-count tiles", async () => {
    mockFetch([
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
            databricks_serving_endpoint: 19,
            databricks_app: 2,
          },
        },
        metadata: {},
        logoUrl: null,
        lastSyncAt: "2026-07-24T11:06:00.000Z",
        syncStatus: "success",
        errorMessage: null,
        nangoConnectionId: null,
      },
    ]);
    render(<IntegrationsPage />);

    // The per-card "Agents discovered" row was intentionally removed (the count
    // is shown in the connect toast). The card must still avoid resource-count
    // tiles.
    expect(await screen.findByText("Last sync")).toBeInTheDocument();
    expect(screen.queryByText("UC assets")).not.toBeInTheDocument();
    expect(screen.queryByText("Serving")).not.toBeInTheDocument();
    expect(screen.queryByText("Apps / Jobs")).not.toBeInTheDocument();
  });

  it("shows a genuine AWS partial-failure warning as a connected banner", async () => {
    mockFetch([
      awsIntegration({
        isEnabled: true,
        isCredentialsAdded: true,
        lastSyncAt: "2026-07-24T17:37:00.000Z",
        syncStatus: "success",
        errorMessage:
          "Scanned 16/17 regions. Skipped: eu-central-1: the request socket did not establish a connection within the configured timeout.",
      }),
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
    mockFetch([
      awsIntegration({
        isEnabled: true,
        isCredentialsAdded: true,
        lastSyncAt: "2026-07-24T17:37:00.000Z",
        syncStatus: "success",
        errorMessage: null,
      }),
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
});
