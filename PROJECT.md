# PROJECT.md — AccountBox plan, shape, state, and enforcement

**The single project doc.** Consolidated on 2026-07-04 from (now deleted)
`product-plan.md`, `shape.md`, `BATTLE-PLAN.md`, `AGENT-A-AGENT-B-TASKS.md`,
`current_state_and_glue.md`, `we_failed_again.md`, and
`gmail_agent_runtime_integration_spec.md`. Repo rules and gotchas live in
`AGENTS.md`; user-facing claims live in `README.md`; operational train/DialKit
inventory lives in `docs/for-july.md`.

> Do not "interpret," "synthesize," or "shore up" around violations. When a
> stop condition triggers, stop and report with concrete evidence. Do not
> proceed until the user explicitly directs the next step.

---

## 1. Product target

AccountBox is a local-first browser console for connected account skills.
The metaphor is console plus cartridges: AccountBox is the console; a
skill/cartridge contains a source, tools, policy, training data, adapter,
evals, and an execution boundary.

The stable product frame:

1. Unlock a browser vault.
2. Start a local chat model.
3. Equip a local skill model.
4. Connect an account/source.
5. Let the equipped skill propose bounded tool calls.
6. Execute only verified, policy-allowed tool calls.

Gmail is the first real skill. GitHub is the second-cartridge pressure test:
`main` registers both in `src/lib/skills/index.ts`, but GitHub is
`needs-training` (read tools + local draft only, not equippable). Do not fake
a trained GitHub skill before an adapter/proof exists
(`docs/two-cartridge-concept.md` is design context, not implementation proof).

## 2. Fixed decisions (do not relitigate)

- Canonical repo for active work: `/Users/mac/accountbox`. Do not move work to
  `reset-*` or sibling worktrees unless the user explicitly asks.
- KEEP Better Auth. It owns local sessions and linked provider `Account` rows.
  The vault master password is the app gate; Google/Gmail is a connected
  source, not app login.
- OAuth tokens on `Account` are encrypted at rest with `BETTER_AUTH_SECRET`.
  Do not move tokens again unless the user makes that product decision.
- The vault envelope lives in browser OPFS via `src/lib/vault/opfs-store.ts`.
- The OPFS layer is `src/lib/db/opfs.ts` + `opfs-sqlite.worker.ts`: real OPFS
  SQLite (`@sqlite.org/sqlite-wasm` OPFS VFS in a module worker) as of
  2026-07-06 (user decision; ported from the `mission/two-cartridge` branch).
  It auto-migrates the old JSON document store on first open. Requires
  cross-origin isolation: COOP `same-origin` + COEP `credentialless` headers
  (vite plugin in dev; Caddy must send the same in production).
  Reload-proof: `bun run prove:opfs-sqlite`.
- Server routes may exist as stateless helpers for provider calls and Better
  Auth. They must not persist mail, agent plans, grounded prompts, model
  outputs, training traces, adapter state, or Gmail target state.
- Existing user-authored `Snippet`/`Signature` rows are a current composer
  feature — a narrow exception, not precedent for storing mail/agent state.
- Agent traces are browser-local OPFS only, record only real weight-driven
  plans, and refuse `__cold` plans.
- First Gmail agent write is `create_draft` only. No sending.
- No direct component calls Emberglass internals; React talks to the runtime
  or skill surfaces.

## 3. Hard invariants

If any of these would be violated, stop and report.

**Do not break the Gmail client.** Every relevant change preserves: connect
Gmail, list inbox/mail, open/read threads, labels, compose, draft autosave,
save draft, sent/drafts views, mail-board navigation. Before changing Gmail
auth/storage/chat/model code, know how to run the current client; afterwards,
run the same path again or say why you could not.

**No durable mail persistence.** No mail bodies, snippets, subjects, grounded
prompts, private training traces, or model outputs in the server DB, OPFS,
IndexedDB, or localStorage — unless the user explicitly changes the product.

**Never fake:**

- no fake Gmail account/synthetic mailbox as evidence for the agent loop
- no fake model load, no no-op training, no hardcoded trained/loaded/equipped
  state
