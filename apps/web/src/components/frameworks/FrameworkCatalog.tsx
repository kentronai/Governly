"use client";

import { useState } from "react";
import { Layers, Loader2 } from "lucide-react";
import { PageTitle } from "@/components/common/PageHeader";
import { ComplianceTabs } from "@/components/frameworks/ComplianceTabs";
import { LibraryStats } from "@/components/frameworks/LibraryStats";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useTenant } from "@/contexts/TenantContext";
import { setCatalogFrameworkEnabled } from "@/lib/actions/framework-controls";
import {
  FRAMEWORK_CATALOG,
  type CatalogFramework,
} from "@/lib/frameworks/catalog";
import { cn } from "@/lib/utils";
import { errorToast, successToast } from "@/lib/utils/toast";

/**
 * Admin Center → Frameworks. Same layout as the Regulations library
 * (policy-center): compact cards with a badge icon and an enable switch.
 */
export function FrameworkCatalog() {
  const { tenant, policyStatus, refreshPolicyStatus } = useTenant();
  const enabled = new Set(policyStatus.enabledFrameworkSlugs);
  const [busy, setBusy] = useState<string | null>(null);
  const [info, setInfo] = useState<CatalogFramework | null>(null);

  const toggle = async (slug: string, name: string, on: boolean) => {
    if (!tenant) return;
    setBusy(slug);
    try {
      await setCatalogFrameworkEnabled(tenant.slug, slug, on);
      await refreshPolicyStatus();
      successToast(`Framework ${on ? "enabled" : "disabled"}`, name, "updated");
    } catch {
      errorToast("Unable to update framework");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
    <ComplianceTabs />
    <div className="min-h-full w-full bg-background p-5 lg:p-7">
      <div className="w-full space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
              <Layers className="h-4 w-4" />
              Framework library
            </div>
            <PageTitle>Frameworks</PageTitle>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Enable AI and security frameworks for your organization. Enabled
              frameworks appear under Frameworks in the sidebar.
            </p>
          </div>
          <LibraryStats
            libraryCount={FRAMEWORK_CATALOG.length}
            libraryLabel="Frameworks in library"
            enabledCount={FRAMEWORK_CATALOG.filter((fw) => enabled.has(fw.slug)).length}
          />
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {FRAMEWORK_CATALOG.map((fw) => {
            const { slug, name, icon, color, region } = fw;
            return (
              <article
                key={slug}
                className="flex items-center gap-3 rounded-lg border bg-card px-3 py-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
              >
                <button
                  type="button"
                  onClick={() => setInfo(fw)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  aria-label={`About ${name}`}
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-bold tracking-tight text-white",
                      color,
                    )}
                  >
                    {icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold">{name}</h2>
                    <p className="truncate text-xs text-muted-foreground">
                      {region}
                    </p>
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  {busy === slug && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  <Switch
                    checked={enabled.has(slug)}
                    disabled={busy === slug}
                    onCheckedChange={(on) => toggle(slug, name, on)}
                    aria-label={`${enabled.has(slug) ? "Disable" : "Enable"} ${name}`}
                  />
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <Dialog open={!!info} onOpenChange={(o) => !o && setInfo(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{info?.name}</DialogTitle>
            <DialogDescription>{info?.region}</DialogDescription>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {info?.about}
          </p>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}
