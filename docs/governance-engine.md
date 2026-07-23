# Norix Governance Engine

## Purpose

Norix treats an **Application** as the governance record for a real AI system operated outside Norix. An Application is not an automatically discovered cloud agent. An **Agent** is a concrete runtime asset found by AWS or Azure discovery and may optionally be linked to an Application. This separation prevents cloud inventory from corrupting the business governance model.

The official workflow is:

1. Create an Application.
2. Complete business metadata and scope.
3. Record intended use cases.
4. Identify, score, assign and mitigate risks.
5. document models, hosting, data and technical details.
6. Assign accountable stakeholders.
7. Enable organization-approved compliance frameworks.
8. Upload organization or application evidence.
9. Run automatic control evaluation.
10. Continuously monitor runtime policy execution.
11. Review application and executive dashboards.

## Implementation audit

| Area | Result | Implementation |
| --- | --- | --- |
| Application creation and business metadata | Implemented | Existing Application records and Application Scope remain the source of truth. |
| Use cases, risks, technical details and stakeholders | Implemented | Existing GovIQ modules are reused by the evaluator. |
| Admin Compliance Policies | Extended | Database-backed catalog, search/filter/toggle, full policy drawer, mappings, guidance, CSV checklist and inherited evidence. |
| Application compliance | Extended | Applicability, live evaluation, generated gaps/tasks, mapped deep links, evidence coverage and progress metrics. |
| Evidence | Implemented | Organization/application scope, policy/control mapping, links and encrypted files; inherited organization evidence is evaluated automatically. |
| AWS inventory discovery | Existing and retained | Existing card and scan pipeline are unchanged; all results continue to populate Agent Inventory. |
| Azure inventory discovery | Implemented | Azure card, encrypted service principal, connection test, Resource Graph scan and shared inventory engines. |
| Autonomy and risk | Existing and extended | The data-driven engines are reused for both AWS and Azure resources. |
| Executive dashboard | Extended | Live agent KPIs/distributions/trends/recent agents plus recent blocked runtime violations. |

## Compliance catalog and applicability

The organization enables authoritative entries in Admin → Compliance → Compliance Policies. Disabled entries remain in existing application mappings but are unavailable for new assignment. Policy descriptions, jurisdiction, legal status, authority, effective date, requirements, references, applicability rules and control mappings are stored in the database—not embedded in card components.

Applicability is conservative. A policy with a non-applicable catalog classification does not create a false compliance score. Other policies evaluate only their mapped required controls. Application state is never declared compliant merely because a toggle is enabled.

## Mapping engine

Each policy contains control keys. `control-catalog.ts` maps each key to:

- the Norix source field/module;
- the application route used to complete it;
- expected evidence;
- implementation guidance; and
- task priority.

Examples:

- Risk Register → risk-management controls across ISO 42001, EU AI Act and NIST AI RMF.
- Owner/stakeholders → accountability and human-responsibility controls.
- Models and technical details → technical documentation/model inventory.
- Application default ControlNet policy → runtime safeguards.
- Observability logs → execution verification and record keeping.
- Data governance records → provenance, quality, retention and access controls.

The evaluator reads the saved application scope, use cases, risks, stakeholders, models, red-team runs, discovered agents, runtime policies and observability logs in one tenant-scoped evaluation. A saved field can therefore satisfy every framework that maps to the same control without duplicating data entry.

## Evidence engine

Evidence is scoped to either:

- **Organization**: uploaded once in the Admin Compliance Center and inherited by all applications in the tenant; or
- **Application**: attached to one application.

Evidence can be a policy, PDF, Word file, HTTP(S) link, audit report, risk report, approval record or training record. Files are limited to approved formats and 8 MB, validated on both metadata and decoded size, encrypted with AES-256-GCM before database storage, tenant-authorized on download, and delivered with no-store/nosniff headers.

Evidence is mapped to a policy and control key. The evaluator accepts an active policy-specific item or a generic item for that control. Application evidence and inherited organization evidence are identified separately in evaluation output. Deleting evidence triggers a failed control on the next evaluation; it never leaves an artificial completed state.

## Progress and generated tasks

For every applicable policy:

`coverage % = verified required controls / total required controls × 100`

Status is:

- `compliant`: all required controls verified;
- `partially_compliant`: at least one but not all required controls verified;
- `non_compliant`: no required controls verified or critical evidence is absent;
- `not_applicable`: applicability rules exclude the entry.

An applicable policy with zero registered machine controls fails closed as non-compliant; it can never receive an accidental 100%/compliant result from an empty checklist.

Every unverified control becomes a generated task containing its reason, priority, mapped Norix field, deep link, required evidence and implementation guidance. Application Overview aggregates Overall, ISO 42001, EU AI Act and NIST percentages plus missing controls, missing evidence, high-priority tasks, completed controls and remaining controls. Values come from evaluation records and update whenever a policy is evaluated or evidence changes.

## Runtime policy enforcement and continuous monitoring