- no generic chat pretending to be a skill planner
- no target replay presented as inference
- no fake OPFS persistence, no fake draft creation, no persisted private mail

**Do not add scope:** no peer-to-peer, sync service, multi-device vault,
cloud backend for user data, hosted account system, native helper, mobile
app work, browser extension work, new provider before the second-cartridge
plan is explicit, or autonomous `mail.google.com` clicking/submission.

## 4. Stop and report

Stop instead of improvising if:

- the existing Gmail client breaks
- WebGPU model weights do not load
- the equipped adapter cannot produce real inference
- AdamW LoRA training does not run when a task claims training
- the adapter cannot be reloaded/equipped after refresh
- Gmail OAuth cannot return usable tokens
- the implementation would persist private mail
- the implementation would require target replay, fake data, or fake success
- a storage/runtime move is needed only because stale docs said so
- the current branch/worktree does not match the user's requested repo

## 5. Architecture map

Runtime and skills:

| Piece                        | File                                      | Notes                                    |
| ---------------------------- | ----------------------------------------- | ----------------------------------------- |
| Generic skill contract       | `src/lib/runtime/app-skill.ts`            | The only seam for app-specific planning   |
| Skill registry               | `src/lib/skills/index.ts`                 | Gmail only on `main`                      |
| Gmail skill manifest         | `src/lib/skills/gmail/skill.ts`           | Owns byte-locked `FIXED_SYSTEM_PROMPT`    |
| Generic runtime              | `src/lib/runtime/agent-runtime.ts`        | Engine load, LoRA equip, real inference, `__cold` fail-closed |
| Gmail compatibility wrapper  | `src/lib/runtime/gmail-agent-runtime.ts`  | Delegates to the generic runtime          |
| Plain chat runtime           | `src/lib/runtime/chat-runtime.ts`         | Qwen2.5-3B-Instruct, verbatim text        |
| Engine slot                  | `src/lib/runtime/engine-slot.ts`          | One model/GPU owner across tabs           |
| Device/connection preload    | `src/lib/runtime/agent-preload.ts`        | Honest supported/deferred/unsupported     |
| Weight fetch + engine bridge | `src/lib/runtime/weight-fetch.ts`         | Retry wrapper; engine vendored in-repo at `src/engine/` |
| Vendored WebGPU engine       | `src/engine/`                              | Emberglass runtime graph, copied in — no external checkout |
| Plan parsing                 | `src/lib/runtime/plan-parse.ts`           |                                            |

Agents layer (ax orchestration over the same engines — no engine of its own):

| Piece                      | File                                          | Notes                                       |
| -------------------------- | ---------------------------------------------- | -------------------------------------------- |
| ax provider over Emberglass| `src/lib/agents/providers/emberglass-engine.ts`| Wraps `chatCompleteRaw` as an ax webllm engine |
| Concierge AI service       | `src/lib/agents/concierge-ai.ts`               | Chat model; reloads via `loadChatModel()` per call |
| Orchestrator + tools       | `src/lib/agents/orchestrator.ts`               | Concierge program, Gmail/bbtriage/trainer handoffs, activity events |
| In-browser trainer         | `src/lib/agents/train-runtime.ts`              | Vendored TrainingController; SFT AdamW LoRA + GRPO, eval, OPFS export/equip |
| GRPO controller (engine)   | `src/engine/services/grpo_controller.js`       | On-policy rollouts, group advantages, weighted micro-steps |
| Verifiable rewards         | `src/lib/agents/rewards.ts`                     | bbtriage reward + `toGrpoPrompt`, pure/unit-tested |
| bbtriage verdict contract  | `src/lib/agents/bbtriage.ts`                   | JSON verdict parse/validate (not a tool plan) |
| SFT JSONL parsing          | `src/lib/agents/sft-data.ts`                   | Pure, unit-tested                            |
| Agents Lab UI              | `src/components/agents/agents-lab.tsx` (`/agents`) | Chat, triage, trainer panels, activity rail |

Execution:

| Piece                   | File                                      | Notes                                   |
| ----------------------- | ------------------------------------------ | ---------------------------------------- |
| Client execution helper | `src/lib/agent/execute-plan.ts`            | Refuses `__cold`                         |
| Generic stateless route | `src/routes/api/agent-execute.ts`          | Session via Better Auth, whitelist check |
| Executor registry       | `src/lib/skills/executor.server.ts`        |                                          |
| Gmail executor          | `src/lib/skills/gmail/execute.server.ts`   | `search_messages` / `read_message` / `create_draft` only |

Local storage:

- `src/lib/db/opfs.ts` + `opfs-sqlite.worker.ts` — OPFS SQLite store (table
  `vault_envelope`, id `local`; auto-migrates the legacy JSON store).
- `src/lib/vault/opfs-store.ts` — vault envelope.
- `src/lib/runtime/adapter-store.ts` — adapter files in OPFS.
- `src/lib/agent/trace-recorder.ts` — local-only trace-to-retrain contract.
- `src/lib/vault/portability.ts` — vault export/import + selected localStorage
  keys.

UI:

- `src/routes/_app.tsx` — shell, vault gate, journey gate, settings, mail
  board, panels, chat mount.
- `src/components/journey/*` — first-run steps (`chat-agent` -> `first-skill`
  -> `connect-account`; grandfathered when linked accounts exist).
- `src/components/agent/agent-chat.tsx` — chat/skill mode switcher.
- `src/components/workbench/skill-equip.tsx` — equip/test a skill.
- `src/components/mail/*`, `src/components/editor/*` — Gmail client UI.

## 6. Gmail skill contract

Manifest: id `gmail-agent`, adapter URL `/adapters/gmail-agent`, tools
`search_messages(query)`, `read_message(id)`,
`create_draft(to, subject, body)`. `defineSkill(...)` derives `allowedTools`
from `tools` — never hand-write a second whitelist. No `send_message`, no
delete/archive/autonomous mutation.

Plan schema:

```ts
type Plan =
  | { tool: ToolName; args: Record<string, unknown>; __cold?: boolean; __ran?: boolean; raw?: string }
  | { steps: Array<{ tool: ToolName; args: Record<string, unknown> }>; __cold?: boolean };
```

`__cold` means: not executable, not trace data, not training data, not a
pass. Invalid real model output may carry `__ran: true` and `raw` for
inspection but is still refused.

Byte-locked prompt: `src/lib/skills/gmail/skill.ts` owns
`FIXED_SYSTEM_PROMPT`. Training data generation imports that exact export. If
the prompt changes, regenerate the training data and adapter provenance.

Runtime surface (compatibility module keeps this exact shape):
`loadBaseModel()`, `equipAdapter(source)`, `generate(prompt)`,
`disposeRuntime()`, `getAgentStatus()`, `subscribeAgentStatus(l)`,
`isEquippedForRealInference()`, `trainGmailAdapter(examples)`. States:
`unloaded | loading | loaded | training | equipped | error`.
`isEquippedForRealInference()` is true only with a live engine in `equipped`.
If the engine slot is displaced, status goes honestly back to `unloaded`.
`trainGmailAdapter()` is API compatibility only — the shipped path is external
fine-tune plus equip; it must not pretend to train.

`generate(prompt)` must: return `__cold` with no equipped engine; call the
real Emberglass engine; try deterministic generation first with narrow sampled
retries only for int4 repetition loops; extract a complete JSON plan the model
actually emitted; validate every tool against `allowedTools`; return `__cold`
+ `__ran` + `raw` when inference ran but no valid plan emerged. It must never
read `gmail-synthetic-prompts.json`, call `planForPrompt`, fabricate a plan
from invalid output, or return untagged fallbacks.

Adapter artifacts: `public/adapters/gmail-agent/` with
`adapter_config.json`, `adapters.safetensors`, optional `adapter.json`
provenance manifest. The runtime equips from served adapter URLs;
`adapter-store.ts` persists files in OPFS but the equip path expects a served
directory.

