# NORIX Internals Master Guide

This document is the working mental model for NORIX: what is connected, which
database tables matter, what gets updated during each flow, and why the main UI
words exist.

It is written for product ownership and debugging. If the UI shows a number,
label, warning, or status, this guide explains what table or provider evidence
it should come from.

## Current Local Dev Connection State

Snapshot checked against local Docker Postgres on 2026-07-25.

| Integration              | Connected | Status        | Last sync            | What it currently has                                                                          |
| ------------------------ | --------: | ------------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| AWS                      |       Yes | success       | 2026-07-25 04:30 UTC | Access key connection in `us-east-1`; discovers AWS AgentCore and EC2 agent workloads.         |
| Databricks Unity Catalog |       Yes | success       | 2026-07-25 04:31 UTC | Workspace PAT; 1 Databricks App agent discovered; Unity Catalog and serving resources scanned. |
| Kubernetes Cluster       |       Yes | success       | 2026-07-25 04:31 UTC | EKS API connection; `chatbot-agent` discovered as one `aws_eks` agent.                         |
| Azure                    |        No | not connected | none                 | Catalog entry exists, no credentials.                                                          |
| Google Cloud             |        No | not connected | none                 | Catalog entry exists, no credentials.                                                          |

Current local Agent Inventory by platform:

| Platform        | Discovery source      | Count |
| --------------- | --------------------- | ----: |
| AWS AgentCore   | `agentcore_runtime`   |     2 |
| AWS EC2         | `ec2_instance`        |     1 |
| Databricks Apps | `databricks_app`      |     1 |
| AWS EKS         | `kubernetes_workload` |     1 |

Current Kubernetes agent truth:

| Agent           | Platform | Source                | Why one row                                                                                   |
| --------------- | -------- | --------------------- | --------------------------------------------------------------------------------------------- |
| `chatbot-agent` | AWS EKS  | `kubernetes_workload` | Deployment is the logical agent; Pod and Service are evidence resources, not separate agents. |

## Product Model In One Line

NORIX has three different concepts that must not be mixed:

| Concept     | Meaning                                                                                                                        | Main tables                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Integration | A connection to an external system such as AWS, Databricks, Kubernetes, Azure, or GCP.                                         | `integrations`, provider-specific connection tables                                                       |
| Agent       | A discovered runtime AI workload from an integration.                                                                          | `agents`, `agent_resources`, `agent_recommendations`, `agent_policy_evaluations`                          |
| Application | A governed business use case or product container that can be linked to agents, models, policies, owners, risks, and evidence. | `applications`, `application_policies`, `application_policy_center`, `application_models`, `stakeholders` |

Correct chain:

```text
Integration credentials
  -> provider discovery scan
  -> discovered resources
  -> logical agent rows
  -> policy/risk/ownership/autonomy evaluation
  -> optional assignment to an application
  -> runtime logs and compliance evidence
```

## Database Table Map

The database currently has 55 application tables. The important groups are
below.

### Tenant, Identity, Access

| Table                      | Purpose                                                                             | Updated when                                                        |
| -------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `tenants`                  | Clerk organization or tenant record. Every row in product data belongs to a tenant. | Clerk webhook, lazy tenant sync, setup.                             |
| `users`                    | Local user profile mirror.                                                          | Clerk webhook, user sync.                                           |
| `memberships`              | User membership and permissions inside a tenant.                                    | Clerk org/member sync and user admin actions.                       |
| `api_keys`                 | NORIX API keys for ingestion or external access.                                    | API key create/revoke/delete flows.                                 |
| `processed_webhook_events` | Idempotency log for webhook events.                                                 | Clerk webhook handling.                                             |
| `audit_events`             | Immutable activity trail.                                                           | Almost every credential, connection, policy, and assignment action. |

### Integration Catalog And Credentials

