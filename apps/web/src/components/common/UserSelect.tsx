"use client";

import React, { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface ClerkUser {
  id: string;
  name: string;
  email: string;
  imageUrl?: string;
}

interface UserSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  error?: boolean;
  label?: string;
  required?: boolean;
  tenantId: string;
  disabled?: boolean;
  /** Render only the dropdown at the standard input height (h-9); the form supplies the label. */
  bare?: boolean;
  id?: string;
}

/**
 * UserSelect component for selecting users from organization members
 * Fetches organization members dynamically from Clerk and displays them in a dropdown
 */
export const UserSelect: React.FC<UserSelectProps> = ({
  value,
  onChange,
  placeholder = "Select a user...",
  className = "",
  error = false,
  label = "Select User from Organization",
  required = false,
  tenantId,
  disabled = false,
  bare = false,
  id,
}) => {
  const [users, setUsers] = useState<ClerkUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        setErrorMessage(null);

        const { fetchOrganizationMembers } = await import("@/lib/api/users");
        const data = await fetchOrganizationMembers(tenantId);

        setUsers(data);
      } catch (error) {
        console.error("Error fetching organization members:", error);
        setErrorMessage("Failed to load organization members");
        // Set empty array as fallback
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };

    if (tenantId) {
      fetchUsers();
    }
  }, [tenantId]);

  if (bare && (loading || errorMessage)) {
    return (
      <div
        className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm ${errorMessage ? "text-red-500" : "text-muted-foreground"}`}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {errorMessage ?? "Loading members..."}
      </div>
    );
  }

  if (bare) {
    return (
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          id={id}
          className={`h-9 w-full ${error ? "border-red-500" : ""} ${className}`}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {users.length === 0 ? (
            <SelectItem value="none" disabled>
              No organization members available
            </SelectItem>
          ) : (
            users.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                <span className="flex min-w-0 items-center gap-2">
                  {user.imageUrl && (
                    <img src={user.imageUrl} alt="" className="h-5 w-5 rounded-full" />
                  )}
                  <span className="truncate">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </span>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium text-muted-foreground">
          {label}
          {required && " *"}
        </Label>
        <div className="flex items-center gap-2 p-2 border rounded-md bg-muted h-14!">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">
            Loading organization members...
          </span>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          {label}
          {required && " *"}
        </Label>
        <div className="p-2 border  rounded-md h-14!">
          <span className="text-sm text-red-500">{errorMessage}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-normal text-muted-foreground">
        {label}
        {required && " *"}
      </Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          className={`${error ? "border-red-500" : ""} ${className} h-14!`}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {users.length === 0 ? (
            <SelectItem value="" disabled>
              No organization members available
            </SelectItem>
          ) : (
            users.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                <div className="flex items-center gap-2">
                  {user.imageUrl && (
                    <img
                      src={user.imageUrl}
                      alt={user.name}
                      className="w-6 h-6 rounded-full"
                    />
                  )}
                  <div>
                    <div className="font-medium text-left">{user.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {user.email}
                    </div>
                  </div>
                </div>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
};

export default UserSelect;
