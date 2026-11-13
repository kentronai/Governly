# Contributing to Governly

Thanks for helping. Bug reports, fixes, docs and new integrations are all welcome.

## Before you start

- **Bugs:** open an issue with steps to reproduce on `main`.
- **Features:** open an issue first so we can agree on the shape before you build it.
- **Security issues:** never in a public issue. See [SECURITY.md](SECURITY.md).

## Development setup

You need Docker (Compose 2.24+), Node 20 with pnpm 9, and Python 3.11.

```bash
git clone https://github.com/kentronai/Norix.git && cd Norix
cp .env.example .env              # then fill in your Clerk dev keys
pnpm install
./start_local_dev.sh              # Postgres, Redis, gateway, ONNX and web with hot reload
```

Open http://localhost. Faster web iteration on macOS: keep the Docker services running and start the
dashboard natively with `./dev-local.sh` (Turbopack on :3001).

## Checks

Run these before opening a pull request. CI runs the same ones.

```bash
cd apps/web
pnpm typecheck
pnpm test
pnpm lint

cd ../controlnet
pytest
```

## How the code is organised

Read [AGENTS.md](AGENTS.md): it is the working agreement for humans and coding agents alike. The short
version:

- **UI** is shadcn/ui (`apps/web/src/components/ui`) on Radix + Tailwind + `lucide-react`. Reuse it;
  don't add another UI kit.
- **Page titles** go through `@/components/common/PageHeader`. A test fails on any raw `<h1>`.
- **Backend** is server actions in `apps/web/src/lib/actions/*` and Drizzle (`apps/web/drizzle/schema.ts`).
- **Schema changes** need a hand-written numbered migration in `apps/web/drizzle/` plus a
  `meta/_journal.json` entry. Don't run `drizzle-kit generate`.
- **Integrations** authenticate through the self-hosted Nango client
  (`apps/web/src/lib/server/nango/client.ts`).

## Pull requests

- One change per PR, with a description of what and why, and how you tested it.
- Add or update tests for behaviour you change.
- Update docs (`README.md`, `docs/`) when you change setup, configuration or user-facing behaviour.
- Add a line under `Unreleased` in [CHANGELOG.md](CHANGELOG.md).
- Never commit secrets, `.env` files or keys.

By contributing you agree your work is licensed under the [MIT License](LICENSE) and that you follow
our [Code of Conduct](CODE_OF_CONDUCT.md).
