/**
 * Chat runtime — the SECOND model: Qwen2.5-3B-Instruct, plain conversation.
 *
 * Deliberately slimmer than agent-runtime.ts: no adapter, no plan parsing, no
 * tool whitelist. The user talks to a real local model; the output is the
 * text, verbatim. The same Emberglass engine runs it (identical architecture
 * to VibeThinker-3B — both are Qwen2.5-3B shapes), streamed from same-origin
 * /model-chat with the shared weight-fetch retry.
 *
 * GPU residency goes through the engine-slot coordinator: loading the chat
 * model displaces the skill model and vice versa (one ~2GB int4 working set
 * fits the buffer budget; two don't). Displacement is honest on both sides.
 */

import { claimEngineSlot, releaseEngineSlot } from './engine-slot';
import { getEmberglass, installWeightFetchRetry } from './weight-fetch';

export const CHAT_MODEL_URL = '/model-chat';
export const CHAT_MODEL_LABEL = 'Qwen2.5-3B-Instruct';
const CHAT_HF_REPO = 'Qwen/Qwen2.5-3B-Instruct';
const CHAT_SLOT_ID = 'chat';

// Plain assistant persona. NOT byte-locked (no fine-tune behind it) — this is
// the stock instruct model speaking for itself.
const CHAT_SYSTEM_PROMPT =
  'You are a helpful local assistant running entirely on this device inside AccountBox. Be concise.';

export interface ChatStatus {
  state: 'unloaded' | 'loading' | 'ready' | 'error';
  modelLabel?: string;
  lastError?: string;
  message?: string;
  progress?: { message: string; frac: number };
}

export type ChatTurn = { role: 'system' | 'user' | 'assistant'; content: string };

let engine: any = null; // { chatComplete, dispose }
let currentStatus: ChatStatus = { state: 'unloaded' };
const listeners = new Set<(s: ChatStatus) => void>();
let loadInFlight: Promise<void> | null = null;

function setStatus(next: Partial<ChatStatus>) {
  currentStatus = { ...currentStatus, ...next };
  listeners.forEach((l) => l(currentStatus));
  console.log('[chat-runtime] state ->', currentStatus.state, currentStatus.message || currentStatus.lastError || '');
}

function onDisplaced() {
  try {
    if (engine?.dispose) engine.dispose();
  } catch {}
  engine = null;
  setStatus({
    state: 'unloaded',
    message: 'Chat model unloaded (another model took the GPU)',
  });
}

export function getChatStatus(): ChatStatus {
  return { ...currentStatus };
}

export function subscribeChatStatus(listener: (s: ChatStatus) => void): () => void {
  listeners.add(listener);
  listener(currentStatus);
  return () => listeners.delete(listener);
}

export function isChatReady(): boolean {
  return !!engine && currentStatus.state === 'ready';
}

/** Stream + build the chat engine. Single-flight; joins an in-flight load. */
export async function loadChatModel(): Promise<void> {
  if (isChatReady()) return;
  if (loadInFlight) return loadInFlight;
  loadInFlight = doLoadChatModel().finally(() => {
    loadInFlight = null;
  });
  return loadInFlight;
}

async function doLoadChatModel(): Promise<void> {
  if (!(await claimEngineSlot(CHAT_SLOT_ID, onDisplaced))) {
    const msg = 'The local model is active in another tab — close it there (or the tab) and retry here.';
    setStatus({ state: 'error', lastError: msg });
    throw new Error(msg);
  }
  installWeightFetchRetry();
  setStatus({ state: 'loading', message: `Loading ${CHAT_MODEL_LABEL} (WebGPU)...` });
  setStatus({ progress: { message: 'starting chat model load', frac: 0.05 } });
  try {
    const ember = await getEmberglass();
    engine = await ember.createEmberglassEngine({
      modelUrl: CHAT_MODEL_URL,
      hfRepo: CHAT_HF_REPO,
      log: (m: string) => console.log('[emberglass:chat]', m),
      onProgress: (m: string, f: number) => setStatus({ progress: { message: m, frac: f } }),
    });
    setStatus({ state: 'ready', modelLabel: CHAT_MODEL_LABEL, message: 'Chat model ready', lastError: undefined });
  } catch (e: any) {
    console.error('[chat-runtime] load failed', e);
    const msg = e?.message || String(e);
    let friendly = `Failed to load chat model: ${msg}`;
    if (/WebGPU|gpu|navigator\.gpu/i.test(msg) || !('gpu' in (navigator as any))) {
      friendly += ' — WebGPU not available (need Chrome/Edge on https or localhost with secure context).';
    }
    setStatus({ state: 'error', lastError: friendly });
    throw e;
  }
}

/**
 * One real exchange with the local model. History goes in, text comes out —
 * no parsing, no repair, no fallback content. Throws when the model isn't
 * resident (callers gate on status; we never fabricate a reply).
 */
export async function chat(history: ChatTurn[]): Promise<string> {
  if (!isChatReady()) {
    throw new Error('chat model is not loaded');
  }
  const messages: ChatTurn[] = [{ role: 'system', content: CHAT_SYSTEM_PROMPT }, ...history];
  // Qwen2.5-Instruct's recommended sampling; greedy int4 chat tends to loop.
  const text = await engine.chatComplete(messages, {
    temperature: 0.7,
    topP: 0.8,
    topK: 20,
    maxTokens: 512,
  });
  return String(text);
}

export function disposeChatRuntime(): void {
  try {
    if (engine?.dispose) engine.dispose();
  } catch {}
  engine = null;
  releaseEngineSlot(CHAT_SLOT_ID);
  setStatus({ state: 'unloaded' });
}
