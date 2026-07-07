# AGENTS.md

Guidance for AI agents working on AccountBox. The README covers what the
product is; this file covers how to work on it without re-learning the
decisions already made.

> MANDATORY FIRST READS (every session, before any code change or plan):
>
> 1. `PROJECT.md` (plan, shape, state, invariants, stop conditions, proof gates)
> 2. `AGENTS.md` (this file)
> 3. `README.md` (current user-facing claims)
>    Quote the "Done" definition and at least 3 stop conditions before claiming progress.

## Commands

- `bun run dev` — dev server (port 3000). Restart it after `bun add/remove`
  (Vite's dep cache goes stale and dynamic imports 404).
- `bun run typecheck` — strict TS, `noUnusedLocals` enforced. Run after every
  change; unused imports fail the build.
- `bun run build` — verifies the Tailwind `@theme` + bundle.
- `bun test` — unit tests via Bun's native runner. Pure logic only (no React /
  DOM); resolves the `@/` alias from tsconfig paths.
- `bun run encrypt-tokens` — one-time, idempotent backfill that encrypts any
  plaintext OAuth tokens left in the `account` table.
- `bun run set-owner <email>` — grant a user the `OWNER` role (defaults to the
  primary email). The only sanctioned way to mint an owner.
- `bunx --bun shadcn@latest add <component>` — add ui primitives.
- `bun run prove:real-gmail` — static/server-side checks for the real Gmail
 agent path; the browser WebGPU proof still needs the live browser gate.
- `bun run smoke:train-dev` / `bun run harness:train-dialkit-*` /
 `bun run capture:train-screenshots` — train/DialKit deploy checks.
- DialKit is vendored at `vendor/dialkit` (fork with `dist/` committed,
 installed as a `file:` dep — never a `github:` dep, the self-contained guard
 bans those). It mounts on every server that can take it: local dev and
 train-dev builds (`VITE_DIALKIT=on`). Customer deploys forbid its markers
 (`scripts/deploy.sh`), and E2E gate servers set `VITE_DIALKIT=off` so the
 panel can't overlap gate selectors.
- `bun run e2e:agents` / `bun run e2e:grpo` — real WebGPU Chrome proofs for the
 Agents Lab: SFT train/eval loop, and the in-browser GRPO loop. Each boots its
 OWN vite server (`scripts/run-e2e-isolated.mjs`, port 3100, HMR off,
 `BETTER_AUTH_URL` matched) — never point a gate at the shared :3000 dev
 server; HMR reloads and stale processes both kill multi-GB weight streams.
 Set `E2E_URL` to target a deployed instance instead.
- `bun run check:self-contained` — fails on any reference outside the repo
 folder (absolute `/Users/...` paths, sibling checkouts, escaping symlinks).
 Run it after any wiring/deps change.
- `bun run check:engine-boundary` — `src/engine` is a cordoned module (see
 `src/engine/README.md`): engine code never imports app code, and app code
 touches the engine only via `src/lib/runtime/weight-fetch.ts` and
 `src/lib/agents/train-runtime.ts`. Run it whenever imports near the engine
 change; do not add new direct `@/engine/...` imports outside those seams.
- `bun run check:cartridge-boundary` — cartridges are swappable: the generic
 layer (runtime, agents, workbench UI) reaches skills only through the
 `SKILLS`/`SOURCES` registries, never by importing `@/lib/skills/<id>/*`.
 This is what keeps "add a 3rd/4th/5th cartridge" a matter of adding
 `src/lib/skills/<id>/` + a registry line + an executor, with zero edits to
 generic code. Adding a cartridge-specific import to a shared file fails it.
- `bun run fetch:models` / `bun run hf:upload` — re-materialize / publish the
 heavy binaries (model weights, adapters, bbtriage sft data) against the
 private HF repo `macmacmacmac/accountbox`. Needs `HF_TOKEN` in `.env`.
- `bun run kernels:generate` / `bun run kernels:check` — regenerate / verify
 the vendored WGSL kernel JS from `src/engine/qwgpu/templates`.
- `bun run e2e:agents` — full Agents Lab WebGPU gate (real Chrome, both
  models streamed, bbtriage inference, 20 real AdamW LoRA steps, held-out
  eval delta, OPFS export/re-equip). ~30 min; needs this machine's GPU.
