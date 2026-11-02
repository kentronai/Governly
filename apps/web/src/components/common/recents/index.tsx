import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FilterSection } from "./filter";
import { Pagination } from "./pagination";

import { Button } from "../../ui/button";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";

import { RecentEndpointsPaginatedResponse } from "@/lib/actions/recent";
import { Loading } from "./loading";
import { formatTimestamp } from "@/utils/formatTime";
import { Badge } from "@/components/ui/badge";
import {
  classifyLogOutcome,
  describeRouting,
  getErrorMessage,
  getOutcomeLabel,
  getPolicyDecision,
  getResponseText,
  isPolicyCheck,
} from "@/lib/observability-outcome";


// Display-only: "non_compliant" -> "Non compliant". Never use for stored values.
const toLabel = (v?: string | null) =>
  v ? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, " ") : "";
// Type definitions for observability log data
interface GuardInfo {
  id: string;
  name?: string;
  tier?: string;
  status: string;
  description?: string;
}

interface GuardrailResults {
  input_guards?: GuardInfo[];
  output_guards?: GuardInfo[];
  policy_decision?: string;
  blocked?: boolean;
  violated_guard?: {
    severity?: string;
    rule_id?: string;
    score?: number;
    evidence?: {
      threshold?: number;
      detected_categories?: string[];
      detected_entities?: string[];
      [key: string]: unknown;
    };
  };
  violated_rule?: { rule_id?: string };
  total_execution_time_ms?: number;
  _summary?: {
    decision?: string;
    was_blocked?: boolean;
    total_guards?: number;
    violation?: {
      phase?: string;
      message?: string;
      rule_id?: string;
      severity?: string;
    };
  };
}

interface RequestPayload {
  model?: string;
  messages?: Array<{ role: string; content: string }>;
  stream?: boolean;
}

interface RecentEndpointsTableProps {
  logs: RecentEndpointsPaginatedResponse | undefined;
  isLoading: boolean;
  isFetching: boolean;
  refetch: Function;
}

