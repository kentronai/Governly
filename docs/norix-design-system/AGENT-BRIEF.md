# UI working agreement — port the NORIX design system

> **Drop this file into the target repo** (e.g. as `CLAUDE.md`, `AGENTS.md`, or
> `docs/UI-RULES.md`) together with the `norix-design-system/` folder. It tells any
> agent or developer exactly how to rebuild this app's interface as NORIX.

## Read first
`docs/norix-design-system/NORIX-UI-SPEC.md` — the full specification.
Everything here is a summary of it; the spec wins on any conflict.

## The mandate
This app's UI is being rebuilt to be **visually and structurally identical to NORIX**:
a pure monochrome enterprise console. Every screen must be assembled from the components
in `norix-design-system/source/` using the recipes in `norix-design-system/templates/`.

## Non-negotiables

1. **Copy `source/globals.css` verbatim.** Do not edit a colour. Do not create a
   `tailwind.config.js` — this is Tailwind v4, the theme lives in the CSS.
2. **UI = shadcn/ui (`new-york`, `baseColor: neutral`, `cssVariables: true`)** on Radix +
   Tailwind + `lucide-react`. Import from `@/components/ui/*`.
3. **Never hand-roll a styled `<div>` or `<button>`** where a shadcn component exists.
   Never add a second UI kit.
4. **Merge classes with `cn()`** from `@/lib/utils`. Never string-concatenate classNames.
5. **Colours come from tokens only** — `bg-background`, `bg-card`, `bg-muted`,
   `text-muted-foreground`, `border`. Never `bg-gray-100`, `text-slate-500`,
   `border-zinc-200`, or a raw hex.
6. **Neutrals stay at zero chroma.** Colour is reserved for meaning: destructive red,
   `text-amber-600` warning, `text-red-600` failure. Charts may use `--chart-*`.
7. **Icons are `lucide-react`.** `h-4 w-4` in nav rows and buttons, `h-3.5 w-3.5` in
   sub-nav and metric tiles. No emoji as UI icons.
8. **Toasts** go through `successToast` / `errorToast` / `infoToast` from `@/lib/utils/toast`
   — never `toast()` directly.
9. **Keep the metric set exactly:** header `h-14` · sidebar `w-64` · page frame `p-6` ·
   page stack `space-y-6` · controls `h-9` · table head `h-10` · radius `0.5rem`.
10. **Mount-gate anything hydration-sensitive** (theme, auth, Radix `useId`): render an
    identically-sized skeleton until `useEffect(() => setMounted(true), [])` fires.

## Screen construction

| Building | Start from |
|---|---|
| A list / table screen | `templates/list-page.tsx` |
| A dashboard / metrics screen | `templates/dashboard-page.tsx` |
| App shell + navigation | `templates/root-layout.tsx` |

Section order on a list page is fixed: header → search → table → stat strip → pagination →
modals. Do not reorder it, do not swap the padding.

## Component map — use these, don't invent

| Need | Use |
|---|---|
| Any action | `Button` (`default` = black; `outline`, `ghost`, `secondary`, `destructive`, `link`) |
| Icon-only row action | `Button variant="ghost" size="icon"` + `title` |
| Status pill | `Badge` — healthy `secondary`, inactive `outline`, failure `destructive` |
| Panel | `Card` / `CardHeader` / `CardTitle` / `CardContent` |
| KPI number | `CompactMetricCard` in `grid-cols-[repeat(auto-fill,160px)] gap-2` |
| Data grid | `Table` + colSpan empty-state row |
| Paging | `Pagination` (page-size select + numbered nav) |
| Search | `SearchInput` (`w-[400px]`) |
| Page title bar | `PageHeader` |
| List summary line | `StatStrip` |
| Confirm a delete | `DeleteConfirmationModal` |
| Any other modal | `Dialog` + `DialogHeader` / `DialogFooter` |
| Segmented views | `Tabs` |
| Loading | `Skeleton` at final dimensions, or `animate-pulse rounded bg-muted` |

## Definition of done
Re-read the request, then verify every one of these before reporting done:
- No raw Tailwind colour literals anywhere in the diff.
- No hand-rolled buttons, inputs, or table markup.
- Light **and** dark mode both checked in a real browser — pure black ↔ pure white flip.
- Page uses `p-6` + `space-y-6`; header is `text-2xl font-bold` + muted description.
- Empty, loading, and error states all present.
- Icon-only buttons have `title`; interactive regions have `aria-*` where the source has it.
