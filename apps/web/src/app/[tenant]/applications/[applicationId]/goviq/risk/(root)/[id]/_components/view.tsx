import React from "react";
import { Risk } from "../type";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecordMetadata } from "@/components/common/RecordMetadata";
import { LocalTime } from "@/components/common/LocalTime";
import { cn } from "@/lib/utils";

// Full class strings so Tailwind can see them (dynamic `bg-${color}` never compiled).
const TONE: Record<string, string> = {
  green: "bg-green-500/10 text-green-600",
  yellow: "bg-yellow-500/10 text-yellow-600",
  orange: "bg-orange-500/10 text-orange-600",
  red: "bg-red-500/10 text-red-600",
  blue: "bg-blue-500/10 text-blue-600",
  gray: "bg-muted text-muted-foreground",
};
const statusColorMap: Record<string, keyof typeof TONE> = {
  Low: "green",
  Rare: "green",
  Minor: "green",
  Possible: "yellow",
  Unlikely: "yellow",
  "Requires Review": "yellow",
  Medium: "orange",
  Moderate: "orange",
  Likely: "orange",
  High: "red",
  Major: "red",
  Critical: "red",
  Catastrophic: "red",
  "In Progress": "blue",
  Completed: "green",
};

const userLabel = (u?: { name: string | null; email: string } | null, id?: string | null) =>
  u?.name || u?.email || id || null;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm">{children || "—"}</div>
    </div>
  );
}

export default function View({ risk }: { risk: Risk }) {
  const chips: [string, string][] = [
    ["Risk Level", risk.riskLevel],
    ["Severity", risk.severity],
    ["Likelihood", risk.likelihood],
    ["Mitigation Status", risk.mitigationStatus],
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {chips.map(([label, value]) => (
          <Card key={label}>
            <CardContent className="space-y-2 p-4">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <Badge
                variant="secondary"
                className={cn("text-sm", TONE[statusColorMap[value] ?? "gray"])}
              >
                {value || "—"}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Owner">
            {risk.ownerUser ? (
              <>
                <p className="font-medium">{risk.ownerUser.name}</p>
                <p className="text-muted-foreground">{risk.ownerUser.email}</p>
              </>
            ) : (
              risk.owner
            )}
          </Field>
          <Field label="Use case">
            {risk.useCase && (
              <>
                <p className="font-medium">{risk.useCase.useCase}</p>
                <p className="text-muted-foreground">{risk.useCase.whatItDoes}</p>
              </>
            )}
          </Field>
          <Field label="Target date">
            {risk.targetDate && <LocalTime value={risk.targetDate} mode="date" />}
          </Field>
          <Field label="Last review">
            {risk.lastReviewDate && <LocalTime value={risk.lastReviewDate} mode="date" />}
          </Field>
          {risk.categories?.filter(Boolean).length > 0 && (
            <Field label="Categories">
              <div className="flex flex-wrap gap-1">
                {risk.categories.filter(Boolean).map((c) => (
                  <Badge key={c} variant="outline">
                    {c}
                  </Badge>
                ))}
              </div>
            </Field>
          )}
          <div className="md:col-span-2">
            <Field label="Mitigation plan">
              {risk.mitigationPlan && (
                <p className="whitespace-pre-wrap">{risk.mitigationPlan}</p>
              )}
            </Field>
          </div>
        </CardContent>
      </Card>

      <RecordMetadata
        createdBy={userLabel(risk.user_createdBy, risk.createdBy)}
        createdAt={risk.createdAt}
        updatedBy={userLabel(risk.user_updatedBy, risk.updatedBy)}
        updatedAt={risk.updatedAt}
      />
    </div>
  );
}
