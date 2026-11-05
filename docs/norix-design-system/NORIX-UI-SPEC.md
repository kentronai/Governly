# NORIX UI Specification

The complete, reusable definition of the NORIX design system — extracted from the live
`apps/web` codebase, not invented. Hand this file (and the `source/` + `templates/`
folders next to it) to any agent or developer to rebuild another product's UI so it is
visually and structurally identical to NORIX.

Everything below is verified against real files. Where a value looks arbitrary
(`h-14`, `w-64`, `w-[160px]`) it is arbitrary *in NORIX too* — copy it exactly, that is
what makes the result look like the same product.

---

## 0. The stack (non-negotiable)

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js 15.5 (App Router)** + React 19.1 | Server Components by default; `"use client"` only for interactivity |
| Styling | **Tailwind CSS v4** | CSS-first config. **There is no `tailwind.config.js`** — the theme lives in `globals.css` via `@theme inline` |
| PostCSS | `@tailwindcss/postcss` | v4 plugin |
| Components | **shadcn/ui — `new-york` style** | `baseColor: neutral`, `cssVariables: true` |
| Primitives | **Radix UI** | dialog, select, tabs, dropdown-menu, popover, tooltip, switch, checkbox, radio-group, accordion, scroll-area, separator, slot, label, avatar, progress |
| Variants | **CVA** (`class-variance-authority`) | Every variant-bearing component uses `cva()` |
| Class merge | **`clsx` + `tailwind-merge`** exposed as `cn()` | Never string-concat classes |
| Icons | **`lucide-react`** — only | No react-icons, no heroicons, no emoji-as-icon |
| Toasts | **`react-hot-toast`** behind a custom renderer | Single toast id — toasts never stack |
| Theme | **`next-themes`**, `attribute="class"` | `.dark` class on `<html>`, `defaultTheme="system"` |
| Tables | Plain shadcn `<Table>` (+ `@tanstack/react-table` where sorting is needed) | |
| Charts | `recharts` via shadcn `chart.tsx` | |
| Animation | `tw-animate-css` / `tailwindcss-animate` | Radix `data-[state]` animations |

`components.json` (copy verbatim, adjust nothing but paths):

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": { "config": "", "css": "src/app/globals.css", "baseColor": "neutral", "cssVariables": true, "prefix": "" },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

Install:

```bash
npm i react react-dom next \
  class-variance-authority clsx tailwind-merge lucide-react \
  next-themes react-hot-toast \
  @radix-ui/react-slot @radix-ui/react-dialog @radix-ui/react-select \
  @radix-ui/react-tabs @radix-ui/react-dropdown-menu @radix-ui/react-popover \
  @radix-ui/react-tooltip @radix-ui/react-checkbox @radix-ui/react-switch \
  @radix-ui/react-label @radix-ui/react-separator @radix-ui/react-avatar \
  @radix-ui/react-scroll-area @radix-ui/react-accordion @radix-ui/react-radio-group \
  @radix-ui/react-progress @radix-ui/react-alert-dialog
npm i -D tailwindcss @tailwindcss/postcss postcss tw-animate-css
```

---

## 1. Design language in one paragraph

NORIX is a **pure monochrome enterprise console**. Every neutral is chroma-zero OKLCH —
literally `oklch(L 0 0)` — so there is no blue-grey or warm-grey cast anywhere. Light mode
is near-white `#FCFCFC`-ish on **pure black** text; dark mode inverts to **pure black**
background with **pure white** text. Colour appears *only* to carry meaning: red for
destructive/blocked, amber for warning/degraded, blue only inside charts. Surfaces are
separated by hairline borders and very tight shadows, never by tinted fills. Corners are
`0.5rem`. Density is high: 36px controls, 40px table headers, 56px app bar. The result
reads as calm, flat, and instrument-like — the "polish" is the *restraint*, not decoration.

**The five rules that produce the look:**
1. Neutrals have **zero chroma**. Never `slate-*`, `zinc-*`, `gray-*` literals — use tokens.
2. Colour = semantics only (`destructive`, and hand-picked red/amber/orange tints on icons).
3. Separation by **`border` + `shadow-xs/sm`**, never by a coloured panel.
4. One radius family from `--radius: 0.5rem`.
5. Every colour goes through a CSS variable so light/dark flips for free.

