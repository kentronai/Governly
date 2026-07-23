"use client";


import { FileText, User, Calendar, Users, Target, AlertTriangle, ShieldCheck } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useState, useEffect, useMemo } from "react"
import { useParams } from "next/navigation"
import { formatDate } from "@/lib/utils/date"
import ApplicationStatus from "@/components/applications/ApplicationStatus"
import { useTenant } from "@/contexts/TenantContext";
import { getApplicationDetails } from "@/lib/actions/applications";

// Custom Progress component to replace the imported one
const Progress = ({ value, className = "" }: any) => {
  return (
    <div className={`w-full bg-gray-200 rounded-full h-3 ${className}`}>
      <div
        className="h-full bg-blue-500 rounded-full transition-all"
        style={{ width: `${value}%` }}
      ></div>
    </div>
  );
};

interface PolicyPack {
  id: string;
  name: string;
  description: string;
  category: string;
  country: string;
  state?: string;
  projectsCompliant: number;
  totalProjects: number;
  isActive: boolean;
  tags: string[];
  icon: string;
  color: string;
  type?: "Mandatory" | "Voluntary" | "";
  complianceStatus?: string;
  coverageScore?: number;
  evaluatedAt?: string | null;
  gaps?: Array<{ key: string; title: string; reason: string; status: string }>;
  evaluation?: { controls?: Array<{ key: string; status: string; priority?: "high" | "medium" | "low"; evidence?: Array<{ source?: string }> }> };
}

interface ApplicationDetails {
  application: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  owner: {
    id: string;
    name: string;
    email: string;
  };
  lastUpdated: {
    date: string;
    by: {
      id: string | null;
      name: string;
      email: string;
    };
  };
  stakeholders: Array<{
    id: string;
    name: string;
    role: string;
    email: string;
    department: string;
    responsibilities: string;
  }>;
  useCases: Array<{
    id: string;
    function: string;
    useCase: string;
    whatItDoes: string;
    keyInputs: string[];
    primaryOutputs: string[];
    businessImpact: string[];
    kpis: string[];
  }>;
}

