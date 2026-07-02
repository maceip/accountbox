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

import type { AppSkill } from './app-skill';
import { extractPlanJson, isValidToolPlan } from './plan-parse';

export interface AgentStatus {
  state: 'unloaded' | 'loading' | 'loaded' | 'training' | 'equipped' | 'error';
  modelLabel?: string;
  adapterName?: string;
  lastError?: string;
  message?: string;
  progress?: { message: string; frac: number };
}

export type AdapterSource =
  | { type: 'local-path'; path: string }
  | { type: 'http'; url: string }
  | { type: 'files'; files: FileLike[] };

export interface FileLike {
  name: string;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface SFTExample {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
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
const BASE_MODEL_URL = '/model';
const BASE_HF_REPO = 'WeiboAI/VibeThinker-3B';

// The engine streams the 6GB weights as thousands of Range fetches; over a real
// network ONE transient drop used to kill the entire load. Emberglass is
// consumed as-is, so the retry lives here: a scoped wrapper around global fetch
// that retries weight/adapter requests with backoff. Installed once.
let fetchRetryInstalled = false;
function installWeightFetchRetry() {
  if (fetchRetryInstalled || typeof window === 'undefined') return;
  fetchRetryInstalled = true;
  const orig = window.fetch.bind(window);
  window.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const isWeights = url.includes('/model/') || url.includes('/adapters/');
    if (!isWeights) return orig(input, init);
    let lastErr: unknown;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const res = await orig(input, init);
        if (res.status >= 500) throw new Error(`server ${res.status}`);
        return res;
      } catch (e) {
        lastErr = e;
        const delay = Math.min(500 * 2 ** attempt, 8000);
        console.warn(`[agent-runtime] weight fetch retry ${attempt + 1}/6 in ${delay}ms:`, String(e).slice(0, 120));
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }) as typeof window.fetch;
}

// Dynamic import of the real engine. `emberglass` is a DECLARED file: dependency
// (package.json -> ../emberglass), so the coupling is visible in one place and
// `bun install` fails loudly if the engine checkout is missing — instead of a
// naked ../../../../ path that only worked on one machine by accident.
async function getEmberglass() {
  // @ts-ignore - external ESM, no .d.ts
  const mod = await import('emberglass/src/emberglass_bridge.js');
  return mod;
}