Compliance framework assignment and runtime enforcement serve different purposes. A compliance framework specifies governance obligations. The application's default ControlNet policy specifies executable guardrails. Runtime requests carry application identity, resolve the active default policy, execute its guards, fail closed when required configuration is absent, and write the decision plus guard results to observability logs. Those logs satisfy monitoring/record-keeping controls only when real application-scoped execution evidence exists. Blocked requests appear as recent violations on the Executive Risk Dashboard.

## AWS discovery architecture

The AWS card is located in the existing Integrations page under Cloud Providers. Credentials are encrypted. A connection test validates the account before the initial scan. Discovery inspects Bedrock Agents/AgentCore, knowledge bases/models/guardrails, Lambda, Step Functions, IAM roles/service credentials, API Gateway, EventBridge, Secrets Manager and CloudWatch across configured or resolved regions.

Resources are normalized, correlated into logical agents, classified, scored and upserted. Each scan replaces the resource/recommendation snapshot while preserving the stable agent row. Re-running discovery refreshes Agent Inventory and all discovery dashboards.

## Azure discovery architecture

The Azure card is in the same Cloud Providers category. It uses an Azure Entra service principal. Required values are Azure tenant ID, subscription ID, client ID and client secret. The secret is AES-256-GCM encrypted and never returned to the browser.

Connection testing obtains an OAuth client-credentials token and reads the subscription. Discovery uses Azure Resource Graph and requires subscription Reader access plus permission to query Resource Graph. It discovers:

- Azure OpenAI accounts;
- Azure AI Foundry workspaces/projects;
- Azure Functions;
- Logic Apps;
- user-assigned managed identities;
- Storage accounts;
- Key Vaults; and
- API Management services.

OpenAI, Foundry, Function and Logic App resources are agent anchors. Supporting resources in the same resource group are attached as evidence. The resulting agents pass through the same ownership, capability, autonomy, risk and recommendation engines as AWS and are stored in the same Agent Inventory tables. This avoids duplicate inventory logic.

## Autonomy engine

The capability normalizer derives signals such as owner presence, write/delete/invoke capability, administrative/broad access, execution-capable resources, workflows, public endpoints, external APIs, sensitive stores, guardrails, approval tags, credentials and dormancy.

Data-driven autonomy rules select:

- L1 Observe: read/observe with no action capability;
- L2 Advise: produces recommendations but lacks independent execution;
- L3 Approval Required: can execute and has an explicit human approval checkpoint;
- L4 Autonomous: can execute without an approval checkpoint within discovered guardrails.

The engine stores the level, matched-rule explanation/evidence, confidence and classification timestamp on every agent. It does not infer a human approval workflow unless the provider metadata/tags provide that evidence.

## Risk engine

Risk rules evaluate normalized facts. Each matched rule contributes its configured weight. The explainable score is:

`risk score = clamp(round(sum(matched rule weights)), 0, 100)`

Thresholds are Low 0–24, Medium 25–49, High 50–74 and Critical 75–100. Factors include missing owner, admin/write/delete/invoke permissions, cross-account access, public endpoints, sensitive stores, stale credentials, dormant assets, unused permissions, external APIs and high autonomy. Every contribution is stored with rule key, description and points. Recommendations derive from the same facts, so the dashboard explains both the score and corrective action.

## End-to-end data flow

1. An admin enables compliance catalog entries and uploads reusable evidence.
2. A user creates an Application and completes its governance modules.
3. The user assigns an enabled framework; Norix evaluates mapped live data and inherited evidence.
4. Missing controls become prioritized tasks and links, while verified data raises coverage automatically.
5. Cloud admins connect AWS/Azure; discovery populates the independent Agent Inventory.
6. Discovery classifies autonomy, detects ownership, scores risk and creates recommendations.
7. Agents can be linked to applications; application evaluations then consume their ownership/risk state.
8. Application traffic runs through ControlNet; observations and blocks become continuous evidence and violations.
9. Application Overview and Executive Risk Dashboard query current database state and refresh after evaluation/scans.

## Security and tenancy assumptions

- All new actions require authenticated Clerk user and active organization, and verify that the requested tenant equals that organization.
- Cloud and evidence secrets are encrypted using `AWS_CREDENTIALS_ENCRYPTION_KEY` (a generic rename can be introduced in a future key-rotation migration).
- Cloud credentials need read-only discovery permissions. Norix does not request write access to customer cloud resources.
- Azure Resource Graph cannot prove last invocation time for every service. Norix does not fabricate it; absence remains unknown unless provider activity metadata is available.
- Compliance percentages are evidence coverage, not legal certification. Human legal/compliance approval remains necessary.

## Extensibility

New regulations are seeded as catalog rows with mappings and applicability rules. New controls add a catalog definition and collector. New evidence backends can replace encrypted database blobs with object storage while preserving evidence IDs. New cloud providers normalize into `RawDiscoveredResource` and reuse the shared engines. Risk/autonomy tuning is performed through rule rows, enabling tenant overrides without application code changes.