export default function OverviewPage() {
  const params = useParams();
  const [applicationDetails, setApplicationDetails] =
    useState<ApplicationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { applicationPolicy } = useTenant();
  const assignedPolicies = useMemo(
    () => ((applicationPolicy ?? []) as PolicyPack[]).filter((policy) => policy.isActive),
    [applicationPolicy]
  );
  const complianceMetrics = useMemo(() => {
    const applicable = assignedPolicies.filter((policy) => policy.complianceStatus !== "not_applicable");
    const controls = applicable.flatMap((policy) => policy.evaluation?.controls ?? []);
    const completed = controls.filter((control) => control.status === "verified").length;
    const remaining = Math.max(0, controls.length - completed);
    const missingEvidence = controls.filter((control) => control.status !== "verified" && !(control.evidence?.length)).length;
    const highPriority = controls.filter((control) => control.status !== "verified" && control.priority === "high").length;
    const average = applicable.length ? applicable.reduce((sum, policy) => sum + Number(policy.coverageScore ?? 0), 0) / applicable.length : 0;
    const framework = (needle: RegExp) => applicable.find((policy) => needle.test(policy.name))?.coverageScore ?? 0;
    return { average, missingControls: remaining, missingEvidence, highPriority, completed, remaining, iso: framework(/ISO\/IEC 42001/i), eu: framework(/EU AI Act/i), nist: framework(/NIST AI/i) };
  }, [assignedPolicies]);


  // Fetch application details
  useEffect(() => {
    const fetchApplicationDetails = async () => {
      try {
        setLoading(true);
        const data = await getApplicationDetails(
          params.tenant as string,
          params.applicationId as string
        );
        setApplicationDetails(data as unknown as ApplicationDetails);
      } catch (err) {
        console.error("Error fetching application details:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to fetch application details"
        );
      } finally {
        setLoading(false);
      }
    };

    if (params.tenant && params.applicationId) {
      fetchApplicationDetails();
    }
  }, [params.tenant, params.applicationId]);

  // Format team members for display
  const formatTeamMembers = (
    stakeholders: ApplicationDetails["stakeholders"]
  ) => {
    if (!stakeholders || stakeholders.length === 0) {
      return "No members have been assigned to the project";
    }

    if (stakeholders.length === 1) {
      return `${stakeholders[0].name} (${stakeholders[0].role})`;
    }

    if (stakeholders.length <= 3) {
      return stakeholders.map((s) => `${s.name} (${s.role})`).join(", ");
    }

    return `${stakeholders
      .slice(0, 2)
      .map((s) => `${s.name} (${s.role})`)
      .join(", ")} and ${stakeholders.length - 2} more`;
  };

  // Format goal from use cases "What it does" field
  const formatGoal = (useCases: ApplicationDetails["useCases"]) => {
    if (!useCases || useCases.length === 0) {
      return "To ensure compliance with AI governance standards";
    }

    // If there's only one use case, use its "What it does" field
    if (useCases.length === 1) {
      return useCases[0].whatItDoes;
    }

    // If there are multiple use cases, create a summary
    // For now, we'll use the first use case's "What it does" field
    // and indicate there are more use cases
    const primaryGoal = useCases[0].whatItDoes;
    if (useCases.length > 1) {
      return `${primaryGoal} (and ${useCases.length - 1} other use case${useCases.length > 2 ? "s" : ""})`;
    }

    return primaryGoal;
  };

  // Project Overview Data - now dynamic
  const projectData = applicationDetails
    ? {
      owner: applicationDetails.owner.name,
      lastUpdated: formatDate(applicationDetails.lastUpdated.date),
      lastUpdatedBy: applicationDetails.lastUpdated.by.name,
      goal: formatGoal(applicationDetails.useCases),
      teamMembers: formatTeamMembers(applicationDetails.stakeholders),
    }
    : {
      owner: "Loading...",
      lastUpdated: "Loading...",
      lastUpdatedBy: "Loading...",
      goal: "Loading...",
      teamMembers: "Loading...",
    };

  // Risk Data
  const risks = [
    { level: "Very High", count: 1, color: "bg-red-500" },
    { level: "High", count: 0, color: "bg-orange-500" },
    { level: "Medium", count: 1, color: "bg-yellow-500" },
    { level: "Low", count: 0, color: "bg-green-500" },
    { level: "Very Low", count: 0, color: "bg-green-300" },
  ];

  const generateReport = () => {
    console.log("Generating HTML report...");
  };

  // Show loading state
  if (loading) {
    return (
      <div className="h-screen overflow-y-auto scrollbar-hide scroll-smooth w-full">
        <div className="mx-auto m-4">
          <div className="flex justify-center items-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading Application Overview...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="h-screen overflow-y-auto scrollbar-hide scroll-smooth w-full">
        <div className="mx-auto m-4">
          <div className="flex justify-center items-center h-64">
            <div className="text-center">
              <div className="text-red-500 text-6xl mb-4">⚠️</div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                Error Loading GovIQ overview
              </h2>
              <p className="text-gray-600 mb-4">{error}</p>
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
                className="border-red-500 text-red-500 hover:bg-red-50"
              >
                Try Again
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className=" w-full">
      <div className="mx-auto ">
        {/* Header Section */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-black mb-2">
              {applicationDetails?.application.name || "AI Compliance Checker"}
            </h1>
            <p className="text-gray-600">
              {applicationDetails?.application.description || "No description available"}
            </p>
          </div>
          {/* <ApplicationStatus
              id={applicationDetails?.application.id as string}
              tenant={params.tenant as string}
              // @ts-ignore
              defaultStatus={applicationDetails?.application.status}
            ></ApplicationStatus> */}
          {/* <Button
            variant="outline"
            className="border-black text-black hover:bg-gray-100 bg-transparent"
            onClick={generateReport}
          >
            <FileText className="w-4 h-4 mr-2" />
            Generate report
          </Button> */}
        </div>

        {/* Project Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-3">
                <User className="w-5 h-5 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-500">Owner</p>
                  <p className="font-semibold text-black">
                    {projectData.owner}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-3">
                <Calendar className="w-5 h-5 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-500">Last updated</p>
                  <p className="font-semibold text-black">
                    {projectData.lastUpdated}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-3">
                <Users className="w-5 h-5 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-500">Last updated by</p>
                  <p className="font-semibold text-black">
                    {projectData.lastUpdatedBy}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Goal and Team Members */}
        <div className="my-4 hidden grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start space-x-3">
                <Target className="w-5 h-5 text-gray-500 mt-1" />
                <div>
                  <p className="text-sm text-gray-500 mb-1">Goal</p>
                  <p className="text-black">{projectData.goal}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start space-x-3">
                <Users className="w-5 h-5 text-gray-500 mt-1" />
                <div>
                  <p className="text-sm text-gray-500 mb-1">Team members</p>
                  <p className="text-gray-600">{projectData.teamMembers}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="my-5">
          <CardContent className="pt-6">
            <div className="flex items-start space-x-3">
              <Users className="w-5 h-5 text-gray-500 mt-1" />
              <div>
                <p className="text-sm text-gray-500 mb-1">Team members</p>
                <p className="text-gray-600">{projectData.teamMembers}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <section className="my-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Compliance evidence status</h2>
              <p className="text-sm text-muted-foreground">Live results from assigned policy controls—not estimated completion values.</p>
            </div>
          </div>
          {assignedPolicies.length ? (
            <><div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-9">{[
              ["Overall", complianceMetrics.average, "%"], ["ISO 42001", complianceMetrics.iso, "%"], ["EU AI Act", complianceMetrics.eu, "%"], ["NIST", complianceMetrics.nist, "%"],
              ["Missing Controls", complianceMetrics.missingControls, ""], ["Missing Evidence", complianceMetrics.missingEvidence, ""], ["High Priority", complianceMetrics.highPriority, ""], ["Completed", complianceMetrics.completed, ""], ["Remaining", complianceMetrics.remaining, ""],
            ].map(([label, value, suffix]) => <div key={String(label)} className="rounded-lg border bg-card p-3"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{Number(value).toFixed(suffix ? 0 : 0)}{suffix}</p></div>)}</div><div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {assignedPolicies.map((policy) => {
                const status = policy.complianceStatus ?? "not_evaluated";
                const score = Number(policy.coverageScore ?? 0);
                const gaps = policy.gaps ?? [];
                return (
                  <Card key={policy.id} className={status === "non_compliant" ? "border-red-500/30" : ""}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle className="text-base">{policy.name}</CardTitle>
                        <Badge variant="outline" className="capitalize">{status.replaceAll("_", " ")}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {status === "not_applicable" ? (
                        <p className="text-sm text-muted-foreground">This catalog entry does not apply to AI compliance.</p>
                      ) : (
                        <>
                          <div className="flex items-end justify-between"><span className="text-sm text-muted-foreground">Verified evidence coverage</span><span className="text-2xl font-semibold">{score.toFixed(0)}%</span></div>
                          <Progress value={score} />
                        </>
                      )}
                      {gaps.length ? (
                        <div className="space-y-2 rounded-md bg-red-500/5 p-3">
                          {gaps.slice(0, 3).map((gap) => (
                            <p key={gap.key} className="flex gap-2 text-xs text-red-700 dark:text-red-300"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{gap.title}: {gap.reason}</p>
                          ))}
                          {gaps.length > 3 && <p className="text-xs text-muted-foreground">+{gaps.length - 3} additional gap(s)</p>}
                        </div>
                      ) : status === "compliant" ? (
                        <p className="flex gap-2 text-sm text-emerald-600"><ShieldCheck className="h-4 w-4" />All mapped controls have evidence.</p>
                      ) : null}
                      {policy.evaluatedAt && <p className="text-xs text-muted-foreground">Last checked {new Date(policy.evaluatedAt).toLocaleString()}</p>}
                    </CardContent>
                  </Card>
                );
              })}
            </div></>
          ) : (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No compliance policy is assigned to this application. Assign one in Application Settings.</CardContent></Card>
          )}
        </section>

        {/* Project Risks */}
        {/* <Card className="m-4">
            <CardHeader>
              <CardTitle className="text-black flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2" />
                Application risks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-4">
                {risks.map((risk, index) => (
                  <div key={index} className="text-center">
                    <p className="text-sm text-gray-600 mb-2">{risk.level}</p>
                    <div className="text-4xl font-bold text-black mb-2">{risk.count}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card> */}
      </div>
    </div>
  );
}
