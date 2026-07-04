# For July — after the DialKit / train deploy push

**Written:** 2026-07-04  
**Assumption:** The major task is done — DialKit on train, deploy fixed, Playwright checks on deploy, dial tuners wired, fork merged.

Live train as of last deploy: `https://train.public.computer` @ commit `91de1ac` (DialKit on, manifest clean).

---

## What’s good

- **The site loads.** Playwright opens it on every train deploy; no React crash screen in tests.
- **DialKit is on train only.** Open `?dialkit=1` (or flip it on once in localStorage). Agent notes, tag element, save note, copy for agent — all work in the browser.
- **Dial sliders change real layout.** Sidebar width, inbox tile min width, density, etc. Tuner harness drags “Sidebar Width” and sees 256px → 448px.
- **Deploy from this server is one command:** `bash scripts/deploy-train-dev.sh` — local rsync, restart, smokes, note harness, tuner harness, screenshots (after commit `58f3734` is deployed).
- **Customer builds stay clean.** `deploy.sh` refuses DialKit in the artifact and runs production smoke.
- **Vault export/import exists.** Workspace file moves vault + identity; Gmail connections follow the same identity on the server.

---

## What’s not good (real problems left)

### 1. Opening the app in a second browser looks like data loss

Chrome vs Firefox vs incognito each get an empty vault and a **new** server identity. Gmail links from the first browser don’t show up. The app doesn’t explain why. This is the worst remaining UX bug (`docs/account-portability-research.md` §2b).

**Fix:** Copy on setup screen is partly there; still need import prompt when cookies exist but OPFS is empty, and maybe block silent second-account creation.

### 2. DialKit notes and dial values don’t follow you

Saved notes and slider positions live in **this browser’s localStorage** only. New device or cleared site data = gone. Fine for solo dev on one machine; not fine for “I had an idea on my phone.”

**Fix (pick one later):** export notes in agent report (manual today), or sync ciphertext envelope server-side, or PAKE pair from phone — your call.

### 3. Stale JavaScript after deploy

Assets are cached ~1 year (`immutable`). After a bad deploy, users can keep an old bundle until hard refresh — you hit React error #185 that way.

**Fix:** `Cache-Control: no-store` (or short max-age) on `index.html` only; keep long cache on hashed `/assets/*`.

### 4. Two tabs can both try to load the model

Engine slot lock helps **one tab at a time**, but two unlocked tabs can still stress GPU memory. Risk of OOM / WebGPU device lost on smaller GPUs.

**Fix:** Web Locks + honest “agent running in another tab” (partially there for cross-tab; tighten same-tab behavior).

### 5. Deploy proof runs in a GPU-less headless browser

Playwright on the train **server** uses headless Chromium. That environment has **no WebGPU adapter**. Deploy screenshots will show *“the local agent won’t run on this device (WebGPU unavailable)”* — that is **the test runner**, not a verdict on your laptop or phone.

**Your machine:** If Chrome has WebGPU and enough VRAM, the agent should load after the journey (you saw model download start). The server screenshot is not proof that the product is broken globally.

### 6. Journey gate still blocks the full mail board

Fresh vault → three steps (chat model, skill equip, connect account) before the workbench. Intentional. Grandfathered users with linked Gmail skip it.

### 7. Heavy E2E not on deploy path

`test/run_e2e_deployed.mjs` streams real models over the network (~25 min). Deploy uses faster smokes + harnesses. Full journey proof is a separate manual/CI job.

---

## Fix next (suggested order)

1. **HTML cache policy** — stop stale-bundle surprises after deploy.  
2. **Second-browser UX** — detect empty OPFS + explain import; reduce silent duplicate vaults.  
3. **Tab / GPU coordination** — one model instance policy, clear messaging.  
4. **Redeploy once** — pick up screenshot-on-deploy script (`58f3734`); live is still `91de1ac`.  
5. **Portability** — export/import polish; then whatever you choose for multi-device (passkeys, PAKE, encrypted sync).

---

## Planned later (you described Jul 4 — not started)

- **Phone app** as the passkey / unlock provider for the website (iOS Authentication Services, Android Credential Manager).  
- **PAKE pairing** so new devices share vault keys without the server holding plaintext keys.  
- At least **one skill adapter** (Gmail) equipped; connect at least **one mail account** for the workbench to be useful.

See `docs/account-portability-research.md` for export/import vs passkey vs server ciphertext options.

---

## Wrap-up

Major task: **done enough to use train for layout feedback and agent notes.**

Don’t read headless-server WebGPU warnings as “the app can’t run agents.” Read them as “automated screenshots run on a machine with no GPU.”

If something on **your** browser still shows “Something went wrong,” hard-refresh or clear site data once after a deploy — that’s the cache issue in §3.
