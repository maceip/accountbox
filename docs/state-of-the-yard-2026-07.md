# State of the yard — training UIs, browser agents, and the opening (2026-07-07)

**Status: discussion record, not a plan.** Nothing in here is scoped work.
Anything that graduates gets pulled into `docs/PROJECT.md` explicitly by the user.
The do-not-add-scope list in `docs/PROJECT.md` §3 wins every conflict with this
document. Written down so the thinking survives; the anxiety this session was
explicit about — scope creep and cascading failures before anyone uses the
product — is a constraint of this doc, not a footnote to it.

## Why this exists

A survey session (2026-07-07) reviewed the repos in `docs/experiments.md` (shallow
clones live in `experiments/`, gitignored, read-only study material). The
question behind the list: **what is the state of the art in human UI for
fine-tuning text-to-text models, and where does AccountBox sit relative to
it?** Secondary threads: browser-resident agents, dataset/labeling tooling,
and whether our training approach is sound.

## The survey

| Repo | What it is | Verdict |
| --- | --- | --- |
| `unslothai/unsloth` (Studio) | The most advanced open train/run/export UI. Python/FastAPI + llama.cpp backend, React front, Tauri shell. Mac: MLX training + GGUF inference. | Most relevant of the set. Use as an **offline adapter-baking tool** at most; never a dependency (studio tree is **AGPL-3.0**; core kernels Apache-2.0). |
| Unsloth **Data Recipes** | Graph-node synthetic dataset builder over **NVIDIA NeMo Data Designer**. Seed → LLM blocks (Text/Structured/Code/**Judge**) → jinja Expressions → **Validators** (drop failing rows) → Samplers. Validate → preview → full run. | The single most useful design study. Same core discipline we already mandate (validation-filtered synthetic data). Steal two mechanics (see principles 4). |
| `alibaba/page-agent` | In-page GUI agent, client-side DOM extraction, human-in-the-loop panel, browser-use lineage. User has a year-old fork that was ~60 commits ahead. | Closest architectural cousin. Not a competitor. Relevant as the "presence" model (principle 6) and as revisit-material for the punted DOM-sources decision (2026-07-06). |
| `web-infra-dev/midscene` | Vision-driven UI automation (screenshot-only, hosted VLMs), rebranding from browser agent to automation platform. | Mostly no. Product use collides with the `mail.google.com` automation ban; gate use would inject soft vision assertions into fail-closed proofs. Prior art for gate-report UX only. |
| `bytedance/flowgram.ai`, `bytedance/flow-builder` | Workflow-canvas frameworks. | Not for us. Node canvases earn their keep where the artifact is judgeable by eye each iteration (diffusion). Our judgeable artifact is the plan JSON (principle 3). Never as dependencies — this repo already rejected two layout libraries. |
| `bytedance/Lance` | 3B unified multimodal research model, CUDA/40GB VRAM. | Irrelevant to any milestone ("late-night bad decision" — user). Morale evidence that 3B is a serious size. |
| `google-research/kauldron` | JAX research training harness. | Wrong stack layer. One habit worth keeping: full config/provenance on every trained artifact (we largely have this via adapter manifests). |

Two repos from the conversation remain unidentified (user to supply links):
a labeling-UI product ("better-something") and a browser agent with a strange
name. Clone into `experiments/` when named.

## The market conclusion

**There is no good GUI for text-to-text fine-tuning because the audience does
not exist yet.** Training is too hard, models too big, runs too slow; even
Unsloth's own demos click past the training screens. This is not a warning —
it is the opening. Being early is fine. The leapfrog (the copper-wire/5G
analogy from the session) is not a better training UI; it is **skipping the
training-workbench product generation entirely** and shipping skill loops
where data prep, training, and eval are internal organs.

## Design principles to get right the first time

1. **Training is an organ, not a surface.** The customer path is "equip a
   skill / make it better," expressed in chat (`trainer_train`), reported as
   an eval delta. The Agents Lab trainer panel stays a dev/owner surface.
   Never ship a model picker, dataset picker, or hyperparameter form to a
   customer.

2. **The labeling category dies; capture the labor as exhaust (turbocharger
   loop).** The labor that produced the Gmail dataset (author prompts,
   generate plans, validate, curate) is conserved — every new cartridge needs
   it. Normal product use emits the same artifacts at three choke points:
   - *Executed unchanged*: a human-approved (prompt → plan) pair — SFT-grade.
     The trace recorder already captures the plan; the delta is one
     approved/dismissed boolean.
   - *Edited before accepting*: proposed-vs-final diff is a preference pair —
     GRPO/DPO-grade. Mail-adjacent content: OPFS-local, explicit export, and
     training on it is a deliberate product decision (pending, user-owned).
   - *Rephrased after a failure*: the failure **shape** (no content needed)
     steers the synthetic generator — learn "we fail on date-range searches,"
     synthesize date-range examples from scratch, validation-filtered as
     always. Exhaust aims the factory; it is not burned raw. No privacy
     contact.
   The dry-run corpus milestone (docs/PROJECT.md §7) already *is* choke point 1.

3. **Steal ComfyUI's reason, not its graph.** Node canvases work for
   diffusion because the artifact is instantly judgeable by eye. Our
   instantly-judgeable artifact is the plan (three lines of JSON) and the
   live reward/eval curve the trainer panel already draws. Polish that
   feedback loop; add no canvas library.

4. **Judge + preview, fail-closed.** Two mechanics adopted conceptually from
   Data Recipes, in our own bun scripts (never their AGPL code):
   - An **LLM-judge scoring column** as a soft filter *above* the hard
     parse/whitelist filter — never replacing it. A judge saying "looks like
     a good plan" is exactly the soft evidence the failure-memory section of
     docs/PROJECT.md bans as a gate.
   - **Preview-before-full-run** on dataset builds: a `--preview N` that
     prints sample rows with validation verdicts before committing. Our
     generators are all-or-nothing today. Directly useful for the GitHub
     cartridge dataset.

5. **The training math is sound; keep the provenance habit.** Real AdamW
   LoRA (loss 2.52 → 0.31 over 20 steps, positive held-out delta,
   `e2e:agents`) and GRPO with group advantages, SFT warm-start, and
   reinforce-positive-only clipping (`e2e:grpo`). Same math the research
   rigs run. Sweeps are pointless while runs are expensive. Every trained
   artifact carries full config so results can be reproduced or disowned.

6. **Toothbrush test, not distribution.** (Corrected in-session: widget
   distribution requires site-owner buy-in — not available to a two-person
   team.) The daily-presence position we already own is **the Gmail client
   itself** — the first cartridge lives inside a compulsive daily habit; the
   console *is* the mail client. Presence-on-every-page (the page-agent
   concept, likely via bookmarklet — no store, no site owner, works on
   mobile Safari) is act two: a thin in-page summoner talking to the
   AccountBox tab/PWA that holds the WebGPU runtime, since 2GB weights and
   OPFS are same-origin. That architecture has real cross-origin teeth and
   is tagged **post-first-users, user decision**. Browser-extension work
   remains on the do-not-add-scope list.

## What NOT to build

- A labeling UI, rating buttons ("was this helpful? 👍👎"), or a "review your
  traces" chore screen. Asking users to label is the category's failure
  mode; capture points must be actions users take for their own reasons.
- A general "train anything" surface. Unsloth executed that completely; the
  question "why don't you support X?" is answered by the cartridge frame:
  we ship skills — trained, evaluated, policy-bounded, executing against
  real accounts — not a tuning platform.
- Any vendored code from `experiments/` clones (Unsloth Studio is AGPL; all
  clones are gitignored reference material).

## The only near-term contact points

Everything above is decision-list material except:

1. The **dry-run corpus** capstone gate — already scoped in docs/PROJECT.md — is
   choke point 1 of the exhaust loop. No new scope.
2. **Information preservation** when plan-execute / draft-edit UX is touched:
   keep the proposed plan and the final artifact in the same React state
   long enough that a diff *could* be computed. No storage, no new UI.
3. Optional, cheap, whenever dataset work resumes: `--preview N` on the
   dataset generators.

## Addendum (2026-07-08, late-night thread)

- **Panel-first is the working conclusion, not panel-only.** The customer
  surface trends toward: agent panel + plan/approval card + draft review +
  progress ("you approved this training; here's the bar") + one orientation
  affordance. The lab demotes to owner tooling. page-agent's interface can be
  adopted *in our page* — it does not need to follow the user around and does
  not need to be the only thing.
- **The inbox's real use is undiscovered — do not overclaim it.** (Correction
  to "the inbox is the differentiator": that was glazing.) The felt intuition:
  the inbox may become the surface for messaging agents/apps you choose to
  interact with — not another personal-email garbage fire. Something is
  there; what it is gets discovered by use, not asserted.
- **The named killer is UI overload.** Walked as a stranger, the current app
  is "holy shit, what is all this." Confusion is the death note in every form
  factor (panel, SPA, native). Tours/onboarding are explicitly rejected as
  the fix — the fix is less UI, not guided UI.
- **The adoption wall is behavior change, not features.** Everyone defaults
  to Claude/Codex; to them AccountBox reads as "another Claude." Unsloth —
  a strong team — struggles to pull users into their studio because not
  everyone is an artist who needs a studio. Asking people to come learn a
  new loop on our website will not happen. Early is still fine.
- Procedural next step (when picked up): a **cold-eyes inventory** — walk
  every route/surface as a first-time user, list every visible affordance,
  mark each keep / demote-to-owner / cut. Output is a cut list to decide on,
  not a redesign.

## Open threads (user-owned decisions)

- Names/links for the two unremembered repos (labeling UI; weird-named
  browser agent).
- Whether user corrections ever become training data (privacy-weighted).
- Whether/when the bookmarklet-summoner presence experiment happens
  (post-first-users).
- Whether Unsloth Studio (MLX) joins `mlx_lm.lora` as the offline
  adapter-baking bench for the GitHub cartridge.
