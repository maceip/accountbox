# Research: what happens when a vault "account" meets a second tab / browser / device

**Status:** research only — nothing here is implemented or scheduled. Written 2026-07-02.
**Question:** a user creates an "account" (vault) on the first visit. What do they experience — and what should we do — when they open the app in (1) another tab, (2) another browser on the same machine, (3) another device?

---

## 1. What an "account" physically is today

| Piece | Where it lives | Scope |
|---|---|---|
| Vault envelope (encrypted) | OPFS (`src/lib/vault/opfs-store.ts` → `navigator.storage.getDirectory()`) | per **browser profile**, per origin |
| Vault keys (unlocked state) | JS memory (`src/lib/vault/store.ts`), dropped on `pagehide` | per **tab** |
| Better Auth identity | minted at vault-create, pinned in `localStorage` `bm.vault-identity` (`src/lib/vault/constants.ts`) | per **browser profile** |
| Server session | Better Auth cookie + row in server SQLite | per browser profile (cookie jar) |
| Gmail OAuth tokens | server-side, encrypted, keyed to the Better Auth user | follows the **identity**, not the browser |
| Settings, tiles layout, agent traces | `localStorage` (`bm.settings`, `bm.tiles-layout`, `bm.agent-traces`, …) | per browser profile |
| Model weights (6 GB) | HTTP cache; re-quantized to int4 in GPU memory on every load | per browser profile |
| LoRA adapter | fetched from `/adapters/*` each equip | per tab/engine instance |

Nothing above syncs anywhere. That is the design (local-first, zero-knowledge), not an accident — but the user's mental model of the word "account" is "follows me." That mismatch is the whole problem.

## 2. Observed behavior per scenario (current code)

### 2a. Second tab, same browser
- OPFS envelope + localStorage identity + session cookie are **shared** → the tab shows the **Unlock** form (keys are per-tab memory and `pagehide` locks them). Works, modest friction.
- **HAZARD (real, today):** each tab that opens the chat builds its **own WebGPU engine** — two tabs = two 3B int4 models in GPU memory (~2× 1.7 GB+). On an 8 GB GPU this risks device-lost/OOM for both tabs. Nothing coordinates tabs.
- Minor: two unlocked tabs can both write OPFS/localStorage; no `navigator.locks` discipline yet. Envelope writes are rare (create/rotate), so low risk today, grows with more OPFS records.

### 2b. Different browser, same machine (or incognito)
- OPFS and localStorage are empty → user sees **SetupForm** and silently creates a **second, unrelated vault + server identity** (per-browser identity was required to fix the shared-deployment collision — before that, the second browser got a hard 400).
- Their Gmail connections don't appear (tokens hang off identity #1). Settings/layout gone. Nothing tells them why. **This is the worst UX of the three** — it looks like data loss, and nothing explains it.

### 2c. Different device
- Identical to 2b, plus a fresh 6 GB weight download.

## 3. The design tension

- The product thesis (BATTLE-PLAN invariants): product records live **browser-side**; server routes are stateless helpers; no plaintext secrets server-side; mail never persisted.
- The user expectation: "account" = portable.
- Any portability mechanism must therefore move **only ciphertext** (or use platform sync a la passkeys) and never give the server key material. That's a solved class of problem (password managers), so we get to choose a point on the spectrum rather than invent crypto.

## 4. Options

### Option A — Own the locality (baseline, ~day)
Keep everything as-is; fix the *communication*:
- Setup form copy: "This creates a vault **in this browser**. Your vault does not follow you to other browsers or devices (yet)."
- If a session cookie exists but OPFS has no envelope (classic 2b symptom when cookies survive but storage was for another profile — or after Clear-Site-Data), show "This browser has no vault. If you created one elsewhere, open it there or import it."
- Pros: zero crypto risk, zero server change, kills the "silent second account" confusion. Cons: doesn't give portability.
- **Do this regardless of which bigger option is chosen.**

