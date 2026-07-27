import { auth } from "@clerk/nextjs/server";
import {
  Bot,
  Eye,
  Lightbulb,
  ShieldCheck,
  UserRound,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveAgentDiscoveryTenantId } from "@/lib/queries/agent-dashboard";

export const dynamic = "force-dynamic";

const autonomyLevels = [
  {
    level: "L1",
    number: 1,
    title: "Observe",
    icon: Eye,
    description: "The agent observes data and generates outputs visible to the user. No actions are taken.",
    agentResponsibilities: [
      "Reads data and generates outputs visible only to the user",
      "Provides insights, summaries, or alerts",
    ],
    humanResponsibilities: [
      "Reviews outputs and takes every action manually",
    ],
    examples: [
      "Market or competitor monitoring",
      "Anomaly detection alerts",
      "Daily reports and summaries",
    ],
  },
  {
    level: "L2",
    number: 2,
    title: "Advise",
    icon: Lightbulb,
    description: "The agent analyzes data and generates recommendations, drafts, or proposed actions for the user.",
    agentResponsibilities: [
      "Generates recommendations, drafts, or proposed actions",
      "Explains rationale and potential outcomes",
    ],
    humanResponsibilities: [
      "Reviews recommendations and performs every action manually",
    ],
    examples: [
      "Suggested email replies",
      "Budget reallocation suggestions",
      "Content drafts and outlines",
    ],
  },
  {
    level: "L3",
    number: 3,
    title: "Act with Approval",
    icon: ShieldCheck,
    description: "The agent prepares actions but requires explicit human approval before execution.",
    agentResponsibilities: [
      "Prepares actions in a sandbox or pending state",
      "Waits for approval before final execution",
    ],
    humanResponsibilities: [
      "Reviews and approves or rejects each action before execution",
    ],
    examples: [
      "Scheduling meetings with approval",
      "Sending emails with approval",
      "Updating records with approval",
    ],
  },
  {
    level: "L4",
    number: 4,
    title: "Act Autonomously",
    icon: Zap,
    description: "The agent executes actions within defined guardrails, handles exceptions, and optimizes outcomes.",
    agentResponsibilities: [
      "Executes actions independently within defined guardrails",
      "Handles exceptions, records audit evidence, and optimizes outcomes",
    ],
    humanResponsibilities: [
      "Defines guardrails and reviews exceptions, audit logs, and aggregate outcomes",
    ],
    examples: [
      "Auto-scaling infrastructure",
      "Processing orders and refunds",
      "Lead qualification and outreach",
    ],
  },
] as const;

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-sm leading-5">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function AutonomyLevelsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");

  const { tenant } = await params;
  const tenantId = await resolveAgentDiscoveryTenantId(tenant);
  if (tenantId !== orgId) throw new Error("Tenant access denied");

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Agent Autonomy Levels</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          NORIX classifies each agent by what it can do independently and where human responsibility remains.
        </p>
      </header>

      <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-4">
        {autonomyLevels.map((level) => {
          const LevelIcon = level.icon;
          return (
            <Card key={level.level} className="h-full gap-0 overflow-hidden py-0">
              <CardHeader className="border-b bg-muted/50 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <Badge className="flex h-7 w-7 rounded-full p-0 text-sm">{level.number}</Badge>
                  <CardTitle className="text-base">
                    {level.title} <span className="text-muted-foreground">({level.level})</span>
                  </CardTitle>
                </div>
              </CardHeader>

              <CardContent className="flex h-full flex-col px-0">
                <section className="grid min-h-36 grid-cols-[52px_1fr] items-center gap-3 border-b px-4 py-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <LevelIcon className="h-7 w-7" />
                  </span>
                  <p className="text-sm leading-5 text-muted-foreground">{level.description}</p>
                </section>

                <div className="flex-1 space-y-5 px-4 py-4">
                  <section className="grid grid-cols-[32px_1fr] gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Bot className="h-4 w-4" />
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold text-primary">Agent</h2>
                      <BulletList items={level.agentResponsibilities} />
                    </div>
                  </section>

                  <section className="grid grid-cols-[32px_1fr] gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <UserRound className="h-4 w-4" />
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Human</h2>
                      <BulletList items={level.humanResponsibilities} />
                    </div>
                  </section>
                </div>

                <section className="m-4 mt-0 rounded-lg bg-muted/50 p-3">
                  <h2 className="text-sm font-semibold">Examples</h2>
                  <BulletList items={level.examples} />
                </section>
              </CardContent>
            </Card>
          );
        })}
      </div>

    </main>
  );
}