export default function RecentEndpointsTable({
  logs,
  ...other
}: RecentEndpointsTableProps & { hideApplicationName?: boolean }) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const { isLoading, isFetching, hideApplicationName = false } = other;

  const toggleRow = (index: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  if (!logs || isLoading || isFetching) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Endpoints</CardTitle>
          <CardDescription>
            <FilterSection
              isLoading={true}
              isFetching={true}
              refetch={() => {}}
              limit={0}
            ></FilterSection>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead>Model</TableHead>
                {hideApplicationName ? (
                  <></>
                ) : (
                  <>
                    <TableHead>Application</TableHead>
                  </>
                )}
                <TableHead>Agent</TableHead>
                <TableHead>Latency</TableHead>
                <TableHead>Metadata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <Loading hideApplicationName={hideApplicationName}></Loading>
              <Loading hideApplicationName={hideApplicationName}></Loading>
              <Loading hideApplicationName={hideApplicationName}></Loading>
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter></CardFooter>
      </Card>
    );
  }
  const { data, ...rest } = logs;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Endpoints</CardTitle>
        <CardDescription>
          <FilterSection {...rest} {...other}></FilterSection>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Decision</TableHead>
              <TableHead>Model</TableHead>
              {hideApplicationName === true ? (
                <></>
              ) : (
                <>
                  <TableHead>Application</TableHead>
                </>
              )}
              <TableHead>Agent</TableHead>
              <TableHead>Latency</TableHead>
              <TableHead>Metadata</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data || isLoading ? (
              <>
                <Loading></Loading>
                <Loading></Loading>
                <Loading></Loading>
              </>
            ) : (
              <>
                {/* <Loading></Loading> */}
                {data?.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={hideApplicationName ? 6 : 7}
                      className="text-center py-6 text-sm text-muted-foreground"
                    >
                      No Logs Found
                    </TableCell>
                  </TableRow>
                ) : null}
                {data?.map((ele, idx) => {
                  // A non-2xx status is not automatically a policy block — the
                  // guardrail decision is what says whether NORIX blocked it.
                  const outcome = classifyLogOutcome(ele);
                  const isAllowed = outcome === "allowed";
                  const isBlocked = outcome === "blocked";
                  const decision = getPolicyDecision(ele.guardrailResults);
                  const errorMessage =
                    outcome === "error" ? getErrorMessage(ele) : null;
                  // The requested model is not necessarily the one called —
                  // the tenant's Model Registry selection can override it.
                  const routing = describeRouting(ele.metadata);

                  return (
                    <React.Fragment key={idx}>
                      <TableRow className="py-4!">
                        <TableCell>
                          <span className="text-sm">
                            {formatTimestamp(ele.createdAt)}
                          </span>
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant={
                              isAllowed
                                ? "outline"
                                : isBlocked
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {getOutcomeLabel(outcome)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {decision ? (
                            <Badge
                              variant={
                                decision === "block" ? "destructive" : "secondary"
                              }
                            >
                              {toLabel(decision)}
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              No decision
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {/* Policy checks carry no model — the customer's own
                              LLM answered, and NORIX never saw it. Showing
                              "Unknown" there implied data was missing. */}
                          {isPolicyCheck(ele.path)
                            ? "Policy check"
                            : ((ele.requestPayload as RequestPayload)?.model ??
                              "Unknown")}
                        </TableCell>
                        {hideApplicationName === true ? (
                          <></>
                        ) : (
                          <TableCell>
                            {ele.applicationName}
                          </TableCell>
                        )}
                        <TableCell>
                          {ele.agentName ?? "Application traffic"}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {ele.latencyMs ? `${ele.latencyMs}ms` : "N/A"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant={"outline"}
                            size="sm"
                            className="text-sm pre"
                            onClick={() => toggleRow(idx)}
                          >
                            View
                            {expandedRows.has(idx) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronUp className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>

                      {expandedRows.has(idx) && (
                        <TableRow className="p-8">
                          <TableCell colSpan={8}>
                            <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                              {/* Request Info */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                  <span className="text-muted-foreground block">
                                    Request ID
                                  </span>
                                  <span className="font-mono text-xs">
                                    {ele.requestId ?? "N/A"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block">
                                    Action
                                  </span>
                                  <Badge
                                    variant={
                                      isAllowed
                                        ? "outline"
                                        : isBlocked
                                          ? "destructive"
                                          : "secondary"
                                    }
                                  >
                                    {isAllowed
                                      ? "✓ Allowed"
                                      : isBlocked
                                        ? "✗ Blocked"
                                        : "⚠ Error"}
                                  </Badge>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block">
                                    Timestamp
                                  </span>
                                  <span>
                                    {ele.timestamp
                                      ? formatTimestamp(ele.timestamp)
                                      : "N/A"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block">
                                    Execution Time
                                  </span>
                                  <span>
                                    {(ele.guardrailResults as GuardrailResults)
                                      ?.total_execution_time_ms
                                      ? `${(ele.guardrailResults as GuardrailResults).total_execution_time_ms!.toFixed(0)}ms`
                                      : "N/A"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block">Agent</span>
                                  <span>{ele.agentName ?? "Not attributed"}</span>
                                </div>
                                {routing ? (
                                  <div className="col-span-2">
                                    <span className="text-muted-foreground block">
                                      Routed To
                                    </span>
                                    <span className="text-xs break-words">
                                      {routing}
                                    </span>
                                  </div>
                                ) : null}
                              </div>

                              {/* Failure detail - the request never reached a
                                  policy decision, so show what actually went
                                  wrong instead of an empty "Blocked Reason". */}
                              {outcome === "error" ? (
                                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-md">
                                  <div className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
                                    Request Failed
                                  </div>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                    <div>
                                      <span className="text-amber-700 dark:text-amber-400 block text-xs">
                                        HTTP Status
                                      </span>
                                      <span className="font-mono text-xs">
                                        {ele.statusCode ?? "N/A"}
                                      </span>
                                    </div>
                                    <div className="col-span-2 md:col-span-3">
                                      <span className="text-amber-700 dark:text-amber-400 block text-xs">
                                        Reason
                                      </span>
                                      <span className="text-xs break-words">
                                        {errorMessage ?? "N/A"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ) : null}

                              {/* Blocked Reason - Only show if a guard blocked it */}
                              {isBlocked && ele.guardrailResults
                                ? (() => {
                                    const results =
                                      ele.guardrailResults as GuardrailResults;
                                    return (
                                      <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-md">
                                        <div className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
                                          Blocked Reason
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                          <div>
                                            <span className="text-red-600 dark:text-red-400 block text-xs">
                                              Phase
                                            </span>
                                            <span className="capitalize">
                                              {results?._summary?.violation
                                                ?.phase ?? "N/A"}
                                            </span>
                                          </div>
                                          <div>
                                            <span className="text-red-600 dark:text-red-400 block text-xs">
                                              Rule ID
                                            </span>
                                            <span className="font-mono text-xs">
                                              {results?.violated_rule
                                                ?.rule_id ?? "N/A"}
                                            </span>
                                          </div>
                                          <div>
                                            <span className="text-red-600 dark:text-red-400 block text-xs">
                                              Severity
                                            </span>
                                            <Badge
                                              variant="destructive"
                                              className="text-xs"
                                            >
                                              {results?.violated_guard
                                                ?.severity ?? "N/A"}
                                            </Badge>
                                          </div>
                                          <div className="col-span-2 md:col-span-1">
                                            <span className="text-red-600 dark:text-red-400 block text-xs">
                                              Message
                                            </span>
                                            <span className="text-xs break-words block max-w-full">
                                              {results?._summary?.violation
                                                ?.message ?? "N/A"}
                                            </span>
                                          </div>
                                        </div>

                                        {/* The detector's own numbers. "Blocked
                                            by toxicity" is unactionable without
                                            the score it fired at and the
                                            threshold it was measured against —
                                            that pair is what tells you whether
                                            to retune the policy. */}
                                        {(() => {
                                          const guard = results?.violated_guard;
                                          const evidence = guard?.evidence;
                                          const categories = [
                                            ...(evidence?.detected_categories ?? []),
                                            ...(evidence?.detected_entities ?? []),
                                          ];
                                          if (
                                            guard?.score == null &&
                                            evidence?.threshold == null &&
                                            categories.length === 0
                                          ) {
                                            return null;
                                          }
                                          return (
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-3 pt-3 border-t border-red-200 dark:border-red-900">
                                              <div>
                                                <span className="text-red-600 dark:text-red-400 block text-xs">
                                                  Score
                                                </span>
                                                <span className="font-mono text-xs">
                                                  {guard?.score != null
                                                    ? guard.score.toFixed(2)
                                                    : "N/A"}
                                                </span>
                                              </div>
                                              <div>
                                                <span className="text-red-600 dark:text-red-400 block text-xs">
                                                  Threshold
                                                </span>
                                                <span className="font-mono text-xs">
                                                  {evidence?.threshold != null
                                                    ? String(evidence.threshold)
                                                    : "N/A"}
                                                </span>
                                              </div>
                                              <div className="col-span-2">
                                                <span className="text-red-600 dark:text-red-400 block text-xs">
                                                  Detected
                                                </span>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                  {categories.length === 0 ? (
                                                    <span className="text-xs">N/A</span>
                                                  ) : (
                                                    categories.map((category) => (
                                                      <Badge
                                                        key={category}
                                                        variant="destructive"
                                                        className="text-[10px]"
                                                      >
                                                        {category}
                                                      </Badge>
                                                    ))
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    );
                                  })()
                                : null}

                              {/* Guardrails that actually ran. Without this the
                                  panel showed a verdict with no evidence, so
                                  there was no way to tell which policy made the
                                  call — or that none of them did. */}
                              {(() => {
                                const results =
                                  ele.guardrailResults as GuardrailResults | null;
                                const guards = [
                                  ...(results?.input_guards ?? []).map((g) => ({
                                    ...g,
                                    phase: "input" as const,
                                  })),
                                  ...(results?.output_guards ?? []).map((g) => ({
                                    ...g,
                                    phase: "output" as const,
                                  })),
                                ];
                                const violatedRuleId =
                                  results?.violated_rule?.rule_id ??
                                  results?._summary?.violation?.rule_id;

                                return (
                                  <div className="space-y-2">
                                    <div className="text-sm font-medium">
                                      Guardrails Evaluated{" "}
                                      <span className="text-muted-foreground font-normal">
                                        ({guards.length})
                                      </span>
                                    </div>
                                    {guards.length === 0 ? (
                                      <div className="p-2 bg-background border rounded text-xs text-muted-foreground">
                                        {isBlocked
                                          ? `Blocked at the ${results?._summary?.violation?.phase ?? "input"} phase before the remaining guards ran.`
                                          : "No guardrail ran on this request — the policy attached to this application has no guardrails, or the request failed before the guards executed."}
                                      </div>
                                    ) : (
                                      <div className="grid gap-2 sm:grid-cols-2">
                                        {guards.map((guard, guardIdx) => {
                                          const isViolated =
                                            guard.status === "violated" ||
                                            guard.id === violatedRuleId;
                                          return (
                                            <div
                                              key={`${guard.id}-${guard.phase}-${guardIdx}`}
                                              className="flex items-start justify-between gap-2 p-2 bg-background border rounded"
                                            >
                                              <div className="min-w-0">
                                                <div className="text-xs font-medium truncate">
                                                  {guard.name ?? guard.id}
                                                </div>
                                                <div className="text-[11px] text-muted-foreground truncate">
                                                  {guard.description ?? guard.id}
                                                </div>
                                              </div>
                                              <div className="flex shrink-0 gap-1">
                                                {guard.tier ? (
                                                  <Badge
                                                    variant="outline"
                                                    className="text-[10px]"
                                                  >
                                                    {guard.tier}
                                                  </Badge>
                                                ) : null}
                                                <Badge
                                                  variant={
                                                    isViolated
                                                      ? "destructive"
                                                      : "secondary"
                                                  }
                                                  className="text-[10px] capitalize"
                                                >
                                                  {isViolated
                                                    ? "violated"
                                                    : (guard.status ?? "passed")}
                                                </Badge>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}

                              {/* User Prompt */}
                              <div className="space-y-2">
                                <div className="text-sm font-medium">
                                  User Prompt
                                </div>
                                <div className="p-2 bg-background border rounded text-xs font-mono max-h-32 overflow-auto break-words whitespace-pre-wrap">
                                  {(() => {
                                    const payload =
                                      ele.requestPayload as RequestPayload;
                                    const messages = payload?.messages;
                                    if (!messages || !Array.isArray(messages))
                                      return "N/A";
                                    const userMessage = [...messages]
                                      .reverse()
                                      .find((m) => m.role === "user");
                                    return userMessage?.content ?? "N/A";
                                  })()}
                                </div>
                              </div>

                              {/* Model response — the other half of the
                                  conversation. Absent it, an allowed request
                                  was indistinguishable from one that never
                                  reached the model. */}
                              <div className="space-y-2">
                                <div className="text-sm font-medium">
                                  Model Response
                                </div>
                                <div className="p-2 bg-background border rounded text-xs font-mono max-h-32 overflow-auto break-words whitespace-pre-wrap">
                                  {getResponseText(ele) ??
                                    (isBlocked
                                      ? "Not generated — the request was blocked before it reached the model."
                                      : "N/A")}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </>
            )}
          </TableBody>
        </Table>
      </CardContent>
      <CardFooter>
        <Pagination {...rest}></Pagination>
      </CardFooter>
    </Card>
  );
}
