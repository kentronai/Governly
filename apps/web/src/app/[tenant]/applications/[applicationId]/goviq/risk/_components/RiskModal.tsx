"use client";

import { useState, useEffect } from "react";
import { Loader } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { UserSelect } from "@/components/common/UserSelect";
import {
  calculateRiskLevel,
  LIKELIHOODS,
  SEVERITIES,
} from "@/lib/risk-level";

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
  controlOwner: string | null;
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

interface Props {
  isOpen: boolean;
  mode: "create" | "edit" | "view";
  risk?: Partial<Risk> | null;
  onClose: () => void;
  onSubmit?: (
    data: Partial<Risk> & {
      riskName: string;
      owner: string;
      controlOwner?: string | null;
      severity: Risk["severity"];
      likelihood: Risk["likelihood"];
      riskLevel: Risk["riskLevel"];
      mitigationStatus: Risk["mitigationStatus"];
    }
  ) => Promise<void>;
  isPending: boolean;
  tenantId: string;
  /** Create mode: values picked from the IBM / MIT catalog. */
  initial?: Partial<Risk> | null;
  /** Shown under the title, e.g. "From IBM AI Risk Atlas". */
  sourceLabel?: string;
}

const SEVERITY_OPTIONS = SEVERITIES;
const LIKELIHOOD_OPTIONS = LIKELIHOODS;
const STATUS_OPTIONS = [
  "Not Started",
  "In Progress",
  "Requires Review",
  "Completed",
];

