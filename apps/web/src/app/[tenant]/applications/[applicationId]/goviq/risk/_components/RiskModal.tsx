"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { UserSelect } from "@/components/common/UserSelect";
import { useTenant } from "@/contexts/TenantContext";
import { enabledFrameworks } from "@/lib/frameworks";
import { getApplicationUseCaseOptions } from "@/lib/actions/use-cases";
import { cn } from "@/lib/utils";
import {
  AI_LIFECYCLE_PHASES,
  calculateRiskLevel,
  LIKELIHOODS,
  SEVERITIES,
  type RiskLevel,
} from "@/lib/risk-level";
import { ChipMultiSelect } from "./ChipMultiSelect";

type Severity = (typeof SEVERITIES)[number];
type Likelihood = (typeof LIKELIHOODS)[number];
type Status = "Not Started" | "In Progress" | "Requires Review" | "Completed";

interface Risk {
  id: string;
  riskName: string;
  owner: string;
  description: string | null;
  severity: Severity;
  likelihood: Likelihood;
  riskLevel: RiskLevel;
  mitigationStatus: Status;
  mitigationPlan: string | null;
  targetDate: string | null;
  lastReviewDate: string | null;
  categories: string[];
  createdAt: string;
  updatedAt: string;
  controlOwner: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  useCaseIds: string[];
  frameworkSlugs: string[];
  lifecyclePhase: string | null;
  potentialImpact: string | null;
  reviewNotes: string | null;
  implementationStrategy: string | null;
  residualSeverity: Severity | null;
  residualLikelihood: Likelihood | null;
  residualLevel: RiskLevel | null;
}

type Submit = Partial<Risk> & {
  riskName: string;
  owner: string;
  controlOwner?: string | null;
  severity: Severity;
  likelihood: Likelihood;
  riskLevel: RiskLevel;
  mitigationStatus: Status;
};

interface Props {
  isOpen: boolean;
  mode: "create" | "edit" | "view";
  risk?: Partial<Risk> | null;
  onClose: () => void;
  onSubmit?: (data: Submit) => Promise<void>;
  isPending: boolean;
  tenantId: string;
  applicationId: string;
  /** Create mode: values picked from the IBM / MIT catalog. */
  initial?: Partial<Risk> | null;
  /** Shown under the title, e.g. "From IBM AI Risk Atlas, #12". */
  sourceLabel?: string;
}

const STATUS_OPTIONS: Status[] = ["Not Started", "In Progress", "Requires Review", "Completed"];

const LEVEL_STYLE: Record<RiskLevel, string> = {
  Low: "bg-green-500/10 text-green-600",
  Medium: "bg-yellow-500/10 text-yellow-600",
  High: "bg-orange-500/10 text-orange-600",
  Critical: "bg-red-500/10 text-red-600",
};

/** Fields that live on each tab, so a failed save opens the tab with the first error. */
const RISK_TAB_FIELDS = ["riskName", "owner", "lifecyclePhase", "description", "severity", "likelihood"];

const empty = (): Partial<Risk> => ({
  riskName: "",
  owner: "",
  controlOwner: "",
  description: "",
  severity: undefined,
  likelihood: undefined,
  mitigationStatus: undefined,
  targetDate: "",
  mitigationPlan: "",
  categories: [],
  useCaseIds: [],
  frameworkSlugs: [],
  lifecyclePhase: null,
  potentialImpact: "",
  reviewNotes: "",
  implementationStrategy: "",
  residualSeverity: null,
  residualLikelihood: null,
});

