"use client";

import { errorToast } from "@/lib/utils/toast";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RowActionsMenu } from "@/components/common/RowActionsMenu";
import Pagination from "@/components/common/pagination";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Eye,
} from "lucide-react";
import {
  createStakeholder,
  updateStakeholder,
  deleteStakeholder,
} from "@/lib/actions/stakeholders";
import { StakeholderModal } from "./StakeholderModal";
import { DeleteConfirmationModal } from "@/components/common/DeleteConfirmationModal";
import DynamicDetailsViewModal, {
  createFieldConfig,
} from "@/components/modal/DynamicDetailsViewModal";

import { PageTitle } from "@/components/common/PageHeader";
interface Stakeholder {
  id: string;
  userName: string;
  role: string;
  email?: string | null;
  department?: string | null;
  responsibilities?: string | null;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string | null;
}

interface ClerkUser {
  id: string;
  name: string;
  email: string;
  imageUrl?: string;
}

interface Props {
  initialStakeholders: Stakeholder[];
  applicationId: string;
  tenantId: string;
  userId: string;
}

// "org:admin" / "member" -> "Admin" / "Member"
const formatRole = (role?: string | null) => {
  const value = (role ?? "").replace(/^org:/, "");
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "-";
};

export function StakeholdersList({
  initialStakeholders,
  applicationId,
  tenantId,
  userId,
}: Props) {
  const [stakeholders, setStakeholders] = useState(initialStakeholders);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedStakeholder, setSelectedStakeholder] =
    useState<Stakeholder | null>(null);

  const filteredStakeholders = stakeholders.filter(
    (s) =>
      s.userName.toLowerCase().includes(search.toLowerCase()) ||
      s.role.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (data: any) => {
    startTransition(async () => {
      try {
        const newStakeholder = await createStakeholder({
          tenantId,
          applicationId,
          ...data,
        });
        setStakeholders((prev) => [newStakeholder as any, ...prev]);
        setIsModalOpen(false);
      } catch (error) {
        console.error("Failed to create stakeholder:", error);
        // Rethrowing inside a transition hits the error boundary; toast instead.
        errorToast(error instanceof Error ? error.message : "Failed to create stakeholder");
      }
    });
  };

  const handleUpdate = async (data: any) => {
    if (!selectedStakeholder) return;

    startTransition(async () => {
      try {
        const updated = await updateStakeholder(selectedStakeholder.id, data);
        setStakeholders((prev) =>
          prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s))
        );
        setIsModalOpen(false);
        setSelectedStakeholder(null);
      } catch (error) {
        console.error("Failed to update stakeholder:", error);
        // Rethrowing inside a transition hits the error boundary; toast instead.
        errorToast(error instanceof Error ? error.message : "Failed to update stakeholder");
      }
    });
  };

  const handleDelete = async () => {
    if (!selectedStakeholder) return;

    startTransition(async () => {
      try {
        await deleteStakeholder(selectedStakeholder.id);
        setStakeholders((prev) =>
          prev.filter((s) => s.id !== selectedStakeholder.id)
        );
        setIsDeleteModalOpen(false);
        setSelectedStakeholder(null);
      } catch (error) {
        console.error("Failed to delete stakeholder:", error);
        // Rethrowing inside a transition hits the error boundary; toast instead.
        errorToast(error instanceof Error ? error.message : "Failed to delete stakeholder");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <PageTitle>Stakeholders</PageTitle>
          <p className="text-muted-foreground">
            Manage stakeholders in this application
          </p>
        </div>
        <Button
          onClick={() => {
            setSelectedStakeholder(null);
            setIsModalOpen(true);
          }}
          disabled={isPending}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Stakeholder
        </Button>
      </div>

      {/* Search */}
      <div className="relative w-[343px]">
        <Input
          type="search"
          placeholder="Search stakeholders..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="pl-10 h-9"
        />
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      </div>

      {/* Table */}
      <div className="">
        <Table>
          <TableHeader>
            <TableRow className="border-b">
              <TableHead className="font-semibold">Name</TableHead>
              <TableHead className="font-semibold">Role</TableHead>
              <TableHead className="font-semibold">Email</TableHead>
              <TableHead className="font-semibold">Department</TableHead>
              <TableHead className="font-semibold">Responsibilities</TableHead>
              <TableHead className="font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStakeholders.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center py-12 text-muted-foreground"
                >
                  {search
                    ? "No stakeholders found"
                    : "No stakeholders yet. Add one to get started!"}
                </TableCell>
              </TableRow>
            ) : (
              filteredStakeholders.slice((page - 1) * pageSize, page * pageSize).map((stakeholder) => (
                <TableRow
                  key={stakeholder.id}
                  className=" border-b last:border-b-0"
                >
                  <TableCell className="font-medium">
                    {stakeholder.userName}
                  </TableCell>
                  <TableCell>{formatRole(stakeholder.role)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {stakeholder.email || "-"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {stakeholder.department || "-"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                    {stakeholder.responsibilities || "-"}
                  </TableCell>
                  <TableCell>
                    <RowActionsMenu
                      items={[
                        { label: "View", icon: Eye, onSelect: () => { setSelectedStakeholder(stakeholder); setIsViewModalOpen(true); } },
                        { label: "Edit", icon: Pencil, disabled: isPending, onSelect: () => { setSelectedStakeholder(stakeholder); setIsModalOpen(true); } },
                        { label: "Delete", icon: Trash2, destructive: true, disabled: isPending, onSelect: () => { setSelectedStakeholder(stakeholder); setIsDeleteModalOpen(true); } },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {filteredStakeholders.length > pageSize && (
          <Pagination page={page} setPage={setPage} totalPages={Math.ceil(filteredStakeholders.length / pageSize)} pageSize={pageSize} setPageSize={setPageSize} />
        )}
      </div>

      {/* Modals */}
      <StakeholderModal
        isOpen={isModalOpen}
        mode={selectedStakeholder ? "edit" : "create"}
        stakeholder={selectedStakeholder}
        tenantId={tenantId}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedStakeholder(null);
        }}
        onSubmit={selectedStakeholder ? handleUpdate : handleCreate}
        isPending={isPending}
      />

      <DynamicDetailsViewModal
        isOpen={isViewModalOpen}
        onClose={() => {
          setIsViewModalOpen(false);
          setSelectedStakeholder(null);
        }}
        data={selectedStakeholder}
        title="Stakeholder Details"
        fields={createFieldConfig.stakeholder()}
      />

      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedStakeholder(null);
        }}
        onConfirm={handleDelete}
        isLoading={isPending}
        title="Delete Stakeholder"
        itemName={selectedStakeholder?.userName || ""}
        itemType="stakeholder"
      />
    </div>
  );
}