export function RiskModal({
  isOpen,
  mode,
  risk,
  onClose,
  onSubmit,
  isPending,
  tenantId,
  initial,
  sourceLabel,
}: Props) {
  const [formData, setFormData] = useState<Partial<Risk>>({
    riskName: "",
    owner: "",
    controlOwner: "",
    description: "",
    severity: undefined,
    likelihood: undefined,
    riskLevel: undefined,
    mitigationStatus: undefined,
    targetDate: "",
    mitigationPlan: "",
    categories: [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isViewMode = mode === "view";
  const isEditMode = mode === "edit";
  const title = isViewMode
    ? "View Risk"
    : isEditMode
      ? "Edit Risk"
      : "Create Risk";
  const saveButtonText = isEditMode ? "Save" : "Create";
  const loadingText = isEditMode ? "Saving..." : "Creating...";

  useEffect(() => {
    if ((mode === "edit" || mode === "view") && risk) {
      setFormData({
        riskName: risk.riskName || "",
        owner: risk.owner || "",
        controlOwner: risk.controlOwner || "",
        description: risk.description || "",
        severity: risk.severity,
        likelihood: risk.likelihood,
        riskLevel: risk.riskLevel,
        mitigationStatus: risk.mitigationStatus,
        targetDate: risk.targetDate
          ? new Date(risk.targetDate).toISOString().split("T")[0]
          : "",
        mitigationPlan: risk.mitigationPlan || "",
        categories: risk.categories || [],
      });
    } else if (mode === "create") {
      setFormData({
        riskName: "",
        owner: "",
        controlOwner: "",
        description: "",
        severity: undefined,
        likelihood: undefined,
        riskLevel: undefined,
        mitigationStatus: undefined,
        targetDate: "",
        mitigationPlan: "",
        categories: [],
        ...initial,
      });
    }
    setErrors({});
  }, [mode, risk, isOpen, initial]);

  // Risk level is never typed in: it follows severity x likelihood.
  const riskLevel = calculateRiskLevel(formData.severity, formData.likelihood);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.riskName?.trim()) {
      newErrors.riskName = "Risk name is required";
    }
    if (!formData.owner?.trim()) {
      newErrors.owner = "Owner is required";
    }
    if (!formData.severity) {
      newErrors.severity = "Severity is required";
    }
    if (!formData.likelihood) {
      newErrors.likelihood = "Likelihood is required";
    }
    if (!formData.mitigationStatus) {
      newErrors.mitigationStatus = "Status is required";
    }
    if (!formData.targetDate?.trim()) {
      newErrors.targetDate = "Review date is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (isViewMode || !onSubmit) return;

    if (!validate()) return;

    try {
      await onSubmit(
        { ...formData, riskLevel } as Partial<Risk> & {
          riskName: string;
          owner: string;
          controlOwner?: string | null;
          severity: Risk["severity"];
          likelihood: Risk["likelihood"];
          riskLevel: Risk["riskLevel"];
          mitigationStatus: Risk["mitigationStatus"];
        }
      );
    } catch (error: any) {
      setErrors({ submit: error.message || "Failed to save risk" });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px]  p-0 gap-0 z-50 max-h-[90vh] overflow-y-auto">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogHeader className="p-6 pb-4 space-y-1 border-b">
          <h3 className="text-lg font-semibold leading-none tracking-tight">
            {title}
          </h3>
          {sourceLabel && (
            <p className="text-sm text-muted-foreground">{sourceLabel}</p>
          )}
        </DialogHeader>

        <div className="p-6 space-y-6">
          {/* Risk Name Field */}
          <div className="space-y-2">
            <Label
              htmlFor="riskName"
              className="text-sm font-medium text-muted-foreground"
            >
              Risk Name*
            </Label>
            <Input
              id="riskName"
              placeholder="Enter risk name manually"
              className={`h-9 ${errors.riskName ? "border-red-500 focus-visible:border-red-500" : ""}`}
              value={formData.riskName}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, riskName: e.target.value }))
              }
              disabled={isViewMode}
            />
            {errors.riskName && (
              <p className="text-sm text-red-500">{errors.riskName}</p>
            )}
          </div>

          {/* Owner and Control Owner Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <UserSelect
                value={formData.owner || ""}
                onChange={(value) =>
                  setFormData((prev) => ({ ...prev, owner: value }))
                }
                placeholder="Select risk owner"
                className={errors.owner ? "border-red-500" : ""}
                error={!!errors.owner}
                label="Owner"
                required={true}
                tenantId={tenantId}
                disabled={isViewMode}
              />
              {errors.owner && (
                <p className="text-sm text-red-500">{errors.owner}</p>
              )}
            </div>
            <div className="space-y-2">
              <UserSelect
                value={formData.controlOwner || ""}
                onChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    controlOwner: value || null,
                  }))
                }
                placeholder="Select control owner"
                className=""
                error={false}
                label="Control Owner"
                required={false}
                tenantId={tenantId}
                disabled={isViewMode}
              />
            </div>
          </div>

          {/* Description Field */}
          <div className="space-y-2">
            <Label
              htmlFor="description"
              className="text-sm font-medium text-muted-foreground"
            >
              Description
            </Label>
            <Textarea
              id="description"
              value={formData.description ?? ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="Describe the risk in detail..."
              rows={3}
              disabled={isViewMode}
            />
          </div>

          {!!formData.categories?.filter(Boolean).length && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">
                Categories
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {formData.categories.filter(Boolean).map((c) => (
                  <Badge key={c} variant="outline">
                    {c}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {initial && mode === "create" && (
            <p className="text-xs text-muted-foreground">
              Severity and likelihood below are suggested defaults for this
              catalog risk (the source does not rate them). Adjust them to your
              use case; the risk level updates automatically.
            </p>
          )}

          {/* Severity and Likelihood */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label
                htmlFor="severity"
                className="text-sm font-medium text-muted-foreground"
              >
                Severity*
              </Label>
              <Select
                value={formData.severity}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    severity: value as Risk["severity"],
                  }))
                }
                disabled={isViewMode}
              >
                <SelectTrigger
                  className={`h-9 ${errors.severity ? "border-red-500" : ""}`}
                >
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.severity && (
                <p className="text-sm text-red-500">{errors.severity}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="likelihood"
                className="text-sm font-medium text-muted-foreground"
              >
                Likelihood*
              </Label>
              <Select
                value={formData.likelihood}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    likelihood: value as Risk["likelihood"],
                  }))
                }
                disabled={isViewMode}
              >
                <SelectTrigger
                  className={`h-9 ${errors.likelihood ? "border-red-500" : ""}`}
                >
                  <SelectValue placeholder="Select likelihood" />
                </SelectTrigger>
                <SelectContent>
                  {LIKELIHOOD_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.likelihood && (
                <p className="text-sm text-red-500">{errors.likelihood}</p>
              )}
            </div>
          </div>

          {/* Risk Level and Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label
                htmlFor="riskLevel"
                className="text-sm font-medium text-muted-foreground"
              >
                Risk Level (auto)
              </Label>
              <div className="flex h-9 items-center">
                {riskLevel ? (
                  <Badge variant="secondary">{riskLevel} risk</Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    Set severity and likelihood
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="mitigationStatus"
                className="text-sm font-medium text-muted-foreground"
              >
                Status*
              </Label>
              <Select
                value={formData.mitigationStatus}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    mitigationStatus: value as Risk["mitigationStatus"],
                  }))
                }
                disabled={isViewMode}
              >
                <SelectTrigger
                  className={`h-9 ${errors.mitigationStatus ? "border-red-500" : ""}`}
                >
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.mitigationStatus && (
                <p className="text-sm text-red-500">
                  {errors.mitigationStatus}
                </p>
              )}
            </div>
          </div>

          {/* Review Date */}
          <div className="space-y-2">
            <Label
              htmlFor="targetDate"
              className="text-sm font-medium text-muted-foreground"
            >
              Review Date*
            </Label>
            <Input
              id="targetDate"
              type="date"
              className={`h-9 ${errors.targetDate ? "border-red-500 focus-visible:border-red-500" : ""}`}
              value={formData.targetDate ?? ""}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, targetDate: e.target.value }))
              }
              disabled={isViewMode}
            />
            {errors.targetDate && (
              <p className="text-sm text-red-500">{errors.targetDate}</p>
            )}
          </div>

          {/* Mitigation Plan */}
          <div className="space-y-2">
            <Label
              htmlFor="mitigationPlan"
              className="text-sm font-medium text-muted-foreground"
            >
              Mitigation Plan
            </Label>
            <Textarea
              id="mitigationPlan"
              value={formData.mitigationPlan ?? ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  mitigationPlan: e.target.value,
                }))
              }
              placeholder="Describe the mitigation strategy..."
              rows={3}
              disabled={isViewMode}
            />
          </div>

          {errors.submit && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{errors.submit}</p>
            </div>
          )}
        </div>

        <DialogFooter className="p-6 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {isViewMode ? "Close" : "Cancel"}
          </Button>
          {!isViewMode && (
            <Button data-autosave disabled={isPending} onClick={handleSubmit}>
              {isPending ? (
                <>
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                  {loadingText}
                </>
              ) : (
                saveButtonText
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
