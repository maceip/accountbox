# Webwright learnings — what changed our minds, one standalone entry each

**Status:** research + accepted direction shift, written 2026-07-09. Each
entry stands alone: what it is, the evidence, what it demands we change, and
why. Decision-gate experiments at the bottom must run before deep commitment.
Companion docs: `tool-synthesis-research.md` (the literature this confirms),
`two-cartridge-concept.md` (the architecture this slots into).

**Primary sources:**

- Repo: <https://github.com/microsoft/Webwright> (local clone:
  `~/code/webwright`, MSR, ~1.5k LoC, Apr 2026)
- Blog: [Webwright: A Terminal Is All You Need For Web Agents](https://www.microsoft.com/en-us/research/articles/webwright-a-terminal-is-all-you-need-for-web-agents/)
- Project page: <https://microsoft.github.io/Webwright/>

---

## L1 — Code-as-action beats step-by-step action prediction for web agents

**What it is.** Every mainstream web agent (browser-use, Stagehand, ours-as-
imagined) runs a loop: observe page state → predict ONE next action (click,
type, selector) → execute → repeat. Webwright discards the loop: the model
gets a terminal, writes a whole Playwright *program* for the task, runs it,
inspects its own screenshots, and repairs the program until it passes. The
browser is disposable; the program is the product.

**Evidence.** SOTA on two real-website benchmarks at a 100-step budget:
86.7% Online-Mind2Web (300 tasks, GPT-5.4; highest open-source harness) and
60.1% on Odysseys long-horizon (200 tasks) — **+15.6 points over prior SOTA**
and +26.6 over the same model doing screenshot+xy-coordinate prediction.
Same model, different harness — the harness is the gain.

**What it demands.** Any AccountBox plan where a model emits DOM-level or
coordinate-level actions at runtime is dead. App automation is authored as
programs, executed as programs.

**Why.** Programs survive lazy loading, re-renders, and pagination that
one-action-at-a-time prediction trips over; loops/functions collapse
50-step interactions into one artifact; and a program can be re-run,
audited, and diffed — an action stream cannot.

---

## L2 — The durable artifact is the tool script, not the session or the weights

**What it is.** Webwright's `/webwright:craft` mode ends a task by
*parameterizing* the working script: one function named for the task, typed
Google-style `Args:` docstring, an argparse CLI whose defaults reproduce the
original task, side-effect-free at import, screenshots proving each critical
point. That file IS the reusable capability ("search flights" forever, any
dates).

**Evidence.** `skills/webwright/commands/craft.md` +
`reference/cli_tool_mode.md` in the repo define the contract; the Task
Showcase dashboard renders the run artifacts.

**What it demands.** Adopt this as the **cartridge tool format**: a crafted
AccountBox tool = parameterized script + typed arg schema + provenance
evidence (screenshots/trajectory). The `AppSkill.tools[]` entry is generated
from the docstring/schema; the executor runs the frozen script behind the
existing whitelist/dry-run policy gate.

**Why.** It's exactly the shape our manifest layer already wants
(`ToolSpec` + executor + provenance in one file), and it matches our
evidence culture — every tool ships with the proof it worked.

---

## L3 — Strong model crafts once; small model consumes forever

**What it is.** The intelligence split: a frontier-class model does the
one-time exploration/authoring of tools; a small model then completes real
tasks by *selecting and filling* those tools. The expensive model is a
contractor, not a resident.

**Evidence.** Webwright README §Performance: "even **Qwen-3.5-9B** completes
tasks well on Online-Mind2Web sites with 5+ tools available." Independently:
SkillWeaver (<https://arxiv.org/abs/2504.07079>) — APIs synthesized by a
strong agent boost weaker agents up to +54.3%; CodeAct
(<https://arxiv.org/abs/2402.01030>) — live code-writing gains concentrate
in strong models (i.e. don't ask the 3B to write code). Our own
`docs/tool-synthesis-research.md` reached this conclusion from the
literature in July; Webwright is now the maintained reference
implementation with numbers.

**What it demands.** VibeThinker's runtime job is frozen as: pick one tool
from the manifest, fill args, emit one line of JSON, refuse unsupported.
Nothing more ambitious ever runs locally at runtime.

**Why.** It keeps the shipped product 100% local (the frontier model never
runs at daily-use time) and it assigns the 3B the only job it has proven it
can do.

---

## L4 — What we had backwards: app knowledge goes in code, not weights

**What it is.** Our "learn the DOM" future-state idea fine-tuned VibeThinker
on a site's DOM/action structure so the *weights* would know the app. The
inversion: the app knowledge lives in the crafted tool scripts (L2); the
weights never see a DOM. Fine-tuning's only remaining job is **format
discipline** — reliably emitting a schema-valid tool call.

**Evidence (our own repo).** `training/eval-real-mlx.py` runs base
VibeThinker as a control and it **fails the bar**; the tuned adapter passes
— same model, same tasks, so training demonstrably buys output discipline,
not app knowledge (the training data was synthetic prompts, not DOM).
`gate-artifact.json`: even tuned, 4/18 strict-valid under int4 — format is
the bottleneck. VibeThinker is a math-reasoning tune that wants to emit
`<think>` prose; untuned it cannot produce one clean JSON line.

**What it demands.** DOM-derived training data stays PUNTED (already
formalized in PROJECT.md §6 on 2026-07-06). Per-app training stops being the
mechanism that teaches the app. The Done-sentence and product copy already
reflect this ("API-grounded").

**Why.** DOM-in-weights was unproven, brittle (site redesign → retrain), and
the hardest possible job for a 3B. DOM-in-code is regenerable per tool with
zero retraining.

---

## L5 — Fine-tuning probably collapses to ONE generic tool-calling adapter

**What it is.** If tools arrive as clean schemas (L2) and the model only
needs format discipline (L4), that skill is app-agnostic. Train one adapter
on a *mixture* of toolsets and a brand-new cartridge may work zero-shot from
its manifest. Per-app adapters demote to an optional quality boost (domain
phrasing, many-cartridges-equipped disambiguation) — the StarCraft "level-up"
mechanic, not the gate to app #3.

**Evidence.** Not yet proven for us — this is the three-arm experiment
(below). Supporting: Webwright's Qwen-9B-with-tools result used no per-site
tuning at all.

**What it demands.** Run decision gate G1 before building any more per-app
training UX. If green: "crafting" becomes the per-app step; "training"
becomes a factory step that shipped with the product.

**Why.** It removes the most expensive step (per-app fine-tune) from the
add-an-app path, which is the whole scalability question for "any SaaS app."

---

## L6 — A user demonstration replaces the frontier model (the core hypothesis)

**What it is.** Webwright needs a frontier model because it *explores an
unfamiliar site blind*. Our product has the user sitting in their own
logged-in tab, able to demonstrate the task once. `playwright codegen`
records a demonstration into a working Playwright script **deterministically,
zero LLM**. The only remaining LLM step is parameterizing a known-working
script (turn `fill("Aug 15")` into a `date` arg) — a small, mechanically
verifiable transform (re-run, compare screenshots) plausibly within reach of
a local model. Frontier crafting remains only the *no-demo fallback*
(autonomous exploration), and spec'd APIs need no LLM at all
(OpenAPI/Google Discovery → tools mechanically).

**Evidence.** `playwright codegen` is stock Playwright
(<https://playwright.dev/docs/codegen>). Webwright's `local_cdp` browser
mode (`src/webwright/environments/local_browser.py`) proves attach-to-real-
logged-in-browser works. The parameterization-by-local-model claim is
untested — decision gate G3.

**What it demands.** The skill-builder UX is "record a demonstration," not
"wait for an agent to figure your app out." Build the demo→codegen→
parameterize→verify pipeline; run G3 to pick the smallest model that can do
the parameterize step.

**Why.** This is what keeps the product story local-first even at
skill-building time — the frontier model is only ever needed to replace a
missing human demonstration, and our users are the demonstration.

---

## L7 — Runtime "write to app" without a big model: already proven, keep it boring

**What it is.** At daily-use time nothing intelligent authors anything: the
local 3B emits `{tool, args}`, the executor runs a frozen script/API call
behind the whitelist + dry-run + draft-only policy gates.

**Evidence.** Our shipped Gmail path already does this (real `create_draft`
through `src/lib/skills/gmail/execute.server.ts`, no frontier model
anywhere). Webwright's small-model-with-tools result (L3) says the pattern
scales to crafted tools.

**What it demands.** Nothing new — it demands we *don't* add intelligence to
the runtime path. Crafted tools plug into the existing executor registry and
policy layer unchanged; GRPO's verifiable reward gets cleaner ("emitted a
policy-passing tool call" beats bbtriage verdict parsing).

**Why.** Every proven system keeps its job: engine, cartridge contract,
trainer (retargeted at the generic adapter), vault, proof gates. This shift
reuses the whole substrate — that's why it's cheap to adopt.

---

## Constraints (so nobody designs past them)

- **Crafting runs outside the browser** (Python + Playwright = native
  helper): banned scope for the *shipped* product today (PROJECT.md §3).
  Near-term it's a dev-time pipeline for gold cartridges; user-facing needs
  an explicit product decision (opt-in helper or service).
- **Gmail stays API-only.** Autonomous `mail.google.com` clicking is banned;
  crafted browser-driving tools are for apps without a sane API.
- **Frontier crafting = one-time, out-of-band, opt-in.** Never at runtime;
  conflicts with 100%-local only at the skill-build moment, and L6 may
  remove even that.

## Decision gates (run these before committing the roadmap)

- **G1 — three-arm eval:** base VibeThinker vs ONE generic tool-calling
  adapter vs per-app adapter, on the Gmail toolset + one crafted toolset.
  Existing harnesses (`eval-real-mlx.py` pattern). Decides L5.
- **G2 — one real Webwright crafting run** against GitHub (or any SaaS) to
  verify the craft output drops into an `AppSkill` manifest + executor as
  cleanly as L2 claims.
- **G3 — demo-to-tool without frontier:** `playwright codegen` a real task
  in a logged-in tab, parameterize with a LOCAL model, verify by re-run.
  Decides L6; if green, the skill builder runs fully local and Webwright
  becomes the no-demo fallback.
