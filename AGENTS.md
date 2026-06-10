# AGENTS.md

Guidance for AI agents working on Better Mail. The README covers what the
product is; this file covers how to work on it without re-learning the
decisions already made.

## Commands

- `bun run dev` — dev server (port 3000). Restart it after `bun add/remove`
  (Vite's dep cache goes stale and dynamic imports 404).
- `bun run typecheck` — strict TS, `noUnusedLocals` enforced. Run after every
  change; unused imports fail the build.
- `bun run build` — verifies the Tailwind `@theme` + bundle.
- `bunx --bun shadcn@latest add <component>` — add ui primitives.

## Hard rules

- **Never store mail or private info in the database.** The schema is the four
  Better Auth tables (`User`, `Session`, `Account`, `Verification`) and only
  Better Auth writes to it. Gmail data is fetched live and passed through —
  subjects, senders, snippets exist only in HTTP responses and React state.
  Adding any persistence of message data is a deliberate product decision the
  user must make, not a refactor.
- **Commits: no attribution.** Never append "Generated with Claude Code" or
  `Co-Authored-By` trailers. Conventional-ish subjects, lowercase, body
  bullets. Commit only when asked.
- **Stock-first shadcn.** Use stock primitives restyled through theme tokens;
  hand-rolled chrome gets reverted (this happened to the command palette).
  Custom components only where no primitive exists.

## Stack gotchas (these have all bitten before)

- shadcn here is the **base-nova style on `@base-ui/react` — NOT Radix**:
  - triggers use the `render` prop, not `asChild`
  - open state is `data-popup-open`, not `data-[state=open]`
  - `DropdownMenuLabel` must sit inside a `DropdownMenuGroup` or it throws
    "MenuGroupContext is missing" at runtime
  - popup animations use Base UI's transition idiom
    (`data-starting-style:` / `data-ending-style:` + `transition-[opacity,scale]`),
    **never** tw-animate keyframes gated on `data-open` — those blink on open.
- `react-resizable-panels` is **v4**: `Group orientation=…` +
  `onLayoutChanged` (returns an id→flexGrow map), `Panel defaultSize="40%"`
  string sizes. Online docs/examples are mostly the old v3 API.
- Tailwind v4: tokens live in `@theme` blocks in `src/styles.css`; there is no
  tailwind.config. `tailwind-merge` only dedupes identical variant prefixes —
  to override e.g. a sidebar badge position, repeat the exact variant
  (`peer-data-[size=default]/menu-button:top-1`).

## Design system (source of truth: the design handoff bundle)

- Dark-first Linear-derived palette, exposed as utilities: `bg-canvas`,
  `bg-surface-1..4`, `bg-term`, `border-hairline(-strong/-tertiary)`,
  `text-ink(-muted/-subtle/-tertiary)`, `text-label-*`, `accent-2` (teal).
  Dark mode maps the shadcn semantic vars onto this palette in `styles.css`;
  prefer semantic tokens (`bg-card`, `text-muted-foreground`) in components so
  light mode keeps working.
- **Orange `#f46a3c` is THE chrome accent in both themes** (user-overridable
  via the accent setting, applied as inline CSS vars on `<html>`).
  **Teal (`accent-2`) is dev-only**: terminal/code/⌘K affordances, DEV chips.
- **Fonts — Roboto for anything a human wrote or a label we wrote; JetBrains
  Mono for anything a machine produced.** If you'd copy-paste it into a
  terminal, it's mono. Addresses are always mono, no exceptions. Counts,
  times, IDs, kbd hints: mono. Sidebar brand wordmark and group labels: mono.
  KPI display values: Roboto 600 (their deltas: mono). Full per-element tables
  live in the project memory / design bundle.
- Counts are compact-formatted via `formatCount` (20649 → `20.6k`).
- Unfinished features render as visible **Soon** affordances (dimmed control +
  mono `SOON` chip), never as silently dead buttons.

## Architecture decisions (don't relitigate)

- **Inbox tiles are a custom split-tree implementation** —
  `src/lib/layout-tree.ts` (pure tree ops) + `inbox-tiles.tsx` (pointer drag,
  drop zones, ghost chip) rendered on shadcn Resizable. react-grid-layout and
  dockview were both tried and rejected (gaps/floating panes; IDE tab
  semantics). Do not reintroduce a docking library.
- **`account-dot.tsx` is the single account→color source.** Colors are
  per-account (Settings → Accounts), positional fallback. Never assign account
  colors anywhere else.
- Settings are a `useSyncExternalStore` store in `src/hooks/use-settings.ts`
  (localStorage `bm.settings`), no provider. Layout persists to
  `bm.tiles-layout`, scope to `bm.account-scope` — all client-side only.
- Cross-component actions use props lifted to `Home` (`src/routes/index.tsx`);
  the one exception is the tiles reset, a window event
  (`RESET_TILE_LAYOUT_EVENT` in `layout-tree.ts`).
- Dev-only dummy accounts: `src/lib/test-account.ts` (`test-` prefix skips the
  Gmail fetch and renders generated mail; UI gated by `import.meta.env.DEV`).

## Keyboard

`⌘K` palette · `G` then `I` inbox/all accounts · `⌥1–9` switch account
(`⌘1–9` is browser-reserved — don't try). Handlers live in `Home` with a
typing guard. New global actions belong in both the palette and
Settings → Keyboard.
