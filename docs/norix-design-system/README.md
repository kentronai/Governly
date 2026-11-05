# NORIX Design System — portable package

Everything needed to rebuild another product's UI so it looks and behaves exactly like
NORIX. Extracted from the live `apps/web` codebase — no invented values.

## What's here

```
norix-design-system/
├── README.md                     ← you are here
├── NORIX-UI-SPEC.md              ← THE SPEC. Tokens, shell, every component contract,
│                                   page recipes, rules, porting order. Read this.
├── AGENT-BRIEF.md                ← drop into the target repo as its CLAUDE.md/AGENTS.md
├── source/                       ← copy-paste-ready code
│   ├── globals.css               ← all design tokens (light + dark). Copy verbatim, FIRST.
│   ├── components.json           ← shadcn config
│   ├── lib/
│   │   ├── utils.ts              ← cn()  → import from "@/lib/utils"
│   │   └── utils/toast.ts        ← successToast / errorToast / infoToast
│   │                                     → import from "@/lib/utils/toast"
│   ├── components/ui/            ← the shadcn primitives, exactly as NORIX has them
│   │   ├── button.tsx  badge.tsx  card.tsx  input.tsx  textarea.tsx  label.tsx
│   │   ├── table.tsx   dialog.tsx tabs.tsx  select.tsx pagination.tsx skeleton.tsx
│   │   ├── checkbox.tsx switch.tsx dropdown-menu.tsx tooltip.tsx separator.tsx
│   │   └── custom-toast.tsx
│   ├── components/app/           ← the shell (portable: no Clerk, no tenant slugs)
│   │   ├── AppShell.tsx          ← h-screen skeleton, only the content column scrolls
│   │   ├── AppHeader.tsx         ← h-14 sticky bar + theme toggle
│   │   └── Sidebar.tsx           ← w-64 nav, config-driven, collapsible groups
│   └── components/common/        ← the composed patterns
│       ├── PageHeader.tsx  SearchInput.tsx  StatStrip.tsx  Pagination.tsx
│       ├── CompactMetricCard.tsx  DeleteConfirmationModal.tsx
│       └── ThemeProvider.tsx  ThemedToaster.tsx
└── templates/                    ← full page recipes to build screens from
    ├── root-layout.tsx           ← shell wiring + nav config
    ├── list-page.tsx             ← header → search → table → stats → pagination → modals
    └── dashboard-page.tsx        ← header → metric mosaic → detail cards
```

## How to apply it to another app

1. Copy this whole folder into the target repo (`docs/norix-design-system/`).
2. Copy `AGENT-BRIEF.md` to the repo root as `CLAUDE.md` (or `AGENTS.md`).
3. Install the deps listed in §0 of the spec.
4. `source/globals.css` → `src/app/globals.css`, **overwriting**. Delete any
   `tailwind.config.js`; this is Tailwind v4.
5. `source/components.json` → repo root; adjust the `css` path if yours differs.
6. `source/lib/*` → `src/lib/`, `source/components/*` → `src/components/`.
7. Wire the shell from `templates/root-layout.tsx` and fill in your `NAV` array.
8. Rebuild each screen on `templates/list-page.tsx` / `dashboard-page.tsx`.

Steps 4–7 alone get you roughly 80% of the visual identity.

## Three quirks carried over deliberately

- **Geist is declared but never loaded.** `globals.css` sets `--font-sans: Geist` but NORIX
  has no `next/font` import, so it silently falls back to the system sans. Fix this in the
  new app (spec §2.2) — it's the single cheapest upgrade to the look.
- **`Button variant="destructive"` hard-codes `#DC2626`** instead of using `--destructive`.
  Kept for pixel parity. If you fix it, fix it in both apps so they don't diverge.
- **`lib/utils.ts` and `lib/utils/` coexist.** `@/lib/utils` resolves to the file (`cn()`),
  `@/lib/utils/toast` into the directory. That is how NORIX is laid out, so any code copied
  straight from NORIX resolves unchanged. It works, but it is a footgun — if you would rather
  collapse it to `@/lib/toast`, do it once, everywhere, before porting any screens.

## Where each piece came from

| Package file | NORIX source |
|---|---|
| `source/globals.css` | `apps/web/src/app/globals.css` |
| `source/components/ui/*` | `apps/web/src/components/ui/*` |
| `source/components/common/CompactMetricCard.tsx` | `apps/web/src/components/agent-discovery/CompactMetricCard.tsx` |
| `source/components/common/Pagination.tsx` | `apps/web/src/components/common/pagination.tsx` |
| `source/components/common/DeleteConfirmationModal.tsx` | `apps/web/src/components/common/DeleteConfirmationModal.tsx` |
| `source/lib/utils/toast.ts` | `apps/web/src/lib/utils/toast.ts` |
| `source/components/app/AppHeader.tsx` | `apps/web/src/components/app/TenantHeader.tsx` (de-Clerked) |
| `source/components/app/Sidebar.tsx` | `apps/web/src/components/app/sidebar/Sidebar.tsx` (config-driven) |
| `source/components/app/AppShell.tsx` | `apps/web/src/app/[tenant]/layout.tsx` + `LayoutWithConditionalSidebar.tsx` |
| `templates/list-page.tsx` | `apps/web/src/app/[tenant]/api-keys/**` |
| `templates/dashboard-page.tsx` | `apps/web/src/components/observability/stats.tsx` |
