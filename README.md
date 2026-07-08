# AccountBox

**Local account skills. One console.**

AccountBox is a local-first browser app for connected accounts. You unlock a
browser vault, run local WebGPU models, equip account skills, and connect the
accounts those skills can act on. Gmail and GitHub are the first cartridges;
your data stays where it already lives.

The first real skill is Gmail. The current product still includes the working
Gmail client: connect accounts, list mail, read threads, labels, compose,
draft autosave, save drafts, sent/drafts views, and the mail-board navigation.
The agent path is narrower by design: Gmail skill plans may only call
`search_messages`, `read_message`, and `create_draft`. It never sends mail.
GitHub is the second-cartridge boundary: read tools and local draft proposals
are wired; a trained GitHub adapter is not proof yet.

## Current Shape

- **Console, not mail-only app.** AccountBox is the console; skills are
  cartridges. Gmail is the first cartridge. GitHub is the second-cartridge
  pressure test — manifests and executors exist; do not fake a trained adapter.
- **Vault first.** The vault master password is the app gate. Google/Gmail is a
  connected source after unlock, not the product login.
- **Local models.** Plain chat uses Qwen2.5-3B-Instruct. Skill planning uses
  VibeThinker-3B plus a LoRA adapter through Emberglass/WebGPU.
- **Fail closed.** Unequipped, invalid, or non-inference plans are tagged
  `__cold` and refused by execution.
- **No fake proof.** Target replay, synthetic mailboxes, fake trained states,
  and no-op training do not count as product progress.

## Privacy Boundary

- Mail is fetched live from provider APIs. Mail bodies, snippets, subjects, and
  grounded prompts must not be written to durable app storage.
- Better Auth owns local sessions and linked provider account rows. OAuth
  tokens on `Account` are encrypted at rest with `BETTER_AUTH_SECRET`.
- Browser-owned product state lives locally: vault envelope + workspace
  records in OPFS SQLite, settings and layout in localStorage, agent traces
  in OPFS, and adapter files as plain OPFS files (or served local app
  storage).
- Agent traces are local-only, record only real weight-driven plans, and refuse
  `__cold` plans. They leave the device only through an explicit user export.
- Existing user-authored composer snippets/signatures are server rows today.
  Treat them as a narrow current exception, not a precedent for storing mail or
  agent state on the server.

## What Works Now

- Vault create/unlock plus local Better Auth session.
- First-run journey: start local chat model, equip/test the Gmail skill, then
  connect Gmail.
- Working Gmail client UI.
- Two-cartridge skill boundary: Gmail + GitHub manifests, eval harness, proof
  scripts (`prove:two-cartridge`, `prove:skill-evals`).
- Generic `AppSkill` runtime seam:
  - `src/lib/runtime/agent-runtime.ts`
  - `src/lib/runtime/app-skill.ts`
  - `src/lib/runtime/skill-runtimes.ts`
  - `src/lib/skills/gmail/skill.ts`
  - `src/lib/skills/github/skill.ts`
- Generic fail-closed execution route:
  - client: `src/lib/agent/execute-plan.ts`
  - route: `src/routes/api/agent-execute.ts`
  - Gmail executor: `src/lib/skills/gmail/execute.server.ts`
- Real OPFS SQLite browser storage (`@sqlite.org/sqlite-wasm` in a module
  worker, auto-migrates the old JSON store; reload-proven via
  `prove:opfs-sqlite` / `prove:vault-opfs`). Needs cross-origin isolation —
  the dev server sends COOP/COEP automatically; falls back loudly to the
  legacy JSON store where the headers are absent.
- In-browser training on the Agents Lab (`/agents`): real SFT AdamW LoRA and
  GRPO with an injected verifiable reward, proven end-to-end in a real WebGPU
  Chrome (`e2e:agents` 21/21, `e2e:grpo` 15/15 — train, export adapter to
  OPFS files, re-equip). Adapter binaries persist as plain OPFS files.
- Concierge chat with a generic `skill_plan(skillId, task)` handoff; unknown
  or untrained cartridges refuse — no cold planning.
- Eval Range runs a cartridge's manifest seed cases against its live equipped
  planner; a `__cold` generation is a failed case, never a fake pass.
- Boundary guards in CI: `check:self-contained` (no external references),
  `check:engine-boundary` (the vendored WebGPU engine is a cordoned module),
  `check:cartridge-boundary` (generic code reaches skills only via the
  registry — adding a cartridge touches `src/lib/skills/<id>/` + registries,
  nothing else; recipe in `docs/two-cartridge-concept.md`).
- Durable workspace state: the last equipped skill/adapter is recorded in
  OPFS SQLite at equip time (a record of what you did — never rendered as
  live equipped state after reload).
- Train/dev deploy support for DialKit layout tuners and agent notes.

## Local Setup

You'll need [Bun](https://bun.sh), a Google OAuth app for Gmail, and local
model/adapter assets if you want the WebGPU skill path.

```bash
git clone https://github.com/maceip/accountbox.git
cd accountbox
bun install
cp .env.example .env
```

For local dev, a SQLite main database is enough:

```bash
DATABASE_URL=file:./dev.db
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=your-generated-secret
IS_SELF_HOSTED=true
```

Google/Gmail:

1. Enable the Gmail API in Google Cloud.
2. Add the `gmail.modify` and `gmail.settings.basic` scopes.
3. Create a web OAuth client with callback
   `http://localhost:3000/api/auth/callback/google`.
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.

Then initialize and run:

```bash
bun run db:push
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Model Assets

The real model path expects same-origin assets:

- `/model` -> VibeThinker/Qwen-shape base weights for skill planning.
- `/model-chat` -> Qwen2.5-3B-Instruct weights for plain chat.
- `/adapters/gmail-agent` -> `adapter_config.json`, `.safetensors`, and
  optional adapter manifest for the Gmail skill.

The weight directories are real gitignored copies (not symlinks), restored
from the private HF mirror by `bun run fetch:models`:

- `model/` — VibeThinker-3B skill-planner weights
- `model-chat/` — Qwen2.5-3B-Instruct chat weights
- `public/adapters/gmail-agent/`

If those assets are absent, the UI must report cold/unsupported/error states.
Do not replace them with fake loaded state.

## Device Support Matrix

Measured on real hardware (2026-07-04) against the agent-preload GPU gate in
`src/lib/runtime/agent-preload.ts`. "New gate" is the current probe: WebGPU
present, WGSL `immediate_address_space`, adapter `subgroups`, and a real
`requestDevice` grant for the 1 GiB buffer floor. Emberglass requires all of
these; Safari/WebKit browsers (including every iOS browser) do not expose
WebGPU with these features today.

| Device / browser                                  | New gate verdict                        | Ground truth observed                                                                       |
| ------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------- |
| Xiaomi (Mali gen-5, 12GB) — WebView 150/Canary 151 | SUPPORTED                                | Full device grant incl. real 1 GiB buffer; model load OOM-killed at ~95% (loader peak, open bug) |
| Xiaomi — stock Chrome 149                          | UNSUPPORTED — "browser WGSL is too old"  | Correct: Android Chrome 149 lacks `immediate_address_space`; old gate wrongly passed this    |
| Pixel 10 Pro Fold (Tensor G5, 16GB) — WebView 150  | SUPPORTED                                | Full device grant incl. real 1 GiB buffer; AICore also present as a native path              |
| Windows 11 + Edge 150 (Intel Xe-2LPG iGPU)         | SUPPORTED                                | Full end-to-end proof: 5.8GB model streamed + int4-quantized in 389s, real tokens in 4.9s    |
| iPhone XS Max (iOS 18.7, Safari/WebKit)            | UNSUPPORTED — "WebGPU is not available"  | Correct: `navigator.gpu` absent; WebGPU ships by default only in Safari 26 (iOS 26+)         |

Known engine gap from this run — since FIXED (2026-07-05): the weight loader's
host-side peak (~2GB extra while decoding/quantizing the embedding table)
OOMed the tab on 12GB-RAM phones even when the GPU qualified. Tensors over
64MB now stream in ~32MB row slices (`src/engine/qwgpu/safetensors_loader.js`,
bit-identical output, unit-tested). Not yet re-verified on phone hardware.

## Commands

| Command                                | What it does                                                  |
| -------------------------------------- | ------------------------------------------------------------- |
| `bun run dev`                          | Dev server on port 3000                                       |
| `bun run typecheck`                    | Strict TypeScript checks                                      |
| `bun run build`                        | Production build                                              |
| `bun run test`                         | Unit tests (scoped runner — never run bare `bun test`)       |
| `bun run train:gmail-dataset`          | Generate Gmail SFT data (training runs in-browser via Agents Lab) |
| `bun run prove:real-gmail`             | Static/server-side proof checks for the real Gmail path       |
| `bun run prove:two-cartridge`          | Two-cartridge manifest/executor boundary proof                |
| `bun run prove:skill-evals`            | Skill eval harness proof                                      |
| `bun run smoke:production`             | Production smoke check                                        |
| `bun run smoke:train-dev`              | Train/dev smoke check with DialKit markers                    |
| `bun run harness:train-dialkit-note`   | Playwright check for DialKit agent notes                      |
| `bun run harness:train-dialkit-tuners` | Playwright check for DialKit layout tuners                    |
| `bun run capture:train-screenshots`    | Save train deploy screenshots                                 |
| `bun run prove:opfs-sqlite`            | Browser proof: SQLite write → reload → read-back              |
| `bun run prove:vault-opfs`             | Browser proof: vault create → reload → unlock                 |
| `bun run e2e:agents`                   | Full Agents Lab WebGPU gate (real Chrome + GPU, ~30 min)      |
| `bun run e2e:grpo`                     | In-browser GRPO gate (real Chrome + GPU, ~20 min)             |
| `bun run check:self-contained`         | Guard: no references outside the repo                         |
| `bun run check:engine-boundary`        | Guard: engine cordon (src/engine two-seam rule)               |
| `bun run check:cartridge-boundary`     | Guard: generic code reaches skills only via the registry      |
| `bun run kernels:generate` / `:check`  | Regenerate / verify WGSL kernel JS from templates             |
| `bun run fetch:models` / `hf:upload`   | Restore / publish heavy binaries via the private HF mirror    |
| `bun run set-owner`                    | Grant owner role                                              |
| `bun run encrypt-tokens`               | Backfill plaintext OAuth tokens into encrypted rows           |

## Active References

- `PROJECT.md` - plan, product shape, current state, invariants, and gates.
- `AGENTS.md` - repo rules and gotchas.
- `docs/for-july.md` - latest train/DialKit deployment inventory and fix list.
- `docs/two-cartridge-concept.md` - design note for the cartridge pivot.
- `docs/state-of-the-yard-2026-07.md` - survey of training-UI/browser-agent
  landscape and the design principles drawn from it (discussion record, not
  a plan).

## License

AccountBox is open source under the [MIT license](LICENSE).
