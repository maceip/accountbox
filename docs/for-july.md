# For July — after the DialKit / train deploy push

**Written:** 2026-07-04 (updated with file/method map)  
**Assumption:** The major task is **done** — DialKit on train, deploy fixed, Playwright checks on deploy, dial tuners wired, DialKit fork merged.

**Live train (last known deploy):** `https://train.public.computer` — manifest at `/opt/train/app/deploy-manifest.json` showed commit `91de1ac`, `dialkit: true`, built `2026-07-04T08:20:14Z`. GitHub `main` is ahead at `74320a1` (this doc + screenshot-on-deploy wiring in `58f3734`).

---

## Scope — what this document covers

| Area | Repo / path | Purpose |
|------|-------------|---------|
| AccountBox app | `/home/devuser/projects/accountbox` → `github.com/maceip/accountbox` | Product UI, vault, journey, agent runtimes, deploy scripts |
| DialKit fork | `/home/devuser/projects/dialkit` → `github.com/maceip/dialkit` @ `19ba014` | Dev tuners + agent notes panel (`DevSessionStore`, `FeedbackPanel`) |
| Emberglass | `/home/devuser/projects/emberglass` (sibling dep) | WebGPU inference engine loaded by `getEmberglass()` in `src/lib/runtime/weight-fetch.ts` |
| Train runtime | `/opt/train/app` on `78.141.219.102` | Served by `train-app.service` → `localhost:3210`, fronted by Caddy |
| Caddy | `/etc/caddy/Caddyfile` block `train.public.computer` | TLS, static `/model/*`, `/model-chat/*`, `/adapters/*`, reverse proxy to app |
| Legacy widget | `/home/devuser/projects/dev-feedback-widget/dev-feedback.js` | Old Ambient Link feedback script; **not** used by AccountBox (DialKit replaced it) |

---

## Major task — what we finished

### DialKit on train only

| Piece | File | Key symbols |
|-------|------|-------------|
| Enable gate | `src/components/dialkit/dialkit-dev.tsx` | `STORAGE_KEY = "accountbox:dialkit"`, `dialkitEnabledByDefault()`, `DialKitDevRoot` |
| Build flag | `VITE_DIALKIT=on` in `scripts/deploy-train-dev.sh` | Tree-shaken when unset — see lazy imports in `src/components/dialkit/dialkit-slot.tsx` |
| Root mount | `src/routes/__root.tsx` | `<DialKitSlot />` |
| App mount | `src/routes/_app.tsx` | `<DialKitAppDials />` (only when journey complete) |
| Fork dep | `package.json` | `"dialkit": "github:maceip/dialkit#19ba014"` |
| Fork build | `scripts/ensure-dialkit.sh` | Builds `node_modules/dialkit/dist/` if missing |
| DialKit panel | `../dialkit/src/components/DialRoot.tsx` | `DialRoot`, `devSession={{ projectKey: "accountbox-train" }}` |
| Agent notes UI | `../dialkit/src/components/FeedbackPanel.tsx` | `FeedbackPanel`, buttons "Tag element" / "Save note" / "Copy for agent" |
| Session store | `../dialkit/src/store/DevSessionStore.ts` | `DevSessionStore.addNote()`, `copyAgentReport()`, `storageKey()` → `dialkit:dev-session:v1:{projectKey}` |
| Element inspect | `../dialkit/src/utils/dom-inspect.ts` | `cssPath()`, `inspectElement()` |

**localStorage keys (DialKit):**

- `accountbox:dialkit` — `"1"` after `?dialkit=1` or train build (`dialkit-dev.tsx`)
- `dialkit:dev-session:v1:accountbox-train` — notes + dial change log (`DevSessionStore.ts`, constant `DIALKIT_SESSION_KEY` in `scripts/lib/train-harness.mjs`)

### Dial tuners wired to real layout

| Panel | File | Hook | Writes |
|-------|------|------|--------|
| App shell | `src/components/dialkit/app-shell-dials.tsx` | `useDevDialKit("App shell", …, { id: "accountbox-app-shell" })` | `applyAppShellDialVars()` in `src/components/dialkit/dialkit-vars.ts` |
| Inbox | `src/components/dialkit/inbox-dials.tsx` | `useDevDialKit("Inbox", …, { id: "accountbox-inbox" })` | `applyInboxDialVars()` + `RESET_TILE_LAYOUT_EVENT` from `src/lib/layout-tree.ts` |

**CSS custom properties set by dials:**

