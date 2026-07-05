/**
 * In-browser train/eval runtime — the Trainer agent's hands.
 *
 * This is the proven Emberglass training harness (test/train_proven.js:
 * completion-only loss masking, AdamW LoRA steps, DISJOINT held-out eval)
 * mounted inside AccountBox. Everything runs on the user's GPU via the house
 * kernels; nothing here talks to a server beyond fetching same-origin weights
 * and dataset files.
 *
 * Residency: the training session claims the shared engine slot (id
 * "trainer"), displacing the chat or skill model exactly like they displace
 * each other. Displacement disposes the session and the status goes honestly
 * `unloaded`.
 *
 * Honesty contract, same as the inference runtimes:
 *  - losses/evals are real GPU numbers or the call throws — no placeholders
 *  - the exported adapter is read back from the trained GPU buffers
 *    (PEFT-compatible safetensors), stored in OPFS, and re-equippable
 *  - text generation is verbatim model output.
 *
 * Emberglass ships no .d.ts; the narrow structural types below are the one
 * place its training surface is declared (mirrors weight-fetch.ts for
 * inference).
 */

import {
  claimEngineSlot,
  currentEngineSlotOwner,
  DisplacedDuringLoadError,
  releaseEngineSlot,
} from "@/lib/runtime/engine-slot";
import { installWeightFetchRetry } from "@/lib/runtime/weight-fetch";
import {
  saveAdapter,
  loadAdapterFiles,
  listAdapters,
} from "@/lib/runtime/adapter-store";
import type { FileLike } from "@/lib/runtime/agent-runtime";

import {
  parseJsonlExamples,
  type ChatMessage,
  type SftExample,
} from "./sft-data";
import { bbtriageReward, toGrpoPrompt } from "./rewards";
import { extractTriageVerdict, type TriageVerdict } from "./bbtriage";

export { parseJsonlExamples };
export type { ChatMessage, SftExample };

// ---------------------------------------------------------------------------
// Emberglass training-surface types (structural; engine ships no .d.ts)
// ---------------------------------------------------------------------------

interface PreparedExample {
  tokens: number[];
  lossMask: number[];
}

interface EmberRuntime {
  setLora(adapter: unknown): void;
  clearLora(): void;
  invalidateLora(): void;
}

interface GpuBufferLike {
  destroy?(): void;
}

interface GpuDeviceLike {
  queue: {
    writeBuffer(buffer: unknown, offset: number, data: ArrayBufferView): void;
  };
}

/** A module of a trainable adapter (createTrainableAdapter). */
interface TrainableModule {
  A: GpuBufferLike;
  B: GpuBufferLike;
  rank: number;
  scale: number;
  inDim: number;
  outDim: number;
}

/** A module of a loaded (read-only) adapter — loadLoraAdapterGPU keeps the
 *  raw float arrays around, in the same [rank][in]/[rank][out] layout the
 *  trainable buffers use, which is what makes warm-starting a pure copy. */
interface LoadedLoraModule {
  A: GpuBufferLike;
  B: GpuBufferLike;
  rawA?: Float32Array;
  rawB?: Float32Array;
  rank: number;
  scale: number;
}

interface EmberModelSession {
  dev: unknown;
  rt: EmberRuntime;
  tokenizer: unknown;
  loadWith(reader: unknown, label: string): Promise<unknown>;
  generate(
    messages: ChatMessage[],
    opts?: {
      maxTokens?: number;
      temperature?: number;
      topK?: number;
      topP?: number;
    },
  ): AsyncGenerator<string>;
}

interface EmberTrainingController {
  prepareExample(ex: {
    messages?: ChatMessage[];
    prompt?: string;
    completion: string;
  }): PreparedExample;
}

interface EmberTrainer {
  adapter: { name: string } & Record<string, unknown>;
  attach(adapter: unknown): void;
  trainStep(
    microBatches: PreparedExample[],
  ): Promise<{ loss: number; lr: number; gradNorm: number }>;
  evalLoss(
    tokens: number[],
    lossMask: number[],
  ): Promise<{ loss: number }>;
}

/** One GRPO prompt: chat messages (no assistant turn) + gold for the reward. */
export interface GrpoPromptRow {
  messages: ChatMessage[];
  gold: unknown;
}

