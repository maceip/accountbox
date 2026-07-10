# NOW.md — current mission

Previous mission (generic two-cartridge boundary) is DONE — landed in
`017c45c` (generic layer wired end-to-end, `check:cartridge-boundary` in CI).
The campaign map for everything after this slice is `docs/PROJECT.md` §7b.

## Mission

**Phase 1 — close the Gmail loop: the dry-run corpus gate.** Build the
harness that drives the real equipped Gmail planner (real WebGPU browser,
real adapter) over a prompt set and appends every parse+policy-valid plan to
a browser-local "would-execute" corpus. Use the corpus numbers to fix plan
validity (currently 4/18 strict under int4). Credentials are LAST: no real
Gmail token until the corpus proves the outputs are worth executing.

## Current Slice

- Corpus harness: drive the concierge/planner loop in a real WebGPU Chrome
  (isolated server pattern, `scripts/run-e2e-isolated.mjs`); record
  `{prompt, plan JSON, validation verdict, model id, adapter id}` to
  OPFS/export — browser-local only, never a server.
- Target: 10–100 `create_draft`-class valid plans, high pass rate, zero
  `__cold` entries in the final corpus run.
- Plan-validity work, measured on the corpus: try in order (1) retry budget
  on parse-fail, (2) constrained/grammar decoding at the sampler, (3) int8
  arm to isolate quantization cost. Adopt what the numbers justify; each
  arm's numbers get committed with the harness.
- Ops sub-item: add `Cross-Origin-Opener-Policy: same-origin` +
  `Cross-Origin-Embedder-Policy: credentialless` to the train Caddyfile so
  deployed storage runs SQLite instead of the loud JSON fallback; verify
  with a deployed `prove:opfs-sqlite`-style check.

## Allowed Files For This Slice

- `scripts/` (new corpus harness + isolated-server wiring)
- `test/` (corpus gate)
- `src/lib/runtime/plan-parse.ts`, `src/lib/runtime/agent-runtime.ts`
  (decode/retry/validation changes only)
- `src/engine/qwgpu/` sampler files ONLY if constrained decoding requires it
  (then `bun run kernels:check` + mirror rules apply)
- `src/lib/agent/trace-recorder.ts` / OPFS corpus writer
- docs updated in the same commit as reality changes

## Forbidden Work

- No real Gmail tokens, no sending, no `create_draft` execution against a
  real mailbox in this slice — the corpus is would-execute only.
- No new cartridges, no skill-builder work, no Webwright code in product
  paths (research gates G1–G3 run in `experiments/` per §7b).
- No storage/auth moves (the `mission/two-cartridge` remainder is a queued
  user decision).
- No fake corpus entries: every row comes from real weight-driven inference;
  `__cold` rows are recorded as failures, never dropped silently.

## Proof Commands

```bash
bun run typecheck && bun run test
bun run check:self-contained && bun run check:engine-boundary && bun run check:cartridge-boundary
bun run prove:two-cartridge && bun run prove:skill-evals
# the slice gate itself (real WebGPU browser):
#   corpus harness run -> committed corpus artifact + pass-rate report
```

## Done Definition (this slice)

A committed corpus artifact from a real-browser run: >=10 `create_draft`-
class plans, pass rate reported honestly, zero `__cold` in the final run,
plus the decode-fix numbers (before/after) that got it there. Then STOP and
present to the user for the real-token decision.

## Stop Conditions

- Gmail client breaks; weights fail to load; adapter can't equip
- pass rate cannot be raised above ~50% after all three decode arms — stop
  and report with numbers (that verdict changes Phase 2/3 priorities)
- anything would require a real token, fake data, or target replay
