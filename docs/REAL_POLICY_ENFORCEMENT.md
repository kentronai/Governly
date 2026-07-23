# Real policy enforcement and evidence

Norix separates verified evidence from posture inference:

- **Runtime enforcement** is verified only when traffic passes through ControlNet.
- **Cloud discovery** is provider API evidence about configuration and capabilities; it is not labeled as prompt monitoring.
- **Compliance** fails closed. A control without persisted evidence is a gap, never a pass.

## Policy rollout

Enabling an organization compliance policy materializes and evaluates it for every existing application and discovered agent. New applications and newly discovered agents inherit active tenant policies automatically. An agent linked to an application also inherits that application's active default runtime policy.

## Runtime identity headers

ControlNet clients should send:

```text
X-API-KEY: <norix key>
X-Application-ID: <application uuid>
X-Agent-ID: <optional discovered agent uuid or external agent id>
X-Policy-ID: <optional explicit policy uuid>
```

When `X-Agent-ID` is present, Norix verifies that the agent belongs to the authenticated tenant and that its linked application matches `X-Application-ID`. If `X-Policy-ID` is omitted, the linked application's active default policy is selected. A blocked request creates both an `observability_logs` row and a durable `policy_findings` row.

## Provider-neutral discovery

AWS and Azure use native SDK/API discovery. Other providers and self-hosted systems can send authenticated normalized snapshots to:

```text
POST /api/agent-discovery/ingest
X-API-KEY: <norix key>
```

The body contains an enabled Norix `integrationId`, provider/account identity, and up to 1,000 agents. Each agent must include explicit normalized capability facts. Norix calculates autonomy and risk from its database-backed rules, preserves collector metadata with `provenance: collector_api`, and immediately evaluates effective policies.

This ingestion API does not claim native runtime interception. PII, jailbreak, toxicity, and prompt-injection enforcement becomes live evidence only after the agent's model traffic is routed through ControlNet with the identity headers above.