export interface GrpoStepStats {
  meanReward: number;
  rewardStd: number;
  rewards: number[];
  microBatches: number;
  skipped: number;
  objective: number;
  lr: number;
  gradNorm: number;
  stepMs: number;
  rollouts: Array<
    Array<{ text: string; reward: number; advantage: number; tokens: number }>
  >;
}

interface EmberGrpoController {
  step(opts: {
    prompts: GrpoPromptRow[];
    groupSize?: number;
    rewardFn: (text: string, gold: unknown, prompt: GrpoPromptRow) => number;
    sampling?: {
      maxTokens?: number;
      temperature?: number;
      topK?: number;
      topP?: number;
    };
    maxTrainSeq?: number;
  }): Promise<GrpoStepStats>;
}

interface TrainBridge {
  QWEN25_3B: unknown;
  urlReader(base: string): unknown;
  ModelSession: new (opts: {
    cfg: unknown;
    log?: (m: string) => void;
  }) => EmberModelSession;
  AdapterRegistry: new () => { adapters: Record<string, unknown> };
  TrainingController: new (opts: {
    session: EmberModelSession;
    adapters: unknown;
    log?: (m: string) => void;
  }) => EmberTrainingController;
  QwenLoraTrainer: new (
    rt: EmberRuntime,
    opts: Record<string, unknown>,
  ) => EmberTrainer;
  createTrainableAdapter(
    rt: EmberRuntime,
    opts: Record<string, unknown>,
  ): { name: string; modules: Record<string, TrainableModule> };
  loadLoraAdapterGPU(
    dev: unknown,
    files: FileLike[],
    cfg: unknown,
  ): Promise<{ modules: Record<string, LoadedLoraModule> }>;
  exportLoraAdapter(
    trainer: EmberTrainer,
    opts?: { name?: string; baseModel?: string },
  ): Promise<{ safetensors: Uint8Array; configJson: string }>;
  GrpoController: new (opts: {
    session: EmberModelSession;
    trainer: EmberTrainer;
    log?: (m: string) => void;
  }) => EmberGrpoController;
}

let bridgeInFlight: Promise<TrainBridge> | null = null;

/** Dynamic import of the engine's training modules (same coupling point as
 *  the inference bridge: the in-repo `src/engine/` vendored engine). */
async function getTrainBridge(): Promise<TrainBridge> {
  if (bridgeInFlight) return bridgeInFlight;
  bridgeInFlight = (async () => {
    // @ts-expect-error - plain-JS engine module, no .d.ts
    const cfg = await import("@/engine/config.js");
    // @ts-expect-error - plain-JS engine module, no .d.ts
    const readers = await import("@/engine/readers.js");
    // @ts-expect-error - plain-JS engine module, no .d.ts
    const sess = await import("@/engine/services/model_session.js");
    // @ts-expect-error - plain-JS engine module, no .d.ts
    const reg = await import("@/engine/services/adapter_registry.js");
    // @ts-expect-error - plain-JS engine module, no .d.ts
    const ctrl = await import("@/engine/services/training_controller.js");
    // @ts-expect-error - plain-JS engine module, no .d.ts
    const trainer = await import("@/engine/qwgpu/trainer.js");
    // @ts-expect-error - plain-JS engine module, no .d.ts
    const loraGpu = await import("@/engine/lora_gpu.js");
    // @ts-expect-error - plain-JS engine module, no .d.ts
    const loraExport = await import("@/engine/lora_export.js");
    // @ts-expect-error - plain-JS engine module, no .d.ts
    const grpo = await import("@/engine/services/grpo_controller.js");
    return {
      QWEN25_3B: cfg.QWEN25_3B,
      urlReader: readers.urlReader,
      ModelSession: sess.ModelSession,
      AdapterRegistry: reg.AdapterRegistry,
      TrainingController: ctrl.TrainingController,
      QwenLoraTrainer: trainer.QwenLoraTrainer,
      createTrainableAdapter: trainer.createTrainableAdapter,
      loadLoraAdapterGPU: loraGpu.loadLoraAdapterGPU,
      exportLoraAdapter: loraExport.exportLoraAdapter,
      GrpoController: grpo.GrpoController,
    } as TrainBridge;
  })();
  return bridgeInFlight;
}

// ---------------------------------------------------------------------------
// Status store (useSyncExternalStore-friendly, mirrors chat-runtime)
// ---------------------------------------------------------------------------

export interface TrainStep {
  step: number;
  loss: number;
  lr: number;
  gradNorm: number;
}

