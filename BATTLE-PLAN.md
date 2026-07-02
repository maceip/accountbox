# BATTLE-PLAN.md — Enforceable contract for delivering the product-plan

**Status:** Authoritative for agent behavior. Read this before touching code.

This document turns `product-plan.md` + `shape.md` + `AGENTS.md` into an **enforceable process**. It records why the prior three resets failed and defines the exact gates, stop conditions, and context an agent must respect.

> Do not "interpret," "synthesize," or "shore up" around violations. When a gate or stop condition triggers, **stop and report** with the concrete evidence. Do not proceed until the user explicitly directs the next step.

---

## 1. Mandatory Context Bundle (load in this order, every session)

Before writing, editing, or planning code changes, an agent **must** read:

1. `product-plan.md` (source of truth for target, fixed decisions, stop conditions, build order, "Done")
2. `shape.md` (product shape memory — the non-negotiables)
3. `AGENTS.md` (stack gotchas, hard rules, commands, design system)
4. `BATTLE-PLAN.md` (this file — failure memory + enforcement)
5. `README.md` (to know what it currently claims vs what we are changing)

An agent must be able to quote the relevant section of `product-plan.md` "Stop And Report" and "Done" before claiming any slice is complete.

**External references (study before implementing the hard parts):**
- OPFS SQLite patterns: `https://github.com/maceip/www-terminal` and `https://github.com/maceip/agent-browser`
- WebGPU/LoRA runtime + AdamW training: `/Users/mac/emberglass/src/services/training_controller.js`, `adapter_registry.js`, `emberglass_bridge.js`; `/Users/mac/qwen-webgpu-lora`; `/Users/mac/edge-thinker`
- Copy **minimum proven** code only. Re-implementing from scratch without studying these is a forbidden pattern.

---

## 2. Diagnosis: Why the prior resets failed (evidence-based)

From agent transcripts, the two reset-* repos in ~ (`reset-accountbox` and `reset-accountbox-v2`), their `opinion*.md` files, and the current working tree:

1. **Architecture hybrid / storage target error.** Code stored product records (vault envelope, provider config, connected accounts, tokens) in server Prisma/SQLite (`prisma/schema.prisma` extensions + `/api/vault`, `connections/google.server.ts`, `ConnectedAccount`, `ProviderConfig`, `VaultEnvelope`). `product-plan.md` requires **browser OPFS SQLite** for those records; server routes are stateless helpers only.

2. **Wrong runtime for the agent.** Chat and grounding routed to an external OpenAI-compatible server (`/api/chat` → `127.0.0.1:8000`, `gmail-grounding.server.ts` shipping live snippets). The target is **real in-browser WebGPU + AdamW LoRA fine-tuning**, trained on Gmail API surface + BetterBox DOM + `mail.google.com` DOM/action patterns. Private mail bodies are never training data and never persisted.

3. **Gmail client breakage risk ignored.** Changes landed without re-exercising the documented "Do Not Break Gmail Client" paths (connect, list, read, labels, compose, draft autosave/save). Several transcripts show drift into server-side grounding and auth coupling that touched these flows.

4. **Breadth before depth + metaphor-as-architecture.** Prior work added chat UI, vault UI, connections, "workspace" metaphors, mock OIDC, extension/mobile scaffolding before the core loop (OPFS proof → real model load → real training → real verified tool call → real `create_draft`) existed. `opinion.md` already flagged this; the new `product-plan.md` is stricter.

5. **No mechanical gates.** Plans existed, but there were no always-run verify steps tied to each phase. Agents crossed "stop" conditions because the criteria were not checkable commands + explicit file invariants.

6. **Context loss.** Each agent session started without a single small bundle that listed (a) the exact current violations, (b) the exact "no fake" detectors, (c) the precise next slice with exit criteria.

7. **Docs describe the old world.** README, schema comments, and some flows still reflect the hosted Postgres + Better Auth-as-login + server-persisted mail-era product.

