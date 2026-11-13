# Governly: working agreement for contributors and coding agents

Read this before changing code. Claude Code loads it through `CLAUDE.md`; Codex, Cursor and others read
it directly. To *install* Governly rather than work on it, use [docs/SKILL.md](docs/SKILL.md).

## What Governly is

A multi-tenant AI governance platform: agent discovery, a guardrail gateway, model registry, vendor
dossiers, regulatory radar and compliance controls. One Docker Compose stack.

## Layout

| Path | What to know |
| --- | --- |
| `apps/web` | Next.js 15 dashboard. UI in `src/components`, server actions in `src/lib/actions`, server-only code in `src/lib/server`, Drizzle schema in `drizzle/schema.ts` |
| `apps/controlnet` | FastAPI guardrail gateway (OpenAI-compatible `/v1`), CGA guard composition, YAML policies |
| `apps/onnx-service` | ONNX inference for ML guards |
| `apps/model-guard` | Model scanner and SBOM generator (not in the default stack) |
| `packages/cga-sdk` | Guard-composition SDK |
| `deploy/` | Self-host overlay (`compose.selfhost.yml`, HTTP-only `nginx.conf`) used by `install.sh` |
| `docker-compose.yml`, `nginx.conf` | The production stack. `deploy/nginx.conf` mirrors `nginx.conf`'s routes: change both |
| `docker-compose.dev.yml`, `start_local_dev.sh` | Development with hot reload |
| `docs/` | Guides; index in `docs/README.md` |

## Non-negotiables

1. **Reuse, don't reinvent.** Search `apps/web/src/components/ui/` and nearby feature folders before
   creating anything. The `norix-components` skill (`.claude/skills/norix-components/SKILL.md`) has the
   full checklist: read it before touching UI, routes, server actions, the schema or dependencies.
2. **UI = shadcn/ui** (New York style, `apps/web/components.json`) on Radix + Tailwind +
   `lucide-react`. Import from `@/components/ui/*`, merge classes with `cn()` from `@/lib/utils`,
   toasts from `@/lib/utils/toast`. No other UI kit, no hand-rolled styled elements where a shadcn
   component exists.
3. **Backend = server actions** (`apps/web/src/lib/actions/*`, `"use server"`, Clerk `auth()`,
   `resolveTenant` by slug or id) + **Drizzle** (`apps/web/drizzle/schema.ts`, client `@db`). Secrets
   via `@/lib/server/crypto`. New tables/columns need a hand-written numbered migration in
   `apps/web/drizzle/` plus a `meta/_journal.json` entry; never run `drizzle-kit generate`.
4. **Page headers are standardized.** Every page title goes through `@/components/common/PageHeader`:
   `<PageHeader title description actions />` for new pages, `<PageTitle>` for custom layouts (its
   `className` is spacing only). Never hand-write an `<h1>`. Enforced by
   `src/components/common/PageHeader.test.tsx`.
5. **Integrations** authenticate through self-hosted Nango via
   `apps/web/src/lib/server/nango/client.ts`. Postgres only (Nango uses its own `nango` database on
   the same server). No MongoDB.
6. **No secrets in the repo.** Never commit `.env*` (except `*.example`), keys or `.pem` files.
   Stage files by explicit path, never `git add -A`.

## Checks

```bash
cd apps/web && pnpm typecheck && pnpm test && pnpm lint
cd apps/controlnet && pytest
```

## Definition of done

Re-read the request, confirm every item is done with Governly's own components and patterns, run the
checks above, and update docs and `CHANGELOG.md` when setup, configuration or user-facing behaviour
changed. Verify UI changes in a real browser, not only with tests.
