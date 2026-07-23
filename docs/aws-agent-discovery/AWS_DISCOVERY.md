# AWS Discovery — how each service is scanned

## Authentication

Three methods (`aws_auth_method` enum), configured per connection in Admin → Integrations:

| Method | How it authenticates | Where |
|---|---|---|
| `iam_role` | STS `AssumeRole` using Norix's own AWS identity into the given `roleArn` | `client-factory.ts` |
| `cross_account` | STS `AssumeRole` into `crossAccountRoleArn` with an `ExternalId` | `client-factory.ts` |
| `access_key` | Static `accessKeyId`/`secretAccessKey`, decrypted from storage | `client-factory.ts` |

Credentials are never stored in plaintext — see `lib/server/crypto.ts` (AES-256-GCM,
`AWS_CREDENTIALS_ENCRYPTION_KEY`). "Test Connection" calls STS `GetCallerIdentity` and records
`lastValidatedAt`/`lastValidationError` without ever storing the resolved temporary credentials.

## Discovery order and why

Discovery is **not** 8 independent scans — later modules are scoped by what earlier modules
found, so we don't enumerate irrelevant resources across a whole AWS account:

1. **Bedrock** (`discovery/bedrock.ts`) runs first and is the anchor. `ListAgents` →
   `ListAgentActionGroups` + `GetAgentActionGroup` (to find each action group's Lambda ARN) →
   `ListAgentAliases`, `ListAgentKnowledgeBases`, `ListKnowledgeBases`, `ListGuardrails`,
   `ListPrompts`.
2. **Lambda** (`discovery/lambda.ts`) — `ListFunctions`, keeping a function if it was referenced
   by a Bedrock action group **or** it has an AI signal: a name matching
   `/agent|bedrock|llm|genai|copilot|assistant/i`, or a tag key in
   `["ai", "ai-agent", "bedrock", "norix:agent"]`. No hardcoded function names.
3. **IAM** (`discovery/iam.ts`) — only inspects roles actually referenced by a Bedrock agent or an
   AI Lambda (`GetRole`, `ListRolePolicies`+`GetRolePolicy`, `ListAttachedRolePolicies`+
   `GetPolicy`+`GetPolicyVersion`). Extracts real facts from the policy documents: has an
   `AdministratorAccess`-equivalent or `"*"` action, has write/delete/invoke actions (regex over
   the actual action list), and whether the trust policy allows a principal in another AWS
   account.
4. **CloudWatch Logs** (`discovery/cloudwatch.ts`) — `DescribeLogGroups` against the known
   `/aws/bedrock` and `/aws/lambda/<name>` prefixes for the functions found in step 2.
5. **Secrets Manager** (`discovery/secretsManager.ts`) — `ListSecrets`, kept only if the secret's
   name/ARN matches an AI Lambda's name (best-effort; Lambda environment variable **values** are
   intentionally never read or stored, only variable key names).
6. **API Gateway** (`discovery/apiGateway.ts`) — both REST (`GetRestApis`+`GetResources`) and
   HTTP/WebSocket (`GetApis`+`GetIntegrations`) APIs, kept only if an integration URI references
   an AI Lambda ARN. This is the real evidence behind the Risk engine's "public endpoint" signal.
7. **EventBridge** (`discovery/eventBridge.ts`) — `ListRules`+`ListTargetsByRule`, kept only if a
   target ARN matches an AI Lambda or a discovered Step Function.
8. **Step Functions** (`discovery/stepFunctions.ts`) — `ListStateMachines`+
   `DescribeStateMachine`, kept only if the state machine's definition JSON contains one of the AI
   Lambda ARNs.

## Correlation (raw resources → logical agents)

`lib/server/aws/correlation.ts`:

- Every discovered `bedrock_agent` is an anchor. Its aliases, knowledge bases (matched by
  `metadata.parentAgentId`), linked Lambdas (matched by ARN), those Lambdas' IAM roles, any Step
  Function/API Gateway/EventBridge resource connected to those Lambdas, and any Secrets Manager
  secret found in the same scan are grouped into one logical agent.
- Guardrails and Prompts are account-level Bedrock resources with no per-agent reference in the
  AWS API — they're attached to every Bedrock agent found in the same scan and explicitly flagged
  `metadata.shared = true` rather than guessed at a 1:1 mapping.
- Any AI-signal Lambda not attached to a Bedrock agent becomes its own single-resource logical
  agent (`platform = 'aws_lambda'`).

## Sync behavior

Agents are keyed on `(connection_id, external_agent_id)` — a unique constraint
(`uq_agents_connection_external_id`) enforces this, so re-running discovery **updates** the
existing row (`UPDATE ... WHERE id = existing.id`) rather than duplicating it. Each scan fully
replaces the agent's `agent_resources` rows and any still-`open` `agent_recommendations`, so the
inventory always reflects the most recent scan, not an accumulation of stale evidence.

`discovery_scans` records `status` (`queued`/`running`/`completed`/`failed`), `startedAt`/
`finishedAt` (duration = the difference), `agentsDiscovered`, and `resourcesScanned` (a per-service
count breakdown) for every run — see the Discovery panel next to the AWS connection tile in
Admin → Integrations.