export function createAgentRuntime(skill: AppSkill): AgentRuntime {
  const tag = `[agent:${skill.id}]`;

  let engine: any = null; // { chatComplete, dispose, label? }
  let currentStatus: AgentStatus = { state: 'unloaded' };
  const listeners = new Set<(s: AgentStatus) => void>();
  let equipInFlight: Promise<void> | null = null;

  function setStatus(next: Partial<AgentStatus>) {
    currentStatus = { ...currentStatus, ...next };
    listeners.forEach((l) => l(currentStatus));
    console.log(`${tag} state ->`, currentStatus.state, currentStatus.message || currentStatus.lastError || '');
  }

  const notifyProgress = (message: string, frac: number) => setStatus({ progress: { message, frac } });
  const notifyError = (err: string) => setStatus({ state: 'error', lastError: err });

  function isEquippedForRealInference(): boolean {
    return !!engine && currentStatus.state === 'equipped';
  }

  function coldSentinel(extra?: Partial<GenericSingleToolPlan>): GenericSingleToolPlan {
    // Tagged sentinel; executePlan refuses __cold, UI shows it as a failure.
    return { tool: skill.allowedTools[0], args: {}, __cold: true, ...extra };
  }

  async function loadBaseModel(): Promise<void> {
    if (engine) {
      setStatus({ state: 'loaded', modelLabel: engine.label || 'emberglass' });
      return;
    }
    installWeightFetchRetry();
    setStatus({ state: 'loading', message: `Loading ${BASE_HF_REPO} base (WebGPU)...` });
    notifyProgress('starting base model load', 0.05);
    try {
      const ember = await getEmberglass();
      engine = await ember.createEmberglassEngine({
        modelUrl: BASE_MODEL_URL,
        hfRepo: BASE_HF_REPO,
        log: (m: string) => console.log('[emberglass]', m),
        onProgress: (m: string, f: number) => notifyProgress(m, f),
      });
      setStatus({ state: 'loaded', modelLabel: engine.label || `${BASE_HF_REPO} (WebGPU)`, message: 'Base model ready' });
    } catch (e: any) {
      console.error(`${tag} base model load failed`, e);
      const msg = e?.message || String(e);
      let friendly = `Failed to load base model: ${msg}`;
      if (/WebGPU|gpu|navigator\.gpu/i.test(msg) || !('gpu' in (navigator as any))) {
        friendly += ' — WebGPU not available (need Chrome/Edge on https or localhost with secure context).';
      }
      notifyError(friendly);
      throw e;
    }
  }

  async function loadAdapterFilesFromSource(src: AdapterSource): Promise<FileLike[]> {
    if (src.type === 'files') return src.files;
    let base: string;
    if (src.type === 'http') base = src.url.replace(/\/$/, '');
    else if (src.type === 'local-path') base = src.path.startsWith('/') ? src.path : `/adapters/${src.path}`;
    else throw new Error('Unsupported AdapterSource');

    const names = ['adapter_config.json', 'adapters.safetensors', 'adapter_model.safetensors'];
    const out: FileLike[] = [];
    for (const name of names) {
      try {
        const res = await fetch(`${base}/${name}`);
        if (!res.ok) continue;
        const buf = new Uint8Array(await res.arrayBuffer());
        out.push({
          name,
          async text() { return new TextDecoder().decode(buf); },
          async arrayBuffer() { return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength); },
        });
      } catch {}
    }
    if (!out.some((f) => f.name.endsWith('.safetensors'))) throw new Error(`No .safetensors found under ${base}`);
    if (!out.some((f) => f.name === 'adapter_config.json')) throw new Error(`No adapter_config.json found under ${base}`);
    return out;
  }

  // Single-flight: concurrent equips share one in-flight engine build instead
  // of streaming the 6GB weights N times.
  async function equipAdapter(adapterSource: AdapterSource): Promise<void> {
    if (isEquippedForRealInference()) return;
    if (equipInFlight) return equipInFlight;
    equipInFlight = doEquipAdapter(adapterSource).finally(() => { equipInFlight = null; });
    return equipInFlight;
  }

  async function doEquipAdapter(adapterSource: AdapterSource): Promise<void> {
    // No base pre-load: the bridge applies the LoRA at engine-create time, so
    // base+adapter is built in ONE weight stream.
    installWeightFetchRetry();
    setStatus({ state: 'loading', message: `Equipping adapter from ${adapterSource.type}...` });
    try {
      const ember = await getEmberglass();
      let loraUrl: string;
      if (adapterSource.type === 'http') loraUrl = adapterSource.url.replace(/\/$/, '');
      else if (adapterSource.type === 'local-path')
        loraUrl = adapterSource.path.startsWith('/') ? adapterSource.path.replace(/\/$/, '') : `/adapters/${adapterSource.path}`;
      else throw new Error("equipAdapter: 'files' source is not supported — serve the adapter dir and use {type:'http'|'local-path'}");

      // Validate the adapter exists before the expensive engine build.
      const files = await loadAdapterFilesFromSource({ type: 'http', url: loraUrl });
      console.log(`${tag} equipAdapter files:`, files.map((f) => f.name).join(', '));

      const fresh = await ember.createEmberglassEngine({
        modelUrl: BASE_MODEL_URL,
        hfRepo: BASE_HF_REPO,
        loraUrl,
        log: (m: string) => console.log('[emberglass]', m),
        onProgress: (m: string, f: number) => notifyProgress(m, f),
      });
      if (engine?.dispose) engine.dispose();
      engine = fresh;
      setStatus({ state: 'equipped', adapterName: skill.id, message: `Real ${skill.label} LoRA equipped (weights active)` });
    } catch (e: any) {
      console.error(`${tag} equipAdapter failed`, e);
      const msg = e?.message || String(e);
      let friendly = `Failed to equip ${skill.label} LoRA: ${msg}`;
      if (/fetch|404|adapter|loraUrl/i.test(msg)) {
        friendly += ` — Make sure the adapter is at ${skill.adapterUrl} (config + safetensors) and publicly served.`;
      }
      notifyError(friendly);
      throw e;
    }
  }

  async function generate(prompt: string): Promise<GenericPlan> {
    if (!engine || currentStatus.state !== 'equipped') {
      console.error(`${tag} ERROR generate COLD — no equipped weights (no real inference)`);
      return coldSentinel();
    }
    try {
      const messages = [
        { role: 'system' as const, content: skill.systemPrompt },
        { role: 'user' as const, content: prompt },
      ];

      // Greedy first (deterministic, best when it works), then SAMPLED retries:
      // int4 weights make greedy decoding fall into repetition loops that never
      // form a valid plan; sampling breaks the deterministic loop. Retries use
      // a NARROW nucleus (low topK/topP) — enough randomness to escape the loop,
      // not enough to shred the JSON. Still the real weights — honest recovery,
      // not fabrication.
      const attempts = [
        { temperature: 0, label: 'greedy' },
        { temperature: 0.3, topK: 10, topP: 0.9, label: 'sampled@0.3/k10' },
        { temperature: 0.5, topK: 20, topP: 0.95, label: 'sampled@0.5/k20' },
        { temperature: 0.8, topK: 40, topP: 1.0, label: 'sampled@0.8/k40' },
      ];

      let lastRaw = '';
      for (const a of attempts) {
        console.log(`${tag} generate REAL path (${a.label}), prompt len=${prompt.length}`);
        const text = await engine.chatComplete(messages, {
          temperature: a.temperature,
          maxTokens: 512,
          ...(a.topK ? { topK: a.topK } : {}),
          ...(a.topP ? { topP: a.topP } : {}),
        });
        lastRaw = String(text);
        console.log(`${tag} raw model output ${a.label} (first 200):`, lastRaw.slice(0, 200));

        // extractPlanJson only recovers a COMPLETE, VALID plan the model
        // actually produced; it never fabricates or repairs values. NOT replay.
        const plan: any = extractPlanJson(text, skill.allowedTools);
        if (plan && isValidToolPlan(plan, skill.allowedTools)) {
          setStatus({ state: 'equipped', lastError: undefined });
          return plan as GenericPlan;
        }
        console.warn(`${tag} ${a.label} did not yield a valid plan`);
      }

      // All attempts failed. Keep the engine EQUIPPED (a bad output must not
      // poison later prompts) but tag __cold so nothing treats it as a plan.
      console.error(`${tag} no valid plan after greedy + sampled retries (real inference)`);
      setStatus({ lastError: 'model output not a valid plan (after retries)' });
      return coldSentinel({ __ran: true, raw: lastRaw.slice(0, 500) });
    } catch (e: any) {
      console.error(`${tag} generate threw (engine kept equipped):`, e?.message || e);
      setStatus({ lastError: `generate error: ${e?.message || e}` });
      return coldSentinel();
    }
  }

  function disposeRuntime(): void {
    try {
      if (engine && typeof engine.dispose === 'function') engine.dispose();
    } catch {}
    engine = null;
    setStatus({ state: 'unloaded' });
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
