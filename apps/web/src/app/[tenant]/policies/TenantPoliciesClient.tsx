"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, ShieldCheck } from "lucide-react";
import { successToast, errorToast } from "@/lib/utils/toast";
import {
  setTenantDefaultPolicy,
  type TenantPolicyRow,
} from "@/lib/actions/tenant-default-policy";

export function TenantPoliciesClient({
  tenant,
  initialPolicies,
}: {
  tenant: string;
  initialPolicies: TenantPolicyRow[];
}) {
  const [policies, setPolicies] = useState<TenantPolicyRow[]>(initialPolicies);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const onToggleDefault = async (policy: TenantPolicyRow, enabled: boolean) => {
    setPendingId(policy.id);
    // Optimistic: enabling one clears the flag on all others.
    setPolicies((prev) =>
      prev.map((p) => ({
        ...p,
        isTenantDefault: p.id === policy.id ? enabled : false,
      })),
    );
    try {
      await setTenantDefaultPolicy(tenant, policy.id, enabled);
      successToast(
        "",
        "",
        "",
        enabled
          ? `"${policy.name}" is now the global default — it enforces on all API traffic without a per-application policy.`
          : `"${policy.name}" is no longer the global default.`,
      );
    } catch (error) {
      // Revert on failure.
      setPolicies(initialPolicies);
      errorToast(
        error instanceof Error ? error.message : "Failed to update default policy",
      );
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Policies</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Runtime guardrail policies for this workspace. Set one as the global
          default to enforce it everywhere.
        </p>
      </div>

      <Alert className="py-3">
        <Info className="h-4 w-4" />
        <AlertTitle>Global default policy</AlertTitle>
        <AlertDescription className="text-xs leading-5">
          The global default is enforced by the ControlNet gateway on any API
          request whose application has no policy of its own. Only one policy can
          be the default. A policy explicitly assigned to an application always
          takes precedence over the global default.
        </AlertDescription>
      </Alert>

      {policies.length === 0 ? (
        <Card className="shadow-none">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No policies yet. Create a policy to enable runtime enforcement.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {policies.map((policy) => (
            <Card
              key={policy.id}
              className="gap-0 overflow-hidden py-0 shadow-none"
            >
              <CardHeader className="border-b p-4">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="truncate text-sm font-semibold">
                    {policy.name}
                  </CardTitle>
                  {policy.isTenantDefault ? (
                    <Badge className="shrink-0 gap-1 text-[11px]">
                      <ShieldCheck className="h-3 w-3" />
                      Global default
                    </Badge>
                  ) : (
                    <Badge
                      variant={policy.isActive ? "secondary" : "outline"}
                      className="shrink-0 text-[11px]"
                    >
                      {policy.isActive ? "Active" : "Inactive"}
                    </Badge>
                  )}
                </div>
                {policy.description ? (
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {policy.description}
                  </p>
                ) : null}
              </CardHeader>
              <CardContent className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-muted-foreground">
                  Global default
                </span>
                <Switch
                  checked={policy.isTenantDefault}
                  disabled={pendingId === policy.id}
                  onCheckedChange={(checked) => onToggleDefault(policy, checked)}
                  aria-label={`Set ${policy.name} as the global default policy`}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
