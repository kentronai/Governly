# Governly documentation

## Getting started

- [Self-hosting](self-hosting.md): install with one command, HTTPS, Clerk, upgrades, backups, troubleshooting
- [Deploy to the cloud](deploy.md): one-click AWS, Azure, Google Cloud, Render and Railway, status and redeploys
- [Configuration](configuration.md): every `.env` setting
- [Setup skill for coding agents](SKILL.md): hand this to Claude Code, Codex or Cursor

## Using Governly

- [ControlNet API reference](API.md): the OpenAI-compatible guardrail gateway
- [Composable Guard Algebra](CGA_GUIDE.md): composing guards
- [Guard packs and policies](CONTROLNET_GUARD_PACKS_FLOW.md) and the [visual flow](CONTROLNET_VISUAL_FLOW.md)
- [Policy enforcement and evidence](REAL_POLICY_ENFORCEMENT.md)
- [Governance engine](governance-engine.md)
- [Datasets and Test Runs](test-runs.md): test an application's guardrails and answer quality
- [AI Trust Center report](ai-trust-center-report.md): a PDF of your AI models, training policy, frameworks and sub-processors

## Architecture

- [System architecture](ARCHITECTURE.md)
- [Internals master guide](NORIX_INTERNALS_MASTER_GUIDE.md)
- [Database architecture](tech/database-architecture.md) and [migrations](DATABASE_MIGRATION.md)
- [Guardrail execution](tech/guardrail-execution-architecture.md),
  [routing and ONNX models](tech/routing-onnx-architecture.md),
  [preloaded runtime](tech/preloaded-runtime-architecture.md)
- AI agent discovery: [architecture](aws-agent-discovery/ARCHITECTURE.md),
  [AWS scanning](aws-agent-discovery/AWS_DISCOVERY.md),
  [capability](aws-agent-discovery/CAPABILITY_ENGINE.md),
  [risk](aws-agent-discovery/RISK_ENGINE.md),
  [recommendation](aws-agent-discovery/RECOMMENDATION_ENGINE.md),
  [autonomy](aws-agent-discovery/AUTONOMY_ENGINE.md) engines,
  [schema](aws-agent-discovery/DATABASE_SCHEMA.md)

## Contributing

- [Development guide](DEVELOPMENT.md) and [local vs remote development](tech/local-remote-development.md)
- [Design system](norix-design-system/README.md) and [UI spec](norix-design-system/NORIX-UI-SPEC.md)
- [CONTRIBUTING.md](../CONTRIBUTING.md) and [AGENTS.md](../AGENTS.md)
- [Versions and releases](releasing.md)
