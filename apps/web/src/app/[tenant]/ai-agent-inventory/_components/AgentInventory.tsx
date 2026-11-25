"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatTimestamp } from "@/utils/formatTime";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Pagination from "@/components/common/pagination";
import AgentObservabilityTab from "./AgentObservabilityTab";
import { CompactMetricCard } from "@/components/agent-discovery/CompactMetricCard";
import {
  Search,
  RefreshCw,
  LayoutDashboard,
  Bot,
  UserX,
  ShieldOff,
  Rocket,
  Copy,
  Eye,
  MoreHorizontal,
} from "lucide-react";
import { errorToast, infoToast, successToast } from "@/lib/utils/toast";
import { isEverDeployed, llmCompanies, policyViolations, readProfile } from "@/lib/server/agents/agent-profile";
import {
  fetchAgents,
  fetchAgentDetail,
  fetchAgentInventorySummary,
  assignAgentToApplication,
} from "@/lib/actions/agents";
import {
  getAgentRefreshStatus,
  refreshAgentInventory,
  type RefreshStatus,
} from "@/lib/actions/agent-inventory-refresh";
import type {
  AgentInventoryInitialData,
  AgentInventorySummary,
} from "@/lib/queries/agents";


import { PageTitle } from "@/components/common/PageHeader";
import { RecordMetadata } from "@/components/common/RecordMetadata";
import type { GoverningPolicy } from "@/lib/queries/agents";
import { ConnectIntegrationDialog } from "@/components/integrations/ConnectIntegrationDialog";
// Display-only: "non_compliant" -> "Non compliant". Never use for stored values.
const toLabel = (v?: string | null) =>
  v ? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, " ") : "";
const ALL = "__all__";
const UNOWNED = "__unowned__";

