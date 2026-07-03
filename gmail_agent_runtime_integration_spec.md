# gmail_agent_runtime_integration_spec.md

**Type:** Formal, exhaustive architecture + interface + data structure specification for the Gmail agent use case.  
**Date:** 2026-07-01  
**Purpose:** Provide a single, unambiguous, class-by-class / method-by-method / data-structure-by-data-structure reference so that AccountBox can correctly delegate to the real external runtime (emberglass + bbverifier) without re-implementation or proxy behavior.  
**Audience:** Future agents and humans. No prose motivation, no plans, no "we will", only definitions, signatures, shapes, and required behaviors.

---

## 0. Canonical Source Locations (immutable for this spec)

- AccountBox wrapper (to be implemented or corrected): `/Users/mac/accountbox/src/lib/runtime/gmail-agent-runtime.ts`
- Data prep (existing): `/Users/mac/accountbox/training/gmail-synthetic-prompts.json`, `/Users/mac/accountbox/training/generate-gmail-dataset.ts`
- Real WebGPU runtime + inference + in-browser training (if used): `/Users/mac/emberglass/`
  - `src/emberglass_bridge.js` (primary factory)
  - `src/services/model_session.js` (ModelSession)
  - `src/services/training_controller.js` (TrainingController)
  - `src/lora_gpu.js` (loadLoraAdapterGPU)
  - `src/qwgpu/*` (underlying kernels, referenced only)
- Heavy training (MLX LoRA on VibeThinker-3B): `/Users/mac/bbverifier/`
  - `lora_config_gmail.yaml`
  - `data/sft/train.jsonl`, `data/sft/valid.jsonl`
  - Output: `adapters/gmail-agent/adapter_config.json` + `adapters/gmail-agent/adapters.safetensors`
- Reference implementations: `/Users/mac/qwen-webgpu-lora`, `/Users/mac/edge-thinker`

No other locations are authoritative.

---

## 1. Gmail-Specific Problem Statement (formal)

Given a natural-language user intent about their Gmail, produce a structured plan consisting only of calls to exactly these three tools:

1. `search_messages(query: string)` — returns message/thread identifiers.
2. `read_message(id: string)` — returns full message content.
3. `create_draft(to, subject, body)` — creates a draft (never sends).

The model must emit a deterministic, machine-executable plan as JSON. Execution of the plan against live Gmail is outside the runtime (handled by `real-gmail-tools.ts`).

Training objective: teach VibeThinker-3B to reliably emit well-formed plans using only these tools, with correct Gmail search syntax, proper sequencing, and placeholder resolution for follow-on ids.

---

## 2. Training Data Structures (exact)

### 2.1 Prompt/Target Source of Truth

File: `training/gmail-synthetic-prompts.json`

```ts
interface GmailPromptsFile {
  description: string;
  prompts: GmailPrompt[];
}

interface GmailPrompt {
  id: string;                    // "p01", "p02", ...
  prompt: string;                // natural language user intent
  expected_tools: ToolName[];    // for grading
  notes?: string;
  targets: PlanTarget[];         // one or more acceptable plan shapes
}

type ToolName = "search_messages" | "read_message" | "create_draft";

type PlanTarget =
  | { tool: "search_messages"; args: { query: string } }
  | { tool: "read_message"; args: { id: string } }
  | { tool: "create_draft"; args: { to: string; subject: string; body: string } }
  | { steps: Array<SingleStep> };   // multi-step

interface SingleStep {
  tool: ToolName;
  args: Record<string, unknown>;
}
```

### 2.2 SFT JSONL Format (what actually goes to the model)

Each line is a JSON object:

```json
{
  "messages": [
    { "role": "system", "content": "<FIXED_SYSTEM_PROMPT>" },
    { "role": "user",   "content": "<user prompt>" },
    { "role": "assistant", "content": "<JSON_PLAN_STRING>" }
  ]
}
```

Exact fixed system prompt (copied verbatim from generated data):

```
You are the local Gmail agent inside AccountBox / AccountBox. Everything runs on the user's machine.

Tools (use only these):
- search_messages: {query: string}   // Gmail search syntax
- read_message: {id: string}
- create_draft: {to: string, subject: string, body: string}   // never send

Respond with a single JSON object for the next tool call, or a short final answer.
Use live data from the user's connected Gmail account(s) and the current state of the AccountBox mail board.
```