| Dial | CSS var / attribute | Consumed in |
|------|---------------------|-------------|
| `sidebarWidth` | `--dialkit-sidebar-width` (rem) | `__root.tsx` SidebarProvider width; sidebar must not pin `w-64` — fixed in `src/components/shell/app-sidebar.tsx` |
| `headerHeight` | `--dialkit-header-height` (rem) | `src/routes/_app.tsx` mobile header |
| `contentGap` | `--dialkit-content-gap` (px) | `src/routes/_app.tsx` main padding |
| `showGridGuides` | `html[data-dialkit-grid="1"]` | `src/styles.css` body grid overlay |
| `tileMinWidth` | `--dialkit-tile-min-px` | `src/components/mail/inbox-tiles.tsx` via `useDialkitCssVar()` |
| `tileGap` | `--dialkit-tile-gap` | `src/styles.css` |
| `readerWidth` | `--dialkit-reader-ratio` | layout tree reset on change |
| `density` | `html[data-dialkit-density]` | `src/hooks/use-mail-density.ts` overrides settings density |

**Live read hook:** `src/hooks/use-dialkit-css-var.ts` — `useDialkitCssVar()`, `subscribeDialkitCss()` (MutationObserver on `document.documentElement`).

### Deploy + verification

| Script | File | What it does |
|--------|------|--------------|
| Train deploy | `scripts/deploy-train-dev.sh` | `VITE_DIALKIT=on` build, artifact guard (`accountbox-train\|Agent notes\|copyAgentReport`), writes `.output/deploy-manifest.json`, sync, restart, smokes |
| Customer deploy | `scripts/deploy.sh` | **Forbids** DialKit markers (`FORBIDDEN_ARTIFACT_RE`), no `VITE_DIALKIT` |
| Shared helpers | `scripts/deploy-lib.sh` | `accountbox_deploy_is_local()`, `accountbox_deploy_sync()`, `accountbox_deploy_restart()` → `sudo systemctl restart train-app`, `accountbox_deploy_smoke()` |
| Production smoke | `scripts/smoke-production.mjs` | Mobile viewport, no React error boundary |
| Train smoke | `scripts/smoke-train-dev.mjs` | `?dialkit=1`, scans all `/assets/*.js` for DialKit markers |
| Note harness | `scripts/playwright-train-dialkit-note.mjs` | `ensureTrainVaultUnlocked`, `tagRandomComponent`, `saveAgentNote`, `readDialkitSession`, reload proof |
| Tuner harness | `scripts/playwright-train-dialkit-tuners.mjs` | Drags "Sidebar Width", asserts `--dialkit-sidebar-width` + `[data-slot="sidebar"]` px width |
| Screenshots | `scripts/capture-train-screenshots.mjs` | `artifacts/deploy-screenshots/01-vault-setup.png`, `02-dialkit-vault.png`, `03-app-shell-dialkit.png` |
| Harness helpers | `scripts/lib/train-harness.mjs` | `skipJourneyGate()` writes `accountbox:journey` grandfathered JSON, `assertNoFatalRender()`, `saveDeployScreenshot()` |

**package.json scripts:** `deploy:train-dev`, `smoke:production`, `smoke:train-dev`, `harness:train-dialkit-note`, `harness:train-dialkit-tuners`, `capture:train-screenshots`.

**React #185 fix:** DialKit fork `FeedbackPanel.tsx` — notes list uses `useSyncExternalStore` with stable `getSnapshot` (commit `19ba014` on dialkit `main`).

---

## What’s good (verified)

1. **Site loads without React crash.** Smokes call `assertNoFatalRender()` — rejects body text matching `/Something went wrong|Show Error|Minified React error/i` (`train-harness.mjs`).

2. **DialKit renders on train.** `DialKitDevRoot` → `DialRoot` with `productionEnabled` + `devSession.projectKey: "accountbox-train"`. Harness waits for `.dialkit-feedback-panel` and "Agent notes".

3. **Notes persist in-browser.** `DevSessionStore.addNote()` → localStorage key `dialkit:dev-session:v1:accountbox-train`. Harness validates via `findOpenNote()` after reload + unlock.

4. **Tuners move layout.** Harness proves sidebar 256px → ~448px when "Sidebar Width" maxed; value persists after reload (DialStore localStorage inside fork).

5. **One-command train deploy from this box.** `accountbox_deploy_is_local()` detects `78.141.219.102` — rsync to `/opt/train/app` without SSH-to-self.

6. **Customer artifact stays clean.** `deploy.sh` greps forbidden strings including `copyAgentReport`, `useDevDialKit`, `FeedbackPanel`.

7. **Vault export/import works.** `src/lib/vault/portability.ts` — `buildVaultExport()`, `importVaultFile()`, `downloadVaultExport()`, `VAULT_FILENAME = "accountbox-workspace.json"`. UI wired in `src/components/vault/vault-gate.tsx` (`SetupForm` / `UnlockForm` import buttons). Gmail tokens follow because `pinVaultIdentity()` restores `bm.vault-identity`.

