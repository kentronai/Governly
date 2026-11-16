# Changelog

Every Governly version, newest first. Versions follow [Semantic Versioning](https://semver.org/):
**major** = you must change something to upgrade, **minor** = new features, **patch** = bug fixes.
How to upgrade or cut a release: [docs/releasing.md](docs/releasing.md).

| Version | Date | Highlights |
| --- | --- | --- |
| [**1.7.3**](#173---2026-11-16) | 2026-11-16 | Security fixes: tenant isolation across the app, guardrail bypasses closed, safer agent discovery |
| [1.7.2](#172---2026-11-16) | 2026-11-16 | Control Owner removed from risks, underline tabs on the risk page |
| [1.7.1](#171---2026-11-16) | 2026-11-16 | Risk catalog picker shows all IBM and MIT risks when scrolling |
| [1.7.0](#170---2026-11-16) | 2026-11-16 | Real fairness testing on risks, controls for 5 more frameworks, risk security fixes |
| [1.6.0](#160---2026-11-16) | 2026-11-16 | Controls for 8 more regulations, consistent risk form, editable categories |
| [1.5.0](#150---2026-11-16) | 2026-11-16 | Risk and Treatment tabs: use cases, frameworks, AI lifecycle phase, potential impact, residual risk |
| [1.4.2](#142---2026-11-16) | 2026-11-16 | Numbered risk catalog with category in an actions menu, Governly logo |
| [1.4.1](#141---2026-11-16) | 2026-11-16 | Risk register summary cards and filters, catalog picker layout fixes |
| [1.4.0](#140---2026-11-16) | 2026-11-16 | Risk management: import from IBM AI Risk Atlas and MIT AI Risk Repository, automatic risk level, risk-to-control links |
| [1.3.0](#130---2026-11-13) | 2026-11-13 | Trust Dossier, live AI Radar, controls center, code-based agent discovery, BYOK, open-source self-hosting |
| [1.2.0](#120---2026-08-10) | 2026-08-10 | LangSmith observability, red teaming, guardrail marketplace, `/v1/guard/check`, security fixes |
| [1.1.0](#110---2026-07-31) | 2026-07-31 | Self-hosted Nango integrations, multicloud agent discovery (EKS, Databricks, CrewAI), tenant-wide policy, HTTPS |
| [1.0.0](#100---2026-05-29) | 2026-05-29 | First production launch: dashboard, ControlNet guardrail gateway, model registry, AWS deployment |

## [1.7.3] - 2026-11-16

### Security

- **Tenant isolation.** Every server action and integration route now checks that the signed-in user
  belongs to the organization named in the request. Before, a user of one organization could read
  another's audit logs, request logs and prompts, create or revoke its API keys, and edit or delete
  its applications, risks, use cases, stakeholders, policies, guardrails, documentation and
  integrations.
- Only organization admins can create users.
- Integration secrets are no longer written in plain text to the audit log, and encrypted
  credentials are no longer sent to the browser. Keys saved before this release may still be in old
  audit entries: rotate them.
- Connecting an integration only accepts Nango connections created by the same organization.
- Opening another organization's policy or model scan report by URL shows "not found". Model scans
  are recorded against the signed-in organization instead of a fixed account.
- Unused debug endpoints that exposed model data across organizations were removed.
- Clerk webhooks are verified against the raw request body.

### Guardrail gateway

- Input guards check every user message, including OpenAI multi-part content and earlier messages
  in the conversation (system prompts are not scanned).
- Medium and low severity guards now block instead of only logging.
- PII redaction now actually replaces the text sent to the model and returned to the user.
- Streaming responses: tool calls are checked, deep (T2) checks run before the stream is closed, and
  every choice is checked when `n > 1` (also for non-streaming responses).
- The organization is always taken from the signed token or API key, never from the
  `X-Tenant-ID` header. Clerk session tokens v1 and v2 are both supported.
- Without an application id, the organization's default policy can no longer be bypassed by naming
  a weaker policy, and deactivated application policies are no longer selected.
- Model download refuses private and internal addresses, enforces the size limit while
  downloading, and always stores models under the caller's organization.
- Cache admin endpoints only show or clear the caller's own organization.
- Gateway-only fields (`policy_id`, `application_id`, `agent_id`) are no longer forwarded to the
  model provider, which rejected them.
- Revoked API keys stop working within 30 seconds; edited policies take effect immediately.
- CORS preflight requests are no longer rejected by authentication.

### Fixed

- Agent discovery never deletes or retires agents after a temporary provider error (Databricks,
  AWS, Azure, GCP, GitHub). AWS, Azure and GCP now retire agents that were really removed.
- AWS discovery reads every page of results (API Gateway, Bedrock, CloudWatch).
- One failing agent no longer stops the rest of a discovery scan.
- LangSmith sync ingests all runs since the last sync, not just the newest 100.
- Nango calls time out after 30 seconds instead of leaving a scan running forever.
- Findings from a deactivated policy are resolved.
- Pagination no longer jumps back to page 1 on request logs and the admin users pages.
- Reactivating a deactivated user works again.
- Failed saves show an error message instead of replacing the page with an error screen.
- "Modified By" stays filled in after editing an application.
- Old links like `/applications/<id>/...` keep the full path when redirected.
- The GovIQ overview shows real framework progress instead of placeholder numbers.
- Removed broken and test-only pages.

### Changed

- Linting is configured (`pnpm lint` runs `next/core-web-vitals`).

## [1.7.2] - 2026-11-16

### Removed

- **Control Owner** on risks: removed from the risk form, the register, the risk details page and
  the details pop-up. The risk's Owner is the single responsible person. Values already saved stay
  in the database, hidden.

### Changed

- The risk page's assessment tabs use the same flat underline style as the Controls page and AI Radar.

## [1.7.1] - 2026-11-16

### Fixed

- Risk catalog picker: scroll to load every risk (all 1,617 MIT and 99 IBM), 100 at a time. It
  was capped at the first 200. Shows "Showing N of M" and searches the whole catalog.

## [1.7.0] - 2026-11-16

### Added

- **Real fairness testing on risks** (Bias & Fairness tab). Upload a model's decisions as CSV or Excel;
  the file is read in the browser and only the summary is saved. Shows selection rate and impact ratio
  per group, the four-fifths rule (below 0.8 fails), selection-rate gap and, with a true-label column,
  equal opportunity gap. Replaces the old tab, which showed hard-coded sample data.
- Controls for 5 more frameworks, written from the official sources with references (236 controls):
  NIST Cybersecurity Framework 2.0 (106), AI Verify (65), UNESCO Recommendation on the Ethics of AI (36),
  EEOC guidance on the ADA and AI (15, guidance withdrawn in 2025, noted in the description) and the UK
  AI White Paper (14). Existing control IDs are unchanged; new ones follow them.

### Changed

- Risk assessment tabs (Transparency, Human Oversight, Bias & Fairness, Bias Monitoring, Explainability,
  Environmental Impact) are back, for High and Critical risks.
- Import from the IBM and MIT risk catalogs is limited to Kentron staff for now. Everyone else sees a
  plain "Create Risk" button for a custom risk. Enforced on the server as well as in the menu.
- "Linked policies" is hidden from the risk menu for now.

### Fixed

- Editing or deleting a risk now checks that it belongs to the signed-in organisation.
- Use cases and regulations ticked on a risk are validated on the server.

## [1.6.0] - 2026-11-16

### Added

- Controls for 8 more regulations, each written from the official text with article references
  (146 controls): Quebec Law 25 (31), Saudi Arabia PDPL (24), UAE PDPL (23), Bahrain PDPL (20),
  Colorado SB21-169 (19), Qatar PDPPL (19), California AB 2839 (6; struck down in Kohls v. Bonta,
  appeal pending, marked not currently enforceable) and Illinois HB3773 (4). Existing control IDs
  are unchanged; new ones follow them.
- Risk categories can be removed (×) and added in the risk form.

### Changed

- Risk form: Owner and Control owner match the other fields; every text box has the same height;
  "Applies to frameworks" is now "Applies to regulations & frameworks", grouped by kind.
- Risk page shows only Risk Details. The Transparency, Human Oversight, Bias & Fairness, Bias
  Monitoring, Explainability and Environmental Impact tabs are hidden for now.

### Fixed

- The risk page only opens risks that belong to the signed-in organisation.

## [1.5.0] - 2026-11-16

### Added

- **Risk form in two tabs.** *Risk* (what can go wrong) and *Treatment* (what is done about it):
  - Risk: applies to use cases (from the application's Use Case page), applies to frameworks
    (the ones enabled for the organisation), AI lifecycle phase, description, potential impact,
    inherent likelihood × severity with automatic level, and review notes (filled in automatically
    when a risk is imported from the IBM or MIT catalog).
  - Treatment: status, target date, control owner, treatment plan, implementation strategy, and
    residual likelihood × severity with an automatic residual level (inherent → residual shown
    side by side).
- "Residual" column in the risk register.

### Changed

- Use case cards are compact: sections in a three-column grid, smaller text and icon buttons.

### Fixed

- Creating a risk now checks that the user belongs to the risk's organisation.

## [1.4.2] - 2026-11-16

### Changed

- Risk catalog picker: each source is numbered 1, 2, 3… (IBM 1–99, MIT 1–1,617). The number is
  stored with the risk (`risk_list.catalog_no`) and always maps to the same source reference.
  Search accepts the number. Raw source references (e.g. MIT `59.25.01`) moved out of the table.
- Category and source reference now open from a "…" actions menu on each catalog row (IBM and MIT).
  Risks MIT never categorised say so instead of showing a blank.
- Governly logo in the header, plus a Governly favicon and Apple touch icon.
- ControlNet `uv.lock` synced with the declared `boto3` dependency.

## [1.4.1] - 2026-11-16

### Added

- Risk register summary cards (Total, Critical, High, Medium, Low); click one to filter by that level.
- Filters for risk level, severity and mitigation status, with "Clear filters".

### Fixed

- Risk catalog picker: ID column, one line per cell ending in "…" with the full text on hover, and a
  full-text preview of the selected risk. MIT descriptions no longer show stray quote marks.
- Long risk names no longer push the register's columns off screen.

### Changed

- Linked policies moved from a table column into the row's actions menu, and are view-only for now.

## [1.4.0] - 2026-11-16

### Added

- **Risk management**: "Create Risk" offers a custom risk or an import from the IBM AI Risk Atlas
  (99 risks, Apache-2.0) or the MIT AI Risk Repository (1,617 risks, CC BY 4.0). An imported risk
  pre-fills the form with its name, description and category, plus suggested severity and likelihood
  (neither source rates these, so they are rule-based defaults the user can change).
- Risk level is calculated from severity × likelihood (Low, Medium, High, Critical), in the form and
  on the server.
- Risks link to framework controls: "View controls" on a risk, and "Linked risks" in each control's
  dialog on the Controls page, backed by one `risk_links` table.
- `apps/web/scripts/risk-catalog/build_risk_catalog.py` rebuilds the catalog seed when IBM or MIT
  publish updates.

### Fixed

- Green CI (type errors, stale test, gitleaks version, prod-like install).

## [1.3.0] - 2026-11-13

### Added

- **Trust Dossier**: vendor directory with full dossiers, scoring and tracking; 214 AI applications from
  the AI Trust Index; subprocessor lists for 145 vendors; filters, cards and bulk tracking; a weekly
  agent keeps dossiers current.
- **AI Radar**: live official regulator feeds with 85 verified AI-only sources, Regulation (mandatory)
  vs Framework (voluntary) types, on by default.
- **Controls center** and a framework/regulation catalog, with EU AI Act requirements tracking.
- **Agent Registry**: code-based agent discovery, policy violations, autonomy levels, registry actions
  and a reworked dashboard with a violations table.
- **BYOK**: save your own model keys (edit/delete), larger model lists, unified model catalog.
- Admin Center in the main sidebar, standardized page headers, rich-text fields across forms, dialog
  autosave.
- Open source: MIT license, one-command self-hosting (`install.sh`, `--doctor`), self-hosting and
  configuration docs, setup skill for coding agents, contributing guide, issue templates, CI, versioning.

### Fixed

- Members list, org switcher, stale agents, model dialog and Trust Dossier dates.
- Permanent control IDs; evidence uploads are never rejected; custom use cases no longer wiped.
- AI Radar retries failing sources and replaces dead ones; real agent owners and honest "Last
  Deployed" for EC2 agents; dashboard agent counts.

### Changed

- Product renamed from NORIX to Governly.

## [1.2.0] - 2026-08-10

### Added

- **LangSmith observability** connected through Nango, with region detection and project
  auto-select.
- **Red teaming**: auto-generated adversarial prompts and real batch tests.
- **Guardrail marketplace**: detection logic for marketplace guardrails, install before use.
- **`/v1/guard/check`**: run policy checks without calling a model.

### Fixed

- Security: closed account-takeover paths in user password and profile management.
- Policy edits no longer wipe guardrails; default safety guardrails restored; marketplace seed upserts
  instead of duplicating.
- Provider model catalog is seeded so models are selectable; display names rejected as model ids.
- Observability no longer reports provider failures as guardrail blocks.
- Nango Connect UI works in production; integration snippets point at the right domain.

## [1.1.0] - 2026-07-31

### Added

- **Self-hosted Nango** integrations layer, with EKS agent discovery.
- Multicloud agent governance: **Databricks** (Unity Catalog and agent deployments) and **CrewAI
  Enterprise** discovery.
- **Tenant-wide default policy** enforced by the gateway everywhere.
- Agent inventory: owner fallback, real-time refresh, consistent autonomy across deployments.
- HTTPS with Let's Encrypt in nginx.

### Fixed

- Guardrails catch rephrased harmful instructions.
- Hydration mismatches in the agent inventory and model registry; faster agent inventory.

## [1.0.0] - 2026-05-29

First production launch.

### Added

- Multi-tenant dashboard (Next.js, Clerk sign-in, Drizzle on Postgres).
- **ControlNet** guardrail gateway: OpenAI-compatible API, Composable Guard Algebra, YAML policies,
  ONNX ML guards.
- Model registry with provider model validation.
- AWS S3 model storage alongside GCS, and the AWS EC2 deployment.