---

## 2. Design tokens — `globals.css`

Copy `source/globals.css` **verbatim**. It is the single source of truth: `:root` (light),
`.dark` (dark), and the `@theme inline` block that maps variables to Tailwind utilities.

### 2.1 Colour tokens

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--background` | `oklch(0.99 0 0)` | `oklch(0 0 0)` | page canvas |
| `--foreground` | `oklch(0 0 0)` | `oklch(1 0 0)` | body text |
| `--card` | `oklch(1 0 0)` | `oklch(0.14 0 0)` | cards, panels |
| `--card-foreground` | `oklch(0 0 0)` | `oklch(1 0 0)` | |
| `--popover` | `oklch(0.99 0 0)` | `oklch(0.18 0 0)` | dropdowns, popovers |
| `--primary` | `oklch(0 0 0)` | `oklch(1 0 0)` | **primary button fill** (black in light, white in dark) |
| `--primary-foreground` | `oklch(1 0 0)` | `oklch(0 0 0)` | primary button label |
| `--secondary` | `oklch(0.94 0 0)` | `oklch(0.25 0 0)` | secondary button, neutral badge |
| `--muted` | `oklch(0.97 0 0)` | `oklch(0.23 0 0)` | **active nav row**, code chips, tab bar |
| `--muted-foreground` | `oklch(0.44 0 0)` | `oklch(0.72 0 0)` | labels, captions, inactive nav |
| `--accent` | `oklch(0.94 0 0)` | `oklch(0.32 0 0)` | hover fill |
| `--destructive` | `oklch(0.63 0.19 23.03)` | `oklch(0.69 0.2 23.91)` | delete / block |
| `--border` | `oklch(0.92 0 0)` | `oklch(0.26 0 0)` | every hairline |
| `--input` | `oklch(0.94 0 0)` | `oklch(0.32 0 0)` | field borders |
| `--ring` | `oklch(0 0 0)` | `oklch(0.72 0 0)` | focus ring |
| `--sidebar` | `oklch(0.99 0 0)` | `oklch(0.18 0 0)` | sidebar surface |
| `--sidebar-border` | `oklch(0.94 0 0)` | `oklch(0.32 0 0)` | |

Charts (the only saturated palette): `--chart-1` amber `oklch(0.81 0.17 75.35)`,
`--chart-2` blue `oklch(0.55 0.22 264.53)`, `--chart-3/4/5` greys.

> **Note:** the primary button is **black on white / white on black**. That single
> inversion is the most recognisable thing about NORIX — get it right first.

### 2.2 Radius, type, spacing

```
--radius: 0.5rem            → radius-sm 4px · radius-md 6px · radius-lg 8px · radius-xl 12px
--font-sans:  Geist, sans-serif
--font-mono:  Geist Mono, monospace
--font-serif: Georgia, serif
--spacing: 0.25rem
--tracking-normal: 0em      (applied to body)
```

⚠️ **Known gap in NORIX — fix it in the new app.** `globals.css` names `Geist` but the repo
never loads the webfont (no `next/font` import anywhere), so it silently falls back to the
system sans. In the receiving app, load it properly and the UI immediately looks better:

```tsx
// app/layout.tsx
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
// <html className={`${GeistSans.variable} ${GeistMono.variable}`}>
// then in globals.css:  --font-sans: var(--font-geist-sans), sans-serif;
```

### 2.3 Shadows

Pure black at 18% — tight, no spread, no colour:

```
--shadow-xs : 0 1px 2px 0 hsl(0 0% 0% / .09)
--shadow-sm : 0 1px 2px 0 hsl(0 0% 0% / .18), 0 1px 2px -1px hsl(0 0% 0% / .18)
--shadow-md : 0 1px 2px 0 hsl(0 0% 0% / .18), 0 2px 4px -1px hsl(0 0% 0% / .18)
--shadow-lg : 0 1px 2px 0 hsl(0 0% 0% / .18), 0 4px 6px -1px hsl(0 0% 0% / .18)
```

Usage in practice: cards `shadow-sm`, inputs/outline buttons `shadow-xs`, dialogs
`shadow-lg`. Nothing uses `shadow-xl`+ in normal flow.

### 2.4 Base layer + utility

```css
@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground; letter-spacing: var(--tracking-normal); }
}
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
```

`* { @apply border-border }` is why `border` alone (no colour) is correct everywhere.

---

## 3. Application shell

The exact three-part skeleton. Copy the classnames character for character.

```
┌──────────────────────────────────────────────────────────┐
│  AppHeader   sticky top-0 h-14 border-b z-20             │  ← 56px
├───────────────┬──────────────────────────────────────────┤
│  Sidebar      │  Content                                 │
│  w-64         │  flex-1 overflow-y-auto                  │
│  border-r     │    └─ page: p-6 + space-y-6              │
│  shadow-sm    │                                          │
│               │                                          │
│  ── mt-auto ──│                                          │
│  Docs / help  │                                          │
└───────────────┴──────────────────────────────────────────┘
```

```tsx
<div className="h-screen flex flex-col overflow-hidden relative">
  <AppHeader />
  <div className="w-full flex-1 flex overflow-hidden">
    <Sidebar />
    <div className="flex-1 overflow-y-auto">{children}</div>
  </div>
