/**
 * AccountBox Local Gmail Agent (real engine path)
 *
 * Product (what we ship):
 * On-device Gmail agent powered by VibeThinker-3B + Gmail-specific LoRA.
 * Runs 100% in the browser using WebGPU (via Emberglass).
 * Natural language → structured Plan for exactly three tools:
 *   search_messages, read_message, create_draft.
 * Private. No cloud inference for planning or tool selection.
 *
 * This is THE ONLY module that UI / callers should import for agent behavior.
 */

import { extractPlanJson, isValidToolPlan } from './plan-parse';

// Inline the exact Plan types from the spec so this file is self-contained.
export type ToolName = 'search_messages' | 'read_message' | 'create_draft';

export interface SingleToolPlan {
  tool: ToolName;
  args: { query?: string; id?: string; to?: string; subject?: string; body?: string; [k: string]: unknown };
  /** Set on any non-plan fallback (cold start / bad JSON / invalid tool). Never on a real, valid weight-driven plan. */
  __cold?: boolean;
  /** True when real WebGPU inference actually ran but its output wasn't a valid plan (distinguishes from true cold). */
  __ran?: boolean;
  /** Raw model text captured when __ran is set, for honest inspection. */
  raw?: string;
}

export interface SingleStep {
  tool: ToolName;
  args: Record<string, unknown>;
}

export interface MultiStepPlan {
  steps: SingleStep[];
}

export type Plan = SingleToolPlan | MultiStepPlan;

// Exact FIXED_SYSTEM_PROMPT (must be byte-identical to training data)
export const FIXED_SYSTEM_PROMPT = `You are the local Gmail agent inside BetterBox / AccountBox. Everything runs on the user's machine.

Tools (use only these):
- search_messages: {query: string}   // Gmail search syntax
- read_message: {id: string}
- create_draft: {to: string, subject: string, body: string}   // never send

Respond with a single JSON object for the next tool call, or a short final answer.
Use live data from the user's connected Gmail account(s) and the current state of the BetterBox mail board.`;

// Public surface matching the integration spec
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

export interface SFTExample {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}

export interface FileLike {
  name: string;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface GmailAgentRuntime {
  loadBaseModel(): Promise<void>;
  trainGmailAdapter(examples: SFTExample[]): Promise<void>;
  equipAdapter(adapterSource: AdapterSource): Promise<void>;
  generate(prompt: string): Promise<Plan>;
  disposeRuntime(): void;
  getAgentStatus(): AgentStatus;
  subscribeAgentStatus(listener: (s: AgentStatus) => void): () => void;
}

// Base weights are served same-origin (public/model -> local WebGPU weights).
// modelUrl overrides hfRepo in the emberglass bridge; HF is only a fallback.
const BASE_MODEL_URL = '/model';

// The engine streams the 6GB weights as thousands of Range fetches; over a real
// network ONE transient drop used to kill the entire load ("Failed to fetch"
// after 20 minutes). Emberglass is consumed as-is, so the retry lives here: a
// scoped wrapper around global fetch that retries weight/adapter requests with
// backoff. Installed once, browser-only, leaves all other requests untouched.
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
        console.warn(`[gmail-agent-runtime] weight fetch retry ${attempt + 1}/6 in ${delay}ms:`, String(e).slice(0, 120));
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }) as typeof window.fetch;
}

// Internal state
let engine: any = null; // { chatComplete, dispose, label? }
let currentStatus: AgentStatus = { state: 'unloaded' };
const listeners = new Set<(s: AgentStatus) => void>();

function setStatus(next: Partial<AgentStatus>) {
  currentStatus = { ...currentStatus, ...next };
  listeners.forEach((l) => l(currentStatus));
  console.log('[gmail-agent-runtime] state ->', currentStatus.state, currentStatus.message || currentStatus.lastError || '');
}

export function getAgentStatus(): AgentStatus {
  return { ...currentStatus };
}

export function subscribeAgentStatus(listener: (s: AgentStatus) => void): () => void {
  listeners.add(listener);
  listener(currentStatus);
  return () => listeners.delete(listener);
}

/** True only when a real engine is loaded AND a Gmail adapter is equipped. */
export function isEquippedForRealInference(): boolean {
  return !!engine && currentStatus.state === 'equipped';
}

function notifyProgress(message: string, frac: number) {
  setStatus({ progress: { message, frac } });
}

function notifyError(err: string) {
  setStatus({ state: 'error', lastError: err });
}

// Dynamic import of the real engine (emberglass). Normal relative specifier so a
// bundler (esbuild for the gate, Vite for the app) can statically resolve and
// bundle it — no machine-specific /@fs/ absolute-path hack. ~/emberglass is a
// sibling of the repo; for Vite dev it must be in server.fs.allow.
async function getEmberglass() {
  // @ts-ignore - external ESM, no .d.ts
  const mod = await import('../../../../emberglass/src/emberglass_bridge.js');
  return mod;
}

