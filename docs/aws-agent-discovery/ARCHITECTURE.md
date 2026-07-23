# AI Agent Discovery — Architecture

> Feature-specific architecture doc. For the overall platform architecture see
> [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md).

## What this is

A production discovery pipeline that connects to a customer's AWS account, finds real AI agents
(Bedrock Agents and their dependent resources), correlates the raw AWS resources into logical
agents, scores each one for capability/autonomy/risk, detects ownership, and generates
recommendations — populating the existing Agent Inventory UI (`/[tenant]/ai-agent-inventory`) and
a dedicated Executive Dashboard (`/[tenant]/ai-agent-inventory/dashboard`).

An **Agent** (`agents` table) is a distinct entity from an **Application** (`applications` table).
An Agent is a concrete discovered AI system; it may optionally reference an Application via a
nullable `applicationId` FK, but is never modeled as one. See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md).

## End-to-end flow

```
Admin → Integrations → "AWS AI Agent Discovery" tile
  → createAwsConnection (lib/actions/aws-integration.ts)
       stores encrypted credentials in aws_discovery_connections
  → testAwsIntegrationConnection
       STS GetCallerIdentity via lib/server/aws/client-factory.ts
  → triggerManualScan (lib/actions/aws-discovery.ts)
       → runDiscoveryScan (lib/server/aws/discovery-orchestrator.ts)
            1. buildAwsClients()            — assume-role or static creds, 11 AWS SDK clients
            2. discover*() x 8               — one module per AWS service (see AWS_DISCOVERY.md)
            3. correlateAgents()             — raw resources -> logical agents (correlation.ts)
            4. per agent:
                 detectOwnership()           — ownership-engine.ts
                 buildCapabilityFacts()      — capability-engine.ts
                 classifyAutonomy()          — autonomy-engine.ts  -> rule-engine.ts
                 assessRisk()                — risk-engine.ts      -> rule-engine.ts
                 generateRecommendations()   — recommendations-engine.ts
            5. upsert agents / agent_resources / agent_recommendations
            6. write discovery_scans (status, duration, counts)
  → Agent Inventory page reads lib/queries/agents.ts (real rows only)
  → Executive Dashboard reads lib/queries/agent-dashboard.ts (real aggregates only)
```

## Directory map

```
apps/web/src/lib/server/
  crypto.ts                       AES-256-GCM encrypt/decrypt for stored AWS credentials
  aws/
    client-factory.ts             STS AssumeRole / static credentials -> 11 SDK clients
    correlation.ts                raw resources -> logical agents
    discovery-orchestrator.ts     runs one full scan end-to-end
    discovery/
      types.ts                    RawDiscoveredResource shape shared by every discover* module
      bedrock.ts                  Agents, Aliases, Knowledge Bases, Guardrails, Prompts
      lambda.ts                   AI-signal Lambda functions
      stepFunctions.ts            state machines referencing an AI Lambda
      cloudwatch.ts                log groups for Bedrock/AI Lambdas
      iam.ts                      role permission facts (admin/write/delete/invoke/cross-account)
      secretsManager.ts           secrets referenced by AI Lambdas
      apiGateway.ts                REST/HTTP APIs routing to an AI Lambda
      eventBridge.ts               rules targeting an AI Lambda/Step Function
  agents/
    rule-engine.ts                generic condition evaluator over agent_rules (data, not code)
    capability-engine.ts          raw resources -> normalized fact object
    autonomy-engine.ts            facts -> L1-L4 + reason + evidence + confidence
    risk-engine.ts                facts -> 0-100 score + level + factor breakdown
    ownership-engine.ts           AWS tags -> Norix user match
    recommendations-engine.ts     facts + autonomy + ownership -> recommendation list

apps/web/src/lib/actions/         aws-integration.ts, aws-discovery.ts, agent-rules.ts, agents.ts
apps/web/src/lib/queries/         agents.ts, agent-dashboard.ts
apps/web/src/app/[tenant]/ai-agent-inventory/   inventory table + dashboard route
apps/web/src/components/admin/integrations/AwsDiscoveryIntegrationCard.tsx
apps/web/scripts/seed-agent-rules.ts            seeds the default configurable rules
```

## Design decisions worth knowing

- **Rules are data, not code.** Every autonomy/risk rule is a row in `agent_rules`
  (condition + weight/result), evaluated by one generic function
  (`lib/server/agents/rule-engine.ts`). See [AUTONOMY_ENGINE.md](./AUTONOMY_ENGINE.md) and
  [RISK_ENGINE.md](./RISK_ENGINE.md).
- **No plaintext secrets.** AWS access keys, the cross-account External ID, and any static
  credential are encrypted at rest with AES-256-GCM (`lib/server/crypto.ts`), keyed from
  `AWS_CREDENTIALS_ENCRYPTION_KEY`. The existing `integrations.credentialsEncrypted` column was
  found storing secrets in plaintext despite its name — this feature does not repeat that.
- **Correlation, not guessing.** Resources are only linked to an agent when AWS itself provides
  the reference (a Bedrock action group's Lambda ARN, an IAM role ARN, a Step Function definition
  containing a known Lambda ARN, an API Gateway integration URI, an EventBridge target ARN). A
  standalone AI-signal Lambda with no Bedrock anchor becomes its own single-resource agent.
- **Sync is idempotent.** Agents are keyed on `(connection_id, external_agent_id)`; a re-scan
  updates the existing row and replaces its `agent_resources`/open `agent_recommendations` rather
  than accumulating duplicates.
- **Manual trigger only in this phase.** No scheduler/cron infrastructure exists in this repo yet.
  `discovery_scans.next_scan_at` is reserved so scheduled/continuous sync can be added later
  without a schema change.
