"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRouter } from "next/navigation";
import { useTenant } from "@/contexts/TenantContext";
import { formatTimestamp } from "@/utils/formatTime";
import {
  Search,
  MoreHorizontal,
  Pencil,
  FolderOpen,
  Plus,
  Eye,
  Archive,
} from "lucide-react";
import {
  createApplication,
  updateApplication,
  archiveApplication,
  getApplications,
} from "@/lib/actions/applications";
import { successToast, errorToast } from "@/lib/utils/toast";
import ApplicationLoader from "./ApplicationLoader";
import Pagination from "@/components/common/pagination";
import { PageHeader } from "@/components/common/PageHeader";
import { GenerateTrustCenterReport } from "@/components/trust-center/GenerateTrustCenterReport";

// These dialogs are not needed until the user opens them. Keeping them out of
// the initial applications bundle materially reduces cold dev compilation.
const ApplicationModal = dynamic(() =>
  import("./ApplicationModal").then((module) => module.ApplicationModal)
);
const ApplicationView = dynamic(() => import("./ApplicationView"));
const DeleteConfirmationModal = dynamic(() =>
  import("@/components/common/DeleteConfirmationModal").then(
    (module) => module.DeleteConfirmationModal
  )
);
export interface Application {
  id: string;
  name: string;
  slug: string | null;
  status: "Not Started" | "In Progress" | "Completed" | "Archived";
  goviqEnabled: boolean;
  controlnetEnabled: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    name: string;
    email: string | null;
  } | null;
  updatedBy: {
    name: string;
    email: string | null;
  } | null;
}