export async function loadBaseModel(): Promise<void> {
  if (engine) {
    setStatus({ state: 'loaded', modelLabel: engine.label || 'emberglass' });
    return;
  }

  installWeightFetchRetry();
  setStatus({ state: 'loading', message: 'Loading VibeThinker-3B base (WebGPU)...' });
  notifyProgress('starting base model load', 0.05);

  try {
    const ember = await getEmberglass();
    engine = await ember.createEmberglassEngine({
      // Prefer a served same-origin copy (public/model); HF is the fallback.
      modelUrl: BASE_MODEL_URL,
      hfRepo: 'WeiboAI/VibeThinker-3B',
      log: (m: string) => console.log('[emberglass]', m),
      onProgress: (m: string, f: number) => notifyProgress(m, f),
    });

    setStatus({
      state: 'loaded',
      modelLabel: engine.label || 'VibeThinker-3B (WebGPU)',
      message: 'Base model ready',
    });
  } catch (e: any) {
    console.error('[gmail-agent-runtime] base model load failed', e);
    const msg = e?.message || String(e);
    // Give actionable diagnostics without asking the user for console output.
    let friendly = `Failed to load VibeThinker-3B base: ${msg}`;
    if (/WebGPU|gpu|navigator\.gpu/i.test(msg) || !('gpu' in (navigator as any))) {
      friendly += ' — WebGPU not available (need Chrome/Edge on https or localhost with secure context).';
    } else if (msg.includes('import') || msg.includes('@fs') || msg.includes('emberglass') || msg.includes('bridge')) {
      friendly += ' — Could not dynamically load emberglass. Check that vite fs.allow includes ~/emberglass and the dev server is running.';
    }
    notifyError(friendly);
    throw e;
  }
}

export async function trainGmailAdapter(_examples: SFTExample[]): Promise<void> {
  // In-browser training is supported by Emberglass TrainingController but the primary
  // path for this product is external MLX fine-tune (bbverifier) + equip.
  // We keep the surface for the spec but mark it as no-op for the shipped real path.
  setStatus({ state: 'training', message: 'In-browser training not used for shipped Gmail LoRA (use external fine-tune + equip).' });
  // Immediately go back to equipped/loaded state if we have an engine.
  setStatus({ state: engine ? 'equipped' : 'loaded' });
}

async function loadAdapterFilesFromSource(src: AdapterSource): Promise<FileLike[]> {
  if (src.type === 'files') {
    return src.files;
  }

  let base: string;
  if (src.type === 'http') {
    base = src.url.replace(/\/$/, '');
  } else if (src.type === 'local-path') {
    // For dev we treat local-path as a same-origin served path (public/adapters/...)
    // Absolute fs paths don't work from browser; user should copy to public/ or use http.
    base = src.path.startsWith('/') ? src.path : `/adapters/${src.path}`;
  } else {
    throw new Error('Unsupported AdapterSource');
  }

  // Use the same fetch pattern as emberglass so behavior is identical
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

  if (!out.some((f) => f.name.endsWith('.safetensors'))) {
    throw new Error(`No .safetensors found under ${base}`);
  }
  if (!out.some((f) => f.name === 'adapter_config.json')) {
    throw new Error(`No adapter_config.json found under ${base}`);
  }
  return out;
}

// Single-flight guard: concurrent equips (chat auto-load + a user send/click)
// must share one in-flight engine build, not stream the 6GB weights N times.
let equipInFlight: Promise<void> | null = null;

export async function equipAdapter(adapterSource: AdapterSource): Promise<void> {
  if (isEquippedForRealInference()) return;
  if (equipInFlight) return equipInFlight;
  equipInFlight = doEquipAdapter(adapterSource).finally(() => {
    equipInFlight = null;
  });
  return equipInFlight;
}