Assistant content MUST be a single-line JSON string with no markdown, no extra text outside the JSON object. Two legal top-level shapes:

- Single tool: `{"tool":"search_messages","args":{"query":"..."}}`
- Multi-step: `{"steps":[{"tool":"...","args":{...}}, ...]}`

---

## 3. Plan JSON Schema (runtime output contract)

```ts
type Plan =
  | SingleToolPlan
  | MultiStepPlan;

interface SingleToolPlan {
  tool: ToolName;
  args: {
    query?: string;                    // for search_messages
    id?: string;                       // for read_message
    to?: string; subject?: string; body?: string; // for create_draft
    [k: string]: unknown;
  };
}

interface MultiStepPlan {
  steps: SingleToolPlan[];
}
```

The runtime MUST return a string that is `JSON.stringify(plan)` (or the plan object directly; callers normalize). No prose, no code fences.

---

## 4. Adapter Artifacts (exact layout)

Produced by bbverifier:

```
adapters/gmail-agent/
├── adapter_config.json
└── adapters.safetensors   (or adapter_model.safetensors)
```

`adapter_config.json` (example from real runs):

```json
{
  "base_model_name_or_path": "WeiboAI/VibeThinker-3B",
  "peft_type": "LORA",
  "lora_alpha": 16,
  "r": 16,
  "target_modules": ["self_attn.q_proj", "self_attn.k_proj", ...],
  ...
}
```

Loading code (emberglass) expects at minimum one `.safetensors` file + `adapter_config.json`.

---

## 5. Runtime Classes & Methods (extracted verbatim from emberglass)

### 5.1 Primary Factory

File: `~/emberglass/src/emberglass_bridge.js`

```js
export async function createEmberglassEngine(opts = {}) {
  // opts:
  //   hfRepo?: string                // default "WeiboAI/VibeThinker-3B"
  //   hfToken?: string
  //   modelUrl?: string              // overrides hfRepo
  //   loraUrl?: string               // directory containing adapter files (http or local via fetch shim)
  //   loraRepo?: string
  //   log?: (msg: string) => void
  //   onProgress?: (msg: string, frac: number) => void
  //   runtimeOptions?: object        // passed to QwenWGPU
  //
  // returns:
  //   {
  //     label: string,
  //     chatComplete(messages, { maxTokens?, temperature? }): Promise<string>,
  //     dispose(): void
  //   }
}
```

Implementation inside: creates `ModelSession`, calls `loadWith`, optionally calls `loadLoraAdapterGPU`, returns a thin object with `chatComplete` which drives `session.generate`.

### 5.2 ModelSession (inference)

File: `~/emberglass/src/services/model_session.js`

```ts
export class ModelSession {
  constructor({ cfg = QWEN25_3B, log = () => {}, runtimeOptions = {} } = {});

  async loadWith(reader, label): Promise<this>;

  // Core generation
  async *generate(
    messages: Array<{role: 'system'|'user'|'assistant', content: string}>,
    opts?: {
      maxTokens?: number;      // default 1024
      temperature?: number;    // 0 = greedy
      topK?: number;
      topP?: number;
      stopIds?: number[];      // default [151645, 151643]
    }
  ): AsyncGenerator<string>;   // yields decoded text chunks

  // Lower level (used by generate)
  async readLogits(): Promise<Float32Array>;
  async sampleNextToken(opts?: { temperature?: number; topK?: number; topP?: number }): Promise<number>;
}
```

### 5.3 TrainingController (in-browser training path)

File: `~/emberglass/src/services/training_controller.js`

```ts
export class TrainingController {
  constructor({ session, adapters, log?, trainerOptions? });

  initAdapter(name = 'trainable', { rank = 16, alpha = 32, targetModules? } = {});
  attachAdapter(name: string);

  prepareExample(example: {
    messages?: Array<Message>;
    prompt?: string;
    completion?: string;
    trainPromptToo?: boolean;
  }): PreparedExample;

  inspectExample(example): object;

  prepareBatch(examples): PreparedExample[];

  async step(microBatches): Promise<StepResult>;

  async train(examples, { epochs?, onStep?, maxTrainSeq? }): Promise<{steps: number, adapter}>;
}

interface PreparedExample {
  tokens: number[];
  lossMask: number[];
  promptLength: number;
  completionLength: number;
  firstTrainPos: number;
}

interface StepResult {
  loss: number;
  lr: number;
  gradNorm: number;
}
```

