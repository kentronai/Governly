"use client";
import { type FC, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardFooter, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ComplianceEvidenceManager } from "@/components/compliance/ComplianceEvidenceManager";

// UI Components
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import Pagination from "@/components/common/pagination";

// Icons
import { IoShareSocial } from "react-icons/io5";
import { MoreHorizontal, Search, Loader2, Pencil, Trash2, RefreshCw, AlertTriangle, ShieldCheck } from "lucide-react";

// API & Utilities
import { useDebounce } from "@/hooks/useDebounce";
import { successToast, errorToast } from "@/lib/utils/toast";
import { useTenant } from "@/contexts/TenantContext";
// Types
interface Member {
  id: string;
  user_name: string;
  user_email: string;
  user_role: string;
  permissions: string;
}

interface PolicyPack {
  icon: string | null;
  name: string;
  type: string | null;
  id: string;
  color: string | null;
  metadata: unknown;
  description: string | null;
  isActive: boolean;
  tenantId: string | null;
  category: string | null;
  tags: string[] | null;
  country: string | null;
  projectsCompliant: number;
  totalProjects: number;
  state: string | null;
  parentPolicyId: string | null;
  disable: boolean;
  applicabilityStatus?: string;
  complianceStatus?: string;
  coverageScore?: number;
  evaluation?: {
    summary?: string;
    controls?: Array<{ key: string; title: string; status: string; reason: string; mappedField?: string; mappedRoute?: string; requiredEvidence?: string[]; guidance?: string; priority?: "high" | "medium" | "low" }>;
  };
  gaps?: Array<{ key: string; title: string; status: string; reason: string; mappedField?: string; mappedRoute?: string; requiredEvidence?: string[]; guidance?: string; priority?: "high" | "medium" | "low" }>;
  evaluatedAt?: string | null;
}

interface SettingsProps {
  hasWorkspaceDetailsReadPermission: boolean;
  hasWorkspaceDetailsWritePermission: boolean;
  workspaceDetails: {
    created_by?: {
      username?: string;
    };
  };
}

// Constants
const INITIAL_PAGE = 1;
const INITIAL_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_DELAY = 1000;

// Utility Functions
const formatPermissionText = (permission: string): string => {
  return permission === "readonly"
    ? "View"
    : permission.charAt(0).toUpperCase() + permission.slice(1);
};

const isWorkspaceCreator = (
  userName: string,
  workspaceDetails: any
): boolean => {
  return (
    workspaceDetails?.created_by?.username?.toLowerCase() ===
    userName.toLowerCase()
  );
};

const canShowMemberActions = (
  member: Member,
  userProfile: any,
  workspaceDetails: any,
  hasWritePermission: boolean
): boolean => {
  return (
    hasWritePermission &&
    member.user_email !== userProfile?.email &&
    member.user_role !== "Admin" &&
    !isWorkspaceCreator(member.user_name, workspaceDetails)
  );
};

// Components
const SearchInput: FC<{ value: string; onChange: (value: string) => void }> = ({
  value,
  onChange,
}) => (
  <div className="relative">
    <Input
      type="search"
      placeholder="Search"
      className="rounded-md w-[343px] h-[36px] pl-10 border-[#E4E4E7] text-sm font-normal text-[#71717A] focus:border-[#18181B] focus:ring-0 focus:outline-none"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
    <Search
      size={16}
      className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
    />
  </div>
);

const ShareButton: FC<{
  onClick: () => void;
  isLoading: boolean;
  hasWritePermission: boolean;
}> = ({ onClick, isLoading, hasWritePermission }) => {
  if (!hasWritePermission) return null;

  return (
    <Button
      onClick={onClick}
      className="bg-[#18181B] text-white hover:bg-black/90 rounded-md px-3 py-2 flex items-center gap-2"
      disabled={isLoading}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <IoShareSocial className="h-4 w-4" />
      )}
      <span className="text-sm font-sans leading-normal font-medium">
        Share Application
      </span>
    </Button>
  );
};

