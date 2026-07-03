# AGENT-A-AGENT-B-TASKS.md (executable)

**Canonical repo (run everything here):** `~/accountbox-reset-v4` — the only complete checkout, git `main`, remote `accountbox`. The other checkouts (`~/reset-accountbox`, `~/reset-accountbox-v2`, `~/accountbox-reset-B3`, `~/accountbox-reset-v3`) are stale; do NOT edit them. `~/accountbox` holds only the spec/docs and has no `src/`.

**Toolchain:** `bun` (scripts use `bun run`), TypeScript via `tsc --noEmit`, Vite dev server. Run once before starting:

```bash
cd ~/accountbox-reset-v4 && bun install >/dev/null 2>&1; bun run typecheck
```

**Purpose:** Land the Gmail agent runtime integration per `gmail_agent_runtime_integration_spec.md` (spec §). Most of it is already implemented in this checkout — the tasks below are scoped to what REMAINS, are non-destructive (never re-create an existing file), and every exit command runs as written from the repo root.

**Prime directive (from `we_failed_again.md`):** never let target-replay pass as inference. Cold/parse/validation failures must be VISIBLE and make eval FAIL — never a silent plausible plan.

---

## 0. Current state (verified in this checkout — do NOT redo)

| Item                                                                                                                               | File                                                                                        | Status                                      |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Runtime module + status machine + contract (`GmailAgentRuntime`, `AgentStatus`, `AdapterSource`, `SFTExample`, `FileLike`, `Plan`) | `src/lib/runtime/gmail-agent-runtime.ts`                                                    | DONE (A1)                                   |
| `FIXED_SYSTEM_PROMPT` exported                                                                                                     | same, `:35`                                                                                 | DONE                                        |
| `loadBaseModel` via `createEmberglassEngine`                                                                                       | same, `:115`                                                                                | DONE (A2)                                   |
| `equipAdapter` (recreate-engine-with-LoRA / `loadLoraAdapterGPU`)                                                                  | same, `:197`                                                                                | DONE (A3) — needs real-adapter verification |
| `generate(): Promise<Plan>` (system+user, temp 0, JSON.parse)                                                                      | same, `:247`                                                                                | DONE (A4) — **cold path not fail-closed**   |
| `trainGmailAdapter`                                                                                                                | same, `:146`                                                                                | STUB (in-browser training out of scope)     |
| `getAgentStatus` / `subscribeAgentStatus` / `disposeRuntime`                                                                       | same                                                                                        | DONE                                        |
| local-chat consumes new runtime, treats result as `Plan`                                                                           | `src/components/chat/local-chat.tsx:62`                                                     | DONE (B1)                                   |
| Legacy target-replay to excise                                                                                                     | `src/lib/runtime/accountbox-runtime.ts` (`planForPrompt`/`SYNTH_TARGETS` `:41`,`:75`,`:79`) | REMAINING (B1b)                             |
| `executeTool`                                                                                                                      | `src/lib/agent/real-gmail-tools.ts:11`                                                      | DONE                                        |
| `executePlan`                                                                                                                      | same                                                                                        | **MISSING (B2)**                            |
| eval scripts                                                                                                                       | `training/eval-{plans,gmail-agent}.ts`, `training/plan-grader.ts`                           | REMAINING (B4) — still replay-based         |

**Contract note (supersedes the old "non-dependency" claim):** the shared contract already lives, implemented, in `gmail-agent-runtime.ts`. B imports its exported types/functions; that is the coordination surface. The only hand-authored duplication that can drift is `FIXED_SYSTEM_PROMPT` (runtime) vs `SYSTEM` (data prep) — locked by B3.

---

## 1. AGENT A — runtime correctness (engine + generate)

A owns only `src/lib/runtime/gmail-agent-runtime.ts` + the emberglass bridge. A never edits UI/data/tools.

### A-COLD: make the cold / failure paths fail-closed (REQUIRED — highest priority)

Today `generate` returns a plausible `{tool:'search_messages', …}` on cold start, bad JSON, and invalid tool (`:253`,`:272`,`:284`,`:291`). Replace every such silent fallback so callers/eval can tell weight-driven output from a non-answer:

- Add `export function isEquippedForRealInference(): boolean` (true only when `engine` present AND `status.state === 'equipped'`).
- On not-equipped / parse-fail / invalid-tool: set status `error` + `lastError`, log `[gmail-agent-runtime] ERROR <why>`, and return a tagged sentinel:
  `return { tool: 'search_messages', args: { query: 'is:unread' }, __cold: true } as unknown as Plan;`
  (add `__cold?: true` to the local `Plan`/`SingleToolPlan` alias). Do NOT throw — chat stays alive — but the tag must be present.
- Real, validated path must never carry `__cold`.

**Exit (runs as written):**

```bash
cd ~/accountbox-reset-v4
rg -n "__cold|isEquippedForRealInference" src/lib/runtime/gmail-agent-runtime.ts
rg -n "planForPrompt|gmail-synthetic-prompts" src/lib/runtime/gmail-agent-runtime.ts   # expect no non-comment hits
bun run typecheck
```

### A-EQUIP: verify real LoRA equip end-to-end (no code change if it already works)

`equipAdapter` recreates the engine with the adapter and/or calls `loadLoraAdapterGPU` directly (correct — the engine object exposes only `{label,chatComplete,dispose}`, so `session.rt` cannot be reached post-hoc). Confirm the three `AdapterSource` kinds resolve to `FileLike[]` and that a real bbverifier adapter loads.

**Exit:**

```bash
cd ~/accountbox-reset-v4
rg -n "createEmberglassEngine|loadLoraAdapterGPU|AdapterSource|fetchAdapterFiles" src/lib/runtime/gmail-agent-runtime.ts
# stage a real adapter dir (safetensors + adapter_config.json) from ~/bbverifier, then in the dev server call
# equipAdapter({type:'local-path', path:'<dir>'}) and confirm status -> 'equipped'
bun run typecheck
```

### A-AUDIT: mechanical no-proxy audit (fixed command)

```bash
cd ~/accountbox-reset-v4
test "$(rg -c 'createEmberglassEngine' src/lib/runtime/gmail-agent-runtime.ts)" -ge 1 && echo engine-ok
rg -n 'planForPrompt|SYNTH_TARGETS|gmail-synthetic-prompts' src/lib/runtime/gmail-agent-runtime.ts && echo "FAIL: proxy ref in runtime" || echo "no-proxy-ok"
rg -n 'FIXED_SYSTEM_PROMPT|chatComplete|temperature: 0' src/lib/runtime/gmail-agent-runtime.ts
bun run typecheck && echo "A-AUDIT ok"
```

---

## 2. AGENT B — tools, data, eval, storage (never touches emberglass)

### B1b: finish excising the legacy runtime

`local-chat.tsx` already uses the new runtime. Remove the dead `accountbox-runtime.ts` replay path (or delete the file) and confirm nothing imports it.

```bash
cd ~/accountbox-reset-v4
rg -n "accountbox-runtime" src/ ; echo "^ must be empty"
bun run typecheck
```

### B2: add `executePlan` to `src/lib/agent/real-gmail-tools.ts` (MISSING today)

Keep `executeTool`. Add:

```ts
export async function executePlan(plan: Plan, accessToken?: string) {
  if ((plan as any).__cold)
    throw new Error("refusing to execute cold/non-inference plan");
  if ("steps" in plan) {
    const out = [];
    for (const s of plan.steps)
      out.push(await executeTool(s.tool, s.args, accessToken));
    return out;
  }
  return [await executeTool(plan.tool, plan.args, accessToken)];
}
```

Import `Plan` from `@/lib/runtime/gmail-agent-runtime`. Preserve the existing "no token → descriptive throw" behavior.

```bash
cd ~/accountbox-reset-v4
rg -n "export async function executePlan|__cold" src/lib/agent/real-gmail-tools.ts
bun run typecheck
```

### B3: lock `FIXED_SYSTEM_PROMPT` byte-identity (runtime ↔ data prep)