Note: AccountBox may or may not use the in-browser trainer; the heavy path uses bbverifier/MLX. The controller is documented for completeness.

### 5.4 LoRA Loading

```js
import { loadLoraAdapterGPU } from './lora_gpu.js';

const lora = await loadLoraAdapterGPU(dev, files /* FileLike[] */, cfg);
session.rt.setLora(lora);
```

`files` must contain at least one `.safetensors` and `adapter_config.json`.

---

## 6. AccountBox Wrapper — Required Surface (gmail-agent-runtime.ts)

This is the ONLY module that React code may import for agent decisions.

```ts
// src/lib/runtime/gmail-agent-runtime.ts

export interface AgentStatus {
  state: 'unloaded' | 'loading' | 'loaded' | 'training' | 'equipped' | 'error';
  modelLabel?: string;
  adapterName?: string;
  lastError?: string;
  progress?: { message: string; frac: number };
}

export type Plan = SingleToolPlan | MultiStepPlan; // see section 3

export interface GmailAgentRuntime {
  // Lifecycle
  loadBaseModel(): Promise<void>;                    // loads VibeThinker-3B base (no adapter yet)
  trainGmailAdapter(examples: SFTExample[]): Promise<void>; // optional in-browser path
  equipAdapter(adapterSource: AdapterSource): Promise<void>; // .safetensors + config
  disposeRuntime(): void;

  // Core operation for Gmail use case
  generate(prompt: string): Promise<Plan>;           // MUST use real engine when equipped

  // Observability
  getAgentStatus(): AgentStatus;
  subscribeAgentStatus(listener: (s: AgentStatus) => void): () => void;
}

export type AdapterSource =
  | { type: 'local-path'; path: string }   // file:// or OPFS path
  | { type: 'http'; url: string }
  | { type: 'files'; files: FileLike[] };  // {name, text(), arrayBuffer()}

export interface SFTExample {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}

export interface FileLike {
  name: string;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}
```

### 6.1 Required Behavior of `generate(prompt: string)`

1. If no engine or no adapter equipped: may return a structural default (documented as "cold" behavior), but MUST log that it is not using weights.
2. When a real engine + Gmail adapter is equipped:
   - Build the exact messages array using the FIXED system prompt + user prompt.
   - Call the engine's `chatComplete(messages, { temperature: 0, maxTokens: 512 })` or equivalent `generate` path.
   - Parse the returned string as JSON. If parse fails or tool names are invalid, return a safe error plan.
   - Return the parsed `Plan` object (not a string).
3. MUST NEVER fall back to looking up targets in `gmail-synthetic-prompts.json` once a real adapter is loaded.

### 6.2 Status Transitions (state machine)

```
unloaded
  -> loadBaseModel() -> loading -> loaded
  -> equipAdapter()  -> equipped   (from loaded or unloaded)
  -> trainGmailAdapter() -> training -> equipped (if in-browser)
error (from any state on fatal failure)
```

`getAgentStatus()` must reflect the latest state synchronously. `subscribeAgentStatus` must notify on every transition and on progress updates.

---

## 7. Exact Data Flow for Gmail Chat (end-to-end)

1. User types prompt in `local-chat.tsx`.
2. `local-chat` calls `runtime.generate(prompt)`.
3. `gmail-agent-runtime`:
   a. Constructs `messages = [{role:"system", content: FIXED}, {role:"user", content: prompt}]`
   b. If engine ready: `text = await engine.chatComplete(messages, {temperature:0})`
   c. `plan = safeJsonParse(text)`
   d. Returns `plan`
4. `local-chat` displays the raw plan JSON.
5. `local-chat` (or caller) passes plan to `real-gmail-tools.executePlan(plan, accessToken)`.
6. Tools execute against Gmail REST (using the token from vault/OPFS).
7. Results are rendered; optionally fed back as a follow-up assistant message for multi-turn.

Training data generation path (separate):
- `gmail-synthetic-prompts.json` → `generate-gmail-dataset.ts` → `gmail-agent-train.jsonl`
- Split/copy into `~/bbverifier/data/sft/{train,valid}.jsonl`
- Run MLX training with `lora_config_gmail.yaml`
- Produce adapter artifacts
- Copy artifacts into AccountBox-accessible location (OPFS, public/, or http server)
- Call `equipAdapter(...)`