| Table                              | Purpose                                                                                              | Updated when                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `integrations`                     | The marketplace/catalog card and connection status for AWS, Azure, Databricks, Kubernetes, GCP, etc. | Page catalog sync, adding credentials, discovery scans, revoke. |
| `aws_discovery_connections`        | AWS credential metadata: auth method, region, role/access key metadata. Secrets are encrypted.       | AWS add credentials, test, delete.                              |
| `azure_discovery_connections`      | Azure service principal metadata. Secret encrypted.                                                  | Azure add credentials, test, delete.                            |
| `integration_discovered_resources` | Durable provider resource snapshots for some integrations.                                           | Databricks/resource inventory flows.                            |
| `integrations_admin`               | Older/admin integration surface.                                                                     | Legacy/admin workflows.                                         |

Provider credential storage pattern:

| Provider     | Where credentials live               | Notes                                                                                           |
| ------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| AWS          | `aws_discovery_connections`          | Access key secret is encrypted; `integrations.configuration.awsConnectionId` points to the row. |
| Azure        | `azure_discovery_connections`        | Client secret encrypted; `integrations.configuration.azureConnectionId` points to the row.      |
| Google Cloud | `integrations.credentials_encrypted` | Service account JSON encrypted.                                                                 |
| Databricks   | `integrations.credentials_encrypted` | PAT encrypted.                                                                                  |
| Kubernetes   | `integrations.credentials_encrypted` | API server, token, and cluster CA encrypted.                                                    |

### Discovery, Agents, And Runtime Evidence

| Table                      | Purpose                                                                        | Updated when                               |
| -------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------ |
| `discovery_scans`          | One row per manual or cron scan. Stores status, counts, warnings/errors.       | Every discovery run.                       |
| `agents`                   | One logical discovered AI agent. This is the Agent Inventory source of truth.  | Discovery scans, application assignment.   |
| `agent_resources`          | Raw provider evidence attached to an agent. One agent can have many resources. | Discovery scans replace resource snapshot. |
| `agent_recommendations`    | Open recommendations like assign owner, reduce risk, add policy.               | Discovery scans and recommendation engine. |
| `agent_rules`              | Rule definitions for risk/autonomy style evaluation.                           | Seed/admin tuning.                         |
| `agent_policy_evaluations` | Materialized policy/compliance status for each agent.                          | Discovery scan and policy sync.            |
| `policy_findings`          | Durable open/resolved findings for agents/applications/runtime logs.           | Policy evaluation and runtime findings.    |
| `observability_logs`       | Runtime request/response/guardrail evidence.                                   | ControlNet/playground/runtime API traffic. |

Important rule:

```text
Agent Inventory must count rows in agents, not raw provider resources.
```

That is why Kubernetes must show one `chatbot-agent` row even if the API returns
Deployment, Pod, and Service objects.

### Applications And Governance

| Table                                                          | Purpose                                                 | Updated when                             |
| -------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------- |
| `applications`                                                 | Business application/use-case container.                | Create/edit/archive application.         |
| `stakeholders`                                                 | Owners, reviewers, business contacts.                   | Application stakeholder/owner workflows. |
| `application_models`                                           | Models linked to an application.                        | Application model setup.                 |
| `application_documentation`                                    | Governance docs for an application.                     | Documentation editor.                    |
| `application_policies`                                         | Runtime policies assigned to an application.            | Policy assignment/default policy setup.  |
| `application_policy_center`                                    | Compliance policy status/coverage at application level. | Compliance evaluation.                   |
| `datasets`                                                     | Datasets tied to app/testing/governance.                | Dataset workflows.                       |
| `use_cases`                                                    | Use-case records related to applications/risk.          | Use-case workflows.                      |
| `risks`, `risk_list`, `risk_categories`, `risk_category_links` | Risk catalog and application/use-case risk records.     | Risk workflows.                          |

Product meaning:

