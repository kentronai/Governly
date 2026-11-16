/**
 * Discovers Step Functions state machines that reference one of the
 * already-discovered AI Lambda functions in their definition — these are
 * the "AI workflows" the spec asks for, found by real ARN reference rather
 * than guessed by name.
 */

import {
  ListStateMachinesCommand,
  DescribeStateMachineCommand,
} from "@aws-sdk/client-sfn";
import type { AwsClientBundle } from "../client-factory";
import { extractModelIds } from "../../agents/agent-profile";
import { noteLookupFailure, type RawDiscoveredResource } from "./types";

export async function discoverStepFunctions(
  clients: AwsClientBundle,
  aiLambdaArns: Set<string>,
): Promise<RawDiscoveredResource[]> {
  const resources: RawDiscoveredResource[] = [];
  const { stepFunctions, region } = clients;

  let nextToken: string | undefined;
  do {
    const page = await stepFunctions.send(
      new ListStateMachinesCommand({ nextToken }),
    );
    for (const machine of page.stateMachines ?? []) {
      if (!machine.stateMachineArn || !machine.name) continue;

      let definition = "";
      try {
        const detail = await stepFunctions.send(
          new DescribeStateMachineCommand({
            stateMachineArn: machine.stateMachineArn,
          }),
        );
        definition = detail.definition ?? "";
      } catch (error) {
        noteLookupFailure(clients, "Step Functions DescribeStateMachine", error);
      }

      const referencesAiLambda = Array.from(aiLambdaArns).some((arn) =>
        definition.includes(arn),
      );
      if (!referencesAiLambda) continue;

      resources.push({
        resourceType: "step_function",
        resourceId: machine.name,
        resourceArn: machine.stateMachineArn,
        resourceName: machine.name,
        region,
        tags: {},
        linkedFunctionArns: Array.from(aiLambdaArns).filter((arn) =>
          definition.includes(arn),
        ),
        createdAt: machine.creationDate?.toISOString?.() ?? null,
        metadata: { type: machine.type, modelIds: extractModelIds(definition) },
      });
    }
    nextToken = page.nextToken;
  } while (nextToken);

  return resources;
}