export interface EvalResult {
  label: string;
  meanLoss: number;
  examples: number;
  at: number;
}

export interface GrpoStep {
  step: number;
  meanReward: number;
  rewardStd: number;
  gradNorm: number;
  microBatches: number;
}

export interface TrainerStatus {
  state: "unloaded" | "loading" | "ready" | "training" | "error";
  message?: string;
  lastError?: string;
  progress?: { message: string; frac: number };
  dataset?: { url: string; train: number; heldout: number; skipped: number };
  adapterLabel?: string;
  algorithm?: "sft" | "grpo";
  lossCurve: TrainStep[];
  rewardCurve: GrpoStep[];
  evals: EvalResult[];
}

const BASE_MODEL_URL = "/model";
const TRAINER_SLOT_ID = "trainer";
const MAX_TRAIN_SEQ = 1024;

let session: EmberModelSession | null = null;
let controller: EmberTrainingController | null = null;
let trainer: EmberTrainer | null = null;
let trainSet: PreparedExample[] = [];
let heldoutSet: PreparedExample[] = [];
let loadInFlight: Promise<void> | null = null;

let currentStatus: TrainerStatus = {
  state: "unloaded",
  lossCurve: [],
  rewardCurve: [],
  evals: [],
};
const listeners = new Set<(s: TrainerStatus) => void>();

function setStatus(next: Partial<TrainerStatus>) {
  currentStatus = { ...currentStatus, ...next };
  for (const l of listeners) l(currentStatus);
  // On error, lastError is the signal — a stale `message` must not mask it.
  console.log(
    "[train-runtime] state ->",
    currentStatus.state,
    currentStatus.state === "error"
      ? currentStatus.lastError || currentStatus.message || ""
      : currentStatus.message || currentStatus.lastError || "",
  );
}

export function getTrainerStatus(): TrainerStatus {
  return currentStatus;
}

export function subscribeTrainerStatus(
  listener: (s: TrainerStatus) => void,
): () => void {
  listeners.add(listener);
  listener(currentStatus);
  return () => listeners.delete(listener);
}

export function isTrainerReady(): boolean {
  return !!session && currentStatus.state !== "unloaded" && currentStatus.state !== "loading" && currentStatus.state !== "error";
}

function onDisplaced() {
  session = null;
  controller = null;
  trainer = null;
  setStatus({
    state: "unloaded",
    message: "Training session unloaded (another model took the GPU)",
  });
}