**Net:** repeated attempts to "tie in" or "shore up" the old server-centric app with new local-agent ideas produced an incoherent hybrid that satisfied neither.

---

## 2.5. The reset-* repos in ~ (detailed lineage and what they teach)

User confirmed the prior attempts live as sibling folders in the home directory (both named with "reset"):

- `~/reset-accountbox`
  - Contained `opinion.md`, `plan.md`, `docs/SATURDAY-CONTRACT.md`.
  - First reset after the clean upstream. Introduced the core thesis language ("local single-user agentic browser", "vault master password is the login", "Google is a data source you connect").
  - Saturday contract: "If real data / real model / real provider is unavailable, stop and name what is missing. Do not substitute fake local fixtures on the main path."
  - Still carried breadth (OIDC mock IdP demo, extension/mobile scaffolding, owner/demo machinery) and used server SQLite + verification scripts too early.
  - `opinion.md` already diagnosed the coupling and called for depth-first proof of the loop before anything else.

- `~/reset-accountbox-v2`
  - Contained `opinion-v2.md` (the strongest guardrail document from any prior attempt).
  - Much tighter scope: "how to turn upstream BetterBox into the product."
  - Prime directive in §0: Ship **one working, lovable vertical slice** on real data before infrastructure, abstractions, or verification. "When in doubt, make it work end-to-end on real data, then show it."
  - Explicit invariants (I1–I6) that future agents must treat as binding where they do not conflict with the stricter rules in the current `product-plan.md`:
    - **I1 (critical)**: The vault master password is the *only* app gate. Chat must work with **zero accounts connected**. Explicitly calls out that a prior attempt gated `/api/chat` on a Google session — "that is the single mistake that cascaded into everything else."
    - **I2**: Nothing sensitive in `.env`. Provider creds and model config are pasted **in the web app** at runtime and stored encrypted locally. The app must boot from an empty environment.
    - **I3**: Accounts = data sources, not logins. Connecting never affects "being in the app."
    - **I4**: Never persist mail or message content.
    - **I5**: Real user data only ever goes to the local model.
    - **I6**: No verification gates or test scripts before the feature exists. "Proof of done is a live demo of the real path." Asserting against fixtures proves nothing.
  - Build order was A (local shell + vault lock + ungrounded local chat) → B (connect Gmail + ground chat with live inbox digest) → C (per-account tools: search/read/create_draft only) → D (password manager polish).
  - Reusable/correct patterns captured in v2 that are worth studying (do not cargo-cult the server parts):
    - `src/lib/db/sqlite-url.ts` — normalizes `file:` URLs so Prisma CLI and runtime see the same DB file.
    - Browser vault crypto + vault-gate (zero-knowledge envelope).
    - `src/lib/chat/provider.server.ts` + streaming wrapper with `requireLocal` option (forces local model for grounded turns; honest "no provider" errors instead of fakes).
    - `src/lib/agent/tools.ts` — clean OpenAI-style tool defs for `search_inbox` / `read_email` / `create_draft`.
    - `src/components/shell/connect-data.tsx` — UI that treats "Connect Gmail" as a data-source action after the app is already open.
    - Agent run loop and account-agent wiring.
  - v2 still ultimately stored product records (VaultEnvelope, AppConfig for runtime creds, ConnectedAccount) in server libSQL/Prisma and used an external local LLM server (`ds4-server` on 127.0.0.1:8000) for the "agent" (grounding at inference time + tool calling). It never reached a full end-to-end on the stricter target.

**Current `product-plan.md` (this workspace) is a stricter evolution of the above vision**:

- Product records (vault envelope, provider config/tokens, connected account metadata, `gmail_target`, `gmail_agent_state`, adapters, model config) **must live in browser OPFS SQLite** (or OPFS files/IndexedDB for blobs). Even the "embedded server SQLite" approach of v2 is now out for these records. Server routes are stateless helpers only.
- The Gmail agent must be **real in-browser WebGPU + AdamW LoRA fine-tuning** (load/train/equip/generate via a wrapper around the patterns in the referenced emberglass, qwen-webgpu-lora, and edge-thinker code). Not just inference-time grounding + tools against a local LLM server.
- Training data comes from Gmail API surface + BetterBox DOM + real `mail.google.com` DOM/action patterns (not private mailbox contents by default).
- "Done" explicitly requires a real trained adapter that round-trips from persistence and produces a real `create_draft`.

This progression (opinion → opinion-v2 → current product-plan) explains the "fourth time resetting" sensation: each reset clarified the target further while leaving behind partial server-centric or proxy implementations plus accumulated breadth and verification debt.

**For agents**: When reading the reset-* folders, treat `opinion-v2.md` I1/I2/I6 and the "one vertical slice on real data" rule as near-mandatory unless the current `product-plan.md` explicitly overrides them with something stricter (OPFS + real training). Do not re-introduce server product tables or .env secrets for the items product-plan says belong in OPFS. Study v2's good abstractions (chat provider, tools shape, sqlite normalizer, connect UI) but re-target the storage and runtime layers.

---

## 3. Hard Invariants (if any is violated → stop and report)

From `product-plan.md` "Stop And Report" and "Never Fake", plus shape.md and AGENTS.md:

- **Existing Gmail client works end-to-end** after every relevant change: connect Gmail, list inbox/mail, open/read threads, labels, compose, draft autosave, save draft, sent/drafts views, mail-board navigation. Exercise the path; do not claim "it should still work."
- **No mail or private info persisted.** Never store bodies, snippets, subjects, or grounded prompts in any durable store (server DB, OPFS, IndexedDB, localStorage). Snippets/subjects exist only in HTTP responses and React state.
- **No fakes on the critical path.** No fake Gmail account, synthetic mailbox, fake model load, no-op training, hardcoded trained/loaded state, generic chat pretending to be the Gmail agent, fake OPFS persistence, fake draft creation.
- **Product records live in browser storage (this phase).** Vault envelope, provider config/tokens, connected account metadata, `gmail_target`, `gmail_agent_state`, adapter refs/artifacts, model config → OPFS SQLite (or OPFS files/IndexedDB for blobs). Server routes must not save these.
- **Server routes are stateless helpers only.** If a Gmail API call must go through a server route, the browser sends the access token for that one call after vault unlock. The route does not save the token or any product record.
- **Gmail writes are `create_draft` only (first).** No `send_message`.
- **Better Auth is local-only session state created from vault unlock.** It does not store vault data, provider tokens, Gmail target state, adapters, or mail data. Its tables may remain in the localhost SQLite used by the server for session tables only.
- **Real WebGPU LoRA + AdamW.** The Gmail agent is not a prompt wrapper or remote proxy. It requires load base model, create/train adapter, equip, generate, status, dispose. Training examples come from API ops + DOM structures, not private mailbox contents by default.
- **OPFS persistence must survive reload.** One record written → reload → read back the same content.
- **Adapter must round-trip.** Persist ref/blob → reload → equip → generate without re-training in the same session.

**Mechanical detectors (run these greps on every new session and before claiming progress):**

```bash
# Server-side product records that should move to OPFS (forbidden in this phase)
rg -n "VaultEnvelope|ProviderConfig|ConnectedAccount|gmail_target|gmail_agent_state|adapter_ref|model_config" prisma/schema.prisma src/routes/api/vault.ts src/lib/connections/ 2>/dev/null || true

# Chat proxying to external model instead of WebGPU runtime
rg -n "127\.0\.0\.1:8000|openai.*completions|ds4-server|buildGmailGrounding" src/routes/api/chat.ts src/lib/agent/ 2>/dev/null || true

# Any persistence of mail bodies/snippets/subjects
rg -n "snippet|bodyHtml|body\.(html|text)|persistMail|saveMessage" --glob '!src/lib/gmail/api.server.ts' 2>/dev/null | head -20 || true

# Hardcoded "trained" or "loaded" states
rg -n "isTrained|trained.*true|adapterLoaded|hardcoded|mock.*(model|agent|train)" -i 2>/dev/null || true
```