const ActionDropdown: FC<{
  member: Member;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}> = ({ isOpen, onOpenChange, onEdit, onDelete, isDeleting }) => (
  <DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" className="h-8 w-8 p-0">
        <MoreHorizontal className="h-4 w-4 text-default-400" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="end"
      className="bg-white border w-[120px] border-[#E4E4E7] rounded-md shadow-md"
    >
      <DropdownMenuItem className="flex items-center  text-sm">
        <Pencil className="h-4 w-4 mr-2" />
        Edit
      </DropdownMenuItem>
      <Separator />
      <DropdownMenuItem
        className="flex items-center text-red-500 text-sm"
        disabled={isDeleting}
      >
        {isDeleting ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin mr-2" />
            Deleting...
          </>
        ) : (
          <>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </>
        )}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

const TableContent: FC<{
  members: Member[];
  userProfile: any;
  workspaceDetails: any;
  hasWritePermission: boolean;
  openDropdownId: string | null;
  onDropdownOpenChange: (open: boolean, memberId: string) => void;
  onEditMember: (member: Member) => void;
  onDeleteMember: (memberId: string) => void;
  isDeleting: boolean;
  isLoading: boolean;
}> = ({
  members,
  userProfile,
  workspaceDetails,
  hasWritePermission,
  openDropdownId,
  onDropdownOpenChange,
  onEditMember,
  onDeleteMember,
  isDeleting,
  isLoading,
}) => {
  const colSpan = hasWritePermission ? 4 : 3;

  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="text-center py-12">
          <div className="flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900" />
            <span>Loading...</span>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  if (!members?.length) {
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="text-center py-12">
          <p className="text-lg font-medium text-gray-500">No data available</p>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      {members.map((member) => {
        const showActions = canShowMemberActions(
          member,
          userProfile,
          workspaceDetails,
          hasWritePermission
        );

        return (
          <TableRow
            key={member.id}
            className="h-10 border-b border-[#E4E4E7] last:border-b-0 hover:bg-gray-50"
          >
            <TableCell className="text-sm pl-4 text-[#18181B] font-normal">
              {member.user_name}
            </TableCell>
            <TableCell className="text-sm pl-4 text-[#18181B] font-normal">
              {formatPermissionText(member.permissions)}
            </TableCell>
            <TableCell className="text-sm pl-4 text-[#18181B] font-normal">
              {member.user_email}
            </TableCell>
            {hasWritePermission && (
              <TableCell>
                {showActions && (
                  <ActionDropdown
                    member={member}
                    isOpen={openDropdownId === member.id}
                    onOpenChange={(open) =>
                      onDropdownOpenChange(open, member.id)
                    }
                    onEdit={() => onEditMember(member)}
                    onDelete={() => onDeleteMember(member.id)}
                    isDeleting={isDeleting}
                  />
                )}
              </TableCell>
            )}
          </TableRow>
        );
      })}
    </>
  );
};

