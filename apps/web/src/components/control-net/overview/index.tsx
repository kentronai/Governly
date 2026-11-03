"use client";

import Stats from "./stats";
import RecentEndpointsTable from "../../common/recents";
import {
  useApplicationGraph,
  useApplicationLogs,
} from "@/store/applicationLogs.store";
import ObservabilityChart from "@/components/common/observability-chart";
import { PageTitle } from "@/components/common/PageHeader";
export default function ControlNetOverview() {
  const props = useApplicationLogs();
  const chartProps = useApplicationGraph();

  return (
    <div className=" space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <PageTitle>Control Overview</PageTitle>
      </div>
      <Stats></Stats>
      <ObservabilityChart {...chartProps}></ObservabilityChart>
      <RecentEndpointsTable
        hideApplicationName={true}
        {...props}
      ></RecentEndpointsTable>
    </div>
  );
}
