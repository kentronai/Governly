"use client";
import React from "react";
import { Risk } from "./type";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/common/PageHeader";
export default function View({ risk }: { risk: Risk }) {
  const router = useRouter();
  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" onClick={() => router.back()}>
        <ChevronLeft></ChevronLeft>
        Back
      </Button>
      <div className="space-y-3">
        <PageTitle>{risk.riskName}</PageTitle>
        <p className="text-muted-foreground">{risk.description}</p>
      </div>
    </div>
  );
}
