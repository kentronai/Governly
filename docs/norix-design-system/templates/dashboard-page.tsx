/**
 * NORIX canonical DASHBOARD PAGE.
 *
 *   1. PageHeader
 *   2. Metric mosaic — grid-cols-[repeat(auto-fill,160px)] gap-2 of CompactMetricCard
 *   3. Detail panels — grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 of Card
 *
 * The auto-fill/160px track is what gives the tiles their even, wrapping mosaic
 * instead of stretching to fill the row. Keep it.
 */

"use client";

import {
  Receipt as ReceiptIcon,
  CheckCircle2,
  Clock,
  TriangleAlert,
  DollarSign,
  Users,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/PageHeader";
import { CompactMetricCard } from "@/components/common/CompactMetricCard";

interface Metrics {
  total: number;
  processed: number;
  pending: number;
  failed: number;
  totalValue: string;
  vendors: number;
}

export function ReceiptsDashboard({
  metrics,
  isLoading,
  recent,
}: {
  metrics?: Metrics;
  isLoading?: boolean;
  recent: { id: string; vendor: string; total: string; ago: string }[];
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Receipt capture and reconciliation at a glance"
      />

      <div className="grid grid-cols-[repeat(auto-fill,160px)] gap-2">
        <CompactMetricCard
          label="Receipts"
          value={metrics?.total}
          icon={ReceiptIcon}
          loading={isLoading}
          description="Receipts captured all-time"
        />
        <CompactMetricCard
          label="Processed"
          value={metrics?.processed}
          icon={CheckCircle2}
          loading={isLoading}
          description="Parsed and reconciled"
        />
        <CompactMetricCard
          label="Pending"
          value={metrics?.pending}
          icon={Clock}
          tone="text-amber-600"
          loading={isLoading}
          description="Awaiting processing"
        />
        <CompactMetricCard
          label="Failed"
          value={metrics?.failed}
          icon={TriangleAlert}
          tone="text-red-600"
          loading={isLoading}
          description="Could not be parsed"
        />
        <CompactMetricCard
          label="Total Value"
          value={metrics?.totalValue}
          icon={DollarSign}
          loading={isLoading}
          description="Sum of processed receipts"
        />
        <CompactMetricCard
          label="Vendors"
          value={metrics?.vendors}
          icon={Users}
          loading={isLoading}
          description="Distinct vendors seen"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ReceiptIcon className="h-4 w-4" />
              Recent Receipts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {recent.map((row) => (
                <li className="flex justify-between" key={row.id}>
                  <span className="font-medium text-muted-foreground">
                    {row.vendor}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {row.total} · {row.ago}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              Pipeline Health
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Badge variant="secondary">OCR online</Badge>
            <Badge variant="secondary">Queue draining</Badge>
            <Badge variant="outline">2 retries</Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