8. **Journey gate is intentional and testable.** `src/lib/journey/journey.ts` — steps `chat-agent`, `first-skill`, `connect-account`; `grandfatherJourney()` when linked accounts exist (`_app.tsx` effect). Harness skips via `skipJourneyGate()`.

---

## What’s not good (real problems, with code pointers)

### 1. Second browser = silent second vault (worst UX)

**Symptom:** Chrome vs Firefox vs incognito → empty OPFS → `SetupForm` in `vault-gate.tsx` → `vaultEmailForCreate()` mints new `vault-{uuid}@vault.localhost` (`src/lib/vault/constants.ts`). Gmail on server is keyed to **identity #1**; identity #2 sees no connections.

**Documented:** `docs/account-portability-research.md` §2b.

**Partial fix today:** Export/import in `portability.ts` + pitch copy in `vault-gate.tsx` `PitchPanel` ("Everything lives in this browser").

**Still missing:** Detect "session cookie exists but OPFS empty" and prompt import; block silent second-account creation.

**Relevant files:**

- Envelope storage: `src/lib/vault/opfs-store.ts` — `loadVaultEnvelope()`, `saveVaultEnvelope()` → OPFS table `vault_envelope`
- Unlock memory: `src/lib/vault/store.ts` — `unlockVaultMemory()`, `lockVaultMemory()` (per-tab; cleared on `pagehide`)
- Identity pin: `bm.vault-identity` in `constants.ts`

### 2. DialKit notes / dial values don’t follow you

**Where:** `DevSessionStore.storageKey(projectKey)` — browser-local only. Not in `portability.ts` `LOCAL_KEYS` array (that list is `bm.settings`, `bm.tiles-layout`, `accountbox:journey`, etc.).

**Manual escape:** `DevSessionStore.copyAgentReport()` in FeedbackPanel.

### 3. Stale JavaScript after deploy

**Cause:** Hashed assets under `/assets/*` get long cache. Caddy `train.public.computer` sets `Cache-Control: public, max-age=31536000, immutable` on `/model/*` and `/model-chat/*` (`/etc/caddy/Caddyfile` lines 447–456). Nitro-served HTML/JS bundles inherit aggressive caching in production builds.

**Symptom:** Old bundle + new server → React error #185 (fixed in fork but users can still run pre-fix JS until cache clears).

**Fix target:** `Cache-Control: no-store` or short `max-age` on `/` and `/index.html` only; keep immutable on fingerprinted `/assets/*`.

### 4. Two tabs / GPU memory

**Coordinator:** `src/lib/runtime/engine-slot.ts`

- Lock name: `ENGINE_LOCK = "accountbox-agent-engine"`
- `claimEngineSlot(id, onDisplaced)` — cross-tab via `navigator.locks.request(..., { ifAvailable: true })`
- `releaseEngineSlot(id)`, `currentEngineSlotOwner()`, `slotDecision()`

**Used by:**

- `src/lib/runtime/chat-runtime.ts` — `loadChatModel()` → `claimEngineSlot(CHAT_SLOT_ID, …)`
- `src/lib/runtime/agent-runtime.ts` — `createAgentRuntime()` → same slot for skill models
- `src/lib/runtime/skill-runtimes.ts` — one runtime instance per skill

**Gap:** Cross-tab lock works when second tab tries to load; two tabs both unlocked can still each hold memory until load starts. Research doc §Multi-tab (`account-portability-research.md` line 76–80).

**GPU probe:** `src/lib/runtime/agent-preload.ts` — `probeAgentSupport()`, `evaluateGpuSupport()`, `MIN_GPU_BUFFER_BYTES = 1GB`.

### 5. Deploy screenshots show "WebGPU unavailable" — that’s the test runner

**Not a product verdict.** Playwright uses `chromium.launch({ headless: true })` — no GPU adapter.

**Where the message comes from in product UI:**

- Setup: `vault-gate.tsx` → `AgentSupportNote` calls `probeAgentSupport()`
- Journey: `journey-shell.tsx` → `skipJourneyUnsupportedDevice()` when probe fails
- Chat: `src/components/agent/agent-chat.tsx` lines 465–469 — `unsupported` banner: *"The local agent can't run on this device (WebGPU unavailable or GPU too small)"*

**On a real laptop with WebGPU:** After journey, `loadChatModel()` / `maybePreloadAgent()` in `agent-preload.ts` should stream from `/model-chat/*`. Server screenshot ≠ your device.

### 6. Journey gate blocks full shell for new vaults

**Gate logic:** `src/routes/_app.tsx` — `journeyPending = !demo && !journey.complete`; when true, only `<JourneyShell />` renders (no sidebar/board).

**Steps UI:**