```text
Application is not automatically the running bot.
Application is the governed business use case.
Agents are the runtime things discovered from integrations.
Application becomes meaningful when agents/models/policies/owners/logs/evidence are linked.
```

### Policies, Guardrails, Compliance

| Table                                             | Purpose                                       | Updated when               |
| ------------------------------------------------- | --------------------------------------------- | -------------------------- |
| `policies`                                        | Runtime policy objects.                       | Policy create/edit/delete. |
| `guardrails`                                      | Guardrail definitions.                        | Guardrail catalog/admin.   |
| `policy_guardrails`                               | Join table: which guardrails are in a policy. | Policy editor.             |
| `policy_center`                                   | Policy center governance records.             | Policy center workflows.   |
| `global_ai_policies`                              | Global policy definitions.                    | Global policy workflows.   |
| `governance_frameworks`                           | Frameworks like AIDA, EU AI Act, etc.         | Seed/catalog.              |
| `governance_controls`                             | Controls inside frameworks.                   | Seed/catalog.              |
| `compliance_evidence`                             | Uploaded/reusable evidence.                   | Evidence workflows.        |
| `compliance_assessments`, `eu_ai_act_assessments` | Assessment records.                           | Compliance workflows.      |

### Model Registry And Model Scans

| Table                     | Purpose                                                               | Updated when                      |
| ------------------------- | --------------------------------------------------------------------- | --------------------------------- |
| `provider_models`         | Available model catalog and tenant-added model records.               | Model registry setup and updates. |
| `provider_model_metadata` | Extra metadata about provider models.                                 | Model registry sync/seed.         |
| `tenant_model_settings`   | Which model is selected for a tenant and whether connection is ready. | Model selection/test.             |
| `model_artifacts`         | Model artifact records.                                               | Model scan/upload/import.         |
| `model_scans`             | Scan results for models.                                              | Model scanning.                   |
| `onnx_models`             | ONNX model metadata.                                                  | ONNX model workflows.             |

### Router, Reports, Attachments

| Table                                                           | Purpose                            |
| --------------------------------------------------------------- | ---------------------------------- |
| `router_prompts`, `router_centroids`, `router_prompt_centroids` | Prompt router/training style data. |
| `reports`                                                       | Generated or stored reports.       |
| `attachments`                                                   | Uploaded files.                    |
| `red_teaming_tests`                                             | Red-team test cases/results.       |
| `scan_findings`                                                 | Model/security scan findings.      |
| `navigation_items`                                              | Navigation metadata.               |

## End To End Flow: What Gets Updated

### 1. Integrations Page Loads

Files:

```text
apps/web/src/app/[tenant]/admin/integrations/page.tsx
apps/web/src/lib/api/integrations.ts
apps/web/src/lib/actions/integrations.ts
```

Reads:

```text
integrations
```

Writes:

```text
Usually none during normal load.
Catalog actions may upsert missing provider cards.
```

UI fields:

| Text                | Meaning                                                     |
| ------------------- | ----------------------------------------------------------- |
| `Connected`         | Credentials exist and last state is not failed/pending.     |
| `Not connected`     | No usable credentials saved.                                |
| `Failed`            | Last validation or scan failed.                             |
| `Checking`          | Credentials were saved but validation/discovery is pending. |
| `Add credentials`   | Open provider credential dialog.                            |
| `Reconnect`         | Previous connection failed; add corrected credentials.      |
| `Discover`          | Run a manual discovery scan.                                |
| `Revoke`            | Delete stored credentials/connection.                       |
| `Last sync`         | `integrations.last_sync_at`.                                |
| `Agents discovered` | `integrations.configuration.lastAgentsDiscovered`.          |

### 2. AWS Connect And Discover

Files:

```text
apps/web/src/lib/actions/aws-integration.ts
apps/web/src/lib/actions/aws-discovery.ts
apps/web/src/lib/server/aws/discovery-orchestrator.ts
apps/web/src/lib/server/aws/discovery/*
```