Execution contract: client refuses top-level `__cold`, posts
`{ skillId, plan, accountId? }` to `/api/agent-execute`; the route resolves
the session, resolves the manifest by `skillId`, refuses `__cold`, validates
against `allowedTools`, dispatches to the registered executor, and persists
nothing. The Gmail executor resolves a Google token per request;
`create_draft` creates a real draft; nothing ever sends mail.

Trace contract (`src/lib/agent/trace-recorder.ts`): browser OPFS only, real
weight-driven plans only, no `__cold`, no execution result payloads or mail
content, prompt hash + adapter provenance recorded, export is an explicit
user action.

Training data comes from: Gmail API operations used by this app, canonical
search/read/draft tasks, and parser-valid JSON/tool-plan outputs. DOM-derived
sources (AccountBox client DOM, real `mail.google.com` DOM/action structure)
are PUNTED (user decision 2026-07-06): unproven value, revisit only if
API-grounded training proves insufficient. Do not use private mailbox
contents as durable training data.

## 7. Current state and known gaps (2026-07-04)

- Branch `main` fast-forwarded to `backup/main` `d1ee3aa`; `origin/main`
  points at the older `aidankmcalister/betterbox` remote and is ~51 commits
  behind local `main`.
- `e2e-artifact.json` records a PASSING deployed E2E run (Jul 3,
  train.public.computer, 19 steps) — but it stops at the connect gate: no
  account connected, no draft created. Do not cite it as end-to-end proof.
- `gate-artifact.json` (Jul 2) is the latest browser realness gate: 18/18
  prompts with real inference, 0 true-cold.
- GitHub is not a registered trained skill.
- `trainGmailAdapter()` does not run in-browser AdamW training; shipped path
  is external fine-tune plus equip.
- Second-browser UX fixed (2026-07-05): when the OPFS envelope is missing but
  the browser carries a pinned vault identity or live session, the gate shows
  a recovery screen (import workspace file / load from folder) instead of
  silently minting a second server user; "start fresh" is an explicit escape
  that clears the pin (`vault-gate.tsx`, `constants.ts`).
- Two-tab GPU coordination polished (2026-07-05): after a denied cross-tab
  claim, `watchEngineSlotFree()` in `engine-slot.ts` polls the Web Locks
  registry and flips the stale "active in another tab" error to an honest
  "load it here now" once the other tab releases the engine.
- Agents layer proven 2026-07-04: `bun run e2e:agents` 21/21 (train loss
  2.5166 -> 0.3053 over 20 steps, held-out delta +3.1522, adapter
  export/re-equip from OPFS). Loads that lose the engine slot mid-stream now
  abort (`DisplacedDuringLoadError`) instead of installing a second resident
  model — the preload-equip-vs-trainer race that stalled training.
- Self-contained (2026-07-04): the WebGPU engine is vendored in-repo at
  `src/engine/` (no `file:../emberglass` dep, no external `fs.allow`), model
  weights are real dereferenced copies under `model/` and `model-chat/`
  (gitignored), and `data/bbtriage/sft_v1/` is copied in. Heavy binaries live
  on the private HF repo `macmacmacmac/accountbox`; `bun run fetch:models`
  re-materializes everything and `bun run check:self-contained` fails on any
  `/Users/...`, sibling-checkout, or escaping-symlink reference. Kernels
  regenerate via `bun run kernels:generate` from `src/engine/qwgpu/templates`.
- GRPO (2026-07-04): in-browser group-relative policy optimization on the
  bbtriage task. The CE backward kernel already multiplies gradients by a
  per-token `f32` mask, so `_writeTargets` now threads float advantages
  through unchanged WGSL; `GrpoController` samples G on-policy completions,
  scores them with the verifiable `bbtriageReward`, normalizes advantages
  per group, and applies advantage-weighted micro-steps. Trainer panel has a
  GRPO button + reward curve; concierge `trainer_train` takes
  `algorithm: 'grpo'`.
- Deploy screenshots from the headless VPS report "WebGPU unavailable" —
  environment fact, not a product verdict.
