# Changelog

Every Governly version, newest first. Versions follow [Semantic Versioning](https://semver.org/):
**major** = you must change something to upgrade, **minor** = new features, **patch** = bug fixes.
How to upgrade or cut a release: [docs/releasing.md](docs/releasing.md).

| Version | Date | Highlights |
| --- | --- | --- |
| [**1.4.1**](#141---2026-11-16) | 2026-11-16 | Risk register summary cards and filters, catalog picker layout fixes |
| [1.4.0](#140---2026-11-16) | 2026-11-16 | Risk management: import from IBM AI Risk Atlas and MIT AI Risk Repository, automatic risk level, risk-to-control links |
| [1.3.0](#130---2026-11-13) | 2026-11-13 | Trust Dossier, live AI Radar, controls center, code-based agent discovery, BYOK, open-source self-hosting |
| [1.2.0](#120---2026-08-10) | 2026-08-10 | LangSmith observability, red teaming, guardrail marketplace, `/v1/guard/check`, security fixes |
| [1.1.0](#110---2026-07-31) | 2026-07-31 | Self-hosted Nango integrations, multicloud agent discovery (EKS, Databricks, CrewAI), tenant-wide policy, HTTPS |
| [1.0.0](#100---2026-05-29) | 2026-05-29 | First production launch: dashboard, ControlNet guardrail gateway, model registry, AWS deployment |

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
