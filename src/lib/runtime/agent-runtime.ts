/**
 * Generic on-device agent runtime — ONE runtime, N app skills.
 *
 * All the hardened machinery lives here exactly once: engine load (single
 * weight stream), adapter equip (single-flight), honest plan parsing (no
 * fabrication), greedy→sampled retry against int4 repetition loops, fail-closed
 * __cold tagging, network retry for weight fetches.
 *
 * An app (Gmail, GitHub, …) supplies only an AppSkill (see app-skill.ts) and
 * calls createAgentRuntime(skill). It gets back the same surface the Gmail
 * runtime has always exposed. The engine (emberglass) never knows apps exist.
 */

import { fetchAdapterManifest } from "./adapter-manifest";
import type { AppSkill } from "./app-skill";
import {
  claimEngineSlot,
  currentEngineSlotOwner,
  DisplacedDuringLoadError,
  releaseEngineSlot,
} from "./engine-slot";
import { extractPlanJson, isValidToolPlan } from "./plan-parse";
import {
  getEmberglass,
  installWeightFetchRetry,
  type EmberglassEngine,
} from "./weight-fetch";

const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

export interface AgentStatus {
  state: "unloaded" | "loading" | "loaded" | "training" | "equipped" | "error";
  modelLabel?: string;
  adapterName?: string;
  /** From the adapter's adapter.json manifest; null for pre-manifest adapters. */
  adapterVersion?: string | null;
  lastError?: string;
  message?: string;
  progress?: { message: string; frac: number };
}

export type AdapterSource =
  | { type: "local-path"; path: string }
  | { type: "http"; url: string }
  | { type: "files"; files: FileLike[] };

