"use client";

import {
  FileText,
  User,
  Calendar,
  Users,
  Target,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { formatDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils";
import ApplicationStatus from "@/components/applications/ApplicationStatus";
import { useTenant } from "@/contexts/TenantContext";
import { getApplicationDetails } from "@/lib/actions/applications";
import { isEuAiActPolicyName } from "@/lib/policy-names";
import {
  getAllFrameworkControls,
  type FrameworkControlData,
} from "@/lib/actions/framework-controls";
import { getFramework, type FrameworkDefinition } from "@/lib/frameworks";
import { controlKeys, isDone, percent } from "@/lib/frameworks/helpers";

import { PageTitle } from "@/components/common/PageHeader";
// Custom Progress component to replace the imported one
const Progress = ({ value, className = "" }: any) => {
  return (
    <div className={`w-full bg-muted rounded-full h-3 ${className}`}>
      <div
        className="h-full bg-blue-500 rounded-full transition-all"
        style={{ width: `${value}%` }}
      ></div>
    </div>
  );
};

const InfoCard = ({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  className?: string;
}) => (
  <Card className={cn("min-w-0 py-4 shadow-none", className)}>
    <CardContent className="flex items-start gap-3 px-4">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-sm font-medium">{value}</p>
      </div>
    </CardContent>
  </Card>
);

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

export default function GovIQOverviewPage() {
  const params = useParams();
  const [applicationDetails, setApplicationDetails] =
    useState<ApplicationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { activePolicy } = useTenant();

  const isEUEnabled = useMemo(() => {
    return (
      activePolicy.find((ele) => isEuAiActPolicyName(ele)) != null
    );
  }, [activePolicy]);

  const isISOEnabled = useMemo(() => {
    return activePolicy.find((ele) => ele === "ISO/IEC 42001") != null;
  }, [activePolicy]);

  // Fetch application details
  useEffect(() => {
    const fetchApplicationDetails = async () => {
      try {
        setLoading(true);
        const data = await getApplicationDetails(
          params.tenant as string,
          params.applicationId as string
        );
        console.log("Application details received:", data);
        console.log("Use cases:", data.useCases);
        // @ts-ignore
        setApplicationDetails(data as ApplicationDetails);
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

  const [frameworkControls, setFrameworkControls] = useState<Record<
    string,
    Record<string, FrameworkControlData>
  > | null>(null);
  useEffect(() => {
    if (!params.tenant || (!isEUEnabled && !isISOEnabled)) return;
    getAllFrameworkControls(params.tenant as string)
      .then(setFrameworkControls)
      .catch(() => setFrameworkControls({}));
  }, [params.tenant, isEUEnabled, isISOEnabled]);

  // Format team members for display
  const formatRole = (role?: string | null) => {
    const value = (role ?? "").replace(/^org:/, "");
    return value.charAt(0).toUpperCase() + value.slice(1);
  };

  const formatTeamMembers = (
    stakeholders: ApplicationDetails["stakeholders"]
  ) => {
    if (!stakeholders || stakeholders.length === 0) {
      return "No members have been assigned to the project";
    }

    if (stakeholders.length === 1) {
      return `${stakeholders[0].name} (${formatRole(stakeholders[0].role)})`;
    }

    if (stakeholders.length <= 3) {
      return stakeholders.map((s) => `${s.name} (${formatRole(s.role)})`).join(", ");
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

  // Real completion from the tenant's saved framework controls (the same data
  // and "done" rules the Admin Center framework trackers use).
  const complianceCards = [
    isEUEnabled && getFramework("eu-ai-act"),
    isISOEnabled && getFramework("iso-42001"),
  ]
    .filter((fw): fw is FrameworkDefinition => Boolean(fw))
    .map((fw) => {
      const data = frameworkControls?.[fw.slug] ?? {};
      const requirements = fw.sections.flatMap((sec) => sec.requirements);
      const keys = requirements.flatMap(controlKeys);
      const keysDone = keys.filter((k) => isDone(data, k)).length;
      const reqsDone = requirements.filter((r) =>
        controlKeys(r).every((k) => isDone(data, k)),
      ).length;
      return {
        title: `${fw.navLabel} Completion Status`,
        rows: [
          { label: "Requirements", done: reqsDone, total: requirements.length },
          { label: "Controls", done: keysDone, total: keys.length },
        ],
      };
    });

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
              <p className="text-muted-foreground">Loading GovIQ overview...</p>
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
              <h2 className="text-xl font-semibold mb-2">
                Error Loading GovIQ overview
              </h2>
              <p className="text-muted-foreground mb-4">{error}</p>
              <Button
                variant="destructive"
                onClick={() => window.location.reload()}
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
    <div className="w-full min-w-0">
      <div className="mx-auto space-y-4">
        {/* Header Section */}
        <div className="flex justify-between items-start">
          <div>
            <PageTitle className="mb-2">
              {applicationDetails?.application.name || "AI Compliance Checker"}
            </PageTitle>
            <p className="text-muted-foreground">
              {applicationDetails?.application.description}
            </p>
          </div>
          <div className="shrink-0">
          <ApplicationStatus
            id={applicationDetails?.application.id as string}
            tenant={params.tenant as string}
            // @ts-ignore
            defaultStatus={applicationDetails?.application.status}
          ></ApplicationStatus>
          </div>
        </div>

        {/* Project info: five equal cards in one row on wide screens */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <InfoCard icon={User} label="Owner" value={projectData.owner} />
          <InfoCard icon={Calendar} label="Last Updated" value={projectData.lastUpdated} />
          <InfoCard icon={Users} label="Last Updated By" value={projectData.lastUpdatedBy} />
          <InfoCard icon={Target} label="Goal" value={projectData.goal} />
          <InfoCard icon={Users} label="Team Members" value={projectData.teamMembers} />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {complianceCards.map((card) => (
            <Card key={card.title}>
              <CardHeader>
                <CardTitle>{card.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {card.rows.map((row) => (
                  <div key={row.label}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-muted-foreground">
                        {frameworkControls
                          ? `${row.done} of ${row.total} ${row.label} completed`
                          : "Loading..."}
                      </span>
                      <span className="text-2xl font-bold">
                        {percent(row.done, row.total)}%
                      </span>
                    </div>
                    <Progress
                      value={percent(row.done, row.total)}
                      className="h-3"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Project Risks */}
        {/* <Card className="m-4">
            <CardHeader>
              <CardTitle className=" flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2" />
                Application risks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-4">
                {risks.map((risk, index) => (
                  <div key={index} className="text-center">
                    <p className="text-sm text-muted-foreground mb-2">{risk.level}</p>
                    <div className="text-4xl font-bold  mb-2">{risk.count}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card> */}
      </div>
    </div>
  );
}