If any of the above show **product data** (not the Gmail API fetch functions themselves) living on the server or fakes in the agent path, **stop**.

---

## 4. Current Violations (snapshot at plan creation; re-verify on every agent start)

Run the detectors above. As of the initial writing of this plan, the working tree shows:

- `prisma/schema.prisma` contains `VaultEnvelope`, `ProviderConfig`, `ConnectedAccount`, `OAuthState`, `AppConfig` — server-side product records.
- `src/routes/api/vault.ts` reads/writes `prisma.vaultEnvelope`.
- `src/lib/connections/google.server.ts` + `src/lib/crypto/secret-box.server.ts` + `app-config.server.ts` manage encrypted provider secrets and tokens server-side via Prisma.
- `src/routes/api/chat.ts` proxies to `http://127.0.0.1:8000/v1` with a generic system prompt + optional `buildGmailGrounding` that fetches and serializes live mail.
- `src/lib/agent/gmail-grounding.server.ts` exists and ships inbox snippets.
- `src/components/chat/local-chat.tsx` and `LocalChat` mount are present; they call `/api/chat`.
- `src/components/vault/vault-gate.tsx` + `src/lib/vault/*` implement a vault unlock flow, but the envelope round-trips through the server API.
- `src/routes/_app.tsx` already mounts `VaultGate` and `LocalChat`, and Better Auth session is derived from vault unlock (good direction).
- `dev.db` exists (server SQLite file).
- README still describes the hosted Postgres self-host flow.
- No OPFS SQLite wrapper, no WebGPU runtime wrapper, no LoRA/AdamW training path, no `gmail_target`/`gmail_agent_state` records in browser storage, no verified tool execution for `search_messages`/`read_message`/`create_draft` driven by a trained adapter.

**Rule:** An agent must re-list these (or the current equivalent) at the start of any work and include them in its first response. Do not silently "fix around" them.

---

## 5. Phases with Entry/Exit Criteria (enforceable)

Follow `product-plan.md` "Build Order" but with explicit gates. Do not start Phase N+1 until Phase N's exit criteria are demonstrated and the user acknowledges.

**Phase 0 — Context & Hygiene (no feature work)**
- Entry: this plan exists.
- Exit (all must pass):
  - Agent has read the 5 mandatory files + can quote the "Done" definition and at least 3 "Stop And Report" bullets.
  - Detectors above have been run; current violations listed.
  - `bun run typecheck` is clean on the current tree (or the delta is only the known violations).
  - Gmail client manual path exercised once on a real connected account (connect → list → open thread → labels → compose draft) and result recorded.
- Deliverable: a short "re-verified violations" note in the session.

**Phase 1 — OPFS SQLite foundation (browser persistence only)**
- Entry: Phase 0 exit complete; no changes to Gmail client or auth yet.
- Work (study the cited maceip repos first):
  - Add a minimal browser-only OPFS SQLite wrapper (open, migrate, query). No server involvement for product records.
  - Prove one record round-trips: write → close tab/reload → read yields the same payload.
- Exit (must be demonstrated, not asserted):
  - A small test page or dev-only harness writes a `vault_envelope` shape (or a sentinel record) to OPFS SQLite and reads it back after reload with identical content.
  - `bun run typecheck` clean.
  - No new server DB writes for product state introduced.
- Stop if: OPFS DB does not persist across reload.

**Phase 2 — Vault moves to browser storage; Better Auth stays local-only**
- Entry: Phase 1 exit.
- Work:
  - Move vault envelope persistence from `/api/vault` + Prisma to the OPFS store.
  - Vault unlock still produces the local Better Auth session (keep the current `createVaultSession`/`unlockVaultSession` path or equivalent, but the envelope itself is now browser-only).
  - Confirm shell + chat chrome open after unlock with no Google connected.