function LevelBadge({ level, hint }: { level?: RiskLevel | null; hint: string }) {
  return (
    <div className="flex h-9 items-center">
      {level ? (
        <Badge variant="secondary" className={LEVEL_STYLE[level]}>
          {level} risk
        </Badge>
      ) : (
        <span className="text-sm text-muted-foreground">{hint}</span>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  required,
  error,
  children,
  className,
}: {
  id?: string;
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-sm font-medium text-muted-foreground">
        {label}
        {required && <span className="text-red-500">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

function ChoiceSelect<T extends string>({
  id,
  value,
  options,
  placeholder,
  onChange,
  disabled,
  invalid,
}: {
  id: string;
  value: T | null | undefined;
  options: readonly T[];
  placeholder: string;
  onChange: (v: T) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <Select value={value ?? undefined} onValueChange={(v) => onChange(v as T)} disabled={disabled}>
      <SelectTrigger id={id} className={cn("h-9 w-full", invalid && "border-red-500")}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RiskModal({
  isOpen,
  mode,
  risk,
  onClose,
  onSubmit,
  isPending,
  tenantId,
  applicationId,
  initial,
  sourceLabel,
}: Props) {
  const { policyStatus } = useTenant();
  const [formData, setFormData] = useState<Partial<Risk>>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tab, setTab] = useState("risk");
  const [useCaseOptions, setUseCaseOptions] = useState<{ value: string; label: string }[]>([]);

  const readOnly = mode === "view";
  const title = mode === "view" ? "View risk" : mode === "edit" ? "Edit risk" : "Create risk";

  const frameworkOptions = useMemo(
    () =>
      enabledFrameworks(policyStatus.activePolicyNames, policyStatus.enabledFrameworkSlugs).map(
        (f) => ({ value: f.slug, label: f.name }),
      ),
    [policyStatus.activePolicyNames, policyStatus.enabledFrameworkSlugs],
  );

  useEffect(() => {
    if (!isOpen) return;
    getApplicationUseCaseOptions(applicationId)
      .then((rows) => setUseCaseOptions(rows.map((r) => ({ value: r.id, label: r.name }))))
      .catch(() => setUseCaseOptions([]));
  }, [isOpen, applicationId]);

  useEffect(() => {
    if ((mode === "edit" || mode === "view") && risk) {
      setFormData({
        ...empty(),
        ...risk,
        controlOwner: risk.controlOwner || "",
        description: risk.description || "",
        mitigationPlan: risk.mitigationPlan || "",
        potentialImpact: risk.potentialImpact || "",
        reviewNotes: risk.reviewNotes || "",
        implementationStrategy: risk.implementationStrategy || "",
        targetDate: risk.targetDate ? new Date(risk.targetDate).toISOString().split("T")[0] : "",
        useCaseIds: risk.useCaseIds ?? [],
        frameworkSlugs: risk.frameworkSlugs ?? [],
        categories: risk.categories ?? [],
      });
    } else if (mode === "create") {
      setFormData({ ...empty(), ...initial });
    }
    setErrors({});
    setTab("risk");
  }, [mode, risk, isOpen, initial]);

  const set = <K extends keyof Risk>(key: K, value: Risk[K] | undefined) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  // Both levels follow likelihood x severity; they are never typed in.
  const inherentLevel = calculateRiskLevel(formData.severity, formData.likelihood);
  const residualLevel = calculateRiskLevel(formData.residualSeverity, formData.residualLikelihood);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!formData.riskName?.trim()) e.riskName = "Risk name is required";
    if (!formData.owner?.trim()) e.owner = "Owner is required";
    if (!formData.lifecyclePhase) e.lifecyclePhase = "Lifecycle phase is required";
    if (!formData.description?.trim()) e.description = "Description is required";
    if (!formData.severity) e.severity = "Severity is required";
    if (!formData.likelihood) e.likelihood = "Likelihood is required";
    if (!formData.mitigationStatus) e.mitigationStatus = "Status is required";
    if (!formData.targetDate?.trim()) e.targetDate = "Target date is required";
    if (!!formData.residualSeverity !== !!formData.residualLikelihood)
      e.residual = "Set both residual likelihood and severity, or neither";
    setErrors(e);
    const keys = Object.keys(e);
    if (keys.length) setTab(keys.some((k) => RISK_TAB_FIELDS.includes(k)) ? "risk" : "treatment");
    return !keys.length;
  };

  const handleSubmit = async () => {
    if (readOnly || !onSubmit || !validate()) return;
    try {
      await onSubmit({ ...formData, riskLevel: inherentLevel, residualLevel } as Submit);
    } catch (error: any) {
      setErrors({ submit: error.message || "Failed to save risk" });
    }
  };

  const riskTabErrors = RISK_TAB_FIELDS.some((k) => errors[k]);
  const treatmentTabErrors = ["mitigationStatus", "targetDate", "residual"].some((k) => errors[k]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-5xl">
        <DialogHeader className="space-y-1 border-b p-6 pb-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {sourceLabel ?? "Describe the risk, then record how it will be treated."}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-0">
          <div className="px-6 pt-4">
            <TabsList>
              <TabsTrigger value="risk" className={cn(riskTabErrors && "text-red-500")}>
                Risk
              </TabsTrigger>
              <TabsTrigger value="treatment" className={cn(treatmentTabErrors && "text-red-500")}>
                Treatment
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {/* Risk: what can go wrong, where, and how bad before any action. */}
            <TabsContent value="risk" className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <Field id="useCases" label="Applies to use cases">
                  <ChipMultiSelect
                    id="useCases"
                    options={useCaseOptions}
                    value={formData.useCaseIds ?? []}
                    onChange={(v) => set("useCaseIds", v)}
                    placeholder="Select use cases"
                    emptyText="No use cases yet. Add one on the Use Case page."
                    disabled={readOnly}
                  />
                </Field>
                <Field id="frameworks" label="Applies to frameworks">
                  <ChipMultiSelect
                    id="frameworks"
                    options={frameworkOptions}
                    value={formData.frameworkSlugs ?? []}
                    onChange={(v) => set("frameworkSlugs", v)}
                    placeholder="Select frameworks"
                    emptyText="No frameworks enabled. Turn one on in Admin Center."
                    disabled={readOnly}
                  />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Field id="riskName" label="Risk name" required error={errors.riskName}>
                  <Input
                    id="riskName"
                    className={cn("h-9", errors.riskName && "border-red-500")}
                    placeholder="e.g. Chatbot reveals customer data"
                    value={formData.riskName ?? ""}
                    onChange={(e) => set("riskName", e.target.value)}
                    disabled={readOnly}
                  />
                </Field>
                <div className="space-y-1.5">
                  <UserSelect
                    value={formData.owner || ""}
                    onChange={(v) => set("owner", v)}
                    placeholder="Select risk owner"
                    className={errors.owner ? "border-red-500" : ""}
                    error={!!errors.owner}
                    label="Owner"
                    required
                    tenantId={tenantId}
                    disabled={readOnly}
                  />
                  {errors.owner && <p className="text-xs text-red-500">{errors.owner}</p>}
                </div>
                <Field id="lifecyclePhase" label="AI lifecycle phase" required error={errors.lifecyclePhase}>
                  <ChoiceSelect
                    id="lifecyclePhase"
                    value={formData.lifecyclePhase as (typeof AI_LIFECYCLE_PHASES)[number] | null}
                    options={AI_LIFECYCLE_PHASES}
                    placeholder="Where does it arise?"
                    onChange={(v) => set("lifecyclePhase", v)}
                    disabled={readOnly}
                    invalid={!!errors.lifecyclePhase}
                  />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field id="description" label="Description" required error={errors.description}>
                  <Textarea
                    id="description"
                    rows={3}
                    className={cn(errors.description && "border-red-500")}
                    placeholder="What could go wrong, and how?"
                    value={formData.description ?? ""}
                    onChange={(e) => set("description", e.target.value)}
                    disabled={readOnly}
                  />
                </Field>
                <Field id="potentialImpact" label="Potential impact">
                  <Textarea
                    id="potentialImpact"
                    rows={3}
                    placeholder="What happens if it occurs? e.g. personal data exposed, regulatory fine"
                    value={formData.potentialImpact ?? ""}
                    onChange={(e) => set("potentialImpact", e.target.value)}
                    disabled={readOnly}
                  />
                </Field>
              </div>

              {!!formData.categories?.filter(Boolean).length && (
                <Field label="Categories">
                  <div className="flex flex-wrap gap-1.5">
                    {formData.categories.filter(Boolean).map((c) => (
                      <Badge key={c} variant="outline">
                        {c}
                      </Badge>
                    ))}
                  </div>
                </Field>
              )}

              <Separator />

              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-semibold">Inherent risk (before treatment)</h4>
                  <p className="text-xs text-muted-foreground">
                    Likelihood × severity gives the level automatically.
                    {initial && mode === "create" &&
                      " The catalog does not rate these, so the values below are suggested defaults: adjust them to your use case."}
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <Field id="likelihood" label="Likelihood" required error={errors.likelihood}>
                    <ChoiceSelect
                      id="likelihood"
                      value={formData.likelihood}
                      options={LIKELIHOODS}
                      placeholder="Select likelihood"
                      onChange={(v) => set("likelihood", v)}
                      disabled={readOnly}
                      invalid={!!errors.likelihood}
                    />
                  </Field>
                  <Field id="severity" label="Severity" required error={errors.severity}>
                    <ChoiceSelect
                      id="severity"
                      value={formData.severity}
                      options={SEVERITIES}
                      placeholder="Select severity"
                      onChange={(v) => set("severity", v)}
                      disabled={readOnly}
                      invalid={!!errors.severity}
                    />
                  </Field>
                  <Field label="Risk level (auto)">
                    <LevelBadge level={inherentLevel} hint="Set likelihood and severity" />
                  </Field>
                </div>
              </div>

              <Field id="reviewNotes" label="Review notes">
                <Textarea
                  id="reviewNotes"
                  rows={2}
                  placeholder="Context for reviewers, e.g. where this risk came from"
                  value={formData.reviewNotes ?? ""}
                  onChange={(e) => set("reviewNotes", e.target.value)}
                  disabled={readOnly}
                />
              </Field>
            </TabsContent>

            {/* Treatment: what will be done about it, and what is left afterwards. */}
            <TabsContent value="treatment" className="space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <Field id="mitigationStatus" label="Treatment status" required error={errors.mitigationStatus}>
                  <ChoiceSelect
                    id="mitigationStatus"
                    value={formData.mitigationStatus}
                    options={STATUS_OPTIONS}
                    placeholder="Select status"
                    onChange={(v) => set("mitigationStatus", v)}
                    disabled={readOnly}
                    invalid={!!errors.mitigationStatus}
                  />
                </Field>
                <Field id="targetDate" label="Target date" required error={errors.targetDate}>
                  <Input
                    id="targetDate"
                    type="date"
                    className={cn("h-9", errors.targetDate && "border-red-500")}
                    value={formData.targetDate ?? ""}
                    onChange={(e) => set("targetDate", e.target.value)}
                    disabled={readOnly}
                  />
                </Field>
                <UserSelect
                  value={formData.controlOwner || ""}
                  onChange={(v) => set("controlOwner", v || null)}
                  placeholder="Select control owner"
                  className=""
                  error={false}
                  label="Control owner"
                  required={false}
                  tenantId={tenantId}
                  disabled={readOnly}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field id="mitigationPlan" label="Treatment plan">
                  <Textarea
                    id="mitigationPlan"
                    rows={4}
                    placeholder="What will be done to reduce this risk?"
                    value={formData.mitigationPlan ?? ""}
                    onChange={(e) => set("mitigationPlan", e.target.value)}
                    disabled={readOnly}
                  />
                </Field>
                <Field id="implementationStrategy" label="Implementation strategy">
                  <Textarea
                    id="implementationStrategy"
                    rows={4}
                    placeholder="How: steps, tools, owners and checkpoints"
                    value={formData.implementationStrategy ?? ""}
                    onChange={(e) => set("implementationStrategy", e.target.value)}
                    disabled={readOnly}
                  />
                </Field>
              </div>

              <Separator />

              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-semibold">Residual risk (after treatment)</h4>
                  <p className="text-xs text-muted-foreground">
                    Score the risk again assuming the treatment is in place. This is the current risk
                    level shown in the register.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <Field id="residualLikelihood" label="Likelihood">
                    <ChoiceSelect
                      id="residualLikelihood"
                      value={formData.residualLikelihood}
                      options={LIKELIHOODS}
                      placeholder="Select likelihood"
                      onChange={(v) => set("residualLikelihood", v)}
                      disabled={readOnly}
                      invalid={!!errors.residual}
                    />
                  </Field>
                  <Field id="residualSeverity" label="Severity">
                    <ChoiceSelect
                      id="residualSeverity"
                      value={formData.residualSeverity}
                      options={SEVERITIES}
                      placeholder="Select severity"
                      onChange={(v) => set("residualSeverity", v)}
                      disabled={readOnly}
                      invalid={!!errors.residual}
                    />
                  </Field>
                  <Field label="Current risk level (auto)">
                    <div className="flex h-9 items-center gap-2">
                      <LevelBadge level={inherentLevel} hint="Inherent not set" />
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <LevelBadge level={residualLevel} hint="Not scored yet" />
                    </div>
                  </Field>
                </div>
                {errors.residual && <p className="text-xs text-red-500">{errors.residual}</p>}
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {errors.submit && (
          <p className="mx-6 mb-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            {errors.submit}
          </p>
        )}

        <DialogFooter className="border-t p-6 pt-4">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {readOnly ? "Close" : "Cancel"}
          </Button>
          {!readOnly && (
            <Button data-autosave disabled={isPending} onClick={handleSubmit}>
              {isPending ? (
                <>
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                  {mode === "edit" ? "Saving..." : "Creating..."}
                </>
              ) : mode === "edit" ? (
                "Save"
              ) : (
                "Create"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