function requireSession(): EmberModelSession {
  if (!session) throw new Error("training session is not loaded");
  return session;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Load the VibeThinker-3B base into a trainable session (claims the slot). */
export async function loadTrainerBase(): Promise<void> {
  if (session) return;
  if (loadInFlight) return loadInFlight;
  loadInFlight = doLoadTrainerBase().finally(() => {
    loadInFlight = null;
  });
  return loadInFlight;
}

async function doLoadTrainerBase(): Promise<void> {
  if (!(await claimEngineSlot(TRAINER_SLOT_ID, onDisplaced))) {
    const msg =
      "The local model is active in another tab — close it there and retry.";
    setStatus({ state: "error", lastError: msg });
    throw new Error(msg);
  }
  installWeightFetchRetry();
  setStatus({
    state: "loading",
    message: "Loading VibeThinker-3B base for training (WebGPU)...",
    progress: { message: "starting base model load", frac: 0.05 },
  });
  try {
    const bridge = await getTrainBridge();
    const s = new bridge.ModelSession({
      cfg: bridge.QWEN25_3B,
      log: (m: string) => {
        // log fires per weight tensor during the stream — abort a stream
        // whose slot was taken instead of quantizing into doomed buffers.
        if (currentEngineSlotOwner() !== TRAINER_SLOT_ID)
          throw new DisplacedDuringLoadError(TRAINER_SLOT_ID);
        console.log("[emberglass:train]", m);
        const pct = /(\d+)%/.exec(m);
        if (pct)
          setStatus({
            progress: { message: m, frac: Number(pct[1]) / 100 },
          });
      },
    });
    await s.loadWith(bridge.urlReader(BASE_MODEL_URL), BASE_MODEL_URL);
    // The stream takes minutes; if another model claimed the slot meanwhile,
    // installing this session would double GPU residency. Discard it instead.
    if (currentEngineSlotOwner() !== TRAINER_SLOT_ID) {
      throw new DisplacedDuringLoadError(TRAINER_SLOT_ID);
    }
    session = s;
    controller = new bridge.TrainingController({
      session: s,
      adapters: new bridge.AdapterRegistry(),
      log: (m: string) => console.log("[train-ctrl]", m),
    });
    setStatus({
      state: "ready",
      message: "Training base ready",
      lastError: undefined,
      progress: { message: "ready", frac: 1 },
    });
  } catch (e) {
    if (e instanceof DisplacedDuringLoadError) {
      // onDisplaced already set the honest `unloaded` status.
      console.warn("[train-runtime]", e.message);
      throw e;
    }
    const msg = e instanceof Error ? e.message : String(e);
    setStatus({ state: "error", lastError: `Failed to load train base: ${msg}` });
    throw e;
  }
}

export function disposeTrainerRuntime(): void {
  session = null;
  controller = null;
  trainer = null;
  trainSet = [];
  heldoutSet = [];
  releaseEngineSlot(TRAINER_SLOT_ID);
  setStatus({ state: "unloaded", lossCurve: [], rewardCurve: [], evals: [] });
}

// ---------------------------------------------------------------------------
// Dataset
// ---------------------------------------------------------------------------

function prepare(examples: SftExample[]): {
  prepared: PreparedExample[];
  skipped: number;
} {
  const ctrl = controller;
  if (!ctrl) throw new Error("training session is not loaded");
  const prepared: PreparedExample[] = [];
  let skipped = 0;
  for (const ex of examples) {
    const completion =
      ex.messages.find((m) => m.role === "assistant")?.content ?? "";
    const promptMessages = ex.messages.filter((m) => m.role !== "assistant");
    if (!completion || !promptMessages.length) {
      skipped++;
      continue;
    }
    const mb = ctrl.prepareExample({ messages: promptMessages, completion });
    const active = mb.lossMask.reduce((s, v) => s + v, 0);
    // Same rule as the proven run: an example must fit maxTrainSeq WITHOUT
    // truncation (truncation would drop the completion -> zero trained tokens).
    if (mb.tokens.length <= MAX_TRAIN_SEQ && active > 0) prepared.push(mb);
    else skipped++;
  }
  return { prepared, skipped };
}

/** Fetch + tokenize train/heldout JSONL (same-origin). Real data only. */
export async function loadTrainerDataset(
  trainUrl: string,
  heldoutUrl: string,
): Promise<{ train: number; heldout: number; skipped: number }> {
  requireSession();
  const [trainRes, valRes] = await Promise.all([
    fetch(trainUrl),
    fetch(heldoutUrl),
  ]);
  if (!trainRes.ok) throw new Error(`dataset fetch failed: ${trainUrl} (${trainRes.status})`);
  if (!valRes.ok) throw new Error(`dataset fetch failed: ${heldoutUrl} (${valRes.status})`);
  const trainExamples = parseJsonlExamples(await trainRes.text());
  const heldoutExamples = parseJsonlExamples(await valRes.text());
  const a = prepare(trainExamples);
  const b = prepare(heldoutExamples);
  trainSet = a.prepared;
  heldoutSet = b.prepared;
  const summary = {
    train: trainSet.length,
    heldout: heldoutSet.length,
    skipped: a.skipped + b.skipped,
  };
  if (!trainSet.length || !heldoutSet.length)
    throw new Error(
      `dataset unusable after tokenization (train=${summary.train} heldout=${summary.heldout}, maxSeq=${MAX_TRAIN_SEQ})`,
    );
  setStatus({ dataset: { url: trainUrl, ...summary } });
  return summary;
}

// ---------------------------------------------------------------------------
// Train / eval
// ---------------------------------------------------------------------------

export interface TrainRunOptions {
  steps?: number;
  lr?: number;
  rank?: number;
  gradAccumSteps?: number;
  adapterName?: string;
}

/**
 * Real AdamW LoRA steps on the loaded train split. Hyperparameters default to
 * the validated regime from the proven run (rank 16, alpha 32, lr 2e-4,
 * grad-norm clip 1.0, warmup 5).
 */
export async function runTraining(
  opts: TrainRunOptions = {},
): Promise<{ steps: number; firstLoss: number; lastLoss: number }> {
  const s = requireSession();
  if (!trainSet.length) throw new Error("no dataset loaded — run dataset load first");
  const bridge = await getTrainBridge();
  const steps = Math.max(1, Math.floor(opts.steps ?? 20));
  const accum = Math.max(1, Math.floor(opts.gradAccumSteps ?? 2));
  const rank = Math.max(1, Math.floor(opts.rank ?? 16));
  const name = opts.adapterName ?? "agents-lab";

  const adapter = bridge.createTrainableAdapter(s.rt, {
    name,
    rank,
    alpha: rank * 2,
    targetModules: ["q", "k", "v", "o", "gate", "up", "down"],
  });
  const tr = new bridge.QwenLoraTrainer(s.rt, {
    lr: opts.lr ?? 2e-4,
    maxTrainSeq: MAX_TRAIN_SEQ,
    lmHeadBlock: 128,
    maxGradNorm: 1.0,
    weightDecay: 0.0,
    warmupSteps: 5,
    totalSteps: steps,
    gradAccumSteps: accum,
  });
  tr.attach(adapter);
  trainer = tr;
  s.rt.setLora(adapter);
  s.rt.invalidateLora();

  setStatus({
    state: "training",
    message: `training "${name}" (${steps} steps)`,
    adapterLabel: name,
    lossCurve: [],
  });
  let ti = 0;
  const nextBatch = () => {
    const b: PreparedExample[] = [];
    for (let j = 0; j < accum; j++) b.push(trainSet[ti++ % trainSet.length]);
    return b;
  };
  const curve: TrainStep[] = [];
  try {
    for (let step = 1; step <= steps; step++) {
      const r = await tr.trainStep(nextBatch());
      const entry = { step, loss: r.loss, lr: r.lr, gradNorm: r.gradNorm };
      curve.push(entry);
      setStatus({ lossCurve: [...curve] });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setStatus({ state: "error", lastError: `training failed: ${msg}` });
    throw e;
  }
  setStatus({ state: "ready", message: `trained ${steps} steps` });
  return {
    steps,
    firstLoss: curve[0]?.loss ?? Number.NaN,
    lastLoss: curve[curve.length - 1]?.loss ?? Number.NaN,
  };
}

// ---------------------------------------------------------------------------
// GRPO (group-relative policy optimization) — on-policy, in-browser
// ---------------------------------------------------------------------------

export interface GrpoRunOptions {
  iterations?: number;
  groupSize?: number;
  promptCount?: number;
  lr?: number;
  rank?: number;
  adapterName?: string;
  temperature?: number;
  maxNewTokens?: number;
  /**
   * Same-origin adapter dir to warm-start from (e.g. the SFT bbtriage
   * adapter). GRPO refines an existing policy; from a cold PEFT-init LoRA
   * (delta 0) the model near-never emits a valid verdict, every group scores
   * 0, advantages are all zero and nothing trains. Warm-starting copies the
   * SFT A/B into the trainable buffers, so rollouts start from a policy with
   * reward variance. The trainable adapter adopts the warm adapter's
   * rank/scale (rank opt is ignored) so the seeded weights mean what they
   * meant under SFT.
   */
  warmStartUrl?: string;
}

// Raw JSONL rows -> GRPO prompts with an extractable gold verdict. Rows whose
// assistant turn has no valid verdict are dropped (never fabricate a target).
let grpoPrompts: GrpoPromptRow[] = [];
let grpoHeldout: GrpoPromptRow[] = [];

/** Fetch + parse bbtriage JSONL into GRPO prompts (prompt + gold verdict). */
export async function loadGrpoDataset(
  trainUrl: string,
  heldoutUrl: string,
): Promise<{ train: number; heldout: number; skipped: number }> {
  requireSession();
  const [trainRes, valRes] = await Promise.all([
    fetch(trainUrl),
    fetch(heldoutUrl),
  ]);
  if (!trainRes.ok) throw new Error(`dataset fetch failed: ${trainUrl} (${trainRes.status})`);
  if (!valRes.ok) throw new Error(`dataset fetch failed: ${heldoutUrl} (${valRes.status})`);
  const toPrompts = (raw: string) => {
    const rows = parseJsonlExamples(raw);
    const out: GrpoPromptRow[] = [];
    let skipped = 0;
    for (const row of rows) {
      const p = toGrpoPrompt(row);
      if (p) out.push(p);
      else skipped++;
    }
    return { out, skipped };
  };
  const a = toPrompts(await trainRes.text());
  const b = toPrompts(await valRes.text());
  grpoPrompts = a.out;
  grpoHeldout = b.out;
  const summary = {
    train: grpoPrompts.length,
    heldout: grpoHeldout.length,
    skipped: a.skipped + b.skipped,
  };
  if (!grpoPrompts.length || !grpoHeldout.length)
    throw new Error(
      `GRPO dataset unusable (train=${summary.train} heldout=${summary.heldout})`,
    );
  setStatus({ dataset: { url: trainUrl, ...summary } });
  return summary;
}

/** Held-out disposition accuracy under the current adapter (greedy decode). */
export async function grpoHeldoutAccuracy(
  sampleCount = 8,
): Promise<{ accuracy: number; n: number }> {
  const s = requireSession();
  const n = Math.min(sampleCount, grpoHeldout.length);
  if (!n) return { accuracy: 0, n: 0 };
  let correct = 0;
  for (let i = 0; i < n; i++) {
    const p = grpoHeldout[i];
    let out = "";
    for await (const delta of s.generate(p.messages, {
      maxTokens: 256,
      temperature: 0,
    }))
      out += delta;
    const res = extractTriageVerdict(out);
    const gold = p.gold as TriageVerdict;
    if (res.ok && res.verdict.disposition === gold.disposition) correct++;
  }
  return { accuracy: correct / n, n };
}

/**
 * Real in-browser GRPO on the bbtriage task. Each iteration samples G
 * completions per prompt from the current LoRA policy, scores them with the
 * verifiable bbtriage reward, and applies advantage-weighted policy-gradient
 * steps (the CE backward kernel with float weights). On-policy: the trainer's
 * optimizerStep -> invalidateLora makes the next rollout sample from the
 * updated policy.
 */
export async function runGrpo(
  opts: GrpoRunOptions = {},
): Promise<{
  iterations: number;
  firstReward: number;
  lastReward: number;
}> {
  const s = requireSession();
  if (!grpoPrompts.length)
    throw new Error("no GRPO dataset loaded — call loadGrpoDataset first");
  const bridge = await getTrainBridge();
  const iterations = Math.max(1, Math.floor(opts.iterations ?? 8));
  const groupSize = Math.max(2, Math.floor(opts.groupSize ?? 4));
  const promptCount = Math.max(1, Math.floor(opts.promptCount ?? 2));
  const name = opts.adapterName ?? "agents-lab-grpo";

  // Warm start: parse the SFT adapter first so rank/scale come from it.
  let warmModules: Record<string, LoadedLoraModule> | null = null;
  let rank = Math.max(1, Math.floor(opts.rank ?? 16));
  let scale: number | undefined;
  if (opts.warmStartUrl) {
    setStatus({ message: `warm-starting GRPO from ${opts.warmStartUrl}` });
    const files = await fetchAdapterFilesFromUrl(opts.warmStartUrl);
    const warm = await bridge.loadLoraAdapterGPU(s.dev, files, bridge.QWEN25_3B);
    warmModules = warm.modules;
    const first = Object.values(warmModules)[0];
    if (!first?.rawA || !first?.rawB)
      throw new Error("warm-start adapter has no raw weights to copy");
    rank = first.rank;
    scale = first.scale;
  }

  const adapter = bridge.createTrainableAdapter(s.rt, {
    name,
    rank,
    alpha: rank * 2,
    ...(scale !== undefined ? { scale } : {}),
    targetModules: ["q", "k", "v", "o", "gate", "up", "down"],
  });

  if (warmModules) {
    // Copy SFT A/B into the trainable buffers (identical [rank][in]/[rank][out]
    // layout — see lora_gpu.js). Modules absent from the SFT adapter keep the
    // fresh PEFT init (B=0 -> delta 0). Fail closed on any shape mismatch.
    const dev = s.dev as GpuDeviceLike;
    let seeded = 0;
    for (const [key, mod] of Object.entries(adapter.modules)) {
      const warm = warmModules[key];
      if (!warm?.rawA || !warm?.rawB) continue;
      if (
        warm.rawA.length !== mod.rank * mod.inDim ||
        warm.rawB.length !== mod.rank * mod.outDim
      )
        throw new Error(
          `warm-start shape mismatch at ${key}: A=${warm.rawA.length} B=${warm.rawB.length} vs rank=${mod.rank} in=${mod.inDim} out=${mod.outDim}`,
        );
      dev.queue.writeBuffer(mod.A, 0, warm.rawA);
      dev.queue.writeBuffer(mod.B, 0, warm.rawB);
      seeded++;
    }
    // The loader's own GPU copies are scratch — release them.
    for (const m of Object.values(warmModules)) {
      m.A.destroy?.();
      m.B.destroy?.();
    }
    if (!seeded)
      throw new Error("warm-start matched 0 modules — adapter/model mismatch");
    setStatus({
      message: `warm-started ${seeded} modules (rank=${rank}, scale=${scale})`,
    });
  }
  const tr = new bridge.QwenLoraTrainer(s.rt, {
    lr: opts.lr ?? 1e-5,
    maxTrainSeq: MAX_TRAIN_SEQ,
    lmHeadBlock: 128,
    maxGradNorm: 1.0,
    weightDecay: 0.0,
    warmupSteps: 2,
    totalSteps: iterations,
    gradAccumSteps: 1,
  });
  tr.attach(adapter);
  trainer = tr;
  s.rt.setLora(adapter);
  s.rt.invalidateLora();

  const grpo = new bridge.GrpoController({
    session: s,
    trainer: tr,
    log: (m: string) => console.log("[grpo]", m),
  });

  setStatus({
    state: "training",
    algorithm: "grpo",
    message: `GRPO "${name}" (${iterations} iters, G=${groupSize})`,
    adapterLabel: name,
    rewardCurve: [],
  });

  const curve: GrpoStep[] = [];
  let pi = 0;
  try {
    for (let step = 1; step <= iterations; step++) {
      const prompts: GrpoPromptRow[] = [];
      for (let j = 0; j < promptCount; j++)
        prompts.push(grpoPrompts[pi++ % grpoPrompts.length]);
      const r = await grpo.step({
        prompts,
        groupSize,
        rewardFn: (text, gold) => bbtriageReward(text, gold as TriageVerdict),
        sampling: {
          temperature: opts.temperature ?? 0.9,
          // SFT completions run to ~215 tokens (reasoning + JSON verdict);
          // a 200-token cap truncated the tail and zeroed those rewards.
          maxTokens: opts.maxNewTokens ?? 256,
          topK: 40,
          topP: 0.95,
        },
      });
      const entry: GrpoStep = {
        step,
        meanReward: r.meanReward,
        rewardStd: r.rewardStd,
        gradNorm: r.gradNorm,
        microBatches: r.microBatches,
      };
      curve.push(entry);
      setStatus({
        rewardCurve: [...curve],
        message: `GRPO iter ${step}/${iterations} meanR=${r.meanReward.toFixed(3)}`,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setStatus({ state: "error", lastError: `GRPO failed: ${msg}` });
    throw e;
  }
  setStatus({ state: "ready", message: `GRPO done (${iterations} iters)` });
  return {
    iterations,
    firstReward: curve[0]?.meanReward ?? Number.NaN,
    lastReward: curve[curve.length - 1]?.meanReward ?? Number.NaN,
  };
}

/**
 * Mean held-out loss with the CURRENT trainer adapter active — or, when
 * `base` is true, with a fresh zero adapter (B=0 ≡ base model). Real GPU
 * forward passes on the disjoint heldout split.
 */
export async function runEval(
  label: string,
  { base = false }: { base?: boolean } = {},
): Promise<EvalResult> {
  const s = requireSession();
  if (!heldoutSet.length) throw new Error("no heldout split loaded");
  const bridge = await getTrainBridge();
  let tr = trainer;
  if (base || !tr) {
    // Fresh B=0 adapter: mathematically identical to the raw base model.
    const zero = bridge.createTrainableAdapter(s.rt, {
      name: "eval-base",
      rank: 16,
      alpha: 32,
      targetModules: ["q", "k", "v", "o", "gate", "up", "down"],
    });
    tr = new bridge.QwenLoraTrainer(s.rt, {
      maxTrainSeq: MAX_TRAIN_SEQ,
      lmHeadBlock: 128,
    });
    tr.attach(zero);
  }
  s.rt.setLora(tr.adapter);
  s.rt.invalidateLora();
  let sum = 0;
  for (const mb of heldoutSet) {
    const r = await tr.evalLoss(mb.tokens, mb.lossMask);
    sum += r.loss;
  }
  // Re-bind the trained adapter so training can continue after a base eval.
  if (trainer) {
    s.rt.setLora(trainer.adapter);
    s.rt.invalidateLora();
  }
  const result: EvalResult = {
    label,
    meanLoss: sum / heldoutSet.length,
    examples: heldoutSet.length,
    at: Date.now(),
  };
  setStatus({ evals: [...currentStatus.evals, result] });
  return result;
}

// ---------------------------------------------------------------------------
// Adapter export / equip (OPFS round-trip)
// ---------------------------------------------------------------------------

function fileLike(name: string, bytes: Uint8Array | string): FileLike {
  const raw = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  // Copy into a plain ArrayBuffer (a Uint8Array may be backed by a
  // SharedArrayBuffer, which FileLike callers can't accept).
  const buf = new ArrayBuffer(raw.byteLength);
  new Uint8Array(buf).set(raw);
  return {
    name,
    async text() {
      return new TextDecoder().decode(buf);
    },
    async arrayBuffer() {
      return buf.slice(0);
    },
  };
}

/** Read trained A/B back from the GPU, build PEFT files, persist to OPFS. */
export async function exportTrainedAdapter(
  name: string,
): Promise<{ name: string; safetensorsBytes: number }> {
  if (!trainer) throw new Error("nothing trained yet — run training first");
  const bridge = await getTrainBridge();
  const { safetensors, configJson } = await bridge.exportLoraAdapter(trainer, {
    name,
    baseModel: "WeiboAI/VibeThinker-3B",
  });
  await saveAdapter(name, [
    fileLike("adapters.safetensors", safetensors),
    fileLike("adapter_config.json", configJson),
  ]);
  setStatus({ message: `adapter "${name}" exported to OPFS (${safetensors.byteLength} bytes)` });
  return { name, safetensorsBytes: safetensors.byteLength };
}

export async function listStoredAdapters(): Promise<string[]> {
  return listAdapters();
}

/** Fetch a PEFT/MLX adapter dir (same-origin URL) as FileLike files. */
async function fetchAdapterFilesFromUrl(url: string): Promise<FileLike[]> {
  const base = url.replace(/\/$/, "");
  const names = [
    "adapter_config.json",
    "adapters.safetensors",
    "adapter_model.safetensors",
  ];
  const files: FileLike[] = [];
  for (const n of names) {
    const res = await fetch(`${base}/${n}`);
    if (!res.ok) continue;
    const buf = new Uint8Array(await res.arrayBuffer());
    files.push(fileLike(n, buf));
  }
  if (!files.some((f) => f.name.endsWith(".safetensors")))
    throw new Error(`no adapter weights under ${base}`);
  return files;
}

/** Load an adapter (OPFS by name, or a same-origin URL dir) onto the resident
 *  session — LoRA hot-swap, no weight re-stream. */
export async function equipAdapterOnTrainer(
  source: { opfsName: string } | { url: string },
): Promise<{ modules: number; label: string }> {
  const s = requireSession();
  const bridge = await getTrainBridge();
  let files: FileLike[];
  let label: string;
  if ("opfsName" in source) {
    files = await loadAdapterFiles(source.opfsName);
    label = `opfs:${source.opfsName}`;
  } else {
    files = await fetchAdapterFilesFromUrl(source.url);
    label = source.url.replace(/\/$/, "");
  }
  const lora = await bridge.loadLoraAdapterGPU(s.dev, files, bridge.QWEN25_3B);
  s.rt.setLora(lora);
  s.rt.invalidateLora();
  const modules = Object.keys(lora.modules).length;
  setStatus({ adapterLabel: label, message: `equipped ${label} (${modules} modules)` });
  return { modules, label };
}

/** Clear any active adapter (back to the raw base model). */
export function clearTrainerAdapter(): void {
  const s = requireSession();
  s.rt.clearLora();
  s.rt.invalidateLora();
  setStatus({ adapterLabel: undefined, message: "adapter cleared (base model)" });
}

// ---------------------------------------------------------------------------
// Raw generation on the training session (bbtriage inference + smoke tests)
// ---------------------------------------------------------------------------

export async function trainerGenerate(
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const s = requireSession();
  let out = "";
  for await (const delta of s.generate(messages, {
    maxTokens: opts.maxTokens ?? 512,
    temperature: opts.temperature ?? 0,
  }))
    out += delta;
  return out;
}