const RISK_STYLES: Record<string, string> = {
  Critical: "bg-red-500/15 text-red-600 dark:text-red-400",
  High: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  Medium: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Low: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

const AUTONOMY_STYLES: Record<string, string> = {
  L1: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  L2: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  L3: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  L4: "bg-red-500/15 text-red-600 dark:text-red-400",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  inactive: "bg-muted text-muted-foreground",
  dormant: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

const PLATFORM_LABELS: Record<string, string> = {
  aws_bedrock: "AWS Bedrock",
  aws_agentcore: "AWS AgentCore",
  aws_lambda: "AWS Lambda",
  aws_step_functions: "AWS Step Functions",
  aws_ec2: "AWS EC2",
  aws_eks: "AWS EKS",
  amazon_q: "Amazon Q",
  azure_openai: "Azure OpenAI",
  azure_ai_foundry: "Azure AI Foundry",
  azure_functions: "Azure Functions",
  azure_logic_apps: "Azure Logic Apps",
  azure_virtual_machines: "Azure VMs",
  azure_container_apps: "Azure Container Apps",
  azure_aks: "Azure AKS",
  gcp_vertex_ai: "Vertex AI",
  gcp_cloud_run: "Google Cloud Run",
  gcp_compute: "Google Compute Engine",
  gcp_gke: "Google GKE",
  gcp_functions: "Google Cloud Functions",
  kubernetes: "Kubernetes",
  databricks_model_serving: "Databricks Model Serving",
  databricks_unity_catalog: "Databricks Unity Catalog",
  databricks_apps: "Databricks Apps",
  databricks_jobs: "Databricks Jobs",
  databricks_genie: "Databricks Genie Agent",
  crewai: "CrewAI",
  github: "GitHub",
};
const platformLabel = (value: string) =>
  PLATFORM_LABELS[value] ?? value.replaceAll("_", " ");

function ownerDisplay(value?: string | null): React.ReactNode {
  return value ? (
    value
  ) : (
    <span className="text-orange-600 dark:text-orange-400">Unowned</span>
  );
}

function functionDisplay(value?: string | null): React.ReactNode {
  return value ? (
    value
  ) : (
    <span className="text-muted-foreground">Not provided</span>
  );
}

// The stored level is authoritative: classifyAutonomy() already caps a
// classification at what discovered provider evidence supports before writing
// it. This deliberately does NOT re-derive the cap client-side — doing so gave
// the table a second, divergent definition that silently disagreed with the
// summary cards (which count the column) whenever a row went stale.
function autonomyLevelDisplay(agent: any): string | null {
  return agent.autonomyLevel ?? null;
}

function autonomyReasonDisplay(agent: any): string {
  return agent.autonomyReason ?? "—";
}

function relativeFromNow(iso: string | null): string {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** One empty-cell label for the whole table (Agent ID, framework, LLMs, observability). */
const NotFound = ({ title }: { title?: string }) => (
  <span className="text-xs text-amber-600" title={title}>
    Not found
  </span>
);

// Shows the first few items and a "+N" with the full list on hover.
function Chips({ items, max = 2 }: { items: string[]; max?: number }) {
  if (items.length === 0) {
    return <NotFound />;
  }
  return (
    <div className="flex max-w-[220px] flex-wrap gap-1" title={items.join(", ")}>
      {items.slice(0, max).map((item) => (
        <Badge key={item} variant="outline" className="max-w-[140px] truncate font-normal">
          {item}
        </Badge>
      ))}
      {items.length > max ? (
        <span className="self-center text-xs text-muted-foreground">
          +{items.length - max}
        </span>
      ) : null}
    </div>
  );
}

/** Why observability is (or is not) available for this agent, with the real cause. */
function ObservabilityStatus({ agent }: { agent: any }) {
  const profile = readProfile(agent.profile);
  const stack = observabilityOf(agent);
  // Only permissions that stop NORIX reading where observability is configured
  // (tags, startup script, image, function code) — not deployer/audit ones.
  const gaps: string[] = String(agent.platform).startsWith("aws_")
    ? (Array.from(
        new Set(
          (agent.agentResources ?? []).flatMap((r: any) =>
            Array.isArray(r.rawData?.permissionGaps) ? r.rawData.permissionGaps : [],
          ),
        ),
      ) as string[]).filter((g) => /^(ec2:Describe|ecr:|lambda:GetFunction)/.test(g))
    : [];
  const state = (agent.agentResources ?? [])
    .map((r: any) => r.rawData?.state ?? r.rawData?.computeStatus?.state ?? r.rawData?.appStatus?.state)
    .find(Boolean);
  return (
    <div className="mb-4 space-y-2 rounded-md border p-3 text-sm">
      <div>
        <span className="text-xs text-muted-foreground">Detected observability</span>
        {stack.length ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {stack.map((item) => (
              <Badge key={item} variant="outline" className="font-normal">{item}</Badge>
            ))}
          </div>
        ) : (
          <p className="text-amber-600">
            None detected in tags, environment, code or startup script.
          </p>
        )}
      </div>
      {!profile.deployed ? (
        <p className="text-muted-foreground">
          Runtime: not running{state ? ` (provider state: ${String(state).toLowerCase()})` : ""}. No live telemetry exists until it is started.
        </p>
      ) : null}
      {gaps.length ? (
        <div className="rounded bg-amber-500/10 p-2 text-amber-700 dark:text-amber-400">
          <p className="font-medium">AWS permissions needed to detect observability for this agent</p>
          <ul className="list-disc pl-5">
            {gaps.map((g) => (<li key={g}>{g}</li>))}
          </ul>
          <p className="text-xs">Without them NORIX cannot read the startup script, image or code where observability is configured. Grant them to the AWS connection, then press Refresh.</p>
        </div>
      ) : null}
    </div>
  );
}

/** Full list for the detail dialog; scrolls when long (skills / packages). */
function ChipList({ label, items, emptyText }: { label: string; items: string[]; emptyText?: string }) {
  return (
    <div className="px-3 py-2 space-y-1.5">
      <span className="text-xs text-muted-foreground">
        {label}
        {items.length ? ` (${items.length})` : ""}
      </span>
      {items.length ? (
        <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto">
          {items.map((item) => (
            <Badge key={item} variant="outline" className="font-normal">
              {item}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-amber-600">{emptyText ?? "Not detected"}</p>
      )}
    </div>
  );
}

/** The ID the host gave the running agent: EC2 instance / app id, or the Render/Vercel service id for a repo agent. Code-only agents have none. */
const cloudIdOf = (row: any): string | null =>
  row.platform === "github"
    ? readProfile(row.profile).deployedId
    : (String(row.externalAgentId ?? "").split(":").pop() || null);

const statusLabel = (profile: ReturnType<typeof readProfile>) =>
  profile.deployed ? "Deployed · Running" : isEverDeployed(profile) ? "Deployed · Stopped" : "Not deployed";

// LangSmith tracing is linked per agent (not discovered), so fold it in here.
const observabilityOf = (row: any) => {
  const profile = readProfile(row.profile);
  return row.langsmithProject && !profile.observability.includes("LangSmith")
    ? [...profile.observability, "LangSmith"]
    : profile.observability;
};

const violationsOf = (agent: any) =>
  policyViolations(observabilityOf(agent), llmsOf(agent), agent.approvedModels ?? []);

// The registry shows one LLM list: whatever discovery stored on the profile,
// falling back to the legacy single `model` column for older rows.
const llmsOf = (row: any) => {
  const llms = readProfile(row.profile).llms;
  return llms.length === 0 && row.model ? [row.model] : llms;
};

export function AgentInventory({
  tenant,
  initialAutonomy,
  initialData,
}: {
  tenant: string;
  initialAutonomy?: string;
  initialData: AgentInventoryInitialData;
}) {
  const [rows, setRows] = useState<any[]>(initialData.list.rows);
  const [total, setTotal] = useState(initialData.list.total);
  const [totalPages, setTotalPages] = useState(initialData.list.totalPages);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [isLoading, setIsLoading] = useState(false);
  // A refresh runs on the server, so it outlives this page: `refreshing` is
  // re-derived from the server's status on every mount.
  const [refreshing, setRefreshing] = useState(false);
  // null = closed, "" = no provider connected at all, otherwise the provider name.
  const [connectPrompt, setConnectPrompt] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [riskLevel, setRiskLevel] = useState(ALL);
  const [autonomyLevel, setAutonomyLevel] = useState(
    initialAutonomy && ["L1", "L2", "L3", "L4"].includes(initialAutonomy)
      ? initialAutonomy
      : ALL,
  );
  const [status, setStatus] = useState(ALL);
  const [platform, setPlatform] = useState(ALL);
  const [ownerFilter, setOwnerFilter] = useState(ALL);
  const [deployed, setDeployed] = useState(ALL);
  const [policy, setPolicy] = useState(ALL);
  const [options] = useState(initialData.options);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<any | null>(null);
  const [summary, setSummary] = useState<AgentInventorySummary | null>(
    initialData.summary,
  );
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [applicationOptions] = useState(initialData.applicationOptions);
  const hasMounted = useRef(false);
  // Relative timestamps depend on the current clock, so the server HTML and the
  // first client render would disagree and trip a hydration error. Gate them
  // behind mount: server and first client render both show the static
  // placeholder, then the live value appears once we are purely client-side.
  const [mounted, setMounted] = useState(false);

  // Only the newest request may write results: changing a filter on page 2 fires
  // a stale request before the page resets, and a slow reply must not win.
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setIsLoading(true);
    try {
      const result = await fetchAgents(tenant, {
        search: search || undefined,
        riskLevel: riskLevel === ALL ? undefined : riskLevel,
        autonomyLevel: autonomyLevel === ALL ? undefined : autonomyLevel,
        status: status === ALL ? undefined : status,
        platform: platform === ALL ? undefined : platform,
        ownerUserId:
          ownerFilter === UNOWNED
            ? "unowned"
            : ownerFilter === ALL
              ? undefined
              : ownerFilter,
        deployed: deployed === ALL ? undefined : (deployed as "yes" | "no"),
        policyViolation: policy === ALL ? undefined : (policy as "yes" | "no"),
        page,
        pageSize,
      });
      if (seq !== loadSeq.current) return;
      setRows(result.rows);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } finally {
      if (seq === loadSeq.current) setIsLoading(false);
    }
  }, [
    tenant,
    search,
    riskLevel,
    autonomyLevel,
    status,
    platform,
    ownerFilter,
    deployed,
    policy,
    page,
    pageSize,
  ]);

  const loadSummary = useCallback(async () => {
    setIsSummaryLoading(true);
    try {
      setSummary(await fetchAgentInventorySummary(tenant));
    } catch (error) {
      console.error("Unable to load Agent Inventory summary:", error);
      setSummary(null);
    } finally {
      setIsSummaryLoading(false);
    }
  }, [tenant]);

  const refreshAll = useCallback(async () => {
    // Start discovery across every connected provider on the server; the poll
    // below reloads the inventory when it finishes.
    try {
      const status = await refreshAgentInventory(tenant);
      setRefreshing(status.running);
    } catch (error) {
      errorToast(error);
    }
  }, [tenant]);

  const reportRefresh = useCallback(
    (status: RefreshStatus) => {
      if (!status.results.length) {
        setConnectPrompt("");
        return;
      }
      const failed = status.results.filter((r) => !r.ok);
      const disconnected = failed.find((r) => /not connected/i.test(r.error ?? ""));
      if (disconnected) setConnectPrompt(disconnected.name);
      if (failed.length) {
        errorToast(
          failed.map((r) => `${r.name} scan failed: ${r.error ?? "unknown error"}`).join(" | "),
        );
      } else {
        infoToast(
          `Scan complete: ${status.results.map((r) => `${r.name} (${r.agents})`).join(", ") || "nothing connected"}`,
        );
      }
    },
    [],
  );

  // Pick up a refresh that was started before this page mounted (e.g. the user
  // switched tabs and came back).
  useEffect(() => {
    void getAgentRefreshStatus(tenant)
      .then((status) => setRefreshing(status.running))
      .catch(() => undefined);
  }, [tenant]);

  useEffect(() => {
    if (!refreshing) return;
    const timer = window.setInterval(async () => {
      try {
        const status = await getAgentRefreshStatus(tenant);
        if (status.running) return;
        setRefreshing(false);
        reportRefresh(status);
        await Promise.all([load(), loadSummary()]);
      } catch {
        // Transient poll failure: keep polling.
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [refreshing, tenant, load, loadSummary, reportRefresh]);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const interval = window.setInterval(() => void loadSummary(), 60_000);
    return () => window.clearInterval(interval);
  }, [loadSummary]);

  useEffect(
    () => setPage(1),
    [search, riskLevel, autonomyLevel, status, platform, ownerFilter, deployed, policy],
  );

  useEffect(() => {
    if (!activeAgentId) {
      setActiveAgent(null);
      return;
    }
    fetchAgentDetail(tenant, activeAgentId).then(setActiveAgent);
  }, [tenant, activeAgentId]);

  const hasActiveFilters = useMemo(
    () =>
      search ||
      [riskLevel, autonomyLevel, status, platform, ownerFilter, deployed, policy].some(
        (f) => f !== ALL,
      ),
    [search, riskLevel, autonomyLevel, status, platform, ownerFilter, deployed, policy],
  );

  return (
    <div className="space-y-4">
      <ConnectIntegrationDialog
        open={connectPrompt !== null}
        onOpenChange={(open) => !open && setConnectPrompt(null)}
        tenant={tenant}
        provider={connectPrompt || undefined}
        description={
          connectPrompt
            ? undefined
            : "Agent discovery scans your connected providers, and none are connected yet. Connect AWS, GitHub, Azure, Google Cloud, Databricks or CrewAI in Admin Center → Integrations, then scan again."
        }
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <PageTitle>Agent Registry</PageTitle>
          <p className="text-muted-foreground">
            Every real AI agent discovered from connected providers or ingested
            through NORIX.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/${tenant}/ai-agent-discovery/dashboard`}>
              <LayoutDashboard className="h-4 w-4 mr-1.5" /> Dashboard
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={refreshing || isLoading || isSummaryLoading}
          >
            <RefreshCw
              className={cn(
                "h-4 w-4 mr-1.5",
                (refreshing || isLoading || isSummaryLoading) && "animate-spin",
              )}
            />{" "}
            {refreshing ? "Scanning…" : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,160px)] gap-2">
        <SummaryCard
          label="Total Agents"
          value={summary?.totalAiAgents}
          icon={Bot}
          loading={isSummaryLoading}
          description="Agent records discovered from connected providers or ingestion."
        />
        <SummaryCard
          label="Deployed Agents"
          value={summary?.deployedAgents}
          icon={Rocket}
          loading={isSummaryLoading}
          tone="text-emerald-600 dark:text-emerald-400"
          description="Agents whose runtime is up right now (cloud resource running, or a live GitHub deployment)."
        />
        <SummaryCard
          label="Policy Violations"
          value={summary?.policyViolationAgents}
          icon={ShieldOff}
          loading={isSummaryLoading}
          tone="text-red-600 dark:text-red-400"
          description="Agents violating a policy: no observability detected, or using a model not approved in the Model Registry. Open an agent's Policy Violations tab for details."
        />
      </div>

      <div className="relative w-[343px]">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by agent name, function, model, owner…"
          className="pl-10"
        />
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 stroke-muted-foreground" />
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Radix Select generates its aria-controls id with useId(). Rendering
            these filters only after mount keeps the server HTML and the first
            client render identical (a placeholder, no Radix ids on either side),
            which avoids the hydration id mismatch this page was throwing. */}
        {mounted ? (
          <>
            <FilterSelect
              label="Platform"
              value={platform}
              onChange={setPlatform}
              options={options.platforms}
              formatOption={platformLabel}
            />
            <Select value={deployed} onValueChange={setDeployed}>
              <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs">
                <SelectValue placeholder="Deployment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Status: All</SelectItem>
                <SelectItem value="yes">Deployed</SelectItem>
                <SelectItem value="no">Not deployed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={policy} onValueChange={setPolicy}>
              <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs">
                <SelectValue placeholder="Policy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Policy: All</SelectItem>
                <SelectItem value="yes">Policy violated</SelectItem>
                <SelectItem value="no">Not violated</SelectItem>
              </SelectContent>
            </Select>
          </>
        ) : (
          <div className="h-8 w-full max-w-[720px] rounded-md border bg-muted/10" />
        )}
        {mounted && (
          <Button
            variant="ghost"
            size="sm"
            disabled={!hasActiveFilters}
            onClick={() => {
              setSearch("");
              setRiskLevel(ALL);
              setAutonomyLevel(ALL);
              setStatus(ALL);
              setPlatform(ALL);
              setOwnerFilter(ALL);
              setDeployed(ALL);
              setPolicy(ALL);
            }}
          >
            Clear all
          </Button>
        )}
        <span className="text-xs text-muted-foreground self-center ml-auto">
          {total} agents
        </span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Agent</TableHead>
            <TableHead>Agent ID</TableHead>
            <TableHead>Platform</TableHead>
            <TableHead>Last Deployed</TableHead>
            <TableHead>Agent Framework</TableHead>
            <TableHead>LLMs</TableHead>
            <TableHead>Observability</TableHead>
            <TableHead className="w-[80px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={8}
                className="text-center py-10 text-muted-foreground"
              >
                {isLoading
                  ? "Loading agents…"
                  : "No agents discovered yet. Connect AWS, GitHub, Azure, Google Cloud, Databricks, or CrewAI in Admin → Integrations."}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => {
              const profile = readProfile(r.profile);
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium max-w-[220px] truncate">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
                      {r.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    {cloudIdOf(r) ? (
                      <div className="flex items-center gap-1">
                        <code className="max-w-[140px] truncate text-xs" title={cloudIdOf(r)!}>
                          {cloudIdOf(r)}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          aria-label="Copy agent ID"
                          onClick={(event) => {
                            event.stopPropagation();
                            void navigator.clipboard.writeText(cloudIdOf(r)!);
                            successToast("", "", "", "Agent ID copied");
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <NotFound title="No agent ID: not deployed to a connected cloud or host (Render, Vercel). Connect the host under Integrations, then Refresh." />
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      {/* A repo-only agent: show where it deploys, not "GitHub". */}
                      <div>
                        {r.platform === "github"
                          ? (profile.deployedOn?.split(/ · | \(/)[0] ?? "Not deployed")
                          : platformLabel(r.platform)}
                      </div>
                      {r.platform !== "github" && (
                        <div className="text-xs text-muted-foreground">
                          {`${r.region} · ${r.accountId}`}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {profile.deployedAt ? (
                      <div className="space-y-0.5">
                        <div>{formatTimestamp(profile.deployedAt)}</div>
                        <div className="text-xs text-muted-foreground">{profile.deployed ? "Running" : "Stopped"}</div>
                        {profile.deployedOn ? (
                          <div className="max-w-[180px] truncate text-xs text-muted-foreground" title={profile.deployedOn}>
                            {profile.deployedOn}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">
                        {profile.deployed ? "Not recorded" : "Never"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{profile.framework ?? <NotFound />}</TableCell>
                  <TableCell>
                    <Chips items={llmCompanies(llmsOf(r))} />
                  </TableCell>
                  <TableCell>
                    {observabilityOf(r).length ? (
                      <Chips items={observabilityOf(r)} />
                    ) : (
                      <NotFound />
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Agent actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setActiveAgentId(r.id)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Pagination hosts a Radix Select whose useId-based aria-controls differs
          between the server HTML and the first client render, tripping a
          hydration mismatch. Match the filter treatment above: render it only
          after mount so both sides start from identical markup. */}
      {mounted ? (
        <Pagination
          page={page}
          setPage={setPage}
          totalPages={totalPages}
          pageSize={pageSize}
          setPageSize={setPageSize}
          isLoading={isLoading}
        />
      ) : (
        <div className="h-9" />
      )}

      <AgentDetailModal
        agent={activeAgent}
        tenant={tenant}
        applications={applicationOptions}
        onAssignApplication={async (applicationId) => {
          if (!activeAgent) return;
          const refreshed = await assignAgentToApplication(
            tenant,
            activeAgent.id,
            applicationId,
          );
          setActiveAgent(refreshed);
          await Promise.all([load(), loadSummary()]);
        }}
        onOpenChange={(open) => !open && setActiveAgentId(null)}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone = "text-foreground",
  loading,
  description,
}: {
  label: string;
  value: number | undefined;
  icon: typeof Bot;
  tone?: string;
  loading: boolean;
  description: string;
}) {
  return (
    <CompactMetricCard
      label={label}
      value={value}
      icon={Icon}
      tone={tone}
      loading={loading}
      description={description}
    />
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  formatOption = (option) => option,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  formatOption?: (option: string) => string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto min-w-[130px] text-xs">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}: All</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {formatOption(o)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {title}
      </h3>
      <div className="rounded-lg border divide-y">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 break-words text-right font-medium [overflow-wrap:anywhere]",
          warn && "text-orange-600 dark:text-orange-400",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function AgentDetailModal({
  agent,
  tenant,
  applications,
  onAssignApplication,
  onOpenChange,
}: {
  agent: any | null;
  tenant: string;
  applications: Array<{ id: string; name: string }>;
  onAssignApplication: (applicationId: string | null) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}) {
  const [assigning, setAssigning] = useState(false);
  return (
    <Dialog open={!!agent} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[85vh] w-[95vw] gap-0 overflow-hidden p-0 sm:max-w-4xl"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        {agent && (
          <div className="flex h-full min-h-0 flex-col">
            <DialogHeader className="shrink-0 border-b p-5 pr-12">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-xl">{agent.name}</DialogTitle>
                <Badge
                  className={cn(
                    "border-transparent",
                    readProfile(agent.profile).deployed
                      ? STATUS_STYLES.active
                      : isEverDeployed(readProfile(agent.profile))
                        ? STATUS_STYLES.dormant
                        : STATUS_STYLES.inactive,
                  )}
                >
                  {statusLabel(readProfile(agent.profile))}
                </Badge>
              </div>
              <DialogDescription>
                {platformLabel(agent.platform)} · {agent.region} · Account{" "}
                {agent.accountId}
              </DialogDescription>
            </DialogHeader>

            <Tabs
              defaultValue="details"
              className="flex min-h-0 flex-1 flex-col"
            >
              <TabsList className="mx-5 mt-4 w-fit shrink-0">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="observability">Observability</TabsTrigger>
                <TabsTrigger value="violations">
                  Policy Violations ({violationsOf(agent).length})
                </TabsTrigger>
              </TabsList>
              <TabsContent
                value="details"
                className="min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-5"
              >
              <Section title="Registry Profile">
                {(() => {
                  const profile = readProfile(agent.profile);
                  const llms = profile.llms.length
                    ? profile.llms
                    : agent.model
                      ? [agent.model]
                      : [];
                  const linkHint = profile.repository
                    ? ""
                    : " Its source code could not be read: it is not in a connected GitHub repository and the platform exposes no deployed source.";
                  return (
                    <>
                      <Field label="Status" value={statusLabel(profile)} />
                      <Field label="Agent ID" value={cloudIdOf(agent) ?? "None: not deployed to a connected cloud"} warn={!cloudIdOf(agent)} />
                      {profile.repository || agent.platform === "github" ? (
                        <Field label="Repository" value={profile.repository ?? agent.rawMetadata?.repository ?? agent.externalAgentId} />
                      ) : null}
                      <Field
                        label="Last Deployed"
                        value={
                          profile.deployedAt
                            ? `${formatTimestamp(profile.deployedAt)}${profile.deployedOn ? ` · ${profile.deployedOn}` : ""} · ${profile.deployed ? "running now" : "stopped now"}`
                            : profile.deployed
                              ? `Live${profile.deployedOn ? ` · ${profile.deployedOn}` : ""} (deploy time not recorded)`
                              : "Never deployed"
                        }
                        warn={!profile.deployedAt && !profile.deployed}
                      />
                      <Field label="Developer" value={profile.developer ?? `Not recorded.${linkHint}`} warn={!profile.developer} />
                      <Field
                        label="Deployer"
                        value={
                          profile.deployer ??
                          (agent.platform === "github"
                            ? "Not recorded: GitHub has no deployment or deploy workflow for this code, and its host is not connected. Connect the host (Render, Vercel…) to read who deployed it."
                            : "Not recorded: the cloud only logs who launched it in its audit log. Grant read access to it (AWS: cloudtrail:LookupEvents), then Refresh.")
                        }
                        warn={!profile.deployer}
                      />
                      <Field label="Agent Framework" value={profile.framework ?? `No agent framework found in tags, startup script or code.${linkHint}`} warn={!profile.framework} />
                      <Field label="LLMs" value={llmCompanies(llms).join(", ") || `No model or provider found in config, environment names or code.${linkHint}`} warn={llms.length === 0} />
                      {llms.length > 0 && llms.join() !== llmCompanies(llms).join() ? (
                        <ChipList label="Models" items={llms} />
                      ) : null}
                      <ChipList label="Applications Access" items={profile.applicationsAccess} />
                      <ChipList label="Skills" items={profile.skills} emptyText={`No SKILL.md folders or tool definitions found in the deployed image or code.${linkHint}`} />
                      <ChipList label="Observability" items={observabilityOf(agent)} />
                      <ChipList label="Packages" items={profile.packages} emptyText={`None found in the startup script or bundle.${linkHint}`} />
                      <Field label="Evidence from" value={profile.sources.join(" + ") || "—"} />
                    </>
                  );
                })()}
              </Section>

              {agent.agentRecommendations?.some((rec: any) => !/owner/i.test(rec.recommendationType)) && (
                <Section title="Recommendations">
                  {agent.agentRecommendations.filter((rec: any) => !/owner/i.test(rec.recommendationType)).map((rec: any) => (
                    <div key={rec.id} className="px-3 py-2 text-sm space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {rec.recommendationType.replace(/_/g, " ")}
                        </span>
                        <Badge
                          className={cn(
                            "border-transparent",
                            RISK_STYLES[rec.severity],
                          )}
                        >
                          {rec.severity}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {rec.reason}
                      </p>
                      <p className="text-xs">{rec.suggestedFix}</p>
                    </div>
                  ))}
                </Section>
              )}

              <Section title="Policies">
                {agent.governingPolicies?.length ? (
                  agent.governingPolicies.map((p: GoverningPolicy) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <Link href={`/${tenant}/policies`} className="min-w-0 truncate font-medium hover:underline">
                        {p.name} <span className="text-muted-foreground">{p.version}</span>
                      </Link>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {p.guards} guardrail{p.guards === 1 ? "" : "s"}
                        </span>
                        <Badge variant="outline">
                          {p.source === "application"
                            ? `Application: ${agent.application?.name ?? "linked"}`
                            : "Tenant default"}
                        </Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <Field
                    label="Governing policy"
                    value={
                      agent.application
                        ? `None: ${agent.application.name} has no active policy and there is no tenant default policy.`
                        : "None: assign the agent to an application with a policy, or set a tenant default policy."
                    }
                    warn
                  />
                )}
                <Field
                  label="Policy violations"
                  value={
                    violationsOf(agent).length
                      ? violationsOf(agent).map((v) => v.policy).join(", ")
                      : "None"
                  }
                  warn={violationsOf(agent).length > 0}
                />
              </Section>

              <Section title="Discovery">
                <Field
                  label="First Seen"
                  value={formatTimestamp(agent.firstSeenAt)}
                />
                <Field
                  label="Last Provider Sync"
                  value={formatTimestamp(agent.lastSeenAt)}
                />
                <Field label="Sync Status" value={agent.syncStatus} />
                <Field label="IAM Role" value={agent.iamRoleArn ?? "—"} />
                <Field
                  label="External Agent ID"
                  value={agent.externalAgentId}
                />
              </Section>

              <RecordMetadata
                createdBy="Agent discovery"
                createdAt={agent.createdAt}
                updatedBy="Agent discovery"
                updatedAt={agent.updatedAt}
              />
              </TabsContent>
              <TabsContent
                value="observability"
                className="min-h-0 flex-1 overflow-y-auto p-5"
              >
                <ObservabilityStatus agent={agent} />
                <AgentObservabilityTab
                  tenant={tenant}
                  agentId={agent.id}
                  deployed={readProfile(agent.profile).deployed}
                />
              </TabsContent>
              <TabsContent value="violations" className="min-h-0 flex-1 overflow-y-auto p-5">
                {violationsOf(agent).length ? (
                  <div className="divide-y rounded-lg border">
                    {violationsOf(agent).map((v) => (
                      <div key={v.reason} className="space-y-1 px-3 py-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{v.policy}</span>
                          <Badge className="border-transparent bg-red-500/15 text-red-600 dark:text-red-400">
                            Violated
                          </Badge>
                        </div>
                        <p className="text-muted-foreground">{v.reason}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No policy violations: observability is set up and every model is approved in the Model Registry.
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