### Option B — Encrypted vault export / import (KeePass model, ~days)
- Export = the OPFS envelope (already ciphertext under the master password KDF) + the `bm.vault-identity` string, packaged as a file or QR.
- Import on the new browser/device → write envelope to OPFS, pin identity, then normal Unlock. Gmail connections **follow automatically** because the identity is the same Better Auth user (tokens are keyed to it server-side).
- Pros: true zero-knowledge portability; no new server surface; offline-friendly. Cons: manual; users lose files; no ongoing sync (divergence after import).
- Note: the identity's auth password is derived from the master password, so import+unlock re-establishes the server session with nothing sensitive in the export beyond what the envelope already is (ciphertext + KDF params). Verify KDF params travel with the envelope (they do — they're in the envelope struct).

### Option C — Zero-knowledge envelope sync (Bitwarden model, ~weeks)
- Server stores the **encrypted** envelope blob keyed by identity; new device: identify → fetch blob → unlock locally with master password.
- Requires a *user-memorable* identity (email they actually own, or username) instead of the minted `vault-…@vault.localhost` — that's an onboarding change, and account enumeration / rate limiting become real concerns.
- Pros: the "account" finally behaves like an account; sync of future OPFS records (agent state, adapters refs) can ride the same channel. Cons: crosses the "server holds product records" line (even though ciphertext) — per BATTLE-PLAN this is a **deliberate product decision the user must make**, not a refactor; adds recovery-story pressure (lost master password now looks like "the cloud lost my account").

### Option D — Passkey + PRF unlock, platform-synced (modern, ~weeks, pairs with B or C)
- WebAuthn passkey with the **PRF extension** derives a stable secret that wraps the vault key. Passkeys sync across the user's devices via iCloud Keychain / Google Password Manager — the *platform* does the cross-device transport, we never see key material.
- New device: passkey ceremony → PRF secret → unwrap vault key → (with C) pull ciphertext envelope, or (with B-lite) envelope still needs one manual import.
- Pros: no master-password typing on every device; phishing-resistant; the identity problem from C partially dissolves (passkey = identity). Cons: PRF support is good on Chrome/Safari but not universal; Better Auth passkey plugin + PRF plumbing is real work; still need a fallback (master password) for non-passkey contexts.

### Multi-tab engine coordination (orthogonal, cheap, worth doing early)
- Use `navigator.locks` (Web Locks API): one tab holds the `agent-engine` lock and runs the model; other tabs either show "agent active in another tab" or proxy prompts via `BroadcastChannel` to the owning tab.
- Alternative (bigger): move the engine into a SharedWorker so all tabs share one model instance — WebGPU-in-worker support needs verification per target browser before betting on it.
- Without this, two chat-open tabs can OOM the GPU today (2a hazard).

## 5. Recommendation (when this is picked up)

1. **Now-ish:** Option A copy fixes + `navigator.locks` single-engine guard (small, kills the two worst surprises: silent second vault, two-tab GPU OOM).
2. **Next:** Option B export/import — cheapest real portability, no invariant crossed, Gmail connections follow via the shared identity.
3. **Later, as a product decision:** revisit C (ciphertext sync) and D (passkey+PRF) together — D is the better long-term unlock UX, C is the better data-portability story; they compose.

## 6. Open questions to resolve before implementing

- Does the envelope include everything a new browser needs (KDF params, salt, identity), or does import also need selected `bm.*` keys (settings are cosmetic; `bm.vault-identity` is required)?
- Session semantics on shared machines: should Unlock in a *new* browser invalidate other sessions (Better Auth revocation) or coexist?
- Weight caching: OPFS-persist the already-quantized int4 blob so a second device's first load is minutes → seconds after download, and reloads are instant (separate from portability, same "new context" pain).
- If C is ever chosen: rate limiting + enumeration defenses on the envelope-fetch endpoint; what "delete my account" means server-side.