// Main Component
const Settings: FC<SettingsProps> = ({
  hasWorkspaceDetailsReadPermission,
  hasWorkspaceDetailsWritePermission,
  workspaceDetails,
}) => {
  const queryClient = useQueryClient();
  const { slug } = useParams();
  const [selectedPolicies, setSelectedPolicies] = useState<PolicyPack[]>([]);
  const [evaluatingPolicyId, setEvaluatingPolicyId] = useState<string | null>(null);
  const { refreshApplicationPolicyStatus, applicationPolicy: policiesData } =
    useTenant();

  useEffect(() => {
    if (policiesData) {
      setSelectedPolicies(policiesData);
    }
  }, [policiesData]);

  const { tenant, applicationId } = useParams();

  const handleTogglePolicyStatus = async (policyId: string) => {
    const policy = selectedPolicies.find((p) => p.id === policyId);
    if (!policy) return;

    // Validate params are strings
    if (
      !tenant ||
      !applicationId ||
      Array.isArray(tenant) ||
      Array.isArray(applicationId)
    ) {
      errorToast("Invalid tenant or application ID");
      return;
    }

    if (!policy.parentPolicyId) {
      errorToast("Policy ID is missing");
      return;
    }

    const isCurrentlyActive = policy.isActive;
    const newActiveState = !isCurrentlyActive;

    // Optimistically update UI
    setSelectedPolicies((prevPolicies) =>
      prevPolicies.map((p) =>
        p.id === policyId ? { ...p, isActive: newActiveState } : p
      )
    );

    try {
      // Update in database
      const { updateApplicationCompliancePolicy } = await import(
        "@/lib/api/compliance-policies"
      );
      const result = await updateApplicationCompliancePolicy(
        tenant,
        applicationId,
        policy.parentPolicyId,
        newActiveState
      );

      if (!result.success) {
        // Revert on error
        setSelectedPolicies((prevPolicies) =>
          prevPolicies.map((p) =>
            p.id === policyId ? { ...p, isActive: isCurrentlyActive } : p
          )
        );
        errorToast("Failed to update policy status");
        return;
      }
      refreshApplicationPolicyStatus();
      const evaluation = result.evaluation;
      if (evaluation) {
        setSelectedPolicies((current) => current.map((item) =>
          item.id === policyId
            ? {
                ...item,
                complianceStatus: evaluation.complianceStatus,
                applicabilityStatus: evaluation.applicabilityStatus,
                coverageScore: evaluation.coverageScore,
                evaluation,
                gaps: evaluation.gaps,
                evaluatedAt: evaluation.evaluatedAt,
              }
            : item
        ));
      }
      successToast(
        `Policy ${newActiveState ? "enabled" : "disabled"} successfully`,
        "Policy",
        "updated"
      );
    } catch (error) {
      // Revert on error
      setSelectedPolicies((prevPolicies) =>
        prevPolicies.map((p) =>
          p.id === policyId ? { ...p, isActive: isCurrentlyActive } : p
        )
      );
      errorToast("Error updating policy status");
    }
  };

  const handleEvaluate = async (policy: PolicyPack) => {
    if (!tenant || !applicationId || Array.isArray(tenant) || Array.isArray(applicationId) || !policy.parentPolicyId) {
      errorToast("Invalid application or policy");
      return;
    }
    setEvaluatingPolicyId(policy.id);
    try {
      const { evaluateApplicationCompliancePolicy } = await import("@/lib/api/compliance-policies");
      const result = await evaluateApplicationCompliancePolicy(tenant, applicationId, policy.parentPolicyId);
      setSelectedPolicies((current) => current.map((item) =>
        item.id === policy.id
          ? {
              ...item,
              complianceStatus: result.evaluation.complianceStatus,
              applicabilityStatus: result.evaluation.applicabilityStatus,
              coverageScore: result.evaluation.coverageScore,
              evaluation: result.evaluation,
              gaps: result.evaluation.gaps,
              evaluatedAt: result.evaluation.evaluatedAt,
            }
          : item
      ));
      refreshApplicationPolicyStatus();
      successToast("Compliance evidence re-evaluated", "Policy", "checked");
    } catch (error) {
      errorToast(error instanceof Error ? error.message : "Compliance evaluation failed");
    } finally {
      setEvaluatingPolicyId(null);
    }
  };

  const renderPolicyCard = (policy: PolicyPack) => {
    const status = policy.complianceStatus ?? "not_evaluated";
    const score = Number(policy.coverageScore ?? 0);
    const statusClasses: Record<string, string> = {
      compliant: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
      partially_compliant: "bg-amber-500/10 text-amber-600 border-amber-500/20",
      non_compliant: "bg-red-500/10 text-red-600 border-red-500/20",
      not_applicable: "bg-slate-500/10 text-slate-500 border-slate-500/20",
      not_evaluated: "bg-muted text-muted-foreground border-border",
    };

    return (
      <Card key={policy.id} className="hover:shadow-md transition-shadow">
        <CardContent className="min-h-48">
          <div className="flex items-start justify-between  ">
            <div className="flex items-start gap-3 flex-1">
              <div
                className={`w-8 h-8 rounded-full ${policy.color} flex items-center justify-center  text-sm font-semibold shrink-0`}
              >
                {policy.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold  text-sm leading-tight mb-1 line-clamp-2">
                  {policy.name}
                </h3>
                <p className="text-muted-foreground text-xs leading-relaxed line-clamp-3 mb-2">
                  {policy.description}
                </p>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Badge
                    variant="secondary"
                    className="text-xs px-2 py-0.5 bg-muted text-muted-foreground"
                  >
                    {policy.category}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="text-xs px-2 py-0.5 border text-muted-foreground"
                  >
                    {policy.country}
                    {policy.state ? `, ${policy.state}` : ""}
                  </Badge>
                  {policy.type && (
                    <Badge
                      className={cn(
                        "text-xs px-2 py-0.5 font-medium border",
                        policy.type === "Mandatory"
                          ? "bg-red-500/10 text-red-500"
                          : "bg-blue-500/10 text-blue-500 "
                      )}
                    >
                      {policy.type}
                    </Badge>
                  )}
                </div>
                {policy.isActive && (
                  <div className="mt-3 rounded-md border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Badge className={cn("border text-[11px] capitalize", statusClasses[status])}>
                        {status.replaceAll("_", " ")}
                      </Badge>
                      {status !== "not_applicable" && (
                        <span className="text-xs font-semibold">{score.toFixed(0)}% evidence coverage</span>
                      )}
                    </div>
                    {status === "compliant" ? (
                      <p className="flex items-start gap-1.5 text-xs text-emerald-600">
                        <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        All mapped controls currently have verifiable evidence.
                      </p>
                    ) : policy.gaps?.length ? (
                      <div className="space-y-1">
                        {policy.gaps.slice(0, 2).map((gap) => (
                          <p key={gap.key} className="flex items-start gap-1.5 text-xs text-red-600">
                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span>{gap.title}: {gap.reason}</span>
                          </p>
                        ))}
                        {policy.gaps.length > 2 && (
                          <p className="text-xs text-muted-foreground">+{policy.gaps.length - 2} more control gap(s)</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Enable and run an evidence check to calculate compliance.</p>
                    )}
                    {policy.evaluatedAt && (
                      <p className="text-[11px] text-muted-foreground">Last checked {new Date(policy.evaluatedAt).toLocaleString()}</p>
                    )}
                    {policy.gaps?.length ? <div className="space-y-2 border-t pt-2">
                      <p className="text-xs font-semibold">Generated compliance tasks</p>
                      {policy.gaps.slice(0, 4).map((gap) => <div key={`task-${gap.key}`} className="rounded border bg-background p-2">
                        <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">{gap.title}</span><Badge variant="outline" className="text-[10px] capitalize">{gap.priority ?? "medium"}</Badge></div>
                        {gap.mappedField && <a href={`/${String(tenant)}/applications/${String(applicationId)}/${gap.mappedRoute || "settings"}`} className="mt-1 block text-[11px] text-primary hover:underline">Complete {gap.mappedField}</a>}
                        {gap.requiredEvidence?.length ? <p className="mt-1 text-[11px] text-muted-foreground">Evidence needed: {gap.requiredEvidence.join("; ")}</p> : null}
                        {gap.guidance && <p className="mt-1 text-[11px] text-muted-foreground">{gap.guidance}</p>}
                      </div>)}
                    </div> : null}
                    {policy.parentPolicyId && policy.evaluation?.controls?.length && typeof tenant === "string" && typeof applicationId === "string" ? <div className="border-t pt-3">
                      <ComplianceEvidenceManager tenant={tenant} applicationId={applicationId} policyId={policy.parentPolicyId} controls={policy.evaluation.controls.map((control) => ({ key: control.key, title: control.title }))} onChanged={() => handleEvaluate(policy)} />
                    </div> : null}
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <div className="flex w-full items-center justify-between gap-3 pt-2 border-t mt-auto">
            <span className="text-xs font-medium text-muted-foreground">
              Policy Status
            </span>
            <div className="flex items-center gap-2">
              {policy.isActive && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleEvaluate(policy)}
                  disabled={evaluatingPolicyId === policy.id || !hasWorkspaceDetailsWritePermission}
                >
                  <RefreshCw className={cn("h-3 w-3 mr-1", evaluatingPolicyId === policy.id && "animate-spin")} />
                  Re-check
                </Button>
              )}
            <Switch
              checked={policy.isActive}
              onCheckedChange={() => handleTogglePolicyStatus(policy.id)}
              disabled={!hasWorkspaceDetailsWritePermission}
              className=""
            />
            </div>
          </div>
        </CardFooter>
      </Card>
    );
  };

  // Early return if no read permission
  if (!hasWorkspaceDetailsReadPermission) return null;

  return (
    <div className="w-full space-y-6">
      {/* Policy Management Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold  mb-2">Policy Management</h2>
          <p className="text-muted-foreground text-sm">
            Assign regulations to this application and verify every mapped control against live Norix evidence. Missing evidence fails closed and appears as a gap.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {selectedPolicies.map(renderPolicyCard)}
        </div>
        {!selectedPolicies.length && (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No organization policies are enabled. Enable them in Admin → Compliance → Compliance Policies first.
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
