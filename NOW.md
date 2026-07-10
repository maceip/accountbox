# NOW.md — current mission

## Mission

**Put the working loop on screen.** Run the §10 Done sentence live, in a
browser, in front of engineers: vault unlock → local chat → equip Gmail →
prompt → real plan → **Approve** → a real draft appears in Gmail. No sending.

The graveyard lesson (docs/PROJECT.md §9 + the archived resets): iterations
died polishing adjacent things or servicing plans. The countermeasure is a
visible, running loop — not another harness. The offline "dry-run corpus" is
retired as a pre-gate: `trace-recorder` already records every real plan with
its verdict, so the corpus is now the exhaust of real usage.

## Current Slice

- Approve step for write-effect plans: DONE (agent-chat holds any plan
  containing `skill.safeAction.tool`; Approve executes through the same
  fail-closed route, Reject completes the trace as refused). Generic via the
  manifest — no per-cartridge code.
- Run the manual browser gate (docs/PROJECT.md §8) end-to-end with a REAL
  connected Gmail on `bun run dev`. Fix only what breaks on that exact path.
- If plan validity makes the demo embarrassing: retry budget on parse-fail
  first; measure from traces, not a bespoke harness. Deeper fixes
  (constrained decoding, int8 arm) only with numbers in hand.
- Ops: add COOP/COEP (`same-origin` / `credentialless`) to the train
  Caddyfile so the deployed demo runs SQLite storage, then redeploy + smoke.

## Forbidden Work

- No sending mail, ever. `create_draft` remains the only Gmail write.
- No new cartridges, no skill-builder, no Webwright code in product paths
  (research gates G1–G3 live in `experiments/` per docs/PROJECT.md §7b).
- No offline corpus harness, no new planning documents.
- No fake anything: cold plans render cold, rejected plans record rejected.

## Proof Commands

```bash
bun run typecheck && bun run test
bun run check:self-contained && bun run check:engine-boundary && bun run check:cartridge-boundary
bun run prove:two-cartridge && bun run prove:skill-evals
```

Slice gate: a witnessed live run (screen recording or engineer present) of
the full loop ending in a real Gmail draft, plus the exported traces from
that session.

## Stop Conditions

- Gmail client breaks; weights fail to load; adapter can't equip
- the loop needs fake data, target replay, or a fabricated success to demo
- plan validity is so low the demo can't complete after the retry-budget fix
  — stop and report numbers (that verdict re-prioritizes everything)