- `bun run make:bbtriage-web-dataset` — regenerate the in-browser bbtriage
  train/valid subset under `public/datasets/bbtriage/` (token-length checked
  with the real VibeThinker tokenizer).

## Hard rules

- **Never store mail or agent-private data in the database.** Better Auth owns
  `User`, `Session`, `Account`, and `Verification` rows, with a `role` field on
  `User` (`USER|OWNER`, `input:false`). OAuth tokens on `Account` are
  encrypted at rest (`account.encryptOAuthTokens`, key =
  `BETTER_AUTH_SECRET`). The current schema also has user-authored composer
  `Snippet` and `Signature` rows; treat these as narrow existing exceptions,
  not precedent for storing mail or agent state. Gmail data is still fetched
  live and never persisted — subjects, senders, snippets, bodies, grounded
  prompts, and model outputs exist only in HTTP responses and React state.
  Agent traces live in browser OPFS and refuse `__cold` plans. Adding any
  persistence of message data is a deliberate product decision the user must
  make, not a refactor.
- **Commits: no attribution.** Never append "Generated with Claude Code" or
  `Co-Authored-By` trailers. Conventional-ish subjects, lowercase, body
  bullets. Commit only when asked.
- **Stock-first shadcn.** Use stock primitives restyled through theme tokens;
 hand-rolled chrome gets reverted (this happened to the command palette).
 Custom components only where no primitive exists.
- **Self-contained repo — nothing outside this folder.** The WebGPU engine is
 vendored at `src/engine/` (do not re-add a `file:../emberglass` dep or
 `fs.allow` an external checkout). Model weights (`model/`, `model-chat/`) are
 real copies, not symlinks; the bbtriage SFT data lives at
 `data/bbtriage/sft_v1/`. Heavy binaries are gitignored and hosted on the
 private HF repo `macmacmacmac/accountbox` (`fetch:models` pulls, `hf:upload`
 pushes). Any absolute `/Users/...` path, sibling-project import, or escaping
 symlink is a regression — `bun run check:self-contained` enforces this.

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

- **Stitch + tokens:** `.stitch/DESIGN.md` (uploaded to Stitch project `11643438807169311403`). Section **0. BANNED** lists patterns agents must never use — especially vertical accent stripes on rows (LLM tell).
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

- **AccountBox is a console; skills are cartridges.** Gmail is the first real
  skill. GitHub is the second-cartridge pressure test, but do not fake a
  trained GitHub skill before an adapter/proof exists.
- **`src/lib/runtime/app-skill.ts` is the skill seam.** A new skill means a
  manifest, trained adapter, policy/evals, and one executor module. The generic
  runtime (`agent-runtime.ts`) and generic execution route
  (`/api/agent-execute`) should not become Gmail-shaped again.
- **`gmail-agent-runtime.ts` is compatibility, not a separate runtime.** It
 wraps the shared skill runtime. `accountbox-runtime.ts` (target replay) has
 been deleted — do not reintroduce it as proof of inference.
- **GRPO is a kernel-level extension of the vendored engine, not an ax
 feature.** `src/engine/services/grpo_controller.js` samples on-policy
 completions and applies advantage-weighted micro-steps through the existing
 CE backward kernel (float per-token mask = advantage). Rewards are
 task-owned and injected (`src/lib/agents/rewards.ts`); the controller never
 hard-codes bbtriage. Do not move GRPO math into ax or fabricate rewards.
- **The agents layer (`src/lib/agents/`) orchestrates; it does not own an
  engine.** ax (`@ax-llm/ax`) drives the concierge (chat model via
  `chatCompleteRaw`), the Gmail planner handoff, the bbtriage specialist, and
  the in-browser trainer (`train-runtime.ts` over the Emberglass
  TrainingController). The concierge uses prompt-mode function calling
  (`supportsFunctions: false`) — correct for a 3B model; do not switch it to
  native tool-call mode. UI is `/agents` (`src/components/agents/agents-lab.tsx`).
- **Every engine loader must hold the slot for the WHOLE stream.**
  `engine-slot.ts` owns `DisplacedDuringLoadError`: a load whose slot is taken
  mid-stream aborts per-tensor (thrown from the `log` callback) and a build
  that finishes after displacement is discarded, never installed. Two resident
  ~2GB models stall training under the ~4.3GB buffer budget — this happened.
