"use client";

import { useParams } from "next/navigation";
import UseCaseModule from "./use-case-module";


import { PageTitle } from "@/components/common/PageHeader";
interface UseCaseAppProps {
  initialUseCases?: any[];
  applicationId: string;
  tenantId: string;
  userId: string;
}

export default function UseCaseApp({
  initialUseCases = [],
  applicationId,
  tenantId,
  userId,
}: UseCaseAppProps) {
  const params = useParams();
  const tenantSlug = params.tenant as string;
  return (
    <div className="min-h-screen w-full">
      <PageTitle className="mb-6">Use Case</PageTitle>
      <UseCaseModule
        initialUseCases={initialUseCases}
        applicationId={applicationId}
        tenantId={tenantId}
      />
    </div>
  );
}
