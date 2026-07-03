# current_state_and_glue.md

**Date:** 2026-07-01 06:42
**Purpose:** Single factual inventory. No plans, no contracts, no storytelling. Only what exists, where it lives, and the concrete missing pieces to join the projects.

---

## 1. The two projects we are joining

**Project A (this folder): /Users/mac/accountbox**

- Existing Gmail client UI and data fetching
- Vault + Better Auth local session
- OPFS persistence for some product state (vault envelope, etc.)
- Data preparation that turns prompts into training JSONL

**Project B (the real runtime + training):**

- ~/emberglass (WebGPU inference + in-browser LoRA training engine)
- ~/qwen-webgpu-lora (core WebGPU kernels + architecture)
- ~/edge-thinker (related WebGPU reference)
- ~/bbverifier (actual heavy LoRA fine-tuning using MLX on VibeThinker-3B)

---

## 2. What actually exists right now (fact inventory)

### In Project A (accountbox)

- Vault unlock + local Better Auth session
- Existing Gmail client (connect, list, read, compose, draft) — still works
- `training/gmail-synthetic-prompts.json` + `training/generate-gmail-dataset.ts` → produces `gmail-agent-train.jsonl`
- `src/lib/runtime/accountbox-runtime.ts`:
  - `generate(prompt)` → returns JSON from the targets file above (or simple heuristic)
  - `loadBaseModel()`, `equipAdapter()`, `trainGmailAdapter()` → only check if a .safetensors file exists on disk and flip status flags. They do **not** load or run any model.
- Thin copy scripts (`scripts/run-gmail-finetune.sh`, `post-finetune-eval.sh`) that move JSONL to bbverifier and copy .safetensors back.
- `training/200-rounds.ts` and `training/iterate-plans-200.ts` — these only edit the JSON targets file and call the fake `generate()` above.

### In Project B

- ~/bbverifier:
  - Real MLX LoRA training on VibeThinker-3B (`lora_config_gmail.yaml`)
  - Produces real `adapters.safetensors` + `adapter_config.json`
  - `retrain_then_eval.sh` + `validate_tune.sh` for post-training validation
- ~/emberglass:
  - Real WebGPU engine: `createEmberglassEngine()`, `ModelSession`, `TrainingController`
  - Can load base model + LoRA adapters from .safetensors in browser
  - Can run inference (`generate`) and in-browser training
  - Adapter loading path exists (`fetchAdapterFiles` + `loadLoraAdapterGPU`)
- ~/qwen-webgpu-lora and ~/edge-thinker contain the underlying kernels and references that emberglass builds on.

**Current integration between A and B:**

- Accountbox can prepare a JSONL file.
- Someone can manually copy that JSONL to ~/bbverifier/data and run training.
- The resulting .safetensors can be manually copied back.
- Nothing in accountbox actually loads or calls the real engine from emberglass for inference or training.

---

## 3. The "runtime wrapper" requirement (exact text from source docs)

From product-plan.md and BATTLE-PLAN.md (the only authoritative references):

"Create one AccountBox runtime wrapper. React components call this wrapper only."

"If `emberglass_bridge.js` lacks training methods, add wrapper support around `TrainingController` before claiming Gmail training works."

Wrapper must expose (from product-plan):

- load base model
- create/train Gmail adapter
- equip adapter
- generate with equipped adapter
- report status/error/progress
- dispose runtime

The documents explicitly say this wrapper must be built **around** the code in:

- ~/emberglass/src/emberglass_bridge.js + services/training_controller.js + model_session.js + lora_gpu.js
- ~/qwen-webgpu-lora
- ~/edge-thinker

**They do not define:**

- Exact method signatures, parameters, return types
- How a .safetensors produced by bbverifier gets turned into a loadable adapter inside the emberglass engine
- How a chat prompt becomes a call into the real fine-tuned model (instead of target replay)
- The boundary between "prepare data here" vs "run real engine there"

---

## 4. What does not exist (the actual gaps)

1. No AccountBox code that imports or calls `createEmberglassEngine`, `TrainingController`, or the emberglass bridge for inference.
2. No code that takes a .safetensors from ~/bbverifier and loads it into a real ModelSession.
3. `generate(prompt)` in accountbox-runtime.ts does **not** run any model. It returns pre-written JSON.
4. No chat routing that sends a user message to the real fine-tuned weights and gets a plan back from them.
5. No defined, concrete interface (function signatures) that the "wrapper" must implement.
6. No automated or even documented flow that goes:
   prepare JSONL (accountbox) → train (bbverifier) → load resulting adapter into real engine (emberglass) → call real generate from chat.

---

## 5. Current data/control flow (as it actually works today)

**Training data path (works):**
accountbox training/ prompts + targets
→ generate-gmail-dataset.ts
→ gmail-agent-train.jsonl
→ (manual copy) ~/bbverifier/data/sft/
→ real MLX training
→ real adapters.safetensors

**Inference / agent path (does not work):**
chat prompt
→ accountbox-runtime.ts:generate()
→ returns JSON target from prompts.json
→ (no call to any real model)

There is no connection between the real fine-tuned weights and what the chat sees as "the model".

---

## 6. Minimal factual summary

We have:

- A working data preparation step that feeds real training.
- A working external training system that produces real adapters.
- A working WebGPU runtime (in emberglass) that can load those adapters and run inference.
- A fake stand-in inside accountbox that has been used for all "loop" and "eval" activity so far.

We do not have:

- The glue that makes the real engine the thing that answers prompts in the app.
- A defined, non-vague interface for that glue.

This is the current state as of 06:42 on 2026-07-01.

---

End of document. No plans, no next steps, no contracts. Only inventory.
