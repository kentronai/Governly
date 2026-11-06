"use client";

import React, { useEffect, useState } from "react";

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Icons
import { Loader2, RefreshCw } from "lucide-react";
import { fetchSummaryMetrics, fetchUseCasesByRisk } from "@/lib/api/reports";
import { fetchPolicyCenterPolicies } from "@/lib/api/policy-center";
import { FRAMEWORK_CATALOG } from "@/lib/frameworks/catalog";
import { useTenant } from "@/contexts/TenantContext";

import { PageTitle } from "@/components/common/PageHeader";
interface ReportsPageProps {
  params: Promise<{ tenant: string }>;
}

interface RiskClassificationData {
  Critical: number;
  High: number;
  Medium: number;
  Low: number;
  "No Risk": number;
}

interface UseCasesByRiskResponse {
  success: boolean;
  data: {
    riskClassification: RiskClassificationData;
    totalUseCases: number;
    summary: {
      withRisks: number;
      withoutRisks: number;
    };
  };
}

interface SummaryMetricsResponse {
  success: boolean;
  data: {
    totalApplications: number;
    totalUseCases: number;
    totalAgents: number;
  };
}

function MetricCard({
  title,
  stats,
}: {
  title: string;
  stats: { label: string; value: number }[];
}) {
  return (
    <div className="rounded-xl border bg-muted p-6 transition-shadow hover:shadow-md">
      <h4 className="text-sm font-semibold text-muted-foreground">{title}</h4>
      <div className="mt-4 flex items-end justify-around gap-4">
        {stats.map(({ label, value }) => (
          <div key={label} className="text-center">
            <div className="text-4xl font-bold tabular-nums">{value}</div>
            <div className="mt-1 text-sm text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReportsPage({ params }: ReportsPageProps) {
  const [riskData, setRiskData] = useState<RiskClassificationData>({
    Critical: 0,
    High: 0,
    Medium: 0,
    Low: 0,
    "No Risk": 0,
  });
  const [summaryMetrics, setSummaryMetrics] = useState({
    totalApplications: 0,
    totalUseCases: 0,
    totalAgents: 0,
  });
  const [regulations, setRegulations] = useState({ total: 0, active: 0 });
  const { policyStatus } = useTenant();
  const frameworks = {
    total: FRAMEWORK_CATALOG.length,
    active: policyStatus.enabledFrameworkSlugs.length,
  };
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummaryMetricsData = async () => {
    try {
      const resolvedParams = await params;
      const data = await fetchSummaryMetrics(resolvedParams.tenant);
      setSummaryMetrics(data);
    } catch (err) {
      console.error("Error fetching summary metrics:", err);
      // Don't set error state for summary metrics to avoid breaking the main functionality
    }
  };

  const fetchRegulationsData = async () => {
    try {
      const policies = await fetchPolicyCenterPolicies();
      setRegulations({
        total: policies.length,
        active: policies.filter((policy: any) => policy.isActive).length,
      });
    } catch (err) {
      console.error("Error fetching regulations:", err);
    }
  };

  const fetchRiskData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const resolvedParams = await params;
      const data = await fetchUseCasesByRisk(resolvedParams.tenant);

      setRiskData(data.riskClassification);
    } catch (err) {
      console.error("Error fetching risk data:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    fetchRiskData(true);
    fetchSummaryMetricsData();
    fetchRegulationsData();
  };

  useEffect(() => {
    fetchRiskData();
    fetchSummaryMetricsData();
    fetchRegulationsData();
  }, [params]);

  // Helper function to get bar width based on count
  const getBarWidth = (count: number, maxCount: number) => {
    if (maxCount === 0) return "w-4";
    const percentage = (count / maxCount) * 100;
    if (percentage >= 80) return "w-24";
    if (percentage >= 60) return "w-20";
    if (percentage >= 40) return "w-16";
    if (percentage >= 20) return "w-12";
    return "w-8";
  };

  // Helper function to get bar color based on risk level
  const getBarColor = (riskLevel: string) => {
    switch (riskLevel) {
      case "Critical":
        return "bg-red-800";
      case "High":
        return "bg-red-500";
      case "Medium":
        return "bg-orange-500";
      case "Low":
        return "bg-yellow-500";
      case "No Risk":
        return "bg-green-500";
      default:
        return "bg-gray-500";
    }
  };

  // Calculate max count for proportional bar widths
  const maxCount = Math.max(...Object.values(riskData));

  const complianceData = [
    { name: "EU AI act", cases: 44, evidence: "29/44" },
    { name: "ISO 42001", cases: 32, evidence: "1/32" },
    { name: "NYC local law no.144", cases: 14, evidence: "2/14" },
  ];

  const topDomains = [
    "Candidate scoring",
    "Natural language processing",
    "Text generation",
    "Candidate recommendation",
  ];

  return (
    <div className="min-h-screen  p-6">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <PageTitle className="mb-2">AI Governance Reports</PageTitle>
          <p className="text-muted-foreground mb-6">
            Comprehensive overview of AI use cases and compliance status
          </p>
        </div>

        {/* Executive Overview Dashboard */}
        <Card className="w-full">
          <CardContent className="space-y-6 pt-4">
            {/* Summary Metrics Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold ">
                Governance Overview
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isLoading || isRefreshing}
                className="h-8 w-8 p-0"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
                />
              </Button>
            </div>

            {/* Key metrics */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <MetricCard
                title="Applications and Use Cases"
                stats={[
                  { label: "Applications", value: summaryMetrics.totalApplications },
                  { label: "Use Cases", value: summaryMetrics.totalUseCases },
                  { label: "Agents", value: summaryMetrics.totalAgents },
                ]}
              />
              <MetricCard
                title="Frameworks"
                stats={[
                  { label: "Total", value: frameworks.total },
                  { label: "Active", value: frameworks.active },
                ]}
              />
              <MetricCard
                title="Regulations"
                stats={[
                  { label: "Total", value: regulations.total },
                  { label: "Active", value: regulations.active },
                ]}
              />
            </div>

            {/* Main Content Area - Three Column Layout */}
            {/* add grid instead of hidden to make it visible */}
            <div className="hidden grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column */}
              <div className="space-y-6">
                {/* Use case count by risk classification */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">
                      Use case count by risk classification
                    </h3>
                  </div>
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
                      <span className="ml-2 text-sm text-gray-500">
                        Loading risk data...
                      </span>
                    </div>
                  ) : error ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-red-600 mb-2">
                        Error loading risk data
                      </p>
                      <p className="text-xs text-gray-500">{error}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefresh}
                        className="mt-2"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Try Again
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(riskData).map(([riskLevel, count]) => (
                        <div
                          key={riskLevel}
                          className="flex items-center justify-between"
                        >
                          <span className="text-sm text-gray-600">
                            {riskLevel}
                          </span>
                          <div className="flex items-center space-x-2">
                            <div
                              className={`${getBarWidth(count, maxCount)} h-3 ${getBarColor(riskLevel)} rounded`}
                            ></div>
                            <span className="text-sm font-semibold">
                              {count}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Compliance progress */}
                <div>
                  <h3 className="font-semibold mb-3">Compliance progress</h3>
                  <div className="space-y-3">
                    {complianceData.map((compliance, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <span className="text-sm">{compliance.name}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex space-x-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold">88</div>
                      <div className="text-xs text-gray-600">Progress</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">60</div>
                      <div className="text-xs text-gray-600">Completed</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Middle Column */}
              <div className="space-y-6">
                {/* Use case governance progress */}
                <div>
                  <h3 className="font-semibold mb-3">
                    Use case governance progress
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Intake</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-20 h-3 bg-purple-500 rounded"></div>
                        <span className="text-sm font-semibold">100</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Review</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-3 bg-purple-500 rounded"></div>
                        <span className="text-sm font-semibold">20</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Governance</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-16 h-3 bg-purple-500 rounded"></div>
                        <span className="text-sm font-semibold">80</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Detailed use case evidence */}
                <div>
                  <h3 className="font-semibold mb-3">
                    Detailed use case evidence
                  </h3>
                  <div className="space-y-2">
                    <div className="text-sm">
                      <span className="font-medium">44 use cases</span>
                      <span className="text-gray-600">
                        {" "}
                        Evidence provided: 29/44
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="font-medium">32 use cases</span>
                      <span className="text-gray-600">
                        {" "}
                        Evidence provided: 1/32
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="font-medium">14 use cases</span>
                      <span className="text-gray-600">
                        {" "}
                        Evidence provided: 2/14
                      </span>
                    </div>
                  </div>
                </div>

                {/* Top domains */}
                <div>
                  <h3 className="font-semibold mb-3">Top domains</h3>
                  <div className="space-y-2">
                    {topDomains.map((domain, index) => (
                      <div key={index} className="text-sm">
                        {domain}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-6">
                {/* Use cases by region */}
                <div>
                  <h3 className="font-semibold mb-3">Use cases by region</h3>
                  <div className="space-y-2">
                    {[
                      { name: "Midwest", value: 45 },
                      { name: "East coast", value: 52 },
                      { name: "West coast", value: 48 },
                      { name: "Europe", value: 38 },
                      { name: "Not defined", value: 17 },
                    ].map((region, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between"
                      >
                        <span className="text-sm text-gray-600">
                          {region.name}
                        </span>
                        <div className="w-12 h-2 bg-pink-300 rounded"></div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Most valuable use cases */}
                <div>
                  <h3 className="font-semibold mb-3 border-b-2 border-blue-500 pb-1">
                    Most valuable use cases
                  </h3>
                  <div className="mt-4">
                    <div className="text-sm text-gray-600 mb-2">
                      Total use case value
                    </div>
                    <div className="text-2xl font-bold text-green-600 mb-4">
                      $240m
                    </div>
                    <div className="space-y-2">
                      <div className="w-20 h-2 bg-pink-300 rounded"></div>
                      <div className="w-16 h-2 bg-pink-300 rounded"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
