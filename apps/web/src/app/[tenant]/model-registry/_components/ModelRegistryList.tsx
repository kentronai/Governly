"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  CircleAlert,
  Loader2,
  PlugZap,
} from "lucide-react";
import {
  createProviderModel,
  updateProviderModel,
  deleteProviderModel,
} from "@/lib/actions/provider-models";
import { ProviderModelModal } from "./ProviderModelModal";
import { DeleteConfirmationModal } from "@/components/common/DeleteConfirmationModal";
import { LocalTime } from "@/components/common/LocalTime";
import { ModelScanResultsModal } from "./ModelScanResultsModal";
import {
  selectModelForTenant,
  testModelConnection,
} from "@/lib/actions/model-registry-runtime";

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

export function ModelRegistryList({
  initialModels,
  tenant,
  tenantId,
  userId,
}: Props) {
  const router = useRouter();
  const [models, setModels] = useState(initialModels);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<ProviderModel | null>(
    null,
  );

  const filteredModels = models.filter(
    (m) =>
      m.modelId.toLowerCase().includes(search.toLowerCase()) ||
      m.displayName?.toLowerCase().includes(search.toLowerCase()) ||
      m.provider.toLowerCase().includes(search.toLowerCase()),
  );

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

  const getStatusColor = (status?: string | null) => {
    switch (status?.toLowerCase()) {
      case "active":
        return "bg-green-500/10 text-green-500";
      case "inactive":
        return "bg-muted text-muted-foreground";
      case "deprecated":
        return "bg-red-500/10 text-red-500";
      default:
        return "bg-blue-500/10 text-blue-500";
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
        } else {
          toast.error(res.message || "Failed to create model");
        }
      } catch (error: any) {
        toast.error(error.message || "Failed to create model");
      } finally {
        setIsModalOpen(false);
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
        throw error;
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
        throw error;
      }
    });
  };

  const handleModelClick = (model: ProviderModel) => {
    const routePath = `/${tenant}/model-registry/${model.id}/report`;
    router.push(routePath);
  };

  const handleSelectForPlayground = async (model: ProviderModel) => {
    startTransition(async () => {
      try {
        await selectModelForTenant(model.id);
        setModels((current) =>
          current.map((item) => ({
            ...item,
            isSelected: item.id === model.id,
          })),
        );
        toast.success(`${model.displayName || model.modelId} is now selected.`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to select model.",
        );
      }
    });
  };

  const handleTestConnection = async (model: ProviderModel) => {
    setTestingModelId(model.id);
    setModels((current) =>
      current.map((item) =>
        item.id === model.id ? { ...item, connectionStatus: "testing" } : item,
      ),
    );

    try {
      const result = await testModelConnection(model.id);
      setModels((current) =>
        current.map((item) =>
          item.id === model.id
            ? {
                ...item,
                connectionStatus: result.status,
                connectionErrorCode: result.code,
                connectionMessage: result.message,
                lastTestedAt: result.lastTestedAt,
              }
            : item,
        ),
      );
      if (result.status === "ready") {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Connection test failed.";
      setModels((current) =>
        current.map((item) =>
          item.id === model.id
            ? {
                ...item,
                connectionStatus: "error",
                connectionMessage: message,
              }
            : item,
        ),
      );
      toast.error(message);
    } finally {
      setTestingModelId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold ">Organization Approved Models</h1>
          <p className="text-muted-foreground">
            Browse and manage approved AI models for your organization
          </p>
        </div>
        <Button
          onClick={() => {
            setSelectedModel(null);
            setIsModalOpen(true);
          }}
          className=""
          disabled={isPending}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Model
        </Button>
      </div>

      {/* Search */}
      <div className="relative w-[400px]">
        <Input
          type="search"
          placeholder="Search models by name, provider, or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 stroke-muted-foreground" />
      </div>
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>Total Models: {models.length}</span>
        {/* <span>•</span> */}
        {/* <span>Organization: {models.filter((m) => m.tenantId).length}</span>
        <span>•</span>
        <span>Global: {models.filter((m) => !m.tenantId).length}</span> */}
      </div>

      {/* Models Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredModels.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="py-12">
              <p className="text-center text-muted-foreground">
                {search
                  ? "No models found"
                  : "No models yet. Add one to get started!"}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredModels.map((model) => (
            <Card key={model.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle
                      className="text-lg cursor-pointer hover:text-blue-600 transition-colors"
                      onClick={() => handleModelClick(model)}
                    >
                      {model.displayName || model.modelId}
                    </CardTitle>
                    <div className="mt-1 space-y-0.5">
                      <p className="text-xs text-muted-foreground">
                        Model ID:{" "}
                        <span className="font-mono bg-muted px-1.5 py-0.5 rounded">
                          {model.modelId}
                        </span>
                      </p>
                      <p className="text-sm text-muted-foreground capitalize">
                        {model.provider}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {model.isSelected && (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Selected
                      </Badge>
                    )}
                    <Badge
                      className={getAvailabilityStatusColor(
                        model.availabilityStatus,
                      )}
                      variant="outline"
                    >
                      {model.availabilityStatus || "unknown"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedModel(model);
                        setIsModalOpen(true);
                      }}
                      disabled={isPending}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedModel(model);
                        setIsDeleteModalOpen(true);
                      }}
                      disabled={isPending}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {model.provider === "huggingface" ? (
                  <>
                    {/* For Hugging Face: Show metadata if available */}
                    {model.artifactMetadata ? (
                      <div className="space-y-3">
                        {/* Basic HF Info */}
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Downloads
                            </p>
                            <p className="font-medium">
                              {model.artifactMetadata.hf_downloads
                                ? model.artifactMetadata.hf_downloads >= 1000000
                                  ? `${(model.artifactMetadata.hf_downloads / 1000000).toFixed(1)}M`
                                  : model.artifactMetadata.hf_downloads >= 1000
                                    ? `${(model.artifactMetadata.hf_downloads / 1000).toFixed(1)}K`
                                    : model.artifactMetadata.hf_downloads
                                : "N/A"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Likes
                            </p>
                            <p className="font-medium">
                              {model.artifactMetadata.hf_likes || 0}
                            </p>
                          </div>
                        </div>

                        {/* Tags */}
                        {model.artifactMetadata.tags &&
                          model.artifactMetadata.tags.length > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">
                                Tags
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {model.artifactMetadata.tags
                                  .slice(0, 3)
                                  .map((tag: string, idx: number) => (
                                    <Badge
                                      key={idx}
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {tag}
                                    </Badge>
                                  ))}
                                {model.artifactMetadata.tags.length > 3 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{model.artifactMetadata.tags.length - 3}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )}

                        {/* Format and Library */}
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Format
                            </p>
                            <p className="font-medium capitalize">
                              {model.artifactMetadata.format || "N/A"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Library
                            </p>
                            <p className="font-medium capitalize">
                              {model.artifactMetadata.hf_library_name || "N/A"}
                            </p>
                          </div>
                        </div>

                        {/* Status */}
                        <div className="flex gap-2">
                          {model.artifactMetadata.hf_gated && (
                            <Badge
                              variant="outline"
                              className="text-xs bg-yellow-500/10 text-yellow-500"
                            >
                              Gated
                            </Badge>
                          )}
                          {model.artifactMetadata.hf_private ? (
                            <Badge
                              variant="outline"
                              className="text-xs bg-red-500/10 text-red-500"
                            >
                              Private
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-xs bg-green-500/10 text-green-500"
                            >
                              Public
                            </Badge>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs text-muted-foreground">URL</p>
                        <p className="text-sm font-mono break-all">
                          {model.modelId}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* For all other providers: Show all fields */}

                    {/* Model URL */}
                    {model.modelUrl && (
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Model URL
                        </p>
                        <p className="text-sm font-mono break-all">
                          {model.modelUrl}
                        </p>
                      </div>
                    )}

                    {/* Purpose/Use Case */}
                    {model.purposeUseCase && (
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Use Case
                        </p>
                        <p className="text-sm">{model.purposeUseCase}</p>
                      </div>
                    )}

                    {/* Risk Level */}
                    {model.riskLevel && (
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Risk Level
                        </p>
                        <Badge
                          variant="outline"
                          className={`text-xs ${getRiskLevelColor(model.riskLevel)}`}
                        >
                          {model.riskLevel}
                        </Badge>
                      </div>
                    )}

                    {/* Category */}
                    {model.category && (
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Category
                        </p>
                        <Badge
                          variant="outline"
                          className="text-xs bg-blue-500/10 text-blue-500"
                        >
                          {model.category}
                        </Badge>
                      </div>
                    )}

                    {/* Context Window */}
                    {model.contextWindowTokens && (
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Context Window
                        </p>
                        <p className="text-sm">
                          {model.contextWindowTokens.toLocaleString("en-US")}{" "}
                          tokens
                        </p>
                      </div>
                    )}

                    {/* Pricing */}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Input Cost
                        </p>
                        <p className="font-medium">
                          {formatCost(model.inputCostPer1K)}/1K
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Output Cost
                        </p>
                        <p className="font-medium">
                          {formatCost(model.outputCostPer1K)}/1K
                        </p>
                      </div>
                    </div>

                    {/* Modality */}
                    {model.modality && model.modality.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Modality
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {model.modality
                            .filter((m) => m)
                            .map((mod, idx) => (
                              <Badge
                                key={idx}
                                variant="outline"
                                className="text-xs"
                              >
                                {mod}
                              </Badge>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Scope */}
                    <div>
                      <Badge
                        variant={model.tenantId ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {model.tenantId ? "Organization" : "Global"}
                      </Badge>
                    </div>

                    {(model.provider === "openai" ||
                      model.provider === "gemini") && (
                      <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Connection
                            </p>
                            <div className="mt-1 flex items-center gap-1.5 text-sm font-medium">
                              {model.connectionStatus === "ready" ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              ) : model.connectionStatus === "error" ? (
                                <CircleAlert className="h-4 w-4 text-red-600" />
                              ) : model.connectionStatus === "testing" ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <PlugZap className="h-4 w-4 text-muted-foreground" />
                              )}
                              {model.connectionStatus === "ready"
                                ? "Ready"
                                : model.connectionStatus === "error"
                                  ? "Connection error"
                                  : model.connectionStatus === "testing"
                                    ? "Testing"
                                    : "Not tested"}
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={testingModelId === model.id}
                            onClick={() => handleTestConnection(model)}
                          >
                            {testingModelId === model.id && (
                              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                            )}
                            Test
                          </Button>
                        </div>
                        {model.connectionMessage && (
                          <p
                            className={`text-xs ${
                              model.connectionStatus === "error"
                                ? "text-red-600"
                                : "text-muted-foreground"
                            }`}
                          >
                            {model.connectionMessage}
                          </p>
                        )}
                        {model.lastTestedAt && (
                          <p className="text-xs text-muted-foreground">
                            Last tested{" "}
                            <LocalTime value={model.lastTestedAt} />
                          </p>
                        )}
                        <Button
                          type="button"
                          className="w-full"
                          variant={model.isSelected ? "secondary" : "default"}
                          size="sm"
                          disabled={Boolean(model.isSelected) || isPending}
                          onClick={() => handleSelectForPlayground(model)}
                        >
                          {model.isSelected
                            ? "Selected for Playground"
                            : "Use in Playground"}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Stats */}

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