- Phone gate rewritten + device-tested (2026-07-04): the agent-preload probe
  now checks WGSL `immediate_address_space`, adapter `subgroups`, and a real
  1 GiB `requestDevice` grant instead of trusting advertised limits, and only
  caches success. Verified on 5 real engines across 4 devices — full matrix
  in `README.md` § Device Support Matrix. The gap found on that run — the
  weight loader's host-side decode/quantize peak OOMing 12GB-RAM phones at
  ~95% load — is fixed (2026-07-05): tensors over 64MB raw (the embedding
  table) stream in ~32MB row slices, bit-identical output, unit-tested
  (`src/engine/qwgpu/safetensors_loader.js`, `model_uploader.js`,
  `quantize.js`; mirrored to the emberglass sibling). Not yet re-verified on
  the Xiaomi (device returned). Weight fetches use `cache: 'no-store'`
  (`src/engine/readers.js`).
- Train ops (2026-07-05): Caddy on train.public.computer now serves the app
  shell with `Cache-Control: no-store` (fingerprinted `/assets/*` stay
  immutable) — kills the stale-bundle-after-deploy breakage. Deployed all of
  the above (commit `e4faa99`; the server manifest recorded its pre-rewrite
  id `3f49a7b`); smokes + note/tuner harnesses green.
- GRPO warm-start proven, then stability fixed (2026-07-05): first full gate
  run passed 15/15 (mean reward 0.475 -> 0.862 over 8 iterations, held-out
  disposition accuracy 0% -> 87.5%, 55 distinct rollouts, export/re-equip
  green) — but a rerun COLLAPSED (0.54 -> 0.79 peak -> 0.00 by iter 6, never
  recovered), so a single green run of a stochastic gate is not proof of
  stability. Facts established: (1) cold-start GRPO on bbtriage yields zero
  reward forever — a fresh PEFT-init LoRA (delta 0) near-never emits a valid
  verdict, so every group scores 0 and advantages vanish; `runGrpo` therefore
  warm-starts from the SFT adapter by default (`warmStartUrl`), copying its
  raw A/B into the trainable buffers and adopting its rank/scale. (2) rollout
  budget must exceed the SFT completion length (~215 tok) or truncation
  zeroes rewards; default is now 256. (3) std-normalized group advantages
  explode on nearly-degenerate groups (1,1,1,0.8 -> ±1.7/token) and the
  negative side razes a warm policy; v1 is now reinforce-positive-only
  (`advClipNeg=0`, `advClipPos=1` in `grpo_controller.js`).
- Proof gates run on an ISOLATED server (2026-07-05): the shared :3000 dev
  server killed weight loads two ways — a stale vite process dropped Range
  fetches mid-stream, and an HMR full-reload (any concurrent edit to an SSR
  module) silently stalled a 6GB stream at 95% with no error.
  `scripts/run-e2e-isolated.mjs` boots vite on :3100 with `E2E_NO_HMR=1` and
  `BETTER_AUTH_URL` matched to the port (Better Auth 403s sign-up from any
  other origin); `e2e:agents` / `e2e:grpo` now go through it.
- HF mirror round-trip PROVEN (2026-07-05): upload verified via the HF API
  (12.7GB, 4 groups). `fetch:models` was then found BROKEN two ways — hub
  `downloadFile()` returns a lazy blob that `Bun.write` recorded as 0-byte
  files while logging success, and `Bun.write(path, response)` on a
  redirected CDN response spins at 99% CPU forever. Fixed with a direct
  authenticated resolve-URL fetch pumped chunk-by-chunk to disk plus a
  fail-closed byte-size verify per file. Proof: full cold restore into a
  scratch dir (all 28 files, ~12.4GB, ~110 min on this connection), sha256
  of the largest shards + full adapter trees identical to the originals.
- DialKit vendored + everywhere it can go (2026-07-06): the maceip fork now
  lives at `vendor/dialkit` with its `dist/` committed, installed as a
  `file:` dependency (the old `github:maceip/dialkit#19ba014` dep needed the
  network + a source build on install; `check:self-contained` now bans git
  deps outright). It mounts by default on the local dev server and on
  train-dev builds; customer builds tree-shake it (marker guard verified) and
  proof-gate servers boot with `VITE_DIALKIT=off` so the floating panel
  cannot sit over gate selectors.
