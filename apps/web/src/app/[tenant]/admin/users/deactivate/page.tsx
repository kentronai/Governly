"use client";
import React, { useEffect, useState } from "react";
import "@/components/admin/admin.css";
import { successToast, errorToast } from "@/lib/utils/toast";

// Display-only: "non_compliant" -> "Non compliant". Never use for stored values.
const toLabel = (v?: string | null) =>
  v ? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, " ") : "";
// Removed Navbar import - using static layout instead
// Removed React Query imports - using static data instead
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserProfile } from "@/types";
import { IoCloseCircleSharp } from "react-icons/io5";
import Pagination from "@/components/common/pagination";
import { Input as InputUI } from "@/components/ui/input";
import { Button as ButtonUI } from "@/components/ui/button";
import { useUser } from "@clerk/nextjs";
import { FileSymlink, Search, Power, Eye, RotateCw } from "lucide-react";
import { RowActionsMenu } from "@/components/common/RowActionsMenu";
import { RecordViewDialog } from "@/components/common/RecordViewDialog";

const DeactivatedUsers = () => {
  const [filterValue, setFilterValue] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { user } = useUser();
  const orgId = user?.organizationMemberships?.[0]?.organization?.id;

  const [allUsersData, setAllUsersData] = useState<{
    users: any[];
    counts: number;
  }>({ users: [], counts: 0 });
  const [isFetchingUsers, setIsFetchingUsers] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [viewingUser, setViewingUser] = useState<any>(null);

  // Fetch deactivated users from server action
  const refetchUsers = React.useCallback(async () => {
    if (!orgId) return;

    try {
      setIsFetchingUsers(true);
      setIsFetching(true);
      const { getDeactivatedUsers } = await import("@/lib/actions/users");
      const data = await getDeactivatedUsers({
        page,
        pageSize,
        search: filterValue || undefined,
      });

      if (data.success) {
        setAllUsersData({
          users: data.users || [],
          counts: data.counts || 0,
        });
      }
    } catch (error: any) {
      console.error("Error fetching deactivated users:", error);
      errorToast(error.message || "Failed to fetch deactivated users");
    } finally {
      setIsFetchingUsers(false);
      setIsFetching(false);
    }
  }, [orgId, page, pageSize, filterValue]);

  // Fetch users on mount and when dependencies change
  React.useEffect(() => {
    refetchUsers();
  }, [refetchUsers]);

  const [roleFilter, setRoleFilter] = React.useState<any>("all");
  const [isLoading, setIsLoading] = useState(false);

  // Update user function to activate
  const updateUser = React.useCallback(
    async (data: { updateUserPayload: any; id: string }) => {
      if (!orgId) return;

      try {
        setIsActivating(true);
        const { updateUser: updateUserAction } = await import("@/lib/actions/users");
        await updateUserAction(data.id, data.updateUserPayload, orgId);
        successToast("User activated successfully", "User", "activated and unlocked in Clerk");
        refetchUsers();
      } catch (error: any) {
        console.error("Error activating user:", error);
        errorToast(error.message || "Failed to activate user");
      } finally {
        setIsActivating(false);
      }
    }, [orgId, refetchUsers]);

  const hasSearchFilter = Boolean(filterValue);

  const handleActivateUser = async (user: UserProfile) => {
    const _data = {
      username: (user as any).username || user.name,
      name: user.name,
      status: true,
      role: (user as any).role || "member",
    };
    updateUser({ updateUserPayload: _data, id: user.id });
  };

  const formatDateForExport = (dateString: string | null | undefined): string => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "";

      // Format as DD-MM-YYYY HH:MM:SS UTC
      const day = String(date.getUTCDate()).padStart(2, "0");
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      const year = date.getUTCFullYear();
      const hours = String(date.getUTCHours()).padStart(2, "0");
      const minutes = String(date.getUTCMinutes()).padStart(2, "0");
      const seconds = String(date.getUTCSeconds()).padStart(2, "0");

      return `${day}-${month}-${year} ${hours}:${minutes}:${seconds} UTC`;
    } catch (error) {
      console.error("Error formatting date:", error);
      return "";
    }
  };

  const handleExport = async () => {
    setIsLoading(true);
    try {
      const csvData =
        "Name,Email,Role,Status,Deactivated At\n" +
        allUsersData.users
          .map(
            (user) =>
              `${user.name || ""},${user.email || ""},${user.role || "member"},Inactive,${formatDateForExport(user.updated_at)}`
          )
          .join("\n");

      const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "deactivated_users_export.csv");
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        successToast(null, "Deactivated users", "exported ");
      }
    } catch (error) {
      errorToast("Export failed");
    }
    setIsLoading(false);
  };

  // No client-side filtering needed - API handles search filtering
  const filteredItems = allUsersData.users || [];

  // Search state lives in the page (not a nested component) so the input keeps
  // focus and mount/re-render never resets pagination.
  const [searchValue, setSearchValue] = useState(filterValue);
  useEffect(() => {
    if (searchValue === filterValue) return;
    const timer = setTimeout(() => {
      setFilterValue(searchValue);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value);
  };

  const handleClearSearch = () => {
    setSearchValue("");
    setFilterValue("");
    setPage(1);
  };

  const topContent = (
    <div className="flex flex-col gap-4 ">
      <div className="flex items-center justify-between">
        <div className="relative">
          <InputUI
            type="search"
            placeholder="Search by name...."
            className="rounded-md w-[343px] pl-10  text-sm font-normal  focus:ring-0 focus:outline-none"
            aria-label="Search Query"
            value={searchValue}
            onChange={handleSearchChange}
          />
          <Search
            size={16}
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
          />
          {searchValue && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 transform -translate-y-1/2"
              aria-label="Clear search"
            >
              <IoCloseCircleSharp className="h-4 w-4 text-muted-foreground " />
            </button>
          )}
        </div>
        <div className="flex gap-3">
          <ButtonUI
            onClick={handleExport}
            className="h-9 px-4  flex items-center gap-2"
            disabled={isLoading}
          >
            {isLoading ? (
              <RotateCw className="h-4 w-4 animate-spin" />
            ) : (
              <FileSymlink className="h-4 w-4" />
            )}
            <span className="text-sm">Export</span>
          </ButtonUI>
        </div>
      </div>
    </div>
  );

  const handlePageChange = (newPage: number) => {
    if (
      newPage >= 1 &&
      newPage <= Math.ceil((allUsersData?.counts || 0) / pageSize)
    ) {
      setPage(newPage);
    }
  };

  const handlePageSizeChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    setPageSize(Number(event.target.value));
    setPage(1); // Reset to the first page when page size changes
  };

  const renderUserRole = (role: string) => {
    return (
      <div className="flex flex-col">
        <p>
          {role === "globaladmin"
            ? "Global Admin"
            : toLabel(role?.split(":")?.length > 1 ? role?.split(":")[1] : role)}
        </p>
      </div>
    );
  };

  const renderUserActions = (user: UserProfile) => {
    return (
      <RowActionsMenu
        items={[
          { label: "View", icon: Eye, onSelect: () => setViewingUser(user) },
          { label: "Activate", icon: Power, disabled: isActivating, onSelect: () => handleActivateUser(user) },
        ]}
      />
    );
  };

  const UserTable = () => {
    const isLoadingState = isFetching || isFetchingUsers;
    const users = allUsersData?.users || [];

    return (
      <div>
        <div className="pb-4">
          {topContent}
        </div>
        <div className="border-b">
          <Table>
            <TableHeader>
              <TableRow className="h-10 border-b ">
                <TableHead>Full name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingState ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-muted"></div>
                      <span>Loading de-activated users...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : users.length > 0 ? (
                users.map((user) => (
                  <TableRow
                    key={user.id}
                    className="h-10 border-b last:border-b-0 "
                  >
                    <TableCell>
                      {user.name || "--"}
                    </TableCell>
                    <TableCell>
                      {user.email}
                    </TableCell>
                    <TableCell>
                      {renderUserRole((user as any)?.role || "--")}
                    </TableCell>
                    <TableCell>
                      {renderUserActions(user)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <p className="text-lg font-medium text-muted-foreground">
                        No data available
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="sticky bottom-0 py-2 pt-4 border-t z-50">
          <Pagination
            className="ml-64 pl-[15px]"
            pageSize={pageSize}
            setPageSize={setPageSize}
            page={page}
            setPage={setPage}
            totalPages={Math.ceil((allUsersData?.counts || 0) / pageSize)}
            onPageChange={(newPage: number) => setPage(newPage)}
            onPageSizeChange={(newSize: number) => {
              setPageSize(newSize);
              setPage(1);
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <>
      <RecordViewDialog
        open={!!viewingUser}
        onClose={() => setViewingUser(null)}
        title={viewingUser?.name || viewingUser?.email}
        fields={viewingUser ? [["Email", viewingUser.email], ["Role", viewingUser.role || "member"], ["Status", "Deactivated"]] : []}
        meta={viewingUser ? { createdAt: viewingUser.created_at, updatedAt: viewingUser.updated_at } : undefined}
      />
      <div className="flex flex-col  p-5">
        <div className="flex w-full justify-between items-center">
          <div className="text-xl font-semibold font-sans leading-[100%] mt-4">
            Deactivated Users
          </div>
        </div>

        <div className="w-full mt-4">
          <UserTable />
        </div>
      </div>
    </>
  );
};

DeactivatedUsers.displayName = "DeactivatedUsers";

export default DeactivatedUsers;
