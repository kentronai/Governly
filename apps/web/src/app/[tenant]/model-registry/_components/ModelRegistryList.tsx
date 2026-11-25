"use client";

import { errorToast } from "@/lib/utils/toast";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RowActionsMenu } from "@/components/common/RowActionsMenu";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Eye,
  Box,
  BookOpen,
} from "lucide-react";
import {
  createProviderModel,
  updateProviderModel,
  deleteProviderModel,
} from "@/lib/actions/provider-models";
import { ProviderModelModal } from "./ProviderModelModal";
import { DeleteConfirmationModal } from "@/components/common/DeleteConfirmationModal";
import { availabilityLabel, providerLabel } from "./labels";

interface ProviderModel {
  id: string;
  provider: string;
  modelId: string;
  displayName?: string | null;
  family?: string | null;
  modality?: string[] | null;
  contextWindowTokens?: number | null;
  maxOutputTokens?: number | null;
  inputCostPer1K?: string | null;
  outputCostPer1K?: string | null;
  availabilityStatus?: string | null;
  tenantId?: string | null;
  // Database fields
  modelUrl?: string | null;
  purposeUseCase?: string | null;
  riskLevel?: "Low" | "Medium" | "High" | "Critical" | "N/A" | null;
  category?: "llm" | "3rd_party" | "1st_party" | null;
  // Model artifact fields
  artifactMetadata?: any;
  detectedFormat?: string | null;
  approvalStatus?: string | null;
  isSelected?: boolean | null;
  connectionStatus?: "not_tested" | "testing" | "ready" | "error" | null;
  connectionErrorCode?: string | null;
  connectionMessage?: string | null;
  lastTestedAt?: string | null;
}

interface CreateProviderModelResponse {
  status: boolean;
  message: string;
  model?: ProviderModel;
}

interface Props {
  initialModels: ProviderModel[];
  tenant: string;
  tenantId: string;
  userId: string;
}
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import Pagination from "@/components/common/pagination";