- Full deployed E2E (`node test/run_e2e_deployed.mjs`) is heavy (~25 min,
  needs a real WebGPU Chrome) and is not on the deploy path.
- Train/DialKit deploy state, fix list, and storage-key reference:
  `docs/for-july.md`.

Work order: keep the substrate green (typecheck/tests, no Gmail client
regressions) -> fix the `docs/for-july.md` operational issues (HTML cache
policy, second-browser UX, tab/GPU messaging, redeploy proof) -> scope the
two-cartridge pressure test before implementing GitHub -> prove real browser
inference before claiming any agent milestone.

Next milestones (scoped 2026-07-05 — credentials are LAST, not first):

- **Dry-run corpus (the capstone gate before any real token).** A harness
  drives the real planner (equipped adapter, real WebGPU browser) over a
  prompt set; every plan that passes parse + policy/whitelist validation is
  appended to a local "would-execute" corpus (prompt, plan JSON, validation
  verdict, model/adapter ids — browser-local/OPFS export, never a server).
  Target: 10–100 `create_draft`-class outputs with a high validation pass
  rate and zero `__cold` entries. Real Gmail tokens enter only after the
  corpus proves the outputs are worth sending. The corpus harness drives the
  concierge chat loop, which also exercises the chat-driven
  `trainer_train`/tool-call path — no standalone Playwright gate for that
  (coaxing a 3B chat model into one tool call is high-flake, low-value as a
  dedicated test).
- **GitHub second cartridge, credential-free.** Same corpus pattern. Local
  git operations need no GitHub credentials — the executor dry-runs against
  a local fixture repo. Requires a dataset and a real trained adapter first
  (the in-browser trainer is now proven on bbtriage); do not register the
  skill before the adapter exists.
- **Deferred indefinitely:** Xiaomi/phone re-verification (hardware
  returned; distraction from the above).

## 8. Proof gates

Use the narrowest gate that matches the change:

- Docs-only: `bun run typecheck`.
- Type/runtime changes: `bun run typecheck` + targeted `bun test`.
- Runtime proof: `bun run prove:real-gmail`, then a browser WebGPU run for
  real equip/generate.
- Storage: `bun run prove:opfs-sqlite` (SQLite write -> reload -> read-back)
  and `bun run prove:vault-opfs` (vault create -> reload -> unlock, no
  `/api/vault` calls) against a dev server with COI headers and
  `BETTER_AUTH_URL` matched to its port
  (`E2E_NO_HMR=1 BETTER_AUTH_URL=http://localhost:3001 vite dev --port 3001`).
- Train/DialKit deploy: `bun run smoke:train-dev`,
  `bun run harness:train-dialkit-note`,
  `bun run harness:train-dialkit-tuners`,
  `bun run capture:train-screenshots`.
- Full deployed E2E: `node test/run_e2e_deployed.mjs`.
- Agents layer (ax orchestration, in-browser train/eval):
  `bun run e2e:agents` — 21 steps in a real WebGPU Chrome against its own
  isolated server (`scripts/run-e2e-isolated.mjs`): concierge chat reply,
  bbtriage JSON verdict with honest chat-model displacement, 20 real AdamW
  LoRA steps with falling loss, held-out eval delta > 0, adapter exported to
  OPFS and re-equipped from it.
- GRPO (in-browser RL): `bun run e2e:grpo` — real WebGPU Chrome against its
  own isolated server: trainer base loads, baseline held-out accuracy, GRPO
  warm-starts from the SFT bbtriage adapter (a cold LoRA provably scores 0
  forever), 8 iterations with rising mean reward and >= 2 distinct on-policy
  rollouts, held-out accuracy does not regress, adapter exported to OPFS and
  re-equipped. Known gate softness (candidate hardening, user decision
  pending): reward comparison is first-vs-last iteration (noise-sensitive)
  and the accuracy baseline is the cold base at 0% (trivially non-regressing)
  — a stricter gate would baseline against the SFT adapter.