</div>
```

**Only the content column scrolls.** The outer shell is `h-screen ... overflow-hidden`, so
the header and sidebar are permanently fixed without any `position: fixed` hacks.

### 3.1 Header — `h-14`

`sticky top-0 h-14 border-b z-20 flex items-center justify-between px-4`

* **Left:** circular logo tile `flex items-center justify-center bg-white rounded-full h-9 w-9`
  with a 32×32 mark inside. On a detail page the logo is **replaced** by a back affordance:
  `<ChevronLeft className="h-4 w-5 text-muted-foreground" />` + `<span className="text-lg font-medium text-muted-foreground">{entityName}</span>`.
* **Right:** `flex items-center gap-3` → theme toggle · org/context switcher · optional
  `variant="outline"` action button (`h-9 px-3 text-sm font-medium rounded-md`) · avatar (32px).
* **Theme toggle** is `Button variant="outline" size="icon"` with cross-fading Sun/Moon:
  `h-[1.2rem] w-[1.2rem] scale-0 rotate-0 transition-all dark:scale-100 dark:-rotate-90` on
  the Sun and the inverse on the Moon.

**Hydration rule (NORIX does this everywhere and you must too):** anything that depends on
`next-themes`, auth, or `useId` renders a **skeleton of identical dimensions** until
`useEffect(() => setMounted(true), [])` fires. The header's pre-mount shell is
`h-9 w-9 rounded-full bg-muted animate-pulse` + `h-9 w-9 rounded-md` + `h-10 w-28 rounded-md` + `h-8 w-8 rounded-full`.

### 3.2 Sidebar — `w-64`

Container: `flex w-64 flex-col border-r shadow-sm`
Nav region: `flex-1 space-y-1 p-4` · Footer region: `mt-auto p-4 pb-6`

**Nav item (the single most repeated element in the product):**

```tsx
className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
  isActive ? "bg-muted" : "text-muted-foreground hover:text-inherit"
}`}
```

* icon `h-4 w-4`
* active = **`bg-muted` + inherited (full-contrast) text**. There is no accent bar, no
  coloured pill, no bold weight change.
* inactive = `text-muted-foreground`, hovering only restores full contrast.

**Collapsible group** (used for "Agent Registry"): a `<button>` with the same classes plus
`w-full text-left`, a `flex-1` label, and a trailing chevron
`h-4 w-4 shrink-0 transition-transform duration-200` + `rotate-180` when open. The panel
animates on **grid rows**, not height:

```tsx
<div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
  open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
  <div className="overflow-hidden">
    <div className="ml-5 mt-1 space-y-1 border-l pl-2">{/* sub items */}</div>
  </div>
</div>
```

Sub-items: same NavItem with `className="py-1.5 text-xs"` and `h-3.5 w-3.5` icons.

The group auto-opens when the current route is inside it, and stays open.

**Grouped/admin variant** (`w-[256px] border-r pl-2 p-4 flex flex-col`) adds section headers
`flex items-center justify-between w-full text-muted-foreground hover:text-inherit text-sm font-medium p-2`
and gives the active row a slightly stronger lift:
`bg-muted font-medium shadow-[0_1px_2px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.1)]`.
Use the plain variant unless the app genuinely has an admin area.

