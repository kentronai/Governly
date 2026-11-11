"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { errorToast, infoToast } from "@/lib/utils/toast";
import { setVendorTracked } from "@/lib/actions/trust-dossier";

export function TrackButton({
  tenant,
  vendorSlug,
  vendorName,
  initialTracked,
  onChange,
  size = "sm",
}: {
  tenant: string;
  vendorSlug: string;
  vendorName: string;
  initialTracked: boolean;
  onChange?: (tracked: boolean) => void;
  size?: "sm" | "default";
}) {
  const [tracked, setTracked] = useState(initialTracked);
  const [pending, startTransition] = useTransition();

  const toggle = () =>
    startTransition(async () => {
      const next = !tracked;
      try {
        await setVendorTracked(tenant, vendorSlug, next);
        setTracked(next);
        onChange?.(next);
        infoToast(
          next ? `Tracking ${vendorName}` : `Stopped tracking ${vendorName}`,
        );
      } catch (error) {
        errorToast(error);
      }
    });

  return (
    <Button
      disabled={pending}
      onClick={toggle}
      size={size}
      variant={tracked ? "secondary" : "outline"}
    >
      <Star
        className={cn(
          "mr-1.5 h-4 w-4",
          tracked && "fill-current text-amber-500",
        )}
      />
      {tracked ? "Tracked" : "Track"}
    </Button>
  );
}