- HF mirror round-trip: `bun run fetch:models` into a scratch dir must
  re-materialize every mounted file with byte-size verification (the fetch
  path once wrote 0-byte files while logging success — see § 7).
- Self-contained guard: `bun run check:self-contained` (no external path
  references, no escaping symlinks) and `bun run kernels:check` (vendored
  kernels are in sync with their templates).

Static checks do not prove browser WebGPU inference.

Manual browser gate (the only thing that proves the live agent path), in a
WebGPU browser on `bun run dev`:

1. Vault unlock creates/satisfies the local Better Auth session.
2. Chat model streams a real response.
3. Gmail skill equips `/adapters/gmail-agent`; status `equipped`.
4. A prompt produces a real plan with no `__cold`.
5. The execution route refuses cold/invalid plans.
6. With Gmail connected, allowed tools execute and `create_draft` creates a
   real draft without sending mail.

Mechanical detectors (run at the start of substantial sessions and before
claiming an agent milestone):

```bash
# Old server-side product records that should not reappear (expect quiet)
rg -n "VaultEnvelope|ProviderConfig|ConnectedAccount|gmail_target|gmail_agent_state|adapter_ref|model_config" prisma/schema.prisma src/routes/api/vault.ts src/lib/connections/ 2>/dev/null || true

# Chat proxying to an external model instead of the local runtime (expect quiet)
rg -n "127\.0\.0\.1:8000|openai.*completions|ds4-server|buildGmailGrounding" src/routes/api/chat.ts src/lib/agent/ 2>/dev/null || true

# Target replay leaking into the app path (gmail-agent-runtime must have no hits)
rg -n "planForPrompt|SYNTH_TARGETS|gmail-synthetic-prompts" src/lib/runtime/gmail-agent-runtime.ts

# Runtime proof shape
rg -n "createEmberglassEngine|__cold|isEquippedForRealInference" src/lib/runtime src/lib/agent training scripts

# Prompt byte-lock
bun run training/generate-gmail-dataset.ts
bun -e 'import {FIXED_SYSTEM_PROMPT} from "./src/lib/runtime/gmail-agent-runtime.ts"; import {readFileSync} from "fs"; const row=JSON.parse(readFileSync("training/gmail-agent-train.jsonl","utf8").split("\n")[0]); const sys=row.messages.find(m=>m.role==="system").content; if(sys!==FIXED_SYSTEM_PROMPT) throw new Error("SYSTEM prompt drift"); console.log("prompt byte-match OK")'
```

The privacy grep will hit composer snippets/signatures and response-only mail
fields — inspect those hits; they are not permission to store mail. The dead
`accountbox-runtime.ts` target-replay module has been deleted; new hits for it
are a regression.

## 9. Failure memory (why the rules are this strict)

Prior resets failed by mixing old and new product shapes: server product rows
grew beyond Better Auth and composer features; chat proxies and target replay
were presented as "the agent"; Gmail client preservation was assumed instead
of exercised; work drifted between sibling folders until agents lost track of
the real repo; and docs kept instructing agents to rebuild layers already
settled by later pivots. The fix is never another reset.

The sharpest single failure (2026-07-01): a real `mlx_lm.lora` fine-tune ran
once and produced real weights — but the "eval" only called a `generate()`
that replayed curated targets from `gmail-synthetic-prompts.json`, so the
loop scored our own target file and presented it as model behavior. Prime
directive since then: **never let target replay pass as inference.** Cold,
parse, and validation failures must be visible and fail closed.

## 10. Done

Done means this exact local flow works:

> vault unlock -> local Better Auth session -> existing Gmail client still
> works -> real WebGPU model loads -> real LoRA Gmail adapter trains/equips
> from Gmail-API-grounded examples (DOM sources punted 2026-07-06) -> chat
> routes Gmail request to loaded Gmail agent -> live Gmail search/read ->
> real Gmail draft created -> no email sent.

If any part of that sentence is faked, approximated, target-replayed, or
unexercised, it is not Done.
