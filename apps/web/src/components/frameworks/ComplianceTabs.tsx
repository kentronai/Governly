"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { FileText, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { path: "policy-center", label: "Regulations", icon: FileText },
  { path: "frameworks", label: "Frameworks", icon: Layers },
];

/** Regulations | Frameworks tabs shared by both Admin Center library pages. */
export function ComplianceTabs() {
  const pathname = usePathname();
  const { tenant } = useParams<{ tenant: string }>();

  return (
    <div className="border-b bg-background px-8 py-2">
      <div className="flex items-center gap-1">
        {tabs.map(({ path, label, icon: Icon }) => {
          const href = `/${tenant}/admin/settings/${path}`;
          return (
            <Link
              key={path}
              href={href}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                pathname === href
                  ? "border-muted-foreground"
                  : "border-transparent text-muted-foreground hover:border-muted-foreground hover:text-inherit",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
