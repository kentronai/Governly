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
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Copy, Check, Ban, Trash2, Key, Eye } from "lucide-react";
import { RowActionsMenu } from "@/components/common/RowActionsMenu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  createApiKey,
  revokeApiKey,
  deleteApiKey,
} from "@/lib/actions/api-keys";
import { ApiKeyModal } from "./ApiKeyModal";
import { ApiKeyDisplayModal } from "./ApiKeyDisplayModal";
import { DeleteConfirmationModal } from "@/components/common/DeleteConfirmationModal";

import { PageTitle } from "@/components/common/PageHeader";
import { RecordMetadata } from "@/components/common/RecordMetadata";
import Pagination from "@/components/common/pagination";
interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  permissions: string[];
  rateLimitPerMinute?: number | null;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  user_createdBy?: {
    name?: string | null;
    email?: string | null;
  } | null;
  user_revokedBy?: {
    name?: string | null;
    email?: string | null;
  } | null;
}

interface Props {
  initialKeys: ApiKey[];
  tenant: string;
  tenantId: string;
  userId: string;
}

export function ApiKeysList({ initialKeys, tenant, tenantId, userId }: Props) {
  const [keys, setKeys] = useState(initialKeys);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDisplayModalOpen, setIsDisplayModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null);
  const [viewingKey, setViewingKey] = useState<ApiKey | null>(null);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string>("");
  const [copiedKeyId, setCopiedKeyId] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const filteredKeys = keys.filter(
    (k) =>
      k.name.toLowerCase().includes(search.toLowerCase()) ||
      k.keyPrefix.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (data: any) => {
    startTransition(async () => {
      try {
        const result = await createApiKey({
          tenantId,
          ...data,
        });
        setKeys((prev) => [result as any, ...prev]);
        setNewlyCreatedKey((result as any).plainKey);
        setIsCreateModalOpen(false);
        setIsDisplayModalOpen(true);
      } catch (error) {
        console.error("Failed to create API key:", error);
        // Rethrowing inside a transition hits the error boundary; toast instead.
        errorToast(error instanceof Error ? error.message : "Failed to create API key");
      }
    });
  };

  const handleRevoke = async (keyId: string) => {
    startTransition(async () => {
      try {
        const revoked = await revokeApiKey(keyId);
        setKeys((prev) =>
          prev.map((k) =>
            k.id === revoked.id
              ? { ...k, isActive: false, revokedAt: revoked.revokedAt }
              : k
          )
        );
      } catch (error) {
        console.error("Failed to revoke API key:", error);
        // Rethrowing inside a transition hits the error boundary; toast instead.
        errorToast(error instanceof Error ? error.message : "Failed to revoke API key");
      }
    });
  };

  const handleDelete = async () => {
    if (!selectedKey) return;

    startTransition(async () => {
      try {
        await deleteApiKey(selectedKey.id);
        setKeys((prev) => prev.filter((k) => k.id !== selectedKey.id));
        setIsDeleteModalOpen(false);
        setSelectedKey(null);
      } catch (error) {
        console.error("Failed to delete API key:", error);
        // Rethrowing inside a transition hits the error boundary; toast instead.
        errorToast(error instanceof Error ? error.message : "Failed to delete API key");
      }
    });
  };

  const formatDate = (date?: string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("en-US");
  };

  const isExpired = (expiresAt?: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <PageTitle>API Keys</PageTitle>
          <p className="text-muted-foreground">
            Manage API keys for programmatic access to ControlNet
          </p>
        </div>
        <Button
          onClick={() => setIsCreateModalOpen(true)}
          className=""
          disabled={isPending}
        >
          <Plus className="h-4 w-4 mr-2" />
          Create API Key
        </Button>
      </div>

      {/* Search */}
      <div className="relative w-[400px]">
        <Input
          type="search"
          placeholder="Search API keys..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="pl-10"
        />
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      </div>

      {/* Keys Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Key Prefix</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Used</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredKeys.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="text-center py-12 text-muted-foreground"
              >
                {search
                  ? "No API keys found"
                  : "No API keys yet. Create one to get started!"}
              </TableCell>
            </TableRow>
          ) : (
            filteredKeys.slice((page - 1) * pageSize, page * pageSize).map((key) => {
              const expired = isExpired(key.expiresAt);
              const isInactive = !key.isActive || expired || key.revokedAt;

              return (
                <TableRow key={key.id} className="">
                  <TableCell className="font-medium">{key.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 ">
                      <code className="text-sm bg-muted px-2 py-1 rounded">
                        {key.keyPrefix}...
                      </code>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={isInactive ? "outline" : "secondary"}>
                      {key.revokedAt
                        ? "Revoked"
                        : expired
                          ? "Expired"
                          : key.isActive
                            ? "Active"
                            : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {formatDate(key.lastUsedAt) || "Never"}
                  </TableCell>

                  <TableCell>
                    <RowActionsMenu
                      label={`Actions for ${key.name}`}
                      items={[
                        { label: "View", icon: Eye, onSelect: () => setViewingKey(key) },
                        {
                          label: "Revoke",
                          icon: Ban,
                          destructive: true,
                          hidden: !(key.isActive && !key.revokedAt && !expired),
                          disabled: isPending,
                          confirm: `Revoke "${key.name}"? Requests using it will be rejected.`,
                          onSelect: () => handleRevoke(key.id),
                        },
                        {
                          label: "Delete",
                          icon: Trash2,
                          destructive: true,
                          disabled: isPending,
                          onSelect: () => {
                            setSelectedKey(key);
                            setIsDeleteModalOpen(true);
                          },
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      {filteredKeys.length > pageSize && (
        <Pagination
          page={page}
          setPage={setPage}
          totalPages={Math.ceil(filteredKeys.length / pageSize)}
          pageSize={pageSize}
          setPageSize={setPageSize}
        />
      )}

      {/* Stats */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>Total Keys: {keys.length}</span>
        <span>•</span>
        <span>
          Active: {keys.filter((k) => k.isActive && !k.revokedAt).length}
        </span>
        <span>•</span>
        <span>Revoked: {keys.filter((k) => k.revokedAt).length}</span>
      </div>

      {/* Modals */}
      <ApiKeyModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreate}
        isPending={isPending}
      />

      <ApiKeyDisplayModal
        isOpen={isDisplayModalOpen}
        apiKey={newlyCreatedKey}
        onClose={() => {
          setIsDisplayModalOpen(false);
          setNewlyCreatedKey("");
        }}
      />

      <Dialog open={!!viewingKey} onOpenChange={(o) => !o && setViewingKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewingKey?.name}</DialogTitle>
          </DialogHeader>
          {viewingKey && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Key</dt>
              <dd><code>{viewingKey.keyPrefix}...</code></dd>
              <dt className="text-muted-foreground">Permissions</dt>
              <dd>{viewingKey.permissions.join(", ") || "None"}</dd>
              <dt className="text-muted-foreground">Rate limit</dt>
              <dd>{viewingKey.rateLimitPerMinute ? `${viewingKey.rateLimitPerMinute}/min` : "Default"}</dd>
              <dt className="text-muted-foreground">Last used</dt>
              <dd>{formatDate(viewingKey.lastUsedAt) || "Never"}</dd>
              <dt className="text-muted-foreground">Expires</dt>
              <dd>{formatDate(viewingKey.expiresAt) || "Never"}</dd>
              {viewingKey.revokedAt && (
                <>
                  <dt className="text-muted-foreground">Revoked</dt>
                  <dd>{formatDate(viewingKey.revokedAt)}</dd>
                </>
              )}
            </dl>
          )}
          {viewingKey && (
            <RecordMetadata
              createdBy={viewingKey.user_createdBy?.name || viewingKey.user_createdBy?.email}
              createdAt={viewingKey.createdAt}
              updatedBy={viewingKey.revokedAt ? viewingKey.user_revokedBy?.name || viewingKey.user_revokedBy?.email : null}
              updatedAt={viewingKey.updatedAt ?? viewingKey.revokedAt}
            />
          )}
        </DialogContent>
      </Dialog>

      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedKey(null);
        }}
        onConfirm={handleDelete}
        isLoading={isPending}
        title="Delete API Key"
        itemName={selectedKey?.name || ""}
        itemType="API key"
      />
    </div>
  );
}
