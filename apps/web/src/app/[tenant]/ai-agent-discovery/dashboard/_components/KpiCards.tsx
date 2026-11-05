"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, Gauge, Moon, Play, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CompactMetricCard } from "@/components/agent-discovery/CompactMetricCard";

export interface KpiAgent {
  id: string;
  name: string;
  platform: string;
  framework: string | null;
  level: string;
  reason: string;
  running: boolean;
  stopped: boolean;
}

const TONE: Record<string, string> = { L1: "text-emerald-600", L2: "text-yellow-600", L3: "text-orange-600", L4: "text-red-600" };

const CARDS: Array<{ label: string; icon: LucideIcon; tone: string; description: string; filter: (a: KpiAgent) => boolean }> = [
  { label: "Total Agents", icon: Bot, tone: "", description: "Every agent in the registry", filter: () => true },
  ...(["L1", "L2", "L3", "L4"] as const).map((level) => ({
    label: `${level} Autonomy`,
    icon: Gauge,
    tone: TONE[level],
    description: {
      L1: "Answers with an LLM only; no tools or application access",
      L2: "Uses tools/skills or reads applications",
      L3: "Agent framework with tools acting on applications",
      L4: "Executes code, drives a browser/sandbox, or acts broadly across many applications",
    }[level],
    filter: (a: KpiAgent) => a.level === level,
  })),
  { label: "Running Agents", icon: Play, tone: "text-emerald-600", description: "Running right now", filter: (a) => a.running },
  { label: "Stopped Agents", icon: Moon, tone: "text-muted-foreground", description: "Deployed before, not running now", filter: (a) => a.stopped },
];

export function KpiCards({ tenant, agents }: { tenant: string; agents: KpiAgent[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const card = CARDS.find((c) => c.label === open);
  const rows = card ? agents.filter(card.filter) : [];
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {CARDS.map((c) => (
          <button key={c.label} type="button" className="rounded-xl text-left transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setOpen(c.label)}>
            <CompactMetricCard label={c.label} value={agents.filter(c.filter).length} icon={c.icon} tone={c.tone} uppercaseLabel className="w-full" description={c.description} />
          </button>
        ))}
      </div>
      <Dialog open={Boolean(card)} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="flex h-[70vh] w-[95vw] flex-col gap-0 p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b p-5 pr-12">
            <DialogTitle>{card?.label} · {rows.length}</DialogTitle>
            <DialogDescription>{card?.description}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows.length ? (
              <div className="divide-y">
                {rows.map((a) => (
                  <Link key={a.id} href={`/${tenant}/ai-agent-inventory`} className="block space-y-1 px-5 py-3 hover:bg-muted/50">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{a.name}</span>
                      <Badge variant="outline" className={TONE[a.level]}>{a.level}</Badge>
                      {a.framework ? <Badge variant="outline">{a.framework}</Badge> : null}
                      <Badge variant="outline" className="ml-auto">{a.running ? "Running" : a.stopped ? "Stopped" : "Not deployed"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{a.reason}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="p-8 text-center text-sm text-muted-foreground">No agents in this category.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
