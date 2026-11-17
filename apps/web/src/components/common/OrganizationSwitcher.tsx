// src/components/common/OrganizationSwitcher.tsx
"use client";

import {
  OrganizationSwitcher as ClerkOrganizationSwitcher,
  UserButton as ClerkUserButton,
} from "@clerk/nextjs";
import { useUser } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { isKentronEmail } from "@/lib/utils/validateEmail";
import { useState, useEffect } from "react";

export function OrganizationSwitcher() {
  const [isMounted, setIsMounted] = useState(false);
  const { user } = useUser();
  // Kentron staff onboard client organizations; everyone else is limited to one and gets told so.
  const createUrl = isKentronEmail(user?.primaryEmailAddress?.emailAddress ?? "")
    ? "/admin/client-onboarding"
    : "/unauthorized?reason=organization-limit";

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div className="px-3 py-2 border rounded-md min-h-10 flex items-center">
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  return (
    <ClerkOrganizationSwitcher
      appearance={{ theme: shadcn }}
      createOrganizationMode="navigation"
      createOrganizationUrl={createUrl}
      afterCreateOrganizationUrl="/"
      afterSelectOrganizationUrl="/"
    />
  );
}

export function UserButton() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div className="flex items-center">
        <div className="w-8 h-8 bg-muted rounded-full animate-pulse"></div>
      </div>
    );
  }

  return (
    <div className="flex border items-center">
      <ClerkUserButton />
    </div>
  );
}