Reads/writes:

| Step                  | Reads                                | Writes                                                                                 |
| --------------------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| Save credentials      | `tenants`                            | `aws_discovery_connections`, `audit_events`                                            |
| Test connection       | `aws_discovery_connections`          | `aws_discovery_connections.last_validated_at`, `last_validation_error`, `audit_events` |
| Discovery scan starts | `aws_discovery_connections`          | `discovery_scans(status=running)`                                                      |
| Provider APIs scanned | AWS APIs                             | local arrays of raw resources                                                          |
| Correlation           | raw resources                        | logical `CorrelatedAgent[]`                                                            |
| Persist agents        | `agents` existing rows               | `agents`, `agent_resources`, `agent_recommendations`                                   |
| Policy sync           | `agent_policy_evaluations`, policies | `agent_policy_evaluations`, `policy_findings`                                          |
| Scan complete         | `discovery_scans`, `integrations`    | status/counts/last sync/warnings                                                       |

AWS discovers:

```text
Bedrock Agents
AgentCore runtimes
Lambda agent workloads
Step Functions
IAM roles
CloudWatch logs
Secrets Manager
API Gateway
EventBridge
EC2 agent workloads
```

AWS partial warning rule:

If AgentCore permission is missing, AWS should stay Connected if the rest of
the scan completes. The warning should say missing optional
`bedrock-agentcore:ListAgentRuntimes`, not dump raw AWS ARN text.

### 3. Databricks Connect And Discover

Files:

```text
apps/web/src/lib/actions/databricks-integration.ts
apps/web/src/lib/server/databricks/discovery-orchestrator.ts
apps/web/src/lib/server/databricks/api-client.ts
```

Reads/writes:

| Step                     | Reads           | Writes                                                                                                                                      |
| ------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Save workspace URL/token | `integrations`  | `integrations.credentials_encrypted`, config, audit                                                                                         |
| Test workspace           | Databricks APIs | audit                                                                                                                                       |
| Discover                 | Databricks APIs | `discovery_scans`, `agents`, `agent_resources`, `integration_discovered_resources`, recommendations, policy evaluations, integration counts |

Databricks discovers:

```text
Databricks Apps
Model Serving endpoints
Genie spaces
Jobs
Workspace notebooks
Unity Catalog catalogs/schemas/tables/models
```

Important:

Unity Catalog assets are evidence/governance resources. They are not all
agents. Only agent-like Apps, serving endpoints, Genie, Jobs, or notebooks
become logical agents.

### 4. Kubernetes/EKS Connect And Discover

Files:

```text
apps/web/src/lib/actions/kubernetes-integration.ts
apps/web/src/lib/server/kubernetes/discovery-orchestrator.ts
```

Required UI inputs:

```text
Cluster Name
API Server URL
Bearer Token
Cluster CA Certificate
```

Validation calls:

```text
GET /version
GET /api/v1/nodes
GET /api/v1/namespaces
GET /api/v1/services
```

Failure meanings:

| Error           | Meaning                                                                           |
| --------------- | --------------------------------------------------------------------------------- |
| `401`           | Token invalid or expired.                                                         |
| `403`           | Token valid but RBAC cannot read the requested object.                            |
| `404`           | API server URL or path is wrong.                                                  |
| TLS/x509        | Cluster CA certificate is missing/wrong.                                          |
| Timeout/network | NORIX cannot reach the endpoint because of firewall/private endpoint/VPN/network. |

Kubernetes discovers:

```text
Deployments
StatefulSets
DaemonSets
Jobs
Pods
Services
```

But logical agent grouping is:

```text
Deployment/StatefulSet/DaemonSet/Job = primary agent workload
Pod = running replica evidence
Service = network evidence
```

For the current EKS case:

```text
Deployment chatbot-agent + Pod chatbot-agent-... + Service chatbot-agent
  -> one agent row: chatbot-agent
  -> platform: aws_eks
  -> display label: AWS EKS
```

