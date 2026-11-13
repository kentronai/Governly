"use client";

import Link from "next/link";
import { Plug, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Shown when an action needs a provider (AWS, GitHub, …) that the tenant has
 * not connected yet. Sends the user to Admin Center → Integrations.
 */
export function ConnectIntegrationDialog({
  open,
  onOpenChange,
  tenant,
  provider,
  icon: Icon = Plug,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: string;
  /** e.g. "AWS". Omit for the generic "an integration" wording. */
  provider?: string;
  icon?: LucideIcon;
  description?: string;
}) {
  const name = provider ?? "an integration";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
          <DialogTitle>Connect {provider ? `your ${provider}` : "an integration"}</DialogTitle>
          <DialogDescription>
            {description ??
              `${provider ? `${provider} isn't` : "No integration is"} connected yet. Connect ${name} in Admin Center → Integrations to use this feature.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button asChild>
            <Link href={`/${tenant}/admin/integrations`}>
              Go to Integrations
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