**Loading state:** the sidebar renders `w-64 flex-col border-r shadow-sm` with three
`Skeleton` bars (`h-4` at `w-3/4`, `w-1/2`, `w-2/3`, each `mb-2`) — same width, zero layout shift.

---

## 4. Component contracts

### 4.1 Button — `source/components/ui/button.tsx`

Base: `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all` + `disabled:pointer-events-none disabled:opacity-50` + auto-sizing icons `[&_svg:not([class*='size-'])]:size-4` + focus `focus-visible:ring-ring/50 focus-visible:ring-[3px]`.

| variant | classes |
|---|---|
| `default` | `bg-primary text-primary-foreground hover:bg-primary/90` — **black button, white text** |
| `destructive` | `bg-[#DC2626] text-white hover:bg-red-500/90 dark:bg-red-600 dark:hover:bg-red-700` |
| `outline` | `border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50` |
| `secondary` | `bg-secondary text-secondary-foreground hover:bg-secondary/80` |
| `ghost` | `hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50` |
| `link` | `text-primary underline-offset-4 hover:underline` |

| size | classes |
|---|---|
| `default` | `h-9 px-4 py-2 has-[>svg]:px-3` |
| `sm` | `h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5` |
| `lg` | `h-10 rounded-md px-6 has-[>svg]:px-4` |
| `icon` / `icon-sm` / `icon-lg` | `size-9` / `size-8` / `size-10` |

> `icon-sm` and `icon-lg` are **NORIX additions** to stock shadcn. Keep them.
> `destructive` deliberately hard-codes `#DC2626` rather than using the token — this is a
> known inconsistency; preserve it for pixel parity, or fix it to `bg-destructive` in both
> apps together. Do not fix it in only one.

Usage: leading icon is `<Icon className="h-4 w-4 mr-2" />` inside a text button; `asChild`
wraps `next/link`.

### 4.2 Badge — status pill

`rounded-full border px-2 py-0.5 text-xs font-medium w-fit` · `[&>svg]:size-3 gap-1`.
Variants: `default` (black fill), `secondary` (grey fill), `destructive`, `outline`.

**NORIX status convention:** healthy/active → `variant="secondary"`; inactive, revoked,
expired, archived → `variant="outline"`; hard failure → `variant="destructive"`.

### 4.3 Card

`bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm`
(note: `rounded-xl` here, not `lg`; vertical padding on the Card, horizontal `px-6` on
`CardHeader` / `CardContent` / `CardFooter`). `CardTitle` = `leading-none font-semibold`,
`CardDescription` = `text-muted-foreground text-sm`. `CardAction` parks a control in the
top-right of the header via `col-start-2 row-span-2 row-start-1 self-start justify-self-end`.

For dense tiles NORIX overrides to `gap-0 py-0` and puts padding on the content — see 4.7.

### 4.4 Input

`h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base md:text-sm shadow-xs`
+ `placeholder:text-muted-foreground` + `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]`
+ `aria-invalid:border-destructive`. Ships with `autoComplete="off" autoCorrect="off"` baked in.

### 4.5 Table

Wrapper `relative w-full overflow-x-auto`; table `w-full caption-bottom text-sm`.

* `TableHead` — `text-muted-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap`
* `TableRow` — `hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors`
* `TableCell` — `p-2 align-middle whitespace-nowrap`
* first column is usually `className="font-medium"`
* secondary columns: `className="text-sm text-muted-foreground"`
* inline code / ids: `<code className="text-sm bg-muted px-2 py-1 rounded">`
* **empty state is a row, not a separate block:**
  `<TableCell colSpan={N} className="text-center py-12 text-muted-foreground">` with a
  message that differs when a search filter is active vs. genuinely empty.
* **row actions:** `<div className="flex gap-2">` of `Button variant="ghost" size="icon"`,
  each with a `title` attribute, icon `h-4 w-4`, destructive tinted `text-red-500`,
  warning tinted `text-orange-500`.

### 4.6 Pagination — `source/components/common/Pagination.tsx`

The composed control that appears under every list. Layout is `justify-between`:

* **left:** page-size `Select` (`w-[90px] h-9`) with options `[10, 20, 50, 100, 150, 200]`,
  then `<span className="text-sm text-muted-foreground">Items per page</span>`
