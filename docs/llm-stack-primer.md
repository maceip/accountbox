# The LLM stack under the Webwright lens — common ground for AccountBox decisions

**Status:** reference, 2026-07-09. Companion to `webwright-learnings.md`.
Thesis: **a model only turns text into more text; everything that looks like
"doing" is a harness someone wrote.** Most of our decisions reduce to: which
layer does this belong in, and who pays for the intelligence — once, or on
every user action?

## 1. The six layers (and which ones AccountBox already owns)

| # | Layer | What it is | Ours |
|---|-------|------------|------|
| 1 | Weights | Frozen numbers; predict next token. That's all. | VibeThinker-3B + Qwen2.5-3B + LoRA adapters |
| 2 | Inference runtime | Executes the weights: kernels, KV cache, sampling | `src/engine/` — WebGPU, in the user's browser |
| 3 | Chat template | Exact text format the weights expect; wrong = silent quality collapse | ChatML via `model_session.js` |
| 4 | Harness | Assemble prompt → run → **parse output** → validate → loop | `agent-runtime.ts`, `plan-parse.ts`, `__cold` fail-closed |
| 5 | Tools/execution | The only things that touch the world; run by the harness on the model's textual suggestion | skill executors behind `/api/agent-execute` |
| 6 | Policy | Whitelists, dry-run, draft-only, approvals | `allowedTools`, policy gates |

When anyone says "the model did X": the model emitted text; layers 2–6 did X.

## 2. What "Claude-level" actually means

Claude "calling a tool" = Claude emits structured text; the *client harness*
parses it, runs the real function, pastes the result back. "Running code" =
a sandbox next to the model. "Working for an hour" = a loop plus context
management. The weights never execute anything.

The price of a frontier model buys two separable things:

1. **Raw capability** — exploring an unknown website, writing and debugging
   code, novel synthesis.
2. **Loop reliability** — RL-trained to emit valid tool calls ~100% of the
   time, recover from errors, stop when done.

Webwright's SOTA numbers need **both** (its agent explores blind and writes
Playwright code live). AccountBox's runtime needs **neither** — see §4.

## 3. Self-hosting a mid model (DeepSeek etc.): what becomes your code

Run open weights and layers 2–6 are yours: an inference server (vLLM/MLX)
with quantization choices that cost output discipline (we measured int4's
cost: 4/18 strict-valid), the exact chat template, the tool-call format +
parser + retry/repair for malformed calls, the sandbox if it writes code,
the loop, and all safety. A mid model unassisted emits valid tool calls
maybe 90–98% of the time — *you* decide whether to retry, grammar-constrain,
or fail closed. Relevant to us only if we ever consider a bigger local
crafting model (webwright-learnings G3): the crafting harness, not the
model, would be most of that work.

## 4. VibeThinker's contribution, stated in stack terms

A 3B cannot buy either frontier thing. AccountBox routes around both:

- **Raw capability → moved out of runtime.** Exploration and code-writing
  happen once, at crafting time (Webwright / codegen-from-demo), and freeze
  into tool scripts. Runtime never needs them (L2–L6 of
  `webwright-learnings.md`).
- **Loop reliability → replaced by contract + fine-tune + harness.** The
  runtime job is fixed: pick one tool from a short list, fill args, emit one
  JSON line, refuse otherwise. The fine-tune buys exactly that format
  discipline (base model fails the `eval-real-mlx.py` control; tuned
  passes), and the harness assumes the model is unreliable anyway: parse →
  validate → `__cold` → refuse. We never need the model to be right, only
  the harness to detect wrong.

That is the proof AccountBox carries: **layers 1–6 built from scratch in a
browser tab, with the frontier model's trained-in reliability replaced by an
explicit checkable contract.** The engine (in-browser WebGPU inference +
LoRA training) is the rare piece; the harness discipline is what makes a 3B
viable at all.

## 5. Decision heuristics

1. **Locate the layer first.** "The model can't X" is usually a harness
   (parsing/loop/tools) problem, and vice versa.
2. **Big model = one-time contractor, never resident.** Pay frontier prices
   only where output is frozen and reused (tool crafting); the per-action
   slot belongs to the local model. A user demonstration is cheaper than
   both (webwright-learnings L6).
3. **Checkable beats capable.** If output can be validated, a small model +
   fail-closed harness substitutes for a big model's reliability. Reserve
   trust-the-model designs for frontier contexts we don't ship.
4. **Fixed format? Fine-tune. Open-ended? Don't ship it locally.**
5. **Self-hosted quality collapse:** check chat template, quantization,
   sampling, context overflow — in that order — before blaming weights.
