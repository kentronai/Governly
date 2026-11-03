"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Boxes } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useObservabilityIntegrations } from "@/store/tenantLogs.store";
import IntegrationStatusSection from "./integration-status";
import LangSmithStats from "./langsmith-stats";
import LangSmithRuns from "./langsmith-runs";

import { PageTitle } from "@/components/common/PageHeader";
function EmptyState({ href }: { href: string }) {
  return (
    <Card className="shadow-sm border">
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <Boxes className="h-10 w-10 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-lg font-semibold">
            Runtime observability is unavailable
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            Connect a LangSmith workspace from Admin → Integrations to start
            viewing execution traces.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href={href}>Connect from Admin → Integrations</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Observability() {
  const params = useParams();
  const tenant = typeof params?.tenant === "string" ? params.tenant : "";
  const { data, isLoading } = useObservabilityIntegrations();

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <PageTitle>Observability Dashboard</PageTitle>
      </div>

      {isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : !data.status.langsmith.connected ? (
        <EmptyState href={`/${tenant}/admin/integrations`} />
      ) : (
        <>
          <IntegrationStatusSection />
          <LangSmithStats metrics={data.metrics} />
          <LangSmithRuns />
        </>
      )}
    </div>
  );
}