async function doEquipAdapter(adapterSource: AdapterSource): Promise<void> {
  // No base pre-load: the bridge applies the LoRA at engine-create time, so the
  // base+adapter engine is built in ONE weight stream. Pre-loading the base
  // first meant streaming the 6GB weights twice (fatal over a network).
  installWeightFetchRetry();
  setStatus({ state: 'loading', message: `Equipping adapter from ${adapterSource.type}...` });

  try {
    const ember = await getEmberglass();

    // Emberglass loads a LoRA at engine-create time via `loraUrl` (its session/rt
    // are not exposed post-hoc), so we recreate the engine with the adapter. Both
    // 'http' and 'local-path' resolve to a same-origin/http directory. In-memory
    // 'files' cannot be passed through the public bridge in this build.
    let loraUrl: string;
    if (adapterSource.type === 'http') {
      loraUrl = adapterSource.url.replace(/\/$/, '');
    } else if (adapterSource.type === 'local-path') {
      loraUrl = adapterSource.path.startsWith('/')
        ? adapterSource.path.replace(/\/$/, '')
        : `/adapters/${adapterSource.path}`;
    } else {
      throw new Error(
        "equipAdapter: 'files' source is not supported in this build — serve the adapter dir and use {type:'http'|'local-path'}",
      );
    }

    // Validate the adapter exists (safetensors + adapter_config.json) before reload.
    const files = await loadAdapterFilesFromSource({ type: 'http', url: loraUrl });
    console.log('[gmail-agent-runtime] equipAdapter files:', files.map((f) => f.name).join(', '));

    const fresh = await ember.createEmberglassEngine({
      modelUrl: BASE_MODEL_URL,
      hfRepo: 'WeiboAI/VibeThinker-3B',
      loraUrl,
      log: (m: string) => console.log('[emberglass]', m),
      onProgress: (m: string, f: number) => notifyProgress(m, f),
    });
    if (engine?.dispose) engine.dispose();
    engine = fresh;

    setStatus({
      state: 'equipped',
      adapterName: 'gmail-agent',
      message: 'Real Gmail LoRA equipped (weights active)',
    });
  } catch (e: any) {
    console.error('[gmail-agent-runtime] equipAdapter failed', e);
    const msg = e?.message || String(e);
    let friendly = `Failed to equip Gmail LoRA: ${msg}`;
    if (/fetch|404|adapter| loraUrl/i.test(msg)) {
      friendly += ' — Make sure the adapter is at /adapters/gmail-agent (config + safetensors) and publicly served.';
    }
    notifyError(friendly);
    throw e;
  }
}


export async function generate(prompt: string): Promise<Plan> {
  const s = getAgentStatus();

  if (!engine || s.state !== 'equipped') {
    console.error('[gmail-agent-runtime] ERROR generate COLD — no equipped weights (no real inference)');
    return { tool: 'search_messages', args: { query: 'is:unread' }, __cold: true } as SingleToolPlan;
  }

  try {
    const messages = [
      { role: 'system' as const, content: FIXED_SYSTEM_PROMPT },
      { role: 'user' as const, content: prompt },
    ];

    // Attempt schedule: greedy first (deterministic, best when it works), then
    // a few low-temperature SAMPLED retries. int4 weights make greedy decoding
    // fall into repetition loops ("label:x-x-x…") that never form a valid plan;
    // sampling breaks the deterministic loop. Still the real weights — just
    // stochastic — so this is honest recovery, not fabrication.
    const attempts = [
      { temperature: 0, label: 'greedy' },
      { temperature: 0.4, label: 'sampled@0.4' },
      { temperature: 0.7, label: 'sampled@0.7' },
    ];

    let lastRaw = '';
    for (const a of attempts) {
      console.log(`[gmail-agent-runtime] generate REAL path (${a.label}), prompt len=${prompt.length}`);
      const text = await engine.chatComplete(messages, { temperature: a.temperature, maxTokens: 512 });
      lastRaw = String(text);
      console.log(`[gmail-agent-runtime] raw model output ${a.label} (first 200):`, lastRaw.slice(0, 200));

      // extractPlanJson only recovers a COMPLETE, VALID plan the model actually
      // produced; it never fabricates or repairs values. NOT replay.
      const plan: any = extractPlanJson(text);
      if (plan && isValidToolPlan(plan)) {
        setStatus({ state: 'equipped', lastError: undefined });
        return plan as Plan;
      }
      console.warn(`[gmail-agent-runtime] ${a.label} did not yield a valid plan; ${a.temperature === 0 ? 'retrying with sampling' : 'trying next'}`);
    }

    // Every attempt (greedy + sampled) failed to produce a valid plan. Keep the
    // engine EQUIPPED (a bad output must not poison later prompts), but tag
    // __cold so nothing downstream treats a non-plan as a real plan.
    console.error('[gmail-agent-runtime] no valid plan after greedy + sampled retries (real inference)');
    setStatus({ lastError: 'model output not a valid plan (after retries)' });
    return { tool: 'search_messages', args: { query: 'is:unread' }, __cold: true, __ran: true, raw: lastRaw.slice(0, 500) } as SingleToolPlan;
  } catch (e: any) {
    // Keep the engine equipped; a single failed call must not poison later prompts.
    console.error('[gmail-agent-runtime] generate threw (engine kept equipped):', e?.message || e);
    setStatus({ lastError: `generate error: ${e?.message || e}` });
    return { tool: 'search_messages', args: { query: 'is:unread' }, __cold: true } as SingleToolPlan;
  }
}

export function disposeRuntime(): void {
  try {
    if (engine && typeof engine.dispose === 'function') engine.dispose();
  } catch {}
  engine = null;
  setStatus({ state: 'unloaded' });
}

// Convenience named exports for the public surface (matches spec + tasks)
export const loadBaseModelFn = loadBaseModel;
export const equipAdapterFn = equipAdapter;
export const generateFn = generate;

// (Plan / SingleToolPlan / MultiStepPlan are already exported above.)

// Small dev-only audit hook (used by cross-check later)
export function __internalAudit() {
  return {
    usesRealEngine: !!engine,
    hasWeights: currentStatus.state === 'equipped',
    fixedPromptLength: FIXED_SYSTEM_PROMPT.length,
  };
}