export function ModelRegistryList({
  initialModels,
  tenant,
  tenantId,
  userId,
}: Props) {
  const router = useRouter();
  const [models, setModels] = useState(initialModels);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ProviderModel | null>(
    null,
  );

  const filteredModels = models.filter(
    (m) =>
      m.modelId.toLowerCase().includes(search.toLowerCase()) ||
      m.displayName?.toLowerCase().includes(search.toLowerCase()) ||
      m.provider.toLowerCase().includes(search.toLowerCase()),
  );
  const totalPages = Math.max(1, Math.ceil(filteredModels.length / pageSize));
  const current = Math.min(page, totalPages);
  const pageModels = filteredModels.slice((current - 1) * pageSize, current * pageSize);

  const getAvailabilityStatusColor = (status?: string | null) => {
    switch (status) {
      case "available":
        return "bg-green-500/10 text-green-500";
      case "preview":
        return "bg-yellow-500/10 text-yellow-500";
      case "deprecated":
        return "bg-red-500/10 text-red-500";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const formatCost = (cost?: string | null) => {
    if (!cost) return "N/A";
    const num = parseFloat(cost);
    return `$${num.toFixed(4)}`;
  };

  const getRiskLevelColor = (riskLevel?: string | null) => {
    switch (riskLevel?.toLowerCase()) {
      case "critical":
        return "bg-red-500/10 text-red-500";
      case "high":
        return "bg-orange-500/10 text-orange-500";
      case "medium":
        return "bg-yellow-500/10 text-yellow-500";
      case "low":
        return "bg-green-500/10 text-green-500";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const handleCreate = async (data: any) => {
    startTransition(async () => {
      try {
        const res = (await createProviderModel(
          data,
        )) as CreateProviderModelResponse;

        if (!res || !res.status) {
          toast.error(res?.message || "Failed to create model");
          return;
        }

        if (res.model) {
          setModels((prev) => [res.model!, ...prev]);
          toast.success("Model created successfully!");
          setIsModalOpen(false);
        } else {
          toast.error(res.message || "Failed to create model");
        }
      } catch (error: any) {
        toast.error(error.message || "Failed to create model");
      }
    });
  };

  const handleUpdate = async (data: any) => {
    if (!selectedModel) return;

    startTransition(async () => {
      try {
        const updated = await updateProviderModel(selectedModel.id, data);
        setModels((prev) =>
          prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
        );
        setIsModalOpen(false);
        setSelectedModel(null);
      } catch (error) {
        console.error("Failed to update model:", error);
        // Rethrowing inside a transition hits the error boundary; toast instead.
        errorToast(error instanceof Error ? error.message : "Failed to update model");
      }
    });
  };

  const handleDelete = async () => {
    if (!selectedModel) return;

    startTransition(async () => {
      try {
        await deleteProviderModel(selectedModel.id);
        setModels((prev) => prev.filter((m) => m.id !== selectedModel.id));
        setIsDeleteModalOpen(false);
        setSelectedModel(null);
      } catch (error) {
        console.error("Failed to delete model:", error);
        // Rethrowing inside a transition hits the error boundary; toast instead.
        errorToast(error instanceof Error ? error.message : "Failed to delete model");
      }
    });
  };

  const reportPath = (model: ProviderModel) =>
    `/${tenant}/model-registry/${model.id}/report`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Organization Approved Models"
        description="Browse and manage approved AI models for your organization"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/${tenant}/model-registry/catalog`}>
                <BookOpen className="h-4 w-4 mr-2" />
                Browse catalog
              </Link>
            </Button>
            <Button
              onClick={() => {
                setSelectedModel(null);
                setIsModalOpen(true);
              }}
              disabled={isPending}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Model
            </Button>
          </div>
        }
      />

      {/* Search */}
      <div className="relative w-[400px]">
        <Input
          type="search"
          placeholder="Search models by name, provider, or ID..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="pl-10"
        />
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 stroke-muted-foreground" />
      </div>
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>Total Models: {models.length}</span>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Model</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Risk Level</TableHead>
            <TableHead>Context Window</TableHead>
            <TableHead>Cost / 1K (in / out)</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredModels.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-12">
                {search
                  ? "No models found"
                  : "No models yet. Add one to get started!"}
              </TableCell>
            </TableRow>
          ) : (
            pageModels.map((model) => (
              <TableRow key={model.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <Link
                      href={reportPath(model)}
                      className="flex items-center gap-2 hover:text-blue-600 hover:underline"
                    >
                      <Box className="h-4 w-4 shrink-0" />
                      {model.displayName || model.modelId}
                    </Link>
                    {model.isSelected && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <CheckCircle2 className="h-3 w-3" />
                        Selected
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 pl-6 font-mono text-xs font-normal text-muted-foreground">
                    {model.modelId}
                  </p>
                </TableCell>
                <TableCell>{providerLabel(model.provider)}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={getAvailabilityStatusColor(
                      model.availabilityStatus,
                    )}
                  >
                    {availabilityLabel(model.availabilityStatus)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {model.riskLevel ? (
                    <Badge
                      variant="outline"
                      className={getRiskLevelColor(model.riskLevel)}
                    >
                      {model.riskLevel}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {model.contextWindowTokens
                    ? `${model.contextWindowTokens.toLocaleString("en-US")} tokens`
                    : "—"}
                </TableCell>
                <TableCell className="tabular-nums">
                  {model.inputCostPer1K || model.outputCostPer1K
                    ? `${formatCost(model.inputCostPer1K)} / ${formatCost(model.outputCostPer1K)}`
                    : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={model.tenantId ? "default" : "secondary"}>
                    {model.tenantId ? "Organization" : "Global"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <RowActionsMenu
                    label={`Actions for ${model.displayName || model.modelId}`}
                    items={[
                      { label: "View report", icon: Eye, disabled: isPending, onSelect: () => router.push(reportPath(model)) },
                      {
                        label: "Edit",
                        icon: Pencil,
                        disabled: isPending,
                        onSelect: () => {
                          setSelectedModel(model);
                          setIsModalOpen(true);
                        },
                      },
                      {
                        label: "Delete",
                        icon: Trash2,
                        destructive: true,
                        disabled: isPending,
                        onSelect: () => {
                          setSelectedModel(model);
                          setIsDeleteModalOpen(true);
                        },
                      },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {filteredModels.length > 0 && (
        <Pagination
          page={current}
          setPage={setPage}
          totalPages={totalPages}
          pageSize={pageSize}
          setPageSize={setPageSize}
        />
      )}


      {/* Modals */}
      <ProviderModelModal
        isOpen={isModalOpen}
        mode={selectedModel ? "edit" : "create"}
        model={selectedModel}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedModel(null);
        }}
        onSubmit={selectedModel ? handleUpdate : handleCreate}
        isPending={isPending}
        tenantId={tenantId}
      />

      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedModel(null);
        }}
        onConfirm={handleDelete}
        isLoading={isPending}
        title="Delete Provider Model"
        itemName={selectedModel?.displayName || selectedModel?.modelId || ""}
        itemType="model"
      />
    </div>
  );
}
