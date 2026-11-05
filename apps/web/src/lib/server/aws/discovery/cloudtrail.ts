/**
 * Who last deployed a resource, from CloudTrail's 90-day management event
 * history: the newest launch/start/code-update event on that resource.
 * Needs cloudtrail:LookupEvents; a denial is reported as a permission gap.
 */

import { LookupEventsCommand, type CloudTrailClient } from "@aws-sdk/client-cloudtrail";

const DEPLOY_EVENTS = new Set([
  "RunInstances",
  "StartInstances",
  "CreateFunction20150331",
  "UpdateFunctionCode20150331v2",
  "PublishVersion20150331",
  "CreateAgentRuntime",
  "UpdateAgentRuntime",
  "PrepareAgent",
  "CreateAgent",
  "UpdateAgent",
]);

/** "arn:aws:sts::1:assumed-role/Role/jane@x.com" -> "jane@x.com"; IAM users keep their name. */
export function actorName(username: string | undefined, eventJson: string | undefined): string | null {
  if (username) return username;
  try {
    const arn = JSON.parse(eventJson ?? "{}")?.userIdentity?.arn as string | undefined;
    return arn?.split("/").pop() ?? null;
  } catch {
    return null;
  }
}

export async function lastDeployer(
  cloudtrail: CloudTrailClient,
  resourceName: string,
  gaps: string[],
): Promise<{ deployedBy: string; deployedByAt: string } | null> {
  try {
    const res = await cloudtrail.send(
      new LookupEventsCommand({
        LookupAttributes: [{ AttributeKey: "ResourceName", AttributeValue: resourceName }],
        MaxResults: 50,
      }),
    );
    const event = (res.Events ?? []).find((e) => e.EventName && DEPLOY_EVENTS.has(e.EventName));
    const who = event && actorName(event.Username, event.CloudTrailEvent);
    return who && event?.EventTime ? { deployedBy: who, deployedByAt: event.EventTime.toISOString() } : null;
  } catch (e) {
    if (/AccessDenied|not authorized/i.test(`${(e as Error)?.name} ${(e as Error)?.message}`)) {
      gaps.push("cloudtrail:LookupEvents");
    }
    return null;
  }
}
