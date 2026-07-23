"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bot, Gauge, Route } from "lucide-react";
import { cn } from "@/lib/utils";

export function AgentDiscoveryNav({ tenant }: { tenant: string }) {
  const pathname = usePathname();
  const items = [
    { label: "Executive Risk Dashboard", href: `/${tenant}/ai-agent-discovery/dashboard`, icon: BarChart3 },
    { label: "Agent Inventory", href: `/${tenant}/ai-agent-inventory`, icon: Bot },
    { label: "Agent Autonomy Levels", href: `/${tenant}/ai-agent-discovery/autonomy`, icon: Gauge },
    { label: "Registry Journey", href: `/${tenant}/ai-agent-discovery/journey`, icon: Route },
  ];
  return (
    <nav aria-label="Agent Registry" className="flex flex-wrap gap-1 rounded-xl border bg-card p-1.5">
      {items.map((item) => {
        const active = pathname === item.href || (item.href.endsWith("/dashboard") && pathname === `/${tenant}/ai-agent-discovery`);
        return <Link key={item.href} href={item.href} className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}><item.icon className="h-4 w-4" />{item.label}</Link>;
      })}
    </nav>
  );
}