- **Cold paths fail closed.** `__cold` plans are not executable and are not
  trace/training data. Invalid real model output may carry `__ran` and `raw`
  for inspection, but it is still refused.
- **The current OPFS layer is not SQLite.** `src/lib/db/opfs.ts` is the settled
  near-term browser store. Do not start a storage migration solely because an
  older doc said "OPFS SQLite."
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
- Cross-component actions use props lifted to the app shell
  (`src/routes/_app.tsx`); the one exception is the tiles reset, a window event
  (`RESET_TILE_LAYOUT_EVENT` in `layout-tree.ts`).
- Dummy accounts: `src/lib/test-account.ts` (`test-` prefix skips the Gmail
  fetch and renders generated, **folder-aware** mail with per-account variation
  in volume/cadence/order). The UI to add them is gated on the **OWNER** role +
  the `devTools` toggle in Settings → Owner tools — **not** `import.meta.env.DEV`.
  `demoMode` (same page) swaps the whole app onto demo accounts and masks the
  signed-in identity, for recording without exposing real mail; it is gated on
  `demoMode` alone (the toggle is owner-only), never on the session role, so it
  can't flicker back to real mail while `useSession()` re-pends on navigation.

## Keyboard

`⌘K` palette · `G` then `I` inbox/all accounts · `⌥1–9` switch account
(`⌘1–9` is browser-reserved — don't try). Global handlers live in
`_app.tsx`; reader handlers (`Esc`, `R`) live in `inbox-tiles.tsx`. Raw MIME
toggles via the reader toolbar **Raw** button or **`⌥R`** (handled in
`inbox-tiles.tsx`). New global actions belong in both the palette and
Settings → Keyboard.

## Cursor Cloud specific instructions

Runtime is Bun (`bun@1.3.9`); standard commands live in the **Commands** section
above and the `README.md` table. Notes below are the non-obvious cloud caveats.

- **`bun install` used to fail by itself** when `dialkit` was a `github:` dep
 whose `prepare` script needed `tsup` (exit 127, skipping the `postinstall`
 `prisma generate`). DialKit is now vendored at `vendor/dialkit` with `dist/`
 committed (`file:` dep), so a plain `bun install` works. If a cloud image
 still uses the old recipe: `bun install --ignore-scripts`, then
 `bash scripts/ensure-dialkit.sh` (idempotent; skips if `dist/` exists), then
 runs `bunx prisma generate` for both schemas. If dynamic imports 404 or the
 Prisma client is missing after a dep change, re-run those three steps.
- **Local dev uses SQLite, not Postgres.** `.env.example` shows a Postgres
 `DATABASE_URL`, but the Prisma datasource + Better Auth are `sqlite`. Use
 `DATABASE_URL=file:./dev.db`, a generated `BETTER_AUTH_SECRET`, and
 `BETTER_AUTH_URL=http://localhost:3000`. Run `bun run db:push` once to
 create `dev.db` (gitignored). `.env` and `dev.db` are gitignored and are not
 recreated by the update script — recreate them if a VM starts without them.
- **Sign-in is Google-OAuth-only; the vault is the real app gate.** With
 `IS_SELF_HOSTED=true` and no session, `/_app` force-redirects to `/sign-in`,
 which only offers "Continue with Google" — so without `GOOGLE_CLIENT_ID` /
 `GOOGLE_CLIENT_SECRET` you can't reach the app. For a no-Google dev instance,
 set `IS_SELF_HOSTED=false` (or leave it unset): the loader no longer
 redirects and the **vault gate** (`src/components/vault/vault-gate.tsx`)
 becomes the entry. Setting a master password creates a real Better Auth
 email+password session (rows land in `user`/`session`/`account` in
 `dev.db`) and unlocks the workspace. With Google credentials configured,
 keep `IS_SELF_HOSTED=true` and sign in with Google first.
- **The WebGPU/local-agent path cannot run in the headless cloud VM.** No GPU
 means the app honestly reports "WebGPU unavailable — runtime blocked on this
 device"; the vault, Better Auth session, and mail workspace still load. The
 model weights (`/model`, `/model-chat`, adapters) are gitignored HF assets
 pulled by `bun run fetch:models` (needs `HF_TOKEN`); the browser proof gates
 (`bun run e2e:agents` / `e2e:grpo`) and the real Gmail agent path
 additionally need a real WebGPU Chrome and Google OAuth, so they are not
 runnable here.
