# AI Governance Platform

A multi-tenant AI governance and guardrails platform built with Next.js, FastAPI, and functional programming principles.

## Quick Start

```bash
# Start everything locally
./start_local_dev.sh

# Access at http://localhost
```

## Architecture

### Components

1. **ControlNet Gateway** (`apps/controlnet/`)
   - FastAPI service with OpenAI-compatible API
   - Composable Guard Algebra (CGA) for functional guard composition
   - Tiered guard execution (T0/T1/T2)
   - ONNX model integration for ML-based guards
   - Policy management with YAML DSL

2. **Web Dashboard** (`apps/web/`)
   - Next.js application with TypeScript
   - Multi-tenant support with RLS
   - Clerk authentication
   - Drizzle ORM for database
   - Policy management UI
   - Observability dashboard

3. **Model Guard** (`apps/model-guard/`)
   - Model security scanner
   - SBOM generation
   - Vulnerability detection

### Tech Stack

- **Backend**: Python 3.11+, FastAPI, SQLAlchemy
- **Frontend**: Next.js 15, React 19, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Clerk
- **Cache**: Redis
- **ML**: ONNX Runtime, Sentence Transformers
- **Infrastructure**: Docker, Terraform (GCP)

## Project Structure

```
ai-governance/
├── apps/
│   ├── controlnet/        # FastAPI Gateway + CGA
│   ├── web/               # Next.js Dashboard  
│   └── model-guard/       # Model Security Scanner
├── infra/                 # Terraform for GCP
├── packages/
│   └── cga-sdk/          # CGA SDK
└── docs/                 # Documentation
```

## Development

### Prerequisites

- Docker & Docker Compose
- Python 3.11+
- Node.js 18+
- `.env` file configured

### Running Locally

```bash
# Start all services
./start_local_dev.sh

# Or manually
docker-compose up -d
```

### Development Workflow

1. **Database**: Source of truth is `apps/web/drizzle/schema.ts`
2. **Migrations**: Generate with `pnpm db:generate` in web app
3. **Python Code**: Uses functional programming with category theory patterns
4. **Testing**: 
   - ControlNet: `pytest` in `apps/controlnet/`
   - Web: `pnpm test` in `apps/web/`

## Documentation

- [Architecture](./docs/ARCHITECTURE.md) - System architecture
- [CGA Guide](./docs/CGA_GUIDE.md) - Composable Guard Algebra
- [Development Guide](./docs/DEVELOPMENT.md) - Setup and workflow
- [API Reference](./docs/API.md) - ControlNet API docs
- [Deployment Guide](./docs/DEPLOYMENT.md) - GCP deployment

## Features

### Guardrails

- **PII Detection**: Email, phone, SSN detection & redaction
- **Toxicity**: Content toxicity detection
- **Safety**: ONNX models (detoxify, jailbreak, NER)
- **Schema**: JSON schema validation
- **Tools**: Function call validation

### Policy Management

- YAML-based policy DSL
- Multi-phase execution (input/output)
- Tiered guards (T0/T1/T2)
- Policy versioning
- Tenant isolation

### Observability

- Request logging
- Guard execution tracking
- Violation analytics
- Performance metrics

## License

MIT