### 5. Agent Inventory Loads

Files:

```text
apps/web/src/app/[tenant]/ai-agent-inventory/_components/AgentInventory.tsx
apps/web/src/lib/actions/agents.ts
apps/web/src/lib/queries/agents.ts
```

Reads:

```text
agents
agent_policy_evaluations
policy_findings
agent_resources
agent_recommendations
applications
users
tenants
```

Writes:

```text
Only assignment action writes.
Normal list/detail view should not write.
```

Assignment flow:

| UI action                   | Writes                                                                     |
| --------------------------- | -------------------------------------------------------------------------- |
| Assign agent to application | `agents.application_id`, `agents.updated_at`; then refreshes agent detail. |

### 6. Application Governance Flow

Application pages are business-governance containers. They become real when
they are linked to owners, models, policies, evidence, risks, logs, and agents.

Important truth:

```text
Creating an Application alone does not prove the running bot is governed.
Governance becomes real when runtime evidence and discovered agents/models are linked.
```

Typical application writes:

| Action                     | Writes                                                         |
| -------------------------- | -------------------------------------------------------------- |
| Create application         | `applications`, often default policy rows depending on action. |
| Add owner/stakeholder      | `stakeholders`.                                                |
| Add model                  | `application_models`.                                          |
| Assign policy              | `application_policies`, `application_policy_center`.           |
| Evaluate compliance        | `application_policy_center`, `policy_findings`.                |
| Upload evidence            | `compliance_evidence`, possibly attachments.                   |
| Runtime/playground traffic | `observability_logs`, possibly `policy_findings`.              |

## Agent Inventory UI Word Dictionary

### Table Columns

| UI word                 | Meaning                                                    | Data source                                        |
| ----------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| Agent name              | Logical agent name after provider correlation.             | `agents.name`                                      |
| Platform                | Runtime/platform where the agent was found.                | `agents.platform` mapped through `PLATFORM_LABELS` |
| Owner                   | Real owner if provider/app mapping found or user assigned. | `agents.owner_user_id` joined to `users`           |
| Unowned                 | No owner could be derived.                                 | `agents.owner_user_id is null`                     |
| no provider owner match | Provider metadata did not expose a reliable owner.         | `agents.owner_source` / ownership engine           |
| Function                | Business function/use case if detected.                    | `agents.business_function`                         |
| Not provided            | Provider did not supply function metadata.                 | null `business_function`                           |
| Autonomy L1-L4          | How much action-taking authority evidence supports.        | `agents.autonomy_level`                            |
| Risk                    | Risk score and level.                                      | `agents.risk_score`, `agents.risk_level`           |
| Compliance status       | Whether active mapped policy coverage is compliant.        | latest `agent_policy_evaluations`                  |
| Open findings           | Count of unresolved findings.                              | `policy_findings.status = open`                    |
| Status active           | Agent seen in latest discovery or considered live.         | `agents.status`                                    |
| Status inactive         | Agent no longer seen or disabled.                          | `agents.status`                                    |
| Last seen               | Last provider discovery time.                              | `agents.last_seen_at`                              |

### KPI Cards

| UI word                   | Meaning                                                       |
| ------------------------- | ------------------------------------------------------------- |
| Critical Risk             | Count of agents with `risk_level = Critical`.                 |
| High Risk                 | Count of agents with `risk_level = High`.                     |
| Unowned Agents            | Count of agents without an owner.                             |
| L4 Agents                 | Count of agents classified as high-autonomy/action-capable.   |
| L3 Agents                 | Count of agents classified as tool/action capable but not L4. |
| Non-Compliant             | Count of agents with active non-compliant policy evaluation.  |
| Agents With Open Findings | Count of agents with unresolved `policy_findings`.            |
| Missing Runtime Evidence  | Agents without runtime guardrail/log evidence.                |