Make `training/generate-gmail-dataset.ts` import `FIXED_SYSTEM_PROMPT` from the runtime (preferred) or add a diff test. Assistant content must be exactly `JSON.stringify({tool,args})` / `JSON.stringify({steps})`.

```bash
cd ~/accountbox-reset-v4
bun run training/generate-gmail-dataset.ts
bun -e 'import {FIXED_SYSTEM_PROMPT} from "./src/lib/runtime/gmail-agent-runtime.ts"; import {readFileSync} from "fs"; const row=JSON.parse(readFileSync("training/gmail-agent-train.jsonl","utf8").split("\n")[0]); const sys=row.messages.find(m=>m.role==="system").content; if(sys!==FIXED_SYSTEM_PROMPT) throw new Error("SYSTEM prompt drift"); console.log("B3 prompt byte-match OK")'
```

### B4: eval scripts use real generate + FAIL on cold (checklist item 6)

`training/eval-plans.ts` / `eval-gmail-agent.ts`: when a real adapter is present, `await loadBaseModel(); await equipAdapter(...); const plan = await generate(prompt);`. If any returned plan has `__cold` (or `!isEquippedForRealInference()`), print `COLD — FAIL` and exit non-zero. Only print `REAL ENGINE` when weight-driven. Scorer accepts `Plan` object.

```bash
cd ~/accountbox-reset-v4
bun run training/eval-plans.ts; echo "exit=$?"   # with no adapter: must say COLD and exit!=0
# with a real adapter present: must say REAL ENGINE
bun run typecheck
```

### B5: adapter storage (OPFS + local) — enables `equipAdapter({type:'files'|'local-path'})`

Add `src/lib/runtime/adapter-store.ts`: `saveAdapter(name, files)`, `loadAdapterFiles(name)`, `listAdapters()` over the existing `src/lib/db/opfs.ts` primitives. Plus a dev `scripts/copy-adapter.ts` that ingests a `~/bbverifier` adapter dir.

```bash
cd ~/accountbox-reset-v4
rg -n "saveAdapter|loadAdapterFiles|listAdapters" src/lib/runtime/adapter-store.ts
bun run typecheck
```

### B8: cross-verify harness

`training/cross-verify-runtime.ts` imports only public surface; runs the checks below; loads a real adapter if present and asserts every returned plan is a valid `Plan` with allowed tools and **no `__cold`**; diffs the SYSTEM prompt; prints `PASS`/`FAIL` + non-zero on fail.

```bash
cd ~/accountbox-reset-v4
bun run training/cross-verify-runtime.ts; echo "exit=$?"
```

---

## 3. Verification checklist (spec §11 — corrected, runnable from repo root)

```bash
cd ~/accountbox-reset-v4
bun run typecheck                                                              # 3
rg -n "createEmberglassEngine|loadLoraAdapterGPU" src/lib/runtime/gmail-agent-runtime.ts   # 1
rg -n "planForPrompt|gmail-synthetic-prompts" src/lib/runtime/gmail-agent-runtime.ts       # 2: no non-comment hits
rg -n "__cold" src/lib/runtime/gmail-agent-runtime.ts src/lib/agent/real-gmail-tools.ts    # fail-closed present
bun run training/cross-verify-runtime.ts                                       # 4,5,6 (needs real adapter for weight checks)
```

## 4. The one gate that actually matters (manual, sequential — the "hail mary")

WebGPU forward passes cannot run headless. In a browser dev session:

```bash
cd ~/accountbox-reset-v4 && bun run dev   # http://localhost:3000
```

Then: `loadBaseModel()` (real VibeThinker-3B load) → `equipAdapter({type:'local-path', path:'<bbverifier adapter>'})` → send the 18 prompts from `training/gmail-synthetic-prompts.json` → confirm each `generate()` result is a real `Plan` (no `__cold`), tool names in {search_messages,read_message,create_draft}, and observably different from base. Only this proves inference; everything above only proves it's wired to fail loudly if it isn't.

---

End — executable against `~/accountbox-reset-v4`.