export interface FileLike {
  name: string;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface SFTExample {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
}

export interface GenericSingleToolPlan {
  tool: string;
  args: Record<string, unknown>;
  /** Set on any non-plan fallback. Never on a real, valid weight-driven plan. */
  __cold?: boolean;
  /** True when real inference ran but its output wasn't a valid plan. */
  __ran?: boolean;
  /** Raw model text captured when __ran is set, for honest inspection. */
  raw?: string;
}

export interface GenericMultiStepPlan {
  steps: Array<{ tool: string; args: Record<string, unknown> }>;
}

export type GenericPlan = GenericSingleToolPlan | GenericMultiStepPlan;

export interface AgentRuntime {
  loadBaseModel(): Promise<void>;
  equipAdapter(adapterSource: AdapterSource): Promise<void>;
  generate(prompt: string): Promise<GenericPlan>;
  disposeRuntime(): void;
  getAgentStatus(): AgentStatus;
  subscribeAgentStatus(listener: (s: AgentStatus) => void): () => void;
  isEquippedForRealInference(): boolean;
}

// Base weights are served same-origin (/model). modelUrl overrides hfRepo in
// the emberglass bridge; HF is only a fallback. One base model for all skills.
const BASE_MODEL_URL = "/model";
const BASE_HF_REPO = "WeiboAI/VibeThinker-3B";

export function createAgentRuntime(skill: AppSkill): AgentRuntime {
  const tag = `[agent:${skill.id}]`;
  const slotId = `skill:${skill.id}`;

  let engine: EmberglassEngine | null = null;
  let currentStatus: AgentStatus = { state: "unloaded" };
  const listeners = new Set<(s: AgentStatus) => void>();
  let equipInFlight: Promise<void> | null = null;

  // GPU residency is coordinated by the engine slot (one engine at a time,
  // in-tab swaps between chat/skill models + the cross-tab Web Lock). When
  // another model takes the slot, this runtime is displaced: GPU resources
  // are dropped and the status goes honestly `unloaded` — never a stale
  // "equipped" for weights that are gone.
  function onDisplaced() {
    try {
      if (engine?.dispose) engine.dispose();
    } catch {}
    engine = null;
    setStatus({
      state: "unloaded",
      adapterName: undefined,
      message: `${skill.label} model unloaded (another model took the GPU)`,
    });
  }

  async function ensureEngineSlot(): Promise<boolean> {
    return claimEngineSlot(slotId, onDisplaced);
  }

  function setStatus(next: Partial<AgentStatus>) {
    currentStatus = { ...currentStatus, ...next };
    for (const l of listeners) l(currentStatus);
    console.log(
      `${tag} state ->`,
      currentStatus.state,
      currentStatus.message || currentStatus.lastError || "",
    );
  }

  const notifyProgress = (message: string, frac: number) =>
    setStatus({ progress: { message, frac } });
  const notifyError = (err: string) =>
    setStatus({ state: "error", lastError: err });

  function isEquippedForRealInference(): boolean {
    return !!engine && currentStatus.state === "equipped";
  }

  function coldSentinel(
    extra?: Partial<GenericSingleToolPlan>,
  ): GenericSingleToolPlan {
    // Tagged sentinel; executePlan refuses __cold, UI shows it as a failure.
    return { tool: skill.allowedTools[0], args: {}, __cold: true, ...extra };
  }

  async function loadBaseModel(): Promise<void> {
    if (engine) {
      setStatus({ state: "loaded", modelLabel: engine.label || "emberglass" });
      return;
    }
    if (!(await ensureEngineSlot())) {
      const msg =
        "Agent engine is active in another tab — close the chat there (or the tab) and retry here.";
      setStatus({ state: "error", lastError: msg });
      throw new Error(msg);
    }
    installWeightFetchRetry();
    setStatus({
      state: "loading",
      message: `Loading ${BASE_HF_REPO} base (WebGPU)...`,
    });
    notifyProgress("starting base model load", 0.05);
    try {
      const ember = await getEmberglass();
      const fresh = await ember.createEmberglassEngine({
        modelUrl: BASE_MODEL_URL,
        hfRepo: BASE_HF_REPO,
        // log fires per weight tensor during the stream — the displacement
        // check aborts a stream whose slot was taken instead of quantizing
        // 2GB into GPU buffers that would only be discarded at the end.
        log: (m: string) => {
          if (currentEngineSlotOwner() !== slotId)
            throw new DisplacedDuringLoadError(slotId);
          console.log("[emberglass]", m);
        },
        onProgress: (m: string, f: number) => notifyProgress(m, f),
      });
      // The stream takes minutes; another model may have claimed the slot
      // meanwhile. Installing the engine anyway would double GPU residency.
      if (currentEngineSlotOwner() !== slotId) {
        try {
          fresh.dispose?.();
        } catch {}
        throw new DisplacedDuringLoadError(slotId);
      }
      engine = fresh;
      setStatus({
        state: "loaded",
        modelLabel: engine.label || `${BASE_HF_REPO} (WebGPU)`,
        message: "Base model ready",
      });
    } catch (e) {
      if (e instanceof DisplacedDuringLoadError) {
        // onDisplaced already set the honest `unloaded` status.
        console.warn(`${tag} ${e.message}`);
        throw e;
      }
      console.error(`${tag} base model load failed`, e);
      const msg = errorMessage(e);
      let friendly = `Failed to load base model: ${msg}`;
      if (/WebGPU|gpu|navigator\.gpu/i.test(msg) || !("gpu" in navigator)) {
        friendly +=
          " — WebGPU not available (need Chrome/Edge on https or localhost with secure context).";
      }
      notifyError(friendly);
      throw e;
    }
  }

  async function loadAdapterFilesFromSource(
    src: AdapterSource,
  ): Promise<FileLike[]> {
    if (src.type === "files") return src.files;
    let base: string;
    if (src.type === "http") base = src.url.replace(/\/$/, "");
    else if (src.type === "local-path")
      base = src.path.startsWith("/") ? src.path : `/adapters/${src.path}`;
    else throw new Error("Unsupported AdapterSource");

    const names = [
      "adapter_config.json",
      "adapters.safetensors",
      "adapter_model.safetensors",
    ];
    const out: FileLike[] = [];
    for (const name of names) {
      try {
        const res = await fetch(`${base}/${name}`);
        if (!res.ok) continue;
        const buf = new Uint8Array(await res.arrayBuffer());
        out.push({
          name,
          async text() {
            return new TextDecoder().decode(buf);
          },
          async arrayBuffer() {
            return buf.buffer.slice(
              buf.byteOffset,
              buf.byteOffset + buf.byteLength,
            );
          },
        });
      } catch {}
    }
    if (!out.some((f) => f.name.endsWith(".safetensors")))
      throw new Error(`No .safetensors found under ${base}`);
    if (!out.some((f) => f.name === "adapter_config.json"))
      throw new Error(`No adapter_config.json found under ${base}`);
    return out;
  }

  // Single-flight: concurrent equips share one in-flight engine build instead
  // of streaming the model weights N times.
  async function equipAdapter(adapterSource: AdapterSource): Promise<void> {
    if (isEquippedForRealInference()) return;
    if (equipInFlight) return equipInFlight;
    equipInFlight = doEquipAdapter(adapterSource).finally(() => {
      equipInFlight = null;
    });
    return equipInFlight;
  }

  async function doEquipAdapter(adapterSource: AdapterSource): Promise<void> {
    if (!(await ensureEngineSlot())) {
      const msg =
        "Agent engine is active in another tab — close the chat there (or the tab) and retry here.";
      setStatus({ state: "error", lastError: msg });
      throw new Error(msg);
    }
    // No base pre-load: the bridge applies the LoRA at engine-create time, so
    // base+adapter is built in ONE weight stream.
    installWeightFetchRetry();
    setStatus({
      state: "loading",
      message: `Equipping adapter from ${adapterSource.type}...`,
    });
    try {
      const ember = await getEmberglass();
      let loraUrl: string;
      if (adapterSource.type === "http")
        loraUrl = adapterSource.url.replace(/\/$/, "");
      else if (adapterSource.type === "local-path")
        loraUrl = adapterSource.path.startsWith("/")
          ? adapterSource.path.replace(/\/$/, "")
          : `/adapters/${adapterSource.path}`;
      else
        throw new Error(
          "equipAdapter: 'files' source is not supported — serve the adapter dir and use {type:'http'|'local-path'}",
        );

      // Validate the adapter exists before the expensive engine build.
      const files = await loadAdapterFilesFromSource({
        type: "http",
        url: loraUrl,
      });
      console.log(
        `${tag} equipAdapter files:`,
        files.map((f) => f.name).join(", "),
      );

      const fresh = await ember.createEmberglassEngine({
        modelUrl: BASE_MODEL_URL,
        hfRepo: BASE_HF_REPO,
        loraUrl,
        // log fires per weight tensor during the stream — abort a stream
        // whose slot was taken (this is the exact race the agents-lab E2E
        // hit: the preload equip finished mid-training and stalled it).
        log: (m: string) => {
          if (currentEngineSlotOwner() !== slotId)
            throw new DisplacedDuringLoadError(slotId);
          console.log("[emberglass]", m);
        },
        onProgress: (m: string, f: number) => notifyProgress(m, f),
      });
      // Displaced while streaming (e.g. the trainer took the GPU): discard the
      // fresh engine instead of installing a second model over budget.
      if (currentEngineSlotOwner() !== slotId) {
        try {
          fresh.dispose?.();
        } catch {}
        throw new DisplacedDuringLoadError(slotId);
      }
      if (engine?.dispose) engine.dispose();
      engine = fresh;
      // Identity manifest is optional (pre-manifest adapters equip with
      // version null); its absence or failure must never fail the equip.
      const manifest = await fetchAdapterManifest(loraUrl);
      setStatus({
        state: "equipped",
        adapterName: skill.id,
        adapterVersion: manifest?.version ?? null,
        message: `Real ${skill.label} LoRA equipped (weights active${manifest?.version ? `, ${manifest.version}` : ""})`,
      });
    } catch (e) {
      if (e instanceof DisplacedDuringLoadError) {
        // onDisplaced already set the honest `unloaded` status.
        console.warn(`${tag} ${e.message}`);
        throw e;
      }
      console.error(`${tag} equipAdapter failed`, e);
      const msg = errorMessage(e);
      let friendly = `Failed to equip ${skill.label} LoRA: ${msg}`;
      if (/fetch|404|adapter|loraUrl/i.test(msg)) {
        friendly += ` — Make sure the adapter is at ${skill.adapterUrl} (config + safetensors) and publicly served.`;
      }
      notifyError(friendly);
      throw e;
    }
  }

  async function generate(prompt: string): Promise<GenericPlan> {
    if (!engine || currentStatus.state !== "equipped") {
      console.error(
        `${tag} ERROR generate COLD — no equipped weights (no real inference)`,
      );
      return coldSentinel();
    }
    try {
      const messages = [
        { role: "system" as const, content: skill.systemPrompt },
        { role: "user" as const, content: prompt },
      ];

      // Greedy first (deterministic, best when it works), then SAMPLED retries:
      // int4 weights make greedy decoding fall into repetition loops that never
      // form a valid plan; sampling breaks the deterministic loop. Retries use
      // a NARROW nucleus (low topK/topP) — enough randomness to escape the loop,
      // not enough to shred the JSON. Still the real weights — honest recovery,
      // not fabrication.
      const attempts = [
        { temperature: 0, label: "greedy" },
        { temperature: 0.3, topK: 10, topP: 0.9, label: "sampled@0.3/k10" },
        { temperature: 0.5, topK: 20, topP: 0.95, label: "sampled@0.5/k20" },
        { temperature: 0.8, topK: 40, topP: 1.0, label: "sampled@0.8/k40" },
      ];

      let lastRaw = "";
      for (const a of attempts) {
        console.log(
          `${tag} generate REAL path (${a.label}), prompt len=${prompt.length}`,
        );
        const text = await engine.chatComplete(messages, {
          temperature: a.temperature,
          maxTokens: 512,
          ...(a.topK ? { topK: a.topK } : {}),
          ...(a.topP ? { topP: a.topP } : {}),
        });
        lastRaw = String(text);
        console.log(
          `${tag} raw model output ${a.label} (first 200):`,
          lastRaw.slice(0, 200),
        );

        // extractPlanJson only recovers a COMPLETE, VALID plan the model
        // actually produced; it never fabricates or repairs values. NOT replay.
        const plan = extractPlanJson(text, skill.allowedTools);
        if (plan && isValidToolPlan(plan, skill.allowedTools)) {
          setStatus({ state: "equipped", lastError: undefined });
          return plan as GenericPlan;
        }
        console.warn(`${tag} ${a.label} did not yield a valid plan`);
      }

      // All attempts failed. Keep the engine EQUIPPED (a bad output must not
      // poison later prompts) but tag __cold so nothing treats it as a plan.
      console.error(
        `${tag} no valid plan after greedy + sampled retries (real inference)`,
      );
      setStatus({ lastError: "model output not a valid plan (after retries)" });
      return coldSentinel({ __ran: true, raw: lastRaw.slice(0, 500) });
    } catch (e) {
      console.error(
        `${tag} generate threw (engine kept equipped):`,
        errorMessage(e),
      );
      setStatus({ lastError: `generate error: ${errorMessage(e)}` });
      return coldSentinel();
    }
  }

  function disposeRuntime(): void {
    try {
      if (engine && typeof engine.dispose === "function") engine.dispose();
    } catch {}
    engine = null;
    releaseEngineSlot(slotId);
    setStatus({ state: "unloaded" });
  }

  return {
    loadBaseModel,
    equipAdapter,
    generate,
    disposeRuntime,
    getAgentStatus: () => ({ ...currentStatus }),
    subscribeAgentStatus(listener: (s: AgentStatus) => void) {
      listeners.add(listener);
      listener(currentStatus);
      return () => listeners.delete(listener);
    },
    isEquippedForRealInference,
  };
}
