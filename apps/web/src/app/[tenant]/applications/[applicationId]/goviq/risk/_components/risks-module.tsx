"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Plus,
  MoreHorizontal,
  Pencil,
  Eye,
  Trash2,
  AlertTriangle,
  ChevronDown,
  Database,
  PenLine,
  Layers,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CompactMetricCard } from "@/components/agent-discovery/CompactMetricCard";
import {
  RiskCatalogPicker,
  CATALOG_SOURCES,
  type CatalogRisk,
  type CatalogSource,
} from "./RiskCatalogPicker";
import { RiskLinksDialog } from "./RiskLinksDialog";
import { getRiskLinkCounts } from "@/lib/actions/risk-links";
import { getRisksByApplication } from "@/lib/actions/risks";
import { createRisk, updateRisk, deleteRisk } from "@/lib/actions/risks";
import { RiskModal } from "./RiskModal";
import DynamicDetailsViewModal, {
  createFieldConfig,
} from "@/components/modal/DynamicDetailsViewModal";
import { DeleteConfirmationModal } from "@/components/common/DeleteConfirmationModal";
import { getFormattedDateString } from "@/lib/utils/helpers";
import { getUserNamesFromIds } from "@/lib/utils/userUtils";
import { successToast, errorToast } from "@/lib/utils/toast";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { isKentronEmail } from "@/lib/utils/validateEmail";


import { PageTitle } from "@/components/common/PageHeader";
// Display-only: "non_compliant" -> "Non compliant". Never use for stored values.
const toLabel = (v?: string | null) =>
  v ? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, " ") : "";
interface Risk {
  id: string;
  riskName: string;
  owner: string;
  description: string | null;
  severity: "Minor" | "Moderate" | "Major" | "Catastrophic";
  likelihood: "Rare" | "Unlikely" | "Possible" | "Likely";
  riskLevel: "Low" | "Medium" | "High" | "Critical";
  mitigationStatus:
    | "Not Started"
    | "In Progress"
    | "Requires Review"
    | "Completed";
  mitigationPlan: string | null;
  targetDate: string | null;
  lastReviewDate: string | null;
  categories: string[];
  createdAt: string;
  updatedAt: string;
  useCaseIds: string[];
  frameworkSlugs: string[];
  lifecyclePhase: string | null;
  potentialImpact: string | null;
  reviewNotes: string | null;
  implementationStrategy: string | null;
  residualSeverity: Risk["severity"] | null;
  residualLikelihood: Risk["likelihood"] | null;
  residualLevel: Risk["riskLevel"] | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdByUser?: {
    id: string;
    name: string;
    email: string;
  };
  updatedByUser?: {
    id: string;
    name: string;
    email: string;
  };
}

const LEVELS = ["Critical", "High", "Medium", "Low"] as const;
const LEVEL_TONE: Record<(typeof LEVELS)[number], string> = {
  Critical: "text-red-600",
  High: "text-orange-600",
  Medium: "text-yellow-600",
  Low: "text-green-600",
};
const SEVERITY_OPTIONS = ["Catastrophic", "Major", "Moderate", "Minor"];
const STATUS_OPTIONS = ["Not Started", "In Progress", "Requires Review", "Completed"];

interface RisksModuleProps {
  applicationId: string;
  tenantId: string;
  useCaseId?: string;
}

const getRiskLevelStyle = (level: string) => {
  switch (level) {
    case "Low":
      return "bg-green-500/10 text-green-500 ";
    case "Medium":
      return "bg-yellow-500/10 text-yellow-500";
    case "High":
      return "bg-orange-500/10 text-orange-600 ";
    case "Critical":
      return "bg-red-500/10 text-red-600 ";
    default:
      return "bg-gray-500/10 text-gray-500 ";
  }
};

const getStatusStyle = (status: string) => {
  switch (status) {
    case "Not Started":
      return "bg-muted text-muted-foreground";
    case "In Progress":
      return "bg-blue-500/10 text-blue-500";
    case "Requires Review":
      return "bg-orange-500/10 text-orange-500";
    case "Completed":
      return "bg-green-500/10 text-green-500 ";
    default:
      return "bg-muted text-muted-foreground";
  }
};