---

## 8. File & Module Mapping (AccountBox side)

```
src/lib/runtime/
  gmail-agent-runtime.ts          ← THE ONLY allowed import for agent behavior
  (accountbox-runtime.ts is legacy and must delegate or be deleted)

src/components/chat/local-chat.tsx
  import { generate, getAgentStatus, ... } from '@/lib/runtime/gmail-agent-runtime'

training/
  gmail-synthetic-prompts.json
  generate-gmail-dataset.ts       // produces SFT JSONL from above
  eval-plans.ts                   // scores plans (structural, not via model)
```

No other file may contain model loading, LoRA application, or direct calls to emberglass internals.

---

## 9. Error Handling & Safety Requirements

- If the generated text is not valid JSON or uses an unknown tool: `generate` MUST throw or return `{ tool: "search_messages", args: { query: "is:unread" } }` as a safe fallback and surface the error in status.
- Temperature must be 0 (or very low) for plan generation to ensure determinism.
- The runtime must never attempt to send mail. `create_draft` is the only write tool.
- All PII is forbidden in training data and prompts stored for fine-tuning.

---

## 10. Minimal Implementation Skeleton (for the wrapper)

```ts
// gmail-agent-runtime.ts (skeleton — real code must fill in)
import { createEmberglassEngine } from '../../../../emberglass/src/emberglass_bridge.js'; // adjust path or bundle

let engine: any = null;
let status: AgentStatus = { state: 'unloaded' };
const listeners = new Set<(s: AgentStatus) => void>();

function notify() { for (const l of listeners) l(status); }

export async function loadBaseModel() {
  status = { state: 'loading' }; notify();
  engine = await createEmberglassEngine({
    // modelUrl or hfRepo
    log: (m) => console.log('[emberglass]', m),
    onProgress: (m, f) => { status.progress = {message:m, frac:f}; notify(); }
  });
  status = { state: 'loaded', modelLabel: engine.label }; notify();
}

export async function equipAdapter(src: AdapterSource) {
  // convert src to files compatible with fetchAdapterFiles or loadLoraAdapterGPU
  // call into the loaded session
  status = { state: 'equipped', adapterName: 'gmail-agent' }; notify();
}

export async function generate(prompt: string): Promise<Plan> {
  if (!engine) {
    // cold behavior documented
    return { tool: 'search_messages', args: { query: 'is:unread' } };
  }
  const messages = [
    { role: 'system' as const, content: FIXED_SYSTEM_PROMPT },
    { role: 'user' as const, content: prompt }
  ];
  const text = await engine.chatComplete(messages, { temperature: 0, maxTokens: 512 });
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Model did not emit valid plan JSON: ' + text);
  }
}

export function getAgentStatus() { return status; }
export function subscribeAgentStatus(l: any) { listeners.add(l); return () => listeners.delete(l); }
```

---

## 11. Verification Checklist (mechanical)

Any claim that the integration is complete must pass these exact checks:

1. `rg -n "createEmberglassEngine|ModelSession|loadLoraAdapterGPU" src/lib/runtime/gmail-agent-runtime.ts` returns matches.
2. `rg -n "planForPrompt|gmail-synthetic-prompts" src/lib/runtime/gmail-agent-runtime.ts` returns no matches (except possibly in comments for cold path).
3. `bun run typecheck` passes.
4. In the UI, after `equipAdapter`, a prompt produces a plan whose text was generated by the weights (inspect via `readLogits` or by changing adapter and observing different output).
5. Running the real bbverifier training, copying the produced adapter, and calling `equipAdapter` + `generate` succeeds end-to-end.
6. `eval-plans.ts` (or successor) can optionally call the real `generate` instead of the target lookup when an adapter is equipped.

---

## 12. Glossary (exact terms)

- Plan: structured JSON describing one or more of the three Gmail tool calls.
- Adapter: LoRA weights (`adapters.safetensors` + `adapter_config.json`) specialized on Gmail planning.
- Engine: the object returned by `createEmberglassEngine`.
- SFT: supervised fine-tuning data in the messages format.
- Cold path: behavior when no weights are loaded (documented fallback only).

---

End of formal specification.
