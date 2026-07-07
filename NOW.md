# NOW.md — current mission

## Mission

Implement the generic two-cartridge AccountBox path with Gmail and GitHub as
the built-in reference cartridges.

User-facing product frame: equip local account skills, not an AI engineering
workbench. Gmail and GitHub are cartridges in the same console; Gmail is the
first trained/equippable skill, GitHub is the second cartridge with read tools
and local draft-only safe action until real training produces an adapter.

## Current Slice

- Keep the existing Gmail client working.
- Keep Gmail as the only trained LoRA skill until a real GitHub adapter exists.
- Add GitHub to the same manifest/source/executor boundary without posting to
  GitHub.
- Make untrained cartridges visible but not equippable.
- Add manifest-level eval checks for supported and unsupported prompts.
- Lock this with tests before widening scope.

## Known Honesty Gaps

- `src/lib/db/opfs.ts` is an OPFS JSON document store, not OPFS SQLite. Treat it
  as a temporary browser-owned storage shim until the real OPFS SQLite layer is
  implemented and reload-proven.

## Allowed Files For This Slice

- `src/lib/runtime/app-skill.ts`
- `src/lib/skills/**`
- `src/lib/sources/**`
- `src/components/workbench/**`
- `src/components/journey/**`
- `src/components/agent/agent-chat.tsx`
- focused tests near the files above

## Forbidden Work

- Do not write WebGPU shader/runtime internals.
- Do not add a second model runtime.
- Do not add a docking/layout library.
- Do not fake model load, training, equip, eval, OPFS, Gmail data, or draft
  creation.
- Do not post to GitHub. GitHub's first safe action is a local proposed draft
  only.
- Do not persist mail bodies, snippets, subjects, grounded prompts, or private
  training traces by default.
- Do not create generic DOM/API app synthesis yet.

## Proof Commands

Run before claiming this slice:

```bash
bun test
bun run typecheck
bun run prove:two-cartridge
bun run prove:skill-evals
bun run prove:real-gmail
```

Then run the detector bundle:

```bash
rg -n "VaultEnvelope|ProviderConfig|ConnectedAccount|gmail_target|gmail_agent_state|adapter_ref|model_config" prisma/schema.prisma src/routes/api/vault.ts src/lib/connections/ 2>/dev/null || true
rg -n "127\\.0\\.0\\.1:8000|openai.*completions|ds4-server|buildGmailGrounding" src/routes/api/chat.ts src/lib/agent/ 2>/dev/null || true
rg -n "snippet|bodyHtml|body\\.(html|text)|persistMail|saveMessage" --glob '!src/lib/gmail/api.server.ts' 2>/dev/null | head -20 || true
rg -n "isTrained|trained.*true|adapterLoaded|hardcoded|mock.*(model|agent|train)" -i 2>/dev/null || true
```

## Done Definition

The full product is not done until:

> vault unlock -> local Better Auth session -> existing Gmail client still works
> -> real WebGPU model loads -> real LoRA Gmail adapter trains/equips from
> Gmail-API-grounded examples (DOM sources punted 2026-07-06) -> chat routes
> Gmail request to loaded Gmail agent -> live Gmail search/read -> real Gmail
> draft created -> no email sent.

This slice is only the two-cartridge boundary toward that path.

## Stop Conditions

Stop and report if:

- existing Gmail client breaks
- OPFS persistence fails across reload
- any fake trained/equipped/model-loaded state appears
- any private mail content is persisted by default
- GitHub implementation requires posting to GitHub
- WebGPU/LoRA/AdamW training would need to be reimplemented instead of wrapped