- Exit:
  - Create vault → lock → reload → unlock with same master password restores access and session.
  - No `VaultEnvelope` row is created/updated on the server DB for the happy path.
  - Gmail client still works for any already-connected accounts (or connect works end-to-end).
- Stop if: existing Gmail client breaks, or OPFS does not persist.

**Phase 3 — Provider config/tokens move to encrypted browser storage; connections re-target**
- Entry: Phase 2 exit.
- Work:
  - Move Google provider config and connected account metadata + encrypted tokens to OPFS records.
  - Update the connections flow so that after vault unlock the browser holds the tokens; any server route that needs Gmail receives the token for that call only.
  - Keep the existing Gmail API client functions (`src/lib/gmail/api.server.ts`) intact for direct browser → Gmail use where possible; server routes become thin passthroughs when unavoidable.
- Exit:
  - Connect Gmail via the accounts/settings UI succeeds; tokens are usable; list/read/compose work.
  - Re-exercise the full Gmail client path listed in "Do Not Break Gmail Client."
  - `bun run typecheck` clean; no private mail written to any store.
- Stop if: Gmail client breaks or OAuth cannot return usable tokens.

**Phase 4 — Add Gmail target + agent state records (browser)**
- Entry: Phase 3 exit.
- Work:
  - Add `gmail_target` and `gmail_agent_state` shapes in OPFS.
  - Settings surfaces for "Gmail agent" status (not trained / training / equipped / loaded).
- Exit: UI can reflect and persist these states across reload; no server persistence of them.

**Phase 5 — WebGPU runtime wrapper + real model load**
- Entry: Phase 4 exit.
- Work (study the cited emberglass/qwen/edge sources first):
  - Create one AccountBox runtime wrapper module that React code calls exclusively.
  - Expose: load base model, status/error/progress, dispose.
  - Prove a real base model loads in the browser (no fake/hardcoded loaded state).
- Exit:
  - `loadBaseModel()` completes without error on supported hardware; status reports real progress.
  - No "fake model load" (no hardcoded success or mock).
- Stop if: WebGPU model weights do not load.

**Phase 6 — Real Gmail LoRA adapter training with AdamW**
- Entry: Phase 5 exit.
- Work:
  - Extend the wrapper with: create/train Gmail adapter (AdamW LoRA), equip adapter, generate with equipped adapter.
  - If the referenced bridge lacks training methods, add wrapper support around `TrainingController` (or equivalent) before claiming training works.
  - Build training examples from: Gmail API ops used by the app, BetterBox Gmail client DOM/action structure, real `mail.google.com` DOM/action structure, canonical search/read/draft tasks, parser-valid JSON/tool-plan outputs.
  - Do not use private mailbox contents as durable training data by default.
- Exit:
  - A real training run completes (even small LoRA) and reports metrics.
  - After training, `equip` + `generate` produces output for a Gmail task.
  - Adapter ref + blob can be persisted (OPFS file or IndexedDB) and re-equipped after reload without re-training in the same session.
- Stop if: AdamW LoRA training does not run, or adapter cannot be reloaded/equipped after refresh.

**Phase 7 — Chat routes to the loaded Gmail agent; verified tools only**
- Entry: Phase 6 exit + agent state is `loaded`.
- Work:
  - Replace `/api/chat` generic behavior (or the local chat request handling) with the flow in `product-plan.md` "Chat/Gmail Agent".
  - Implement only the three verified tools first: `search_messages`, `read_message`, `create_draft`.
  - Parse agent output as bounded plan/tool call; verify name and args before execution.
  - No `send_message`.
- Exit:
  - With Gmail connected + model loaded + adapter trained/equipped, a chat request about mail results in a real Gmail action (search or read or draft created) executed via the verified tools.
  - Real `create_draft` appears in the user's Gmail (do not send).
  - Result surfaces back in chat.