### Detail Drawer Sections

| UI word                        | Why it exists                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| Ownership                      | Shows whether the platform knows who owns the agent. Governance needs accountability. |
| Governed Application           | Lets a discovered agent be linked to a business application/use case.                 |
| Real Provider Evidence         | Shows facts from provider APIs, not fake/manual assumptions.                          |
| Policy Coverage                | Shows active policy/compliance mapping for the agent.                                 |
| Risk                           | Explains why risk score exists.                                                       |
| Discovered Resources           | Shows raw infrastructure evidence attached to the logical agent.                      |
| Discovery                      | Shows first seen, last seen, sync source, and normalized capability evidence.         |
| Normalized Capability Evidence | Shows the facts used by autonomy/risk engines.                                        |

## Integration UI Word Dictionary

| UI word           | Why it exists                                                   |
| ----------------- | --------------------------------------------------------------- |
| Integrations      | Page where external systems are connected.                      |
| Cloud Providers   | AWS, Azure, GCP runtime/cloud discovery.                        |
| Data Platforms    | Databricks and similar platforms.                               |
| Runtime Platforms | Kubernetes cluster connection.                                  |
| Connected         | Credentials are stored and the last state is usable.            |
| Not connected     | No usable credentials are stored.                               |
| Failed            | Validation or scan failed. User must reconnect/fix permissions. |
| Checking          | Connection exists but validation/discovery is pending.          |
| Add credentials   | Opens credential form.                                          |
| Reconnect         | Same as add credentials, but after failure.                     |
| Discover          | Runs a manual scan.                                             |
| Revoke            | Removes stored credentials and connection state.                |
| Last sync         | Last completed or attempted scan timestamp.                     |
| Agents discovered | Logical agent count from the last scan, not raw resource count. |

## Integration Credential Copy Dictionary

### AWS

| UI word                           | Why                                                            |
| --------------------------------- | -------------------------------------------------------------- |
| AWS discovery access              | Explains this connection is for read-only discovery.           |
| Authentication Method             | User chooses IAM role, cross-account role, or access keys.     |
| IAM role recommended              | Safer than long-lived access keys.                             |
| AWS Region                        | Starting/default region; scanner can discover enabled regions. |
| Role ARN                          | Role NORIX assumes.                                            |
| Cross-account Role ARN            | Role in another AWS account.                                   |
| External ID                       | Protects cross-account assume-role trust.                      |
| Access Key ID / Secret Access Key | Static credential path; works but less preferred.              |

### Azure

| UI word                 | Why                                                     |
| ----------------------- | ------------------------------------------------------- |
| Azure service principal | Azure app credential used for Resource Graph discovery. |
| Tenant ID               | Azure AD tenant.                                        |
| Subscription ID         | Azure subscription to scan.                             |
| Client ID               | Service principal app/client id.                        |
| Client Secret           | Secret for that service principal.                      |

### Databricks

| UI word                       | Why                                               |
| ----------------------------- | ------------------------------------------------- |
| Workspace URL                 | Root Databricks workspace URL.                    |
| Personal Access Token         | Token used to query workspace APIs.               |
| Unity Catalog                 | Governance layer for tables/models/data evidence. |
| Apps / Jobs / Genie / Serving | Agent-like Databricks surfaces.                   |

### Kubernetes

| UI word                | Why                                                                    |
| ---------------------- | ---------------------------------------------------------------------- |
| Cluster Name           | Human identifier and account id for this cluster.                      |
| API Server URL         | Kubernetes API endpoint.                                               |
| Bearer Token           | Service account token used for Kubernetes API reads.                   |
| Cluster CA Certificate | Required so HTTPS/TLS validation works against EKS/private cluster CA. |

## Platform Labels

Stored enum to UI label:

| Stored value               | UI label                                                               |
| -------------------------- | ---------------------------------------------------------------------- |
| `aws_bedrock`              | AWS Bedrock                                                            |
| `aws_agentcore`            | AWS AgentCore                                                          |
| `aws_lambda`               | AWS Lambda                                                             |
| `aws_step_functions`       | AWS Step Functions                                                     |
| `aws_ec2`                  | AWS EC2                                                                |
| `aws_eks`                  | AWS EKS                                                                |
| `azure_openai`             | Azure OpenAI                                                           |
| `azure_ai_foundry`         | Azure AI Foundry                                                       |
| `azure_functions`          | Azure Functions                                                        |
| `azure_logic_apps`         | Azure Logic Apps                                                       |
| `azure_virtual_machines`   | Azure VMs                                                              |
| `azure_container_apps`     | Azure Container Apps                                                   |
| `azure_aks`                | Azure AKS                                                              |
| `gcp_vertex_ai`            | Vertex AI                                                              |
| `gcp_cloud_run`            | Google Cloud Run                                                       |
| `gcp_compute`              | Google Compute Engine                                                  |
| `gcp_gke`                  | Google GKE                                                             |
| `gcp_functions`            | Google Cloud Functions                                                 |
| `databricks_apps`          | Databricks Apps                                                        |
| `databricks_model_serving` | Databricks Model Serving                                               |
| `databricks_jobs`          | Databricks Jobs                                                        |
| `databricks_genie`         | Databricks Genie Agent                                                 |
| `kubernetes`               | Kubernetes                                                             |
| `other`                    | Fallback only. Avoid using when a provider-specific platform is known. |

## What Should Never Be Fake

These fields must only come from real provider data or explicit user action:

| Field             | Allowed sources                                                                   |
| ----------------- | --------------------------------------------------------------------------------- |
| Owner             | Provider tags/metadata, app assignment, stakeholder/user assignment.              |
| Function          | Provider labels/tags, application mapping, explicit user input.                   |
| Model             | Provider runtime config, serving endpoint metadata, model registry link.          |
| Runtime evidence  | `observability_logs`, guardrail results, provider runtime traces where available. |
| Compliance status | `agent_policy_evaluations` or application compliance evaluation.                  |
| Agent count       | Correlated logical agents, not raw resources.                                     |

## Common Debug Queries

Current integration cards:

```sql
select
  name,
  category,
  is_credentials_added,
  is_enabled,
  sync_status,
  last_sync_at,
  error_message,
  configuration
from integrations
order by category, name;
```

Current agents:

```sql
select
  name,
  platform,
  discovery_source,
  region,
  account_id,
  external_agent_id,
  status,
  last_seen_at
from agents
order by updated_at desc;
```

Kubernetes duplicate check:

```sql
select
  name,
  platform,
  discovery_source,
  external_agent_id
from agents
where discovery_source = 'kubernetes_workload';
```

Agent resources under one logical agent:

```sql
select
  a.name as agent,
  ar.resource_type,
  ar.resource_name,
  ar.region,
  ar.raw_data
from agents a
join agent_resources ar on ar.agent_id = a.id
where a.name = 'chatbot-agent'
order by ar.resource_name;
```

Latest discovery scans:

```sql
select
  status,
  agents_discovered,
  resources_scanned,
  error_message,
  started_at,
  finished_at
from discovery_scans
order by started_at desc
limit 20;
```

## How To Become Subject Matter Expert

Use this order:

1. Learn `integrations` and provider credential tables.
2. Learn `discovery_scans`, `agents`, and `agent_resources`.
3. Learn how provider resources become one logical agent.
4. Learn `agent_policy_evaluations`, `policy_findings`, and `agent_recommendations`.
5. Learn `applications` and how agents are assigned to applications.
6. Learn `observability_logs`, because that is what makes runtime governance real.
7. Learn every visible UI word by mapping it back to a table column or provider API.

If a word in the UI cannot be mapped to a table, provider API, or explicit user
action, it should be removed or rewritten.