interface Props {
  tenant: string;
  tenantId: string;
  userId: string;
}
export function ApplicationsList({ tenant, tenantId, userId }: Props) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isFetching, setFetching] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);

  const router = useRouter();

  /**
   * Determines the appropriate overview route based on application module configuration.
   *
   * @param app - Application object with goviqEnabled and controlnetEnabled flags
   * @param tenant - Tenant slug
   * @param applicationId - Application ID
   * @returns The full path to the appropriate overview page
   */
  const canSeeControlNet = useTenant().tenant?.controlnetEnabled ?? false;
  const getApplicationOverviewPath = useCallback(
    (
      app: Pick<Application, "goviqEnabled" | "controlnetEnabled">,
      tenant: string,
      applicationId: string
    ): string => {
      if (app.goviqEnabled === true) {
        return `/${tenant}/applications/${applicationId}/goviq/overview`;
      } else if (app.controlnetEnabled === true && canSeeControlNet) {
        return `/${tenant}/applications/${applicationId}/control-net/overview`;
      } else {
        // Neither module is enabled, default to GovIQ overview as fallback
        return `/${tenant}/applications/${applicationId}/goviq/overview`;
      }
    },
    [canSeeControlNet]
  );

  // Fetch applications from server action
  const fetchApplications = useCallback(async () => {
    try {
      setFetching(true);
      const data = await getApplications(
        tenant,
        page,
        pageSize,
        search || undefined
      );
      setApplications(data.applications || []);
      if (data.pagination) {
        setTotalPages(data.pagination.totalPages || 1);
      }
    } catch (error) {
      errorToast("Failed to refresh applications list");
    } finally {
      setFetching(false);
    }
  }, [tenant, page, pageSize, search]);

  // Fetch applications on component mount and when filters change
  useEffect(() => {
    const timeoutId = setTimeout(
      () => {
        fetchApplications();
      },
      search ? 300 : 0
    ); // Debounce search
    return () => clearTimeout(timeoutId);
  }, [fetchApplications]);

  // Reset to first page on search change
  useEffect(() => {
    setPage(1);
  }, [search]);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const handlePageSizeChange = useCallback((newSize: number) => {
    setPage(1);
    setPageSize(newSize);
  }, []);

  // No client-side filtering needed - server handles it
  const filteredApplications = applications;
  const handleCreate = async (data: {
    name: string;
    description?: string;
    goviqEnabled: boolean;
    controlnetEnabled: boolean;
  }) => {
    startTransition(async () => {
      try {
        const newApp = await createApplication({
          tenantId,
          name: data.name,
          description: data.description,
          goviqEnabled: data.goviqEnabled,
          controlnetEnabled: data.controlnetEnabled,
        });
        if (!newApp.application || !newApp.success) {
          errorToast(newApp.message);
          return;
        }
        // No optimistic insert: the raw row lacks the joined user objects the
        // table renders, and we navigate to the new app's overview anyway.
        // Standard, Strict, and Development policies are created atomically by
        // the server-side createApplication action.
        const overviewPath = getApplicationOverviewPath(
          newApp.application,
          tenant,
          newApp.application.id
        );
        router.push(overviewPath);
        setIsCreateModalOpen(false);
      } catch (error) {
        console.error("Failed to create application:", error);
        errorToast(
          error instanceof Error
            ? error.message
            : "Failed to create application"
        );
      }
    });
  };

  const handleUpdate = async (data: {
    name?: string;
    description?: string;
    goviqEnabled?: boolean;
    controlnetEnabled?: boolean;
    status?: "Not Started" | "In Progress" | "Completed" | "Archived";
  }) => {
    if (!selectedApp) return;

    startTransition(async () => {
      try {
        await updateApplication({
          id: selectedApp.id,
          ...data,
        });
        // The action returns the raw row (createdBy/updatedBy are ids), so
        // refetch rather than merge it — merging blanked "Modified By".
        await fetchApplications();
        setIsEditModalOpen(false);
        setSelectedApp(null);
      } catch (error) {
        console.error("Failed to update application:", error);
        // Rethrowing inside a transition hits the error boundary; toast instead.
        errorToast(error instanceof Error ? error.message : "Failed to update application");
      }
    });
  };

  const handleArchive = async () => {
    if (!selectedApp) return;

    startTransition(async () => {
      try {
        await archiveApplication(selectedApp.id, tenantId);
        await fetchApplications();
        setIsArchiveModalOpen(false);
        setSelectedApp(null);
        successToast("", "", "", "Application archived successfully");
      } catch (error) {
        console.error("Failed to archive application:", error);
        // throw error;
        errorToast("Failed to archive application");
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <PageHeader
        title="Applications"
        description="Centrally manage and govern every AI application with confidence."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Admins only: the component renders nothing for other users. */}
            <GenerateTrustCenterReport tenantSlug={tenant} variant="outline" />
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              disabled={isPending}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Application
            </Button>
          </div>
        }
      />

      {/* Search */}
      <div className="relative w-[343px]">
        <Input
          type="search"
          placeholder="Search applications..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 stroke-muted-foreground" />
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Application Name</TableHead>
            <TableHead>Modified By</TableHead>
            <TableHead>Modified</TableHead>
            {/* <TableHead>Status</TableHead>
            <TableHead>GovIQ</TableHead>
            <TableHead>ControlNet</TableHead> */}
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!isFetching ? (
            <>
              {!isFetching && filteredApplications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    {search
                      ? "No applications found"
                      : "No applications yet. Create one to get started!"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredApplications.map((app) => (
                  <TableRow key={app.id} className="">
                    <TableCell className="font-medium">
                      <Link
                        href={getApplicationOverviewPath(app, tenant, app.id)}
                        className="flex items-center gap-2  hover:text-blue-600 hover:underline"
                        onClick={() =>
                          localStorage.setItem("applicationName", app.name)
                        }
                      >
                        <FolderOpen className="h-4 w-4" />
                        {app.name}
                      </Link>
                    </TableCell>
                    {/* <TableCell>
                      <div
                        className={`
                      inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2  
                      w-fit
                      
                      ${
                        app.status === "Completed"
                          ? "bg-green-500/10 text-green-500"
                          : app.status === "In Progress"
                            ? "bg-yellow-500/10 text-yellow-500"
                            : app.status === "Not Started"
                              ? "bg-muted text-muted-foreground"
                              : ""
                      }
            font-medium
            text-xs
            
            cursor-default
            `}
                      >
                        {app.status}
                      </div>
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant={app.goviqEnabled ? "secondary" : "outline"}
                      >
                        {app.goviqEnabled ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          app.controlnetEnabled ? "secondary" : "outline"
                        }
                      >
                        {app.controlnetEnabled ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell> */}
                    <TableCell className="">
                      {app.updatedBy?.name
                        ? app.updatedBy.name
                        : app.createdBy?.name}
                    </TableCell>
                    <TableCell className="">
                      {formatTimestamp(app.updatedAt)}
                    </TableCell>

                    <TableCell className="">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedApp(app);
                              setIsViewModalOpen(true);
                            }}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedApp(app);
                              setIsEditModalOpen(true);
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedApp(app);
                              setIsArchiveModalOpen(true);
                            }}
                            // className="text-gray-600"
                          >
                            <Archive className="mr-2 h-4 w-4" />
                            Archive
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </>
          ) : (
            <ApplicationLoader />
          )}
        </TableBody>
      </Table>

      {/* Modals */}
      <ApplicationModal
        isOpen={isCreateModalOpen}
        mode="create"
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreate}
        isPending={isPending}
      />

      <ApplicationView
        isOpen={isViewModalOpen}
        onOpenChange={() => setIsViewModalOpen(false)}
        data={selectedApp}
      />

      <ApplicationModal
        isOpen={isEditModalOpen}
        mode="edit"
        application={selectedApp}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedApp(null);
        }}
        onSubmit={handleUpdate}
        isPending={isPending}
      />

      <DeleteConfirmationModal
        isOpen={isArchiveModalOpen}
        onClose={() => {
          setIsArchiveModalOpen(false);
          setSelectedApp(null);
        }}
        onConfirm={handleArchive}
        isLoading={isPending}
        title="Archive Application"
        itemName={selectedApp?.name || ""}
        itemType="application"
        operation="archive"
      />

      <Pagination
        className="ml-64 pl-[15px]"
        pageSize={pageSize}
        setPageSize={setPageSize}
        page={page}
        setPage={setPage}
        // nextPage={page < totalPages ? page + 1 : null}
        // prevPage={page > 1 ? page - 1 : null}
        onPageSizeChange={handlePageSizeChange}
        onPageChange={handlePageChange}
        totalPages={totalPages}
        isLoading={isFetching}
        variant="fixed"
      />
    </div>
  );
}