- `src/components/journey/step-chat.tsx` — step 1, uses `loadChatModel()` from `chat-runtime.ts`
- `src/components/journey/step-skill.tsx` — step 2, `equipAdapter()` from `gmail-agent-runtime.ts`
- `src/components/journey/step-connect.tsx` — step 3, Gmail OAuth

**Storage:** `JOURNEY_STORAGE_KEY = "accountbox:journey"` in `journey.ts` — `completeJourneyStep()`, `parseStoredJourney()`.

**Skip paths:** `grandfatherJourney()`, `skipJourneyUnsupportedDevice()`, harness `JOURNEY_GRANDFATHERED` in `train-harness.mjs`.

### 7. Full E2E not on deploy path

**Heavy test:** `test/run_e2e_deployed.mjs` — real Chrome + WebGPU via `test/lib/browser_launch.mjs` `launchWebGpuBrowser()`, `STREAM_BUDGET_MS = 25 * 60_000`, walks real journey steps 1–2.

**Deploy uses:** smokes + harnesses only (`accountbox_deploy_smoke()` in `deploy-lib.sh`).

**Other tests (not deploy):** `test/vault_portability_check.mjs`, `test/run_gate.mjs`, `bun test` unit tests under `src/lib/journey/journey.test.ts`, `engine-slot.test.ts`, etc.

---

## Fix next (ordered, with touch points)

| # | Fix | Primary files |
|---|-----|---------------|
| 1 | HTML cache policy after deploy | `/etc/caddy/Caddyfile` `train.public.computer` handle block; possibly Nitro static headers |
| 2 | Second-browser UX | `vault-gate.tsx` SetupForm/UnlockForm; maybe auth session check vs `loadVaultEnvelope()` null |
| 3 | Tab / GPU messaging | `engine-slot.ts`, `agent-chat.tsx`, optional `BroadcastChannel` (research doc) |
| 4 | Redeploy train once | `bash scripts/deploy-train-dev.sh` — pick up `capture:train-screenshots` in deploy smoke chain |
| 5 | Portability polish | `portability.ts`, `vault-gate.tsx`; research options in `account-portability-research.md` |

---

## Planned later (your Jul 4 direction — not in code yet)

- Phone app as passkey / unlock provider (iOS Authentication Services, Android Credential Manager) for the website WebAuthn flow.
- PAKE pairing so devices share vault keys without server plaintext.
- At least one equipped skill (`src/lib/skills/gmail/skill.ts`) + connected Gmail account for a useful workbench.

**Design notes (separate doc, not implemented):** `docs/two-cartridge-concept.md` on `main` — from Jul 3 session; not part of this deploy task.

---

## Quick reference — storage & services

### localStorage keys (AccountBox)

| Key | Set by | Purpose |
|-----|--------|---------|
| `bm.vault-identity` | `pinVaultIdentity()` / `vaultEmailForCreate()` | Better Auth user email for this browser |
| `accountbox:journey` | `journey.ts` `writeStorage()` | Journey step completion |
| `accountbox:dialkit` | `dialkit-dev.tsx` | DialKit enabled flag |
| `dialkit:dev-session:v1:accountbox-train` | `DevSessionStore` | Agent notes + dial changes |
| `bm.settings`, `bm.tiles-layout`, `bm.workspaces`, `bm.account-scope` | various hooks | Exported in `portability.ts` v2 |

### OPFS

| Table | ID | File |
|-------|-----|------|
| `vault_envelope` | `local` | `src/lib/vault/opfs-store.ts` via `src/lib/db/opfs.ts` |

### systemd / paths

| Item | Value |
|------|-------|
| Service | `train-app.service` → `node /opt/train/app/server/index.mjs` port `3210` |
| App dir | `/opt/train/app` |
| Adapters | `/opt/train/adapters` (synced from `public/adapters`) |
| Model weights | `/opt/train/model`, `/opt/train/model-chat` (Caddy static) |
| Deploy screenshots | `artifacts/deploy-screenshots/` (gitignored in `.gitignore`) |

### Commands

```bash
cd /home/devuser/projects/accountbox
bash scripts/deploy-train-dev.sh
bun run harness:train-dialkit-note
bun run harness:train-dialkit-tuners
bun run capture:train-screenshots
ACCOUNTBOX_TRAIN_VAULT_PASSWORD='…' bun run harness:train-dialkit-note
node test/run_e2e_deployed.mjs   # ~25 min, needs WebGPU Chrome
```

---

## Wrap-up

**Major task:** Done enough to use train for layout feedback (`useDevDialKit` tuners) and agent notes (`DevSessionStore`).

**Headless deploy screenshots** run on a GPU-less Linux VPS — treat "WebGPU unavailable" there as **environment fact**, not "the product can't run agents."

**If your browser** still shows "Something went wrong" after a deploy: hard-refresh or clear site data once (stale `/assets/*` cache — §3 above).