* **right:** `Previous · 1 … n · Next`, max **5** visible numbers with `…` on both sides,
  active page rendered as `variant="outline"`, others `ghost`
* changing page size resets page to 1
* while `isLoading`, prev/next get `pointer-events-none opacity-50`

**Hydration:** the Radix `Select` is rendered only after mount, with a static
`h-9 w-[90px] rounded-md border border-input` placeholder before that — Radix derives
`aria-controls` from `useId()`, which mismatches between server and client. Keep this.

### 4.7 Metric tile — `CompactMetricCard`

The KPI unit used on every dashboard. Fixed `h-[68px] w-[160px]`, laid out in
`grid grid-cols-[repeat(auto-fill,160px)] gap-2` so tiles wrap into a neat mosaic instead
of stretching.

* label `text-[11px] font-medium leading-4 text-muted-foreground truncate`
* value `mt-1 text-xl font-semibold leading-none tabular-nums` — **`tabular-nums` matters**
* icon chip `absolute right-2.5 top-2.5 h-7 w-7 rounded-md bg-muted/60`, icon `h-3.5 w-3.5`
* `tone` prop tints value + icon: default `text-foreground`, bad `text-red-600`,
  warning `text-amber-600`
* loading → `h-5 w-9 animate-pulse rounded bg-muted`; undefined → renders `—`
* `description` becomes the native `title` tooltip and feeds `aria-label`

### 4.8 Dialog

Overlay `bg-black/50` with fade. Content: `fixed top-1/2 left-1/2 -translate-x-1/2
-translate-y-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] sm:max-w-lg gap-4 rounded-lg
border bg-background p-6 shadow-lg` + zoom-95 enter/exit. Close button sits
`absolute top-4 right-4`. `DialogFooter` = `flex flex-col-reverse gap-2 sm:flex-row sm:justify-end`
(cancel first in DOM, right-most on desktop).

**Destructive confirm** (`DeleteConfirmationModal`) is its own pattern: `sm:max-w-[425px]`,
title prefixed with a red icon medallion
`<span className="flex p-2.5 items-center justify-center rounded-full bg-red-500/10"><AlertTriangle className="h-5 w-5 text-red-500" /></span>`,
body names the item in `<strong>`, footer is `Cancel` (outline) + `Delete` (destructive)
with an "…ing" pending label.

### 4.9 Tabs

`TabsList` — `bg-muted text-muted-foreground inline-flex w-fit items-center justify-center rounded-lg p-2`
`TabsTrigger` — `rounded-md border border-transparent px-2 py-1 text-sm font-medium` and,
when active, `data-[state=active]:bg-background data-[state=active]:shadow-sm`. A raised
white chip inside a grey trough.

### 4.10 Toasts

`react-hot-toast`, `position="top-right"`, `containerStyle={{ top: 50 }}` (clears the 56px
header), `gutter={12}`, default `duration: 4000`.

Custom renderer: `max-w-md w-full bg-[#FFFFFF] shadow-md rounded-md p-4 text-[#18181B]`,
emoji icon in a `w-6 h-6` slot, message `text-sm font-semibold leading-5`, dismiss button
on the right. **A single constant toast id is reused so toasts replace rather than stack.**

Call sites always use the wrappers, never `toast()` directly:
`successToast(res, "Receipt", "created")` · `errorToast(err)` · `infoToast("…")`.
`successToast` maps the action verb to an emoji: created 🎉 · deleted 🗑️ · updated ✏️ ·
archived 📦 · granted ✅ · revoked 🚫 · default ✅.

### 4.11 Search field

There is no dedicated component — NORIX composes it inline, and **that** is the pattern to
copy (a legacy `common/search-box.tsx` exists on NextUI; it is deprecated, do not use it):

```tsx
<div className="relative w-[400px]">
  <Input type="search" placeholder="Search receipts..." className="pl-10"
         value={search} onChange={(e) => setSearch(e.target.value)} />
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
</div>
```

`source/components/common/SearchInput.tsx` packages exactly this.

---

## 5. Page recipes

### 5.1 Page frame

Server component does the data fetch and renders one padded wrapper; the client component
owns interaction:

