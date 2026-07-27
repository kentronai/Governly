"use client";

import React from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type CompliancePolicy = {
  policy_name: string;
  policy_description: string[];
  is_active: boolean;
};

const financialServicesPolicies: CompliancePolicy[] = [
  {
    policy_name:
      "Brokerage, Sales & Trading, and Asset Management Related Detections",
    policy_description: [
      "CFTC Dodd-Frank Swap Activity – Audio, Chat, and Emails",
      "CFTC Dodd-Frank Swap Activity – Videos",
      "FINRA Promotion, Promissory Statement, or Implied Performance Risks – Video, Audio, Chat, Attachment, and Emails",
      "SEC Reg BI Client Relationship Summary Form (Form CRS) – Attachment and Videos",
      "SEC Reg BI Client Relationship Summary Form (Form CRS) – Audio, Chat, and Emails",
    ],
    is_active: true,
  },
  {
    policy_name: "Banking Related Detections",
    policy_description: [
      "FFIEC Promotion, Credit Discussion, or Rate Comparison – Audio, Chat, and Emails",
      "FFIEC Promotion, Credit Discussion, or Rate Comparison – Videos",
    ],
    is_active: true,
  },
  {
    policy_name: "Insurance Detections",
    policy_description: [
      "Implied Performance Risks - Insurance Policies and Annuities – Audio, Chat, Attachment, and Emails",
      "Suitability Conversations – Audio and Chats",
    ],
    is_active: true,
  },
];

const financialServicesConcernPolicies: CompliancePolicy[] = [
  {
    policy_name: "General Compliance Detections",
    policy_description: [
      "Change of Venue – Audio, Chat, Attachment, and Emails",
      "Coercive Behavior – Audio, Chat, and Emails",
      "Collusion – Audio, Chat, Attachment, and Emails",
      "Cryptocurrency Discussions – Video, Audio, Chat, Attachment, and Emails",
      "Customer Complaints - Financial Misconduct / Improprieties – Audio, Chat, and Emails",
      "Customer Complaints - General Financial – Audio, Chat, and Emails",
      "Financial Documents – Attachment, Video, and Emails",
      "Financial Logos – Videos",
      'Material Nonpublic Information ("MNPI") and Insider Tips – Audio, Chat, Attachment, and Emails',
      "Personal Self Promotion – Audio, Chat, Attachment, and Emails",
      "Risky Behavior – Audio, Chat, and Emails",
      "Stock or Mutual Fund Symbols – Audio, Chat, Attachment, and Emails",
      "Stock or Mutual Fund Symbols – Videos",
      "Trade Conversations – Audio, Chat, and Emails",
    ],
    is_active: true,
  },
];

const customPolicies: CompliancePolicy[] = [
  {
    policy_name: "Custom Detection Rules",
    policy_description: [
      "Generic rate swap conversations",
      "Internal Projects",
      "Key watchwords",
      "Mutual Fund",
      "Proprietary documents",
    ],
    is_active: true,
  },
];

function PolicyTable({ data }: { data: CompliancePolicy[] }) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Policy</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length ? (
            data.map((policy) => (
              <TableRow key={policy.policy_name}>
                <TableCell className="align-top font-medium whitespace-normal">
                  {policy.policy_name}
                </TableCell>
                <TableCell className="align-top whitespace-normal text-muted-foreground">
                  <div className="space-y-1.5">
                    {policy.policy_description.map((text) => (
                      <div key={text}>{text}</div>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="align-top text-right">
                  <Switch
                    checked={policy.is_active}
                    aria-label={`Toggle ${policy.policy_name}`}
                  />
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={3}
                className="py-10 text-center text-muted-foreground"
              >
                No data available
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

const OrganizationPolicies = () => {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1200px] space-y-6 p-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Compliance Policies</h1>
            <Badge variant="secondary">Coming Soon</Badge>
          </div>
          <p className="text-muted-foreground">
            Detection policies applied across your organization&apos;s
            monitored channels.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">US Financial Services</h2>
          <PolicyTable data={financialServicesPolicies} />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">
            General Financial Services Concerns
          </h2>
          <PolicyTable data={financialServicesConcernPolicies} />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">Custom</h2>
          <PolicyTable data={customPolicies} />
        </section>
      </div>
    </div>
  );
};

export default OrganizationPolicies;