export default function RisksModule({
  applicationId,
  tenantId,
  useCaseId,
}: RisksModuleProps) {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const filtersActive =
    levelFilter !== "all" || severityFilter !== "all" || statusFilter !== "all";
  const [isPending, startTransition] = useTransition();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedRisk, setSelectedRisk] = useState<Risk | null>(null);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [isLoadingRisk, setIsLoadingRisk] = useState(false);
  const [catalogSource, setCatalogSource] = useState<CatalogSource | null>(null);
  const [prefill, setPrefill] = useState<Partial<Risk> | null>(null);
  const [prefillLabel, setPrefillLabel] = useState<string>();
  const [linkTarget, setLinkTarget] = useState<{
    risk: Risk;
    type: "control" | "policy";
  } | null>(null);
  const [linkCounts, setLinkCounts] = useState<
    Record<string, { control: number; policy: number }>
  >({});

  const router = useRouter();
  const pathname = usePathname();
  // IBM / MIT catalog import is for Kentron staff only for now (the server enforces it too).
  const { user } = useUser();
  const canImportCatalog = isKentronEmail(
    (user?.primaryEmailAddress?.emailAddress ?? "").toLowerCase(),
  );

  const fetchRisk = async () => {
    try {
      setIsLoadingRisk(true);
      const risk = await getRisksByApplication(
        tenantId,
        applicationId,
        useCaseId
      );
      setRisks(risk);
      setLinkCounts(
        await getRiskLinkCounts(tenantId, risk.map((r) => r.id)).catch(() => ({})),
      );
    } catch (err) {
    } finally {
      setIsLoadingRisk(false);
    }
  };

  useEffect(() => {
    fetchRisk();
  }, []);

  // Track previous high risk state to prevent infinite loops
  const previousHighRiskRef = useRef<boolean | null>(null);

  useEffect(() => {
    const hasHighRisk = risks.some((risk) => risk.riskLevel === "High");
    // Only call onHighRiskChange if the value actually changed
    if (previousHighRiskRef.current !== hasHighRisk) {
      previousHighRiskRef.current = hasHighRisk;
      // onHighRiskChange(hasHighRisk);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [risks]);

  // Fetch user names when risks change
  useEffect(() => {
    const fetchUserNames = async () => {
      const allUserIds: string[] = [];

      // Collect all unique user IDs
      risks.forEach((risk) => {
        if (risk.owner) allUserIds.push(risk.owner);
        if (risk.createdBy) allUserIds.push(risk.createdBy);
        if (risk.updatedBy) allUserIds.push(risk.updatedBy);
      });

      const uniqueUserIds = [...new Set(allUserIds)];

      if (uniqueUserIds.length > 0) {
        const names = await getUserNamesFromIds(uniqueUserIds, tenantId);
        setUserNames(names);
      }
    };

    if (risks.length > 0) {
      fetchUserNames();
    }
  }, [risks, tenantId]);

  // Filter risks based on search
  const filteredRisks = risks.filter((risk) => {
    if (levelFilter !== "all" && risk.riskLevel !== levelFilter) return false;
    if (severityFilter !== "all" && risk.severity !== severityFilter) return false;
    if (statusFilter !== "all" && risk.mitigationStatus !== statusFilter) return false;
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      risk.riskName.toLowerCase().includes(searchLower) ||
      risk.description?.toLowerCase().includes(searchLower) ||
      risk.owner.toLowerCase().includes(searchLower) ||
      userNames[risk.owner]?.toLowerCase().includes(searchLower)
    );
  });

  const handleCreate = async (
    data: Partial<Risk> & {
      riskName: string;
      owner: string;
      severity: Risk["severity"];
      likelihood: Risk["likelihood"];
      riskLevel: Risk["riskLevel"];
      mitigationStatus: Risk["mitigationStatus"];
    }
  ) => {
    startTransition(async () => {
      try {
        const riskData = {
          tenantId,
          applicationId,
          useCaseId,
          riskName: data.riskName,
          description: data.description ?? "",
          owner: data.owner,
          severity: data.severity,
          likelihood: data.likelihood,
          riskLevel: data.riskLevel,
          mitigationStatus: data.mitigationStatus,
          mitigationPlan: data.mitigationPlan,
          targetDate: data.targetDate,
          categories: data.categories || [],
          useCaseIds: data.useCaseIds ?? [],
          frameworkSlugs: data.frameworkSlugs ?? [],
          lifecyclePhase: data.lifecyclePhase ?? null,
          potentialImpact: data.potentialImpact || null,
          reviewNotes: data.reviewNotes || null,
          implementationStrategy: data.implementationStrategy || null,
          residualSeverity: data.residualSeverity ?? null,
          residualLikelihood: data.residualLikelihood ?? null,
        };
        // @ts-ignore
        const newRisk = await createRisk(riskData);
        const normalizedRisk = {
          ...newRisk,
          description: newRisk.description ?? undefined,
          mitigationPlan: newRisk.mitigationPlan ?? undefined,
          targetDate: newRisk.targetDate ?? undefined,
          lastReviewDate: newRisk.lastReviewDate ?? undefined,
          riskLevel: newRisk.riskLevel,
        };
        setRisks((prev) => [normalizedRisk as Risk, ...prev]);
        setIsCreateModalOpen(false);
        successToast("", "", "", "Risk created successfully");
        await fetchRisk();
      } catch (error) {
        errorToast("Failed to create risk");
      }
    });
  };

  const handleUpdate = async (
    data: Partial<Risk> & {
      riskName: string;
      owner: string;
      severity: Risk["severity"];
      likelihood: Risk["likelihood"];
      riskLevel: Risk["riskLevel"];
      mitigationStatus: Risk["mitigationStatus"];
    }
  ) => {
    if (!selectedRisk) return;

    startTransition(async () => {
      try {
        const riskData = {
          id: selectedRisk.id,
          tenantId,
          applicationId,
          useCaseId,
          riskName: data.riskName,
          description: data.description,
          owner: data.owner,
          severity: data.severity,
          likelihood: data.likelihood,
          riskLevel: data.riskLevel,
          mitigationStatus: data.mitigationStatus,
          mitigationPlan: data.mitigationPlan,
          targetDate: data.targetDate,
          categories: data.categories || [],
          useCaseIds: data.useCaseIds ?? [],
          frameworkSlugs: data.frameworkSlugs ?? [],
          lifecyclePhase: data.lifecyclePhase ?? null,
          potentialImpact: data.potentialImpact || null,
          reviewNotes: data.reviewNotes || null,
          implementationStrategy: data.implementationStrategy || null,
          residualSeverity: data.residualSeverity ?? null,
          residualLikelihood: data.residualLikelihood ?? null,
        };
        // @ts-ignore
        const updated = await updateRisk(riskData);
        const normalizedRisk = {
          ...updated,
          description: updated.description ?? undefined,
          mitigationPlan: updated.mitigationPlan ?? undefined,
          targetDate: updated.targetDate ?? undefined,
          lastReviewDate: updated.lastReviewDate ?? undefined,
          riskLevel: updated.riskLevel,
        };
        setRisks((prev) =>
          prev.map((risk) =>
            risk.id === updated.id ? (normalizedRisk as Risk) : risk
          )
        );
        setIsEditModalOpen(false);
        setSelectedRisk(null);
        successToast("", "", "", "Risk updated successfully");
        await fetchRisk();
      } catch (error) {
        errorToast("Failed to update risk");
      }
    });
  };

  const handleDelete = async () => {
    if (!selectedRisk) return;

    startTransition(async () => {
      try {
        await deleteRisk(selectedRisk.id);
        setRisks((prev) => prev.filter((risk) => risk.id !== selectedRisk.id));
        setIsDeleteModalOpen(false);
        setSelectedRisk(null);
        successToast("", "", "", "Risk deleted successfully");
        await fetchRisk();
      } catch (error) {
        errorToast("Failed to delete risk");
      }
    });
  };

  const openCustom = () => {
    setPrefill(null);
    setPrefillLabel(undefined);
    setIsCreateModalOpen(true);
  };

  const pickFromCatalog = (r: CatalogRisk) => {
    const source = catalogSource!;
    setCatalogSource(null);
    setPrefill({
      riskName: r.riskName,
      description: r.description ?? "",
      severity: (r.severity ?? undefined) as Risk["severity"],
      likelihood: (r.likelihood ?? undefined) as Risk["likelihood"],
      categories: (r.category ?? []).filter(Boolean),
      reviewNotes: [
        `Imported from the ${CATALOG_SOURCES[source].title}, #${r.catalogNo} (source reference ${r.sourceId}).`,
        r.category?.filter(Boolean).length
          ? `Category: ${r.category.filter(Boolean).join("; ")}.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    });
    setPrefillLabel(`From ${CATALOG_SOURCES[source].title}, #${r.catalogNo}`);
    setIsCreateModalOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-start">
        <PageTitle className="mb-6">Risks</PageTitle>
        {!canImportCatalog ? (
          <Button disabled={isPending} onClick={openCustom}>
            <Plus className="h-4 w-4 mr-2" />
            Create Risk
          </Button>
        ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button disabled={isPending}>
              <Plus className="h-4 w-4 mr-2" />
              Create Risk
              <ChevronDown className="h-4 w-4 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuItem onClick={openCustom} className="items-start gap-3 py-2">
              <PenLine className="mt-0.5 h-4 w-4" />
              <div>
                <p className="font-medium">Add custom risk</p>
                <p className="text-xs text-muted-foreground">Create a risk manually</p>
              </div>
            </DropdownMenuItem>
            {(["ibm", "mit"] as const).map((src) => (
              <DropdownMenuItem
                key={src}
                onClick={() => setCatalogSource(src)}
                className="items-start gap-3 py-2"
              >
                <Database className="mt-0.5 h-4 w-4" />
                <div>
                  <p className="font-medium">Import from {CATALOG_SOURCES[src].title}</p>
                  <p className="text-xs text-muted-foreground">
                    {src === "ibm"
                      ? "Generative and agentic AI risks: privacy, prompt attacks, governance"
                      : "Research-based risks: safety, fairness, misuse, societal impact"}
                  </p>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        )}
      </div>

      {/* Summary: click a level to filter by it */}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => setLevelFilter("all")} className="rounded-xl text-left">
          <CompactMetricCard
            label="Total"
            value={risks.length}
            icon={Layers}
            loading={isLoadingRisk}
            className={levelFilter === "all" ? "ring-2 ring-primary" : undefined}
          />
        </button>
        {LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => setLevelFilter(levelFilter === level ? "all" : level)}
            className="rounded-xl text-left"
          >
            <CompactMetricCard
              label={level}
              value={risks.filter((r) => r.riskLevel === level).length}
              icon={level === "Low" ? ShieldCheck : ShieldAlert}
              tone={LEVEL_TONE[level]}
              loading={isLoadingRisk}
              className={levelFilter === level ? "ring-2 ring-primary" : undefined}
            />
          </button>
        ))}
      </div>

      {/* Search and filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-[343px]">
          <Input
            type="search"
            placeholder="Search risks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        </div>
        {(
          [
            ["Risk level", levelFilter, setLevelFilter, [...LEVELS]],
            ["Severity", severityFilter, setSeverityFilter, SEVERITY_OPTIONS],
            ["Status", statusFilter, setStatusFilter, STATUS_OPTIONS],
          ] as const
        ).map(([label, value, set, options]) => (
          <Select key={label} value={value} onValueChange={set}>
            <SelectTrigger className="w-[170px]" aria-label={label}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All {label.toLowerCase()}s</SelectItem>
              {options.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setLevelFilter("all");
              setSeverityFilter("all");
              setStatusFilter("all");
            }}
          >
            <X className="mr-1 h-4 w-4" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Risk Name</TableHead>
            <TableHead>Risk Level</TableHead>
            <TableHead>Residual</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Likelihood</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Controls</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoadingRisk && filteredRisks.length === 0 && (
            <>
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center py-12 text-muted-foreground"
                >
                  Loading Risk...
                </TableCell>
              </TableRow>
            </>
          )}
          {!isLoadingRisk && filteredRisks.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={9}
                className="text-center py-12 text-muted-foreground"
              >
                {search || filtersActive
                  ? "No risks match your search or filters"
                  : "No risks yet. Create one to get started!"}
              </TableCell>
            </TableRow>
          ) : (
            filteredRisks.map((risk) => (
              <TableRow key={risk.id} className="">
                <TableCell className="max-w-[280px] font-medium">
                  <div className="flex items-center gap-2" title={risk.riskName}>
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                    <span className="truncate">{risk.riskName}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div
                    className={`inline-flex items-center rounded-full border  px-2.5 py-0.5 text-xs font-semibold ${getRiskLevelStyle(risk.riskLevel)}`}
                  >
                    {toLabel(risk.riskLevel)}
                  </div>
                </TableCell>
                <TableCell>
                  {risk.residualLevel ? (
                    <div
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getRiskLevelStyle(risk.residualLevel)}`}
                    >
                      {toLabel(risk.residualLevel)}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not scored</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className="bg-orange-500/10 text-orange-500"
                  >
                    {toLabel(risk.severity)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className="bg-blue-500/10 text-blue-500"
                  >
                    {toLabel(risk.likelihood)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getStatusStyle(risk.mitigationStatus)}`}
                  >
                    {toLabel(risk.mitigationStatus)}
                  </div>
                </TableCell>
                <TableCell>
                  {userNames[risk.owner] || risk.owner}
                </TableCell>
                <TableCell>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    onClick={() => setLinkTarget({ risk, type: "control" })}
                  >
                    View controls ({linkCounts[risk.id]?.control ?? 0})
                  </Button>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          router.push(`${pathname}/${risk.id}`);
                        }}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        View
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setSelectedRisk(risk);
                          setIsEditModalOpen(true);
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      {/* ponytail: "Linked policies" hidden for now; RiskLinksDialog type="policy" still works. */}
                      <DropdownMenuItem
                        onClick={() => {
                          setSelectedRisk(risk);
                          setIsDeleteModalOpen(true);
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Modals */}
      <RiskModal
        isOpen={isCreateModalOpen}
        mode="create"
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreate}
        isPending={isPending}
        tenantId={tenantId}
        applicationId={applicationId}
        initial={prefill}
        sourceLabel={prefillLabel}
      />

      <RiskCatalogPicker
        source={catalogSource}
        onClose={() => setCatalogSource(null)}
        onPick={pickFromCatalog}
      />

      <RiskLinksDialog
        tenant={tenantId}
        risk={linkTarget?.risk ?? null}
        type={linkTarget?.type ?? "control"}
        onClose={() => setLinkTarget(null)}
        onChanged={fetchRisk}
      />

      <DynamicDetailsViewModal
        isOpen={isViewModalOpen}
        onClose={() => {
          setIsViewModalOpen(false);
          setSelectedRisk(null);
        }}
        data={
          selectedRisk
            ? {
                ...selectedRisk,
                userNames, // Pass userNames mapping to modal
              }
            : null
        }
        title="Risk Details"
        fields={createFieldConfig.risk()}
      />

      <RiskModal
        isOpen={isEditModalOpen}
        mode="edit"
        risk={selectedRisk}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedRisk(null);
        }}
        onSubmit={handleUpdate}
        isPending={isPending}
        tenantId={tenantId}
        applicationId={applicationId}
      />

      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedRisk(null);
        }}
        onConfirm={handleDelete}
        isLoading={isPending}
        title="Are you sure you want to delete this risk?"
        itemName={selectedRisk?.riskName || ""}
        itemType="risk"
      />
    </div>
  );
}
