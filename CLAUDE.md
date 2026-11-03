# NORIX — working agreement for agents (Claude, Codex, etc.)

**Before doing ANY work in this repo, consult the `norix-components` skill first**
(`.claude/skills/norix-components/SKILL.md`). It is mandatory reading whenever you touch UI,
routes/APIs, server actions, the Drizzle schema/migrations, or add a dependency.

## Non-negotiables
1. **Reuse, don't reinvent.** Use NORIX's existing components and patterns. Search
   `apps/web/src/components/ui/` and nearby feature folders before creating anything new.
2. **UI = shadcn/ui** (New York style, `apps/web/components.json`) on Radix + Tailwind +
   `lucide-react`. Import components from `@/components/ui/*`; merge classes with `cn()` from
   `@/lib/utils`; toasts from `@/lib/utils/toast`. Do not introduce another UI kit or
   hand-rolled styled elements when a shadcn component exists.
3. **Backend = server actions** (`apps/web/src/lib/actions/*`, `"use server"`, Clerk `auth()`,
   `resolveTenant` by slug-or-id) + **Drizzle** schema (`apps/web/drizzle/schema.ts`, client
   `@db`). Secrets via `@/lib/server/crypto`. New tables/columns need a hand-authored numbered
   migration in `apps/web/drizzle/` + a `_journal.json` entry.
4. **Page headers are standardized.** Every page title is `text-2xl font-bold`, rendered only
   through `@/components/common/PageHeader`:
   - **New pages:** use `<PageHeader title=… description=… actions=… />` (title, muted
     description, right-aligned primary button).
   - **Custom header layouts** (icons, badges, back buttons): use `<PageTitle>` for just the
     `<h1>`. Its `className` is for spacing/layout only (`mb-2`, `my-2`) — never font size,
     weight, tracking or colour (`text-3xl`, `font-semibold`, `text-gray-900`, …).
   - Never hand-write an `<h1>`. Card/section/dialog headings are `<h2>`/`<h3>`.
   - Need something these can't express? Extend `PageHeader.tsx` rather than bypassing it.
   - Enforced by `src/components/common/PageHeader.test.tsx`, which fails on any raw `<h1>`
     or a styled `PageTitle`.
5. **External integrations** authenticate through **self-hosted Nango** (Auth + Proxy) via
   `apps/web/src/lib/server/nango/client.ts`. Postgres only — NORIX and Nango both use the
   existing `postgres` service (Nango has its own `nango` database). No MongoDB.

## Definition of done
When you finish a task, run a **self-check**: re-read what was requested, confirm every item is
actually done and uses proper NORIX components/patterns, and if anything is missing or off-pattern,
go back and finish it before reporting done.
