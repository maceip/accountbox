# The Two-Cartridge Concept

Recovered from the design conversation of Jul 3, 2026 (Codex session, this
machine). This is the canonical write-up; the working mission brief derived
from it lives as `NOW.md` on the `mission/two-cartridge` branch (commit
`300982e`, worktree `~/accountbox-worktrees/two-cartridge`).

## The idea in one line

AccountBox is a console; account skills are cartridges. The first proof ships
**two** built-in cartridges — Gmail and GitHub — because with only one, agents
fossilize Gmail into the architecture and the product becomes a mail app with
a model bolted on.

> Gmail is the first cartridge, not the shape of the console.

Two cartridges is the pressure test: Gmail forces personal/account data and a
safe write (draft), GitHub forces a non-mail source with repo/issue-shaped
tools and stops the core schema from becoming email-shaped.

## Who it's for (product frame)

Not a workbench for AI engineers. The audience is somewhat technical but has
never made their own model — they want to mess around in their browser, and
they may have tried agentic browsers and been frustrated by safety features
blocking things they could train themselves. The frame is:

- "get your accounts to do what you want, running locally on your laptop"
- RPG/loadout UI language for the primary surface: **skill, equip, teach,
  test, source, approval**
- ML machinery (LoRA, eval, adapter manifest, WebGPU) hidden behind
  developer/proof surfaces

First-run journey: unlock local vault → start local model → equip a skill →
connect an account/source → teach/test safely → approve the proposed action.

## The generic cartridge contract

Every skill fits the same minimal shape; Gmail and GitHub implement it, core
workbench state never mentions mail:

| Piece | What it is |
|---|---|
| `SkillDefinition` | name, theme/icon, source type, allowed tools, risk policy |
| `SourceConnection` | auth/account state and capabilities |
| `TrainingSources` | docs, DOM captures, user examples, traces, tool schemas |
| `ToolPlan` | model output format with allowed calls and dry-run metadata |
| `EvalCase` | prompt, expected capability/tool family, unsupported marker |
| `SkillArtifact` | adapter manifest, provenance, eval score, equipped time |

Cartridge-specific code stays behind the cartridge boundary. Banned below the
adapter layer: workbench state named around Gmail, generic UI saying
inbox/mail outside Gmail panes, eval or trace schemas that only understand
email, an auth model that assumes Google OAuth is the product.

## Safety rules per cartridge

- **Gmail (trained, equippable):** read/search tools; the only write is
  `create_draft`; never send; no mail bodies/snippets/subjects or private
  training traces persisted by default.
- **GitHub (second cartridge, untrained at first):** repo/issue/PR read tools;
  the only "write" is a **local proposed draft** — no posting to GitHub until
  approval policy and token storage are proven. Visible but not equippable
  until a real adapter exists.
- Cold or unequipped model fails closed with an explicit cold state. No fake
  trained/equipped/model-loaded state, ever.

## Gold cartridges → skill builder

The expectation is *not* that every new app needs hand-written YAML, tools,
evals, and prompts — that would turn the product into an expert SDK. The
layers:

1. Universal cartridge contract (typed, in AccountBox).
2. **Built-in gold cartridges** — Gmail and GitHub, hand-authored because they
   prove the substrate; they double as gold examples for the synthesizer.
3. **Skill builder** — the real product path for new apps: user points at an
   app/docs/OpenAPI, AccountBox captures DOM/API affordances, user
   demonstrates or describes tasks, system proposes tools/evals/examples,
   user approves in UI.
4. No raw-YAML user workflow; artifacts may serialize as JSON/YAML internally.

## Frozen substrates

The first proof wraps existing runtime work; agents must not rebuild:
WebGPU shader/runtime internals, the LoRA hot-swap engine, model kernels,
docking/layout, generic app-skill synthesis, or a new eval framework. Proven
pieces come from `emberglass`, `edge-thinker`, `qwen-webgpu-lora`. If the
runtime can't be used, stop and report the missing interface — don't replace
it.

## Process rule that came with it

Agents don't get the giant roadmap. Each implementation agent starts from a
one-page `NOW.md` mission brief: current mission, allowed files, forbidden
work, exact proof commands, stop conditions. Historical docs are references,
not the active task list. (This is why the mission branch carries its own
`NOW.md`.)

## Known open questions (from the same conversation)

Two things were explicitly *not* proven yet:

1. Local chat LLM + locally fine-tuned VibeThinker wired together reliably,
   improving over time.
2. Whether arbitrarily fine-tuning VibeThinker on a random app (dumping its
   API + site DOM) actually improves it — claimed by prior agents, never
   observed first-hand.

## Where the work lives

- Branch `mission/two-cartridge` on `maceip/accountbox` — commit `300982e`
  "add two-cartridge skill boundary": skill manifests with trained vs
  needs-training availability, GitHub read/local-draft executor, manifest eval
  harness, proof scripts (`prove:two-cartridge`, `prove:skill-evals`,
  `prove:real-gmail`).
- Worktree `~/accountbox-worktrees/two-cartridge` (holds further uncommitted
  work: OPFS SQLite worker, connections module, more proof scripts).

## Adding a cartridge (the recipe this bought)

As of 2026-07-06 the generic layer is registry-driven and mechanically
guarded (`bun run check:cartridge-boundary`), so a new cartridge is additive.
To add `foo`:

1. `src/lib/skills/foo/skill.ts` — `defineSkill({...})`: tools, byte-locked
   `systemPrompt`, `evalCases`, `safeAction`, `sourceId: "foo"`,
   `availability: "needs-training"` (flip to `"trained"` + set `adapterUrl`
   once a real adapter ships). Optional `training: { datasetUrl, heldoutUrl }`.
2. `src/lib/skills/foo/execute.server.ts` — a `SkillExecutor`; register it in
   `executor.server.ts`.
3. Register the manifest in `src/lib/skills/index.ts` (`SKILLS`) and its
   source in `src/lib/sources/index.ts` (`SOURCES`, with a `connection` if it
   needs OAuth — add the provider to Better Auth + a `linkFoo()`).
4. Assets when trained: `public/adapters/foo/` + `public/datasets/foo/`.
5. GRPO only: supply a `GrpoTaskSpec` (verifiable reward) in code — rewards
   are functions, not manifest data. See `BBTRIAGE_GRPO_TASK` in
   `src/lib/agents/rewards.ts`.

What you do NOT touch: the runtime (`createAgentRuntime` is skill-driven),
the concierge (`skill_plan(skillId, task)` is generic), the workbench
(command center, loadout, skills page, connected-sources, eval range all
read `SKILLS`/`SOURCES`), or preload (picks the first trained skill). The
cartridge appears in the loadout, equips, plans, and evals from its manifest.
The one still-manual product surface: a brand-new OAuth provider needs Better
Auth wiring (no drop-in for arbitrary providers).