- Stop if: any prior stop condition, or implementation would persist private mail, or would require fakes.

**Phase 8 — "Done" verification**
- The exact flow in `product-plan.md` "Done" must be runnable by a human from a fresh checkout + the documented external model/runtime prerequisites:
  > vault unlock -> local Better Auth session -> existing Gmail client still works -> real WebGPU model loads -> real AdamW LoRA Gmail adapter trains/equips from Gmail API + BetterBox Gmail DOM + `mail.google.com` DOM/action examples -> chat routes Gmail request to loaded Gmail agent -> live Gmail search/read -> real Gmail draft created -> no email sent.

Run the detectors again. Exercise the Gmail client paths again. If anything is faked or mail is persisted, it is not Done.

---

## 6. Agent Operating Protocol (how this plan is enforced)

1. **At session start:** read the 5 mandatory files. Run the mechanical detectors. Output the current violations list. Quote the "Done" definition.
2. **Before any edit:** state which Phase you are in and the exit criteria you are targeting. If you are not in a phase, you are in Phase 0.
3. **Never cross a stop condition silently.** If a stop fires (Gmail client breaks, OPFS fails to persist, model fails to load, training doesn't run, adapter won't round-trip, fakes appear, mail would be persisted), stop, cite the exact bullet from product-plan or this plan, show the evidence (command output, file path + lines), and wait for user direction.
4. **Typecheck after every change.** `bun run typecheck` must be clean. Unused imports/locals are failures.
5. **Gmail client regression check.** After any change that could touch auth, Gmail API calls, accounts list, compose, drafts, or tiles, manually (or via a minimal harness) exercise the paths listed in "Do Not Break Gmail Client" and record the result before claiming the change is safe.
6. **No new scope.** Do not introduce peer-to-peer, sync, sharing, cloud backend, hosted accounts, native helper, mobile, extension, new providers, or autonomous `mail.google.com` clicking before Gmail works per the Done definition.
7. **Commits only when asked.** Follow AGENTS.md rules.
8. **If a referenced external pattern is needed:** study the source first (read key files), then copy the minimal viable slice. Do not claim "we'll implement a real one later."

---

## 7. Anti-Patterns (call these out immediately if you see them)

- Treating server Prisma rows as the source of truth for vault/provider/connected/agent state.
- Wiring chat to any `/v1/chat/completions` proxy and calling it "the agent."
- Shipping live mail snippets to a model and calling it "grounding for training."
- Adding UI chrome (chat box, agent settings) before the runtime wrapper + training + verified tools exist.
- Hardcoding `trained: true`, `adapter: "built-in"`, or similar.
- Using `test-` accounts or `demoMode` as evidence for the agent loop.
- Expanding the Prisma schema with new product tables for this feature area.
- "We'll persist mail just for the session" or "just the snippets we need" — forbidden.
- Re-implementing OPFS/SQLite or WebGPU training from scratch without first reading the cited references.

---

## 8. How to Update This Plan

Only the user updates the invariants, phases, or stop conditions. Agents may propose additions as "observed violations" or "missing detector" but must not relax gates.

When the tree changes, the "Current Violations" section should be refreshed by the next agent at the start of work.

---

## 9. Quick Reference — "Done" (copy from product-plan.md)

> Done means this exact local flow works:
> vault unlock -> local Better Auth session -> existing Gmail client still works ->
> real WebGPU model loads -> real AdamW LoRA Gmail adapter trains/equips from
> Gmail API + BetterBox Gmail DOM + `mail.google.com` DOM/action examples -> chat
> routes Gmail request to loaded Gmail agent -> live Gmail search/read -> real
> Gmail draft created -> no email sent.

If any part of that sentence is faked, approximated, or unexercised, it is not Done.

---

**End of BATTLE-PLAN.md. Read product-plan.md next if you have not already.**