```tsx
export default async function Page({ params }) {
  const rows = await getRows();
  return <div className="p-6"><RowsList initialRows={rows} /></div>;
}
```

Inside the client component the top-level element is `<div className="space-y-6">`.
So: **`p-6` on the frame, `space-y-6` between sections.** Always.

### 5.2 Page header

```tsx
<div className="flex justify-between items-start">
  <div>
    <h1 className="text-2xl font-bold">Receipts</h1>
    <p className="text-muted-foreground">Manage receipts and exports</p>
  </div>
  <Button onClick={openCreate} disabled={isPending}>
    <Plus className="h-4 w-4 mr-2" />
    Create Receipt
  </Button>
</div>
```

Type scale in use: page title `text-2xl font-bold` · section/card title `text-lg font-semibold`
· body `text-sm` · meta `text-sm text-muted-foreground` · micro-label `text-[11px]`.

### 5.3 Canonical list page

Order of sections, top to bottom — see `templates/list-page.tsx` for the full file:

1. header + primary action
2. search field (`w-[400px]`)
3. `<Table>` with a colSpan empty-state row
4. footer stat strip — `flex gap-4 text-sm text-muted-foreground` with `•` separators
   (`Total: 12 • Active: 9 • Revoked: 3`)
5. `<Pagination />` when server-paged
6. modals, mounted last

### 5.4 Dashboard page

1. header
2. `grid grid-cols-[repeat(auto-fill,160px)] gap-2` of `CompactMetricCard`
3. `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4` of `Card`s for detail panels

See `templates/dashboard-page.tsx`.

### 5.5 Mutation flow

```tsx
const [isPending, startTransition] = useTransition();

startTransition(async () => {
  try {
    const result = await createThing(payload);   // server action
    setRows((prev) => [result, ...prev]);        // optimistic local update
    successToast(result, "Receipt", "created");
    setModalOpen(false);
  } catch (error) {
    errorToast(error);
  }
});
```

`isPending` disables the trigger button **and** the row action buttons. NORIX seeds client
state from an SSR-fetched `initialX` prop and mutates it locally rather than refetching.

### 5.6 Loading & empty

* in-table empty → the colSpan row (4.5)
* whole-page loading → `Skeleton` blocks at the **exact final dimensions**
* inline value loading → `animate-pulse rounded bg-muted` at the value's size
* never a centred spinner on a full page

---

## 6. Rules for the receiving app

**Do**
- Copy `globals.css` unchanged before anything else — half the look arrives with it.
- Use `cn()` for every conditional class.
- Use tokens (`bg-muted`, `text-muted-foreground`, `border`) — never `bg-gray-100`.
- Keep the `h-14 / w-64 / p-6 / space-y-6 / h-9` metric set.
- Mirror the mount-gate pattern for anything theme-, id-, or auth-dependent.
- Give every icon-only button a `title`.

**Don't**
- Add a second UI kit. (NORIX still has stray NextUI imports — that is debt, not a pattern.)
- Introduce a brand hue. If Receipt Factory needs one, add it as **one** token
  (`--brand`) used on ≤3 surfaces, and leave every neutral at zero chroma.
- Write raw `<button>`/`<div>` where a shadcn component exists.
- String-concatenate classNames.
- Add a `tailwind.config.js` — v4 config belongs in `globals.css`.
- Use emoji as UI icons (they are only used inside toast messages).

---

## 7. Porting order (fastest path to "it looks like NORIX")

| # | Step | Result |
|---|---|---|
| 1 | `globals.css` + `cn()` + `components.json` | correct palette, radius, shadows |
| 2 | `button` `input` `card` `badge` `table` `dialog` `select` `tabs` `skeleton` | correct primitives |
| 3 | Shell: `AppHeader` + `Sidebar` + layout skeleton | the app *reads* as NORIX |
| 4 | `Pagination` `SearchInput` `CompactMetricCard` `DeleteConfirmationModal` `PageHeader` | composed patterns |
| 5 | Toast provider + `successToast`/`errorToast` wrappers | consistent feedback |
| 6 | Rebuild each screen onto `templates/list-page.tsx` / `dashboard-page.tsx` | full parity |
| 7 | Load Geist properly (§2.2) | the typographic polish |

Steps 1–3 alone get you ~80% of the visual identity.
