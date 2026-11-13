"use client";
import React, { useEffect, useState } from "react";
import {
  Key,
  Activity,
  Settings,
  FolderOpen,
  Database,
  FileSearch,
  LayoutDashboard,
  AlertTriangle,
  LayoutGrid,
  BarChart3,
  Bot,
  ChevronDown,
  CircleHelp,
} from "lucide-react";
import { usePathname, useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenant } from "@/contexts/TenantContext";
import { NavItem } from "./NavItem";
import { AdminCenterNav } from "./AdminCenterNav";

export default function Sidebar({ isAdminUser }: { isAdminUser: boolean }) {
  const pathname = usePathname();
  const { tenant } = useParams();
  const { isSignedIn, isLoaded, orgRole } = useAuth();
  const [isMounted, setIsMounted] = useState(false);
  const isAgentDiscoveryRoute =
    pathname.startsWith(`/${tenant}/ai-agent-discovery`) ||
    pathname.startsWith(`/${tenant}/ai-agent-inventory`);
  const [isAgentDiscoveryOpen, setIsAgentDiscoveryOpen] = useState(
    isAgentDiscoveryRoute,
  );

  useEffect(() => {
    if (isAgentDiscoveryRoute) setIsAgentDiscoveryOpen(true);
  }, [isAgentDiscoveryRoute]);

  // Clerk can already be loaded on the browser's first render while it is
  // still unresolved during SSR. Render the same skeleton on both sides,
  // then reveal authenticated navigation after hydration completes.
  useEffect(() => setIsMounted(true), []);

  const { tenant: tenantInfo } = useTenant();
  // Show loading state to prevent layout shift
  if (!isMounted || !isLoaded) {
    return (
      <div className="flex w-64 flex-col border-r shadow-sm">
        <div className="flex-1 space-y-1 p-4">
          <div className="animate-pulse">
            <Skeleton className="h-4  rounded w-3/4 mb-2"></Skeleton>
            <Skeleton className="h-4  rounded w-1/2 mb-2"></Skeleton>
            <Skeleton className="h-4  rounded w-2/3 mb-2"></Skeleton>
          </div>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return null;
  }

  const isActive = (path: string) => {
    if (path === `/${tenant}`) {
      return pathname === `/${tenant}` || pathname === `/${tenant}/`;
    }
    return pathname.startsWith(path);
  };

  return (
    <div className="flex w-64 flex-col border-r shadow-sm">
      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {/* New Feature Pages - At the Top */}
        <div className="space-y-1">
          {tenantInfo?.govIQEnabled && (
            <NavItem
              href={`/${tenant}/reports`}
              icon={<LayoutDashboard className="h-4 w-4" />}
              isActive={isActive(`/${tenant}/reports`)}
            >
              Dashboard
            </NavItem>
          )}
          <NavItem
            href={`/${tenant}/applications`}
            icon={<FolderOpen className="h-4 w-4" />}
            isActive={isActive(`/${tenant}/applications`)}
          >
            Applications
          </NavItem>
          <div>
            <button
              type="button"
              onClick={() => setIsAgentDiscoveryOpen((open) => !open)}
              aria-expanded={isAgentDiscoveryOpen}
              aria-controls="ai-agent-discovery-navigation"
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                isAgentDiscoveryRoute
                  ? "bg-muted"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-inherit"
              }`}
            >
              <LayoutGrid className="h-4 w-4 shrink-0" />
              <span className="flex-1">Agent Registry</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                  isAgentDiscoveryOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            <div
              id="ai-agent-discovery-navigation"
              className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                isAgentDiscoveryOpen
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <div className="ml-5 mt-1 space-y-1 border-l pl-2">
                  <NavItem
                    href={`/${tenant}/ai-agent-discovery/dashboard`}
                    icon={<BarChart3 className="h-3.5 w-3.5" />}
                    isActive={
                      pathname === `/${tenant}/ai-agent-discovery/dashboard`
                    }
                    className="py-1.5 text-xs"
                  >
                    Agent Risk Dashboard
                  </NavItem>
                  <NavItem
                    href={`/${tenant}/ai-agent-inventory`}
                    icon={<Bot className="h-3.5 w-3.5" />}
                    isActive={pathname.startsWith(
                      `/${tenant}/ai-agent-inventory`,
                    )}
                    className="py-1.5 text-xs"
                  >
                    Agent Inventory
                  </NavItem>
                </div>
              </div>
            </div>
          </div>
          <NavItem
            href={`/${tenant}/model-registry`}
            icon={<Database className="h-4 w-4" />}
            isActive={isActive(`/${tenant}/model-registry`)}
          >
            Model Registry
          </NavItem>
          {/* AI Catalog is hidden; Trust Dossier takes its place. */}
          <NavItem
            href={`/${tenant}/admin/trust-dossier`}
            icon={<FileSearch className="h-4 w-4" />}
            isActive={isActive(`/${tenant}/admin/trust-dossier`)}
          >
            Trust Dossier
          </NavItem>
          <NavItem
            href={`/${tenant}/ai-console`}
            icon={<AlertTriangle className="h-4 w-4" />}
            isActive={isActive(`/${tenant}/ai-console`)}
          >
            AI Usage Console
          </NavItem>
        </div>
        {isAdminUser ? (
          <>
            <NavItem
              href={`/${tenant}/ops`}
              icon={<Settings className="h-4 w-4" />}
              isActive={isActive(`/${tenant}/ops`)}
            >
              Operations
            </NavItem>
          </>
        ) : (
          <></>
        )}
        <NavItem
          href={`/${tenant}/api-keys`}
          icon={<Key className="h-4 w-4" />}
          isActive={isActive(`/${tenant}/api-keys`)}
        >
          API Keys
        </NavItem>
        <NavItem
          href={`/${tenant}/observability`}
          icon={<Activity className="h-4 w-4" />}
          isActive={isActive(`/${tenant}/observability`)}
        >
          Observability
        </NavItem>
        {orgRole === "org:admin" && (
          <AdminCenterNav tenant={tenant as string} pathname={pathname} />
        )}
      </nav>
      <nav className=" mt-auto p-4 pb-6">
        <NavItem
          target="__blank__"
          href={`https://docs.kentron.ai/`}
          icon={<CircleHelp className="h-4 w-4" />}
          isActive={false}
        >
          Docs
        </NavItem>
        <p className="px-3 pt-2 text-xs text-muted-foreground">
          Governly v{process.env.NEXT_PUBLIC_APP_VERSION}
        </p>
      </nav>
    </div>
  );
}
