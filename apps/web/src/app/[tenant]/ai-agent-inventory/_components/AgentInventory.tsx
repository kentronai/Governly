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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import Pagination from "@/components/common/pagination";
import { CompactMetricCard } from "@/components/agent-discovery/CompactMetricCard";
import {
  Search,
  RefreshCw,
  LayoutDashboard,
  Bot,
  UserX,
  ShieldOff,
  BadgeX,
} from "lucide-react";
import {
  fetchAgents,
  fetchAgentDetail,
  fetchAgentInventorySummary,
  assignAgentToApplication,
} from "@/lib/actions/agents";
import { refreshAgentInventory } from "@/lib/actions/agent-inventory-refresh";
import type {
  AgentInventoryInitialData,
  AgentInventorySummary,
} from "@/lib/queries/agents";

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

const COMPLIANCE_STYLES: Record<string, string> = {
  compliant: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  partially_compliant: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  non_compliant: "bg-red-500/15 text-red-600 dark:text-red-400",
  not_applicable: "bg-muted text-muted-foreground",
  not_evaluated: "bg-muted text-muted-foreground",
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
  const [pageSize, setPageSize] = useState(25);
  const [isLoading, setIsLoading] = useState(false);
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

  const load = useCallback(async () => {
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
        page,
        pageSize,
      });
      setRows(result.rows);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } finally {
      setIsLoading(false);
    }
  }, [
    tenant,
    search,
    riskLevel,
    autonomyLevel,
    status,
    platform,
    ownerFilter,
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
    // Re-run discovery across every connected provider (real-time), then reload
    // the inventory and summary so the whole view reflects fresh data.
    setIsLoading(true);
    try {
      await refreshAgentInventory(tenant);
    } catch {
      // Fall through to a plain reload even if a provider scan failed.
    }
    await Promise.all([load(), loadSummary()]);
  }, [tenant, load, loadSummary]);

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
    [search, riskLevel, autonomyLevel, status, platform, ownerFilter],
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
      [riskLevel, autonomyLevel, status, platform, ownerFilter].some(
        (f) => f !== ALL,
      ),
    [search, riskLevel, autonomyLevel, status, platform, ownerFilter],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Agent Registry</h1>
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
            disabled={isLoading || isSummaryLoading}
          >
            <RefreshCw
              className={cn(
                "h-4 w-4 mr-1.5",
                (isLoading || isSummaryLoading) && "animate-spin",
              )}
            />{" "}
            Refresh
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
          label="Unowned Agents"
          value={summary?.unownedAgents}
          icon={UserX}
          loading={isSummaryLoading}
          tone="text-orange-600 dark:text-orange-400"
          description="Agents with no provider owner evidence mapped to a NORIX user."
        />
        <SummaryCard
          label="Non-Compliant Agents"
          value={summary?.nonCompliantAgents}
          icon={BadgeX}
          loading={isSummaryLoading}
          tone="text-red-600 dark:text-red-400"
          description="Agents with an active compliance policy evaluation marked non-compliant."
        />
        <SummaryCard
          label="Missing Runtime Evidence"
          value={summary?.agentsWithoutRuntimeEvidence}
          icon={ShieldOff}
          loading={isSummaryLoading}
          tone="text-amber-600 dark:text-amber-400"
          description="Agents whose configured runtime policy has not been fully observed executing through ControlNet."
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
              label="Risk"
              value={riskLevel}
              onChange={setRiskLevel}
              options={options.riskLevels}
            />
            <FilterSelect
              label="Autonomy"
              value={autonomyLevel}
              onChange={setAutonomyLevel}
              options={options.autonomyLevels}
            />
            <FilterSelect
              label="Status"
              value={status}
              onChange={setStatus}
              options={options.statuses}
            />
            <FilterSelect
              label="Platform"
              value={platform}
              onChange={setPlatform}
              options={options.platforms}
              formatOption={platformLabel}
            />
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs">
                <SelectValue placeholder="Owner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Owner: All</SelectItem>
                <SelectItem value={UNOWNED}>Unowned</SelectItem>
              </SelectContent>
            </Select>
          </>
        ) : (
          <div className="h-8 w-full max-w-[720px] rounded-md border bg-muted/10" />
        )}
        {mounted && hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setRiskLevel(ALL);
              setAutonomyLevel(ALL);
              setStatus(ALL);
              setPlatform(ALL);
              setOwnerFilter(ALL);
            }}
          >
            Clear filters
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
            <TableHead>Platform</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Function</TableHead>
            <TableHead>Autonomy</TableHead>
            <TableHead>Risk</TableHead>
            <TableHead>Compliance</TableHead>
            <TableHead>Open Gaps</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Region / Account</TableHead>
            <TableHead>Last Active</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={11}
                className="text-center py-10 text-muted-foreground"
              >
                {isLoading
                  ? "Loading agents…"
                  : "No agents discovered yet. Connect AWS, Azure, Google Cloud, Databricks, or CrewAI in Admin → Integrations."}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer"
                onClick={() => setActiveAgentId(r.id)}
              >
                <TableCell className="font-medium max-w-[220px] truncate">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
                    {r.name}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {platformLabel(r.platform)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <div className="space-y-0.5">
                    <div>{ownerDisplay(r.ownerName)}</div>
                    {!r.ownerName ? (
                      <div className="text-[11px] text-muted-foreground">
                        no provider owner match
                      </div>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {functionDisplay(r.businessFunction)}
                </TableCell>
                <TableCell>
                  {autonomyLevelDisplay(r) ? (
                    <Badge
                      className={cn(
                        "border-transparent",
                        AUTONOMY_STYLES[autonomyLevelDisplay(r)!],
                      )}
                    >
                      {autonomyLevelDisplay(r)}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  {r.riskLevel ? (
                    <Badge
                      className={cn(
                        "border-transparent",
                        RISK_STYLES[r.riskLevel],
                      )}
                    >
                      {r.riskLevel} · {Number(r.riskScore ?? 0)}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  {r.complianceStatus ? (
                    <div className="space-y-1">
                      <Badge
                        className={cn(
                          "border-transparent capitalize",
                          COMPLIANCE_STYLES[r.complianceStatus] ??
                            COMPLIANCE_STYLES.not_evaluated,
                        )}
                      >
                        {r.complianceStatus.replaceAll("_", " ")}
                      </Badge>
                      <p
                        className="max-w-[150px] truncate text-[11px] text-muted-foreground"
                        title={r.compliancePolicyName ?? undefined}
                      >
                        {r.compliancePolicyName} ·{" "}
                        {Number(r.complianceCoverage ?? 0).toFixed(0)}%
                      </p>
                    </div>
                  ) : (
                    <Badge
                      className={cn(
                        "border-transparent",
                        COMPLIANCE_STYLES.not_evaluated,
                      )}
                    >
                      Not evaluated
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    className={cn(
                      "border-transparent tabular-nums",
                      Number(r.openFindingCount) > 0
                        ? "bg-red-500/15 text-red-600 dark:text-red-400"
                        : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    {Number(r.openFindingCount)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    className={cn(
                      "border-transparent",
                      STATUS_STYLES[r.status],
                    )}
                  >
                    {r.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {r.region} · {r.accountId}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {mounted ? relativeFromNow(r.lastSeenAt) : "—"}
                </TableCell>
              </TableRow>
            ))
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
        applications={applicationOptions}
        onAssignApplication={async (applicationId) => {
          if (!activeAgent) return;
          const refreshed = await assignAgentToApplication(
            tenant,
            activeAgent.id,
            applicationId,
          );
          setActiveAgent(refreshed);
          await refreshAll();
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
    <div className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-medium text-right",
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
  applications,
  onAssignApplication,
  onOpenChange,
}: {
  agent: any | null;
  applications: Array<{ id: string; name: string }>;
  onAssignApplication: (applicationId: string | null) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}) {
  const [assigning, setAssigning] = useState(false);
  return (
    <Dialog open={!!agent} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-3xl"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        {agent && (
          <div className="flex max-h-[90vh] flex-col">
            <DialogHeader className="shrink-0 border-b p-5 pr-12">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-xl">{agent.name}</DialogTitle>
                {agent.riskLevel && (
                  <Badge
                    className={cn(
                      "border-transparent",
                      RISK_STYLES[agent.riskLevel],
                    )}
                  >
                    {agent.riskLevel} risk
                  </Badge>
                )}
                {autonomyLevelDisplay(agent) && (
                  <Badge
                    className={cn(
                      "border-transparent",
                      AUTONOMY_STYLES[autonomyLevelDisplay(agent)!],
                    )}
                  >
                    {autonomyLevelDisplay(agent)}
                  </Badge>
                )}
              </div>
              <DialogDescription>
                {platformLabel(agent.platform)} · {agent.region} · Account{" "}
                {agent.accountId}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 overflow-y-auto p-5">
              <Section title="Ownership">
                <Field
                  label="Owner"
                  value={
                    agent.owner
                      ? `${agent.owner.name}${agent.owner.email ? ` · ${agent.owner.email}` : ""}`
                      : "Unowned · no provider owner match"
                  }
                  warn={!agent.owner}
                />
                <Field
                  label="Owner Evidence"
                  value={
                    agent.ownerSource ??
                    "No owner evidence matched a NORIX user"
                  }
                  warn={!agent.ownerSource}
                />
                <Field
                  label="Function"
                  value={agent.businessFunction ?? "Not provided by provider"}
                  warn={!agent.businessFunction}
                />
                <div className="px-3 py-2 space-y-1.5">
                  <span className="text-xs text-muted-foreground">
                    Governed Application
                  </span>
                  <Select
                    value={agent.application?.id ?? "__unlinked__"}
                    disabled={assigning}
                    onValueChange={async (value) => {
                      setAssigning(true);
                      try {
                        await onAssignApplication(
                          value === "__unlinked__" ? null : value,
                        );
                      } finally {
                        setAssigning(false);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unlinked__">
                        Unlinked — tenant policies only
                      </SelectItem>
                      {applications.map((application) => (
                        <SelectItem key={application.id} value={application.id}>
                          {application.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Linking applies the application's default runtime policy;
                    tenant compliance policies apply either way.
                  </p>
                </div>
              </Section>

              <Section title="Real Provider Evidence">
                <Field
                  label="Provider Agent ID"
                  value={agent.externalAgentId ?? "—"}
                />
                <Field
                  label="Discovery Source"
                  value={(
                    agent.rawMetadata?.evidenceSource ??
                    agent.discoverySource ??
                    "—"
                  ).replaceAll("_", " ")}
                />
                <Field
                  label="Model"
                  value={
                    agent.model ??
                    agent.rawMetadata?.providerEvidence?.modelId ??
                    "Not exposed by provider"
                  }
                  warn={
                    !agent.model &&
                    !agent.rawMetadata?.providerEvidence?.modelId
                  }
                />
                <Field
                  label="IAM / Managed Identity"
                  value={
                    agent.iamRoleArn ??
                    agent.rawMetadata?.providerEvidence?.roleArn ??
                    "Not exposed by provider"
                  }
                  warn={
                    !agent.iamRoleArn &&
                    !agent.rawMetadata?.providerEvidence?.roleArn
                  }
                />
                <Field
                  label="Provider Status"
                  value={
                    agent.rawMetadata?.providerEvidence?.status ??
                    agent.status ??
                    "—"
                  }
                />
                <Field
                  label="Provider Version"
                  value={String(
                    agent.rawMetadata?.providerEvidence?.version ?? "—",
                  )}
                />
                <Field
                  label="First Discovered"
                  value={formatTimestamp(agent.firstSeenAt)}
                />
                <Field
                  label="Last Provider Sync"
                  value={formatTimestamp(agent.lastSeenAt)}
                />
              </Section>

              <Section title="Policy Coverage">
                {agent.policyEvaluations?.length ? (
                  agent.policyEvaluations.map((evaluation: any) => (
                    <div
                      key={evaluation.id}
                      className="px-3 py-2 text-sm space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {evaluation.policyName}
                        </span>
                        <Badge variant="outline">
                          {evaluation.complianceStatus.replaceAll("_", " ")}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {evaluation.policyType} ·{" "}
                        {evaluation.assignmentSource.replaceAll("_", " ")} ·{" "}
                        {Number(evaluation.coverageScore)}% evidence coverage
                      </p>
                      {evaluation.evaluation?.summary && (
                        <p className="text-xs">
                          {evaluation.evaluation.summary}
                        </p>
                      )}
                      {Array.isArray(evaluation.gaps) &&
                        evaluation.gaps.length > 0 && (
                          <div className="mt-2 space-y-2 border-t pt-2">
                            <p className="text-xs font-semibold text-red-600">
                              {evaluation.gaps.length} missing control(s)
                            </p>
                            {evaluation.gaps.map((gap: any) => (
                              <div
                                key={gap.key}
                                className="rounded-md bg-red-500/5 p-2 text-xs"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className="font-medium">
                                    {gap.title}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] capitalize"
                                  >
                                    {gap.priority ?? "medium"}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-muted-foreground">
                                  {gap.reason}
                                </p>
                                {Array.isArray(gap.requiredEvidence) &&
                                  gap.requiredEvidence.length > 0 && (
                                    <p className="mt-1 text-muted-foreground">
                                      Evidence needed:{" "}
                                      {gap.requiredEvidence.join("; ")}
                                    </p>
                                  )}
                              </div>
                            ))}
                          </div>
                        )}
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-3 text-sm text-muted-foreground">
                    No effective policies have been evaluated for this agent.
                  </div>
                )}
              </Section>

              <Section title="Open Breaches & Gaps">
                {agent.policyFindings?.length ? (
                  agent.policyFindings.map((finding: any) => (
                    <div
                      key={finding.id}
                      className="px-3 py-2 text-sm space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{finding.title}</span>
                        <Badge
                          className={cn(
                            "border-transparent",
                            RISK_STYLES[
                              finding.severity?.[0]?.toUpperCase() +
                                finding.severity?.slice(1)
                            ] ?? "bg-red-500/10 text-red-600",
                          )}
                        >
                          {finding.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {finding.description}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {finding.source.replaceAll("_", " ")} · seen{" "}
                        {finding.occurrenceCount} time(s) ·{" "}
                        {formatTimestamp(finding.lastDetectedAt)}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-3 text-sm text-muted-foreground">
                    No open policy findings.
                  </div>
                )}
              </Section>

              <Section title="Autonomy">
                <Field
                  label="Level"
                  value={autonomyLevelDisplay(agent) ?? "—"}
                />
                <Field
                  label="Confidence"
                  value={
                    agent.autonomyConfidence
                      ? `${Math.round(Number(agent.autonomyConfidence) * 100)}%`
                      : "—"
                  }
                />
                <Field label="Reason" value={autonomyReasonDisplay(agent)} />
              </Section>

              <Section title="Risk">
                <Field
                  label="Score"
                  value={
                    agent.riskScore != null
                      ? `${Number(agent.riskScore)} / 100`
                      : "—"
                  }
                  warn={Number(agent.riskScore) >= 50}
                />
                <Field label="Level" value={agent.riskLevel ?? "—"} />
              </Section>
              {Array.isArray(agent.riskFactors) &&
                agent.riskFactors.length > 0 && (
                  <div className="rounded-lg border divide-y">
                    {agent.riskFactors.map((f: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-center justify-between px-3 py-2 text-sm"
                      >
                        <span className="text-muted-foreground">
                          {f.description}
                        </span>
                        <span className="font-medium tabular-nums">
                          +{f.points}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

              <Section title="Discovered Resources">
                <Field
                  label="Total"
                  value={String(agent.agentResources?.length ?? 0)}
                />
              </Section>
              {agent.agentResources?.length > 0 && (
                <div className="rounded-lg border divide-y">
                  {agent.agentResources.map((r: any) => (
                    <div key={r.id} className="px-3 py-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">
                          {r.resourceType.replaceAll("_", " ")}
                        </span>
                        <span
                          className="font-medium truncate max-w-[300px]"
                          title={r.resourceName ?? r.resourceArn}
                        >
                          {r.resourceName ?? r.resourceArn}
                        </span>
                      </div>
                      {r.resourceArn && (
                        <p className="mt-1 break-all text-[11px] text-muted-foreground">
                          {r.resourceArn}
                        </p>
                      )}
                      {r.rawData && Object.keys(r.rawData).length > 0 && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs font-medium text-primary">
                            View collected provider metadata
                          </summary>
                          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 text-[11px] leading-relaxed">
                            {JSON.stringify(r.rawData, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {agent.agentRecommendations?.length > 0 && (
                <Section title="Recommendations">
                  {agent.agentRecommendations.map((rec: any) => (
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

              <Section title="Discovery">
                <Field
                  label="First Seen"
                  value={formatTimestamp(agent.firstSeenAt)}
                />
                <Field
                  label="Last Active"
                  value={formatTimestamp(agent.lastSeenAt)}
                />
                <Field label="Sync Status" value={agent.syncStatus} />
                <Field label="IAM Role" value={agent.iamRoleArn ?? "—"} />
                <Field
                  label="External Agent ID"
                  value={agent.externalAgentId}
                />
                <Field
                  label="Model"
                  value={agent.model ?? "Not returned by provider"}
                />
                <Field
                  label="Knowledge Base"
                  value={agent.knowledgeBaseId ?? "—"}
                />
              </Section>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Normalized Capability Evidence
                </h3>
                <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/30 p-3 text-xs whitespace-pre-wrap break-words">
                  {JSON.stringify(agent.capabilities ?? {}, null, 2)}
                </pre>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Provider Metadata & Provenance
                </h3>
                <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/30 p-3 text-xs whitespace-pre-wrap break-words">
                  {JSON.stringify(agent.rawMetadata ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
