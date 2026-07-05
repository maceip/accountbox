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

import {
  claimEngineSlot,
  currentEngineSlotOwner,
  DisplacedDuringLoadError,
  releaseEngineSlot,
  watchEngineSlotFree,
} from "./engine-slot";
import {
  getEmberglass,
  installWeightFetchRetry,
  type EmberglassEngine,
} from "./weight-fetch";

export const CHAT_MODEL_URL = "/model-chat";
export const CHAT_MODEL_LABEL = "Qwen2.5-3B-Instruct";
const CHAT_HF_REPO = "Qwen/Qwen2.5-3B-Instruct";
const CHAT_SLOT_ID = "chat";

// Plain assistant persona. NOT byte-locked (no fine-tune behind it) — this is
// the stock instruct model speaking for itself.
const CHAT_SYSTEM_PROMPT =
  "You are a helpful local assistant running entirely on this device inside AccountBox. Be concise.";

export interface ChatStatus {
  state: "unloaded" | "loading" | "ready" | "error";
  modelLabel?: string;
  lastError?: string;
  message?: string;
  progress?: { message: string; frac: number };
}

export type ChatTurn = {
  role: "system" | "user" | "assistant";
  content: string;
};

let engine: EmberglassEngine | null = null;
let currentStatus: ChatStatus = { state: "unloaded" };
const listeners = new Set<(s: ChatStatus) => void>();
let loadInFlight: Promise<void> | null = null;

function setStatus(next: Partial<ChatStatus>) {
  currentStatus = { ...currentStatus, ...next };
  for (const l of listeners) l(currentStatus);
  console.log(
    "[chat-runtime] state ->",
    currentStatus.state,
    currentStatus.message || currentStatus.lastError || "",
  );
}

function onDisplaced() {
  try {
    if (engine?.dispose) engine.dispose();
  } catch {}
  engine = null;
  setStatus({
    state: "unloaded",
    message: "Chat model unloaded (another model took the GPU)",
  });
}

// Returns the stable current object (setStatus always replaces it), so this
// is safe as a useSyncExternalStore getSnapshot. Do not spread here: a fresh
// object per call makes React see a changed snapshot every render and loop.
export function getChatStatus(): ChatStatus {
  return currentStatus;
}

export function subscribeChatStatus(
  listener: (s: ChatStatus) => void,
): () => void {
  listeners.add(listener);
  listener(currentStatus);
  return () => listeners.delete(listener);
}

export function isChatReady(): boolean {
  return !!engine && currentStatus.state === "ready";
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

let cancelSlotWatch: (() => void) | null = null;

async function doLoadChatModel(): Promise<void> {
  if (!(await claimEngineSlot(CHAT_SLOT_ID, onDisplaced))) {
    const msg =
      "The local model is active in another tab — close it there (or the tab) and retry here.";
    setStatus({ state: "error", lastError: msg });
    // Watch for the other tab to release the engine so this tab's status
    // flips honestly instead of staying stuck on a stale denial.
    cancelSlotWatch?.();
    cancelSlotWatch = watchEngineSlotFree(() => {
      cancelSlotWatch = null;
      if (currentStatus.state === "error" && currentStatus.lastError === msg) {
        setStatus({
          state: "unloaded",
          lastError: undefined,
          message: "The other tab released the local model — load it here now.",
        });
      }
    });
    throw new Error(msg);
  }
  cancelSlotWatch?.();
  cancelSlotWatch = null;
  installWeightFetchRetry();
  setStatus({
    state: "loading",
    message: `Loading ${CHAT_MODEL_LABEL} (WebGPU)...`,
  });
  setStatus({ progress: { message: "starting chat model load", frac: 0.05 } });
  try {
    const ember = await getEmberglass();
    const fresh = await ember.createEmberglassEngine({
      modelUrl: CHAT_MODEL_URL,
      hfRepo: CHAT_HF_REPO,
      // log fires per weight tensor during the stream — abort a stream whose
      // slot was taken instead of quantizing 2GB into doomed GPU buffers.
      log: (m: string) => {
        if (currentEngineSlotOwner() !== CHAT_SLOT_ID)
          throw new DisplacedDuringLoadError(CHAT_SLOT_ID);
        console.log("[emberglass:chat]", m);
      },
      onProgress: (m: string, f: number) =>
        setStatus({ progress: { message: m, frac: f } }),
    });
    // The stream takes minutes; if another model claimed the slot meanwhile,
    // installing this engine would double GPU residency. Discard it instead.
    if (currentEngineSlotOwner() !== CHAT_SLOT_ID) {
      try {
        fresh.dispose?.();
      } catch {}
      throw new DisplacedDuringLoadError(CHAT_SLOT_ID);
    }
    engine = fresh;
    setStatus({
      state: "ready",
      modelLabel: CHAT_MODEL_LABEL,
      message: "Chat model ready",
      lastError: undefined,
    });
  } catch (e) {
    if (e instanceof DisplacedDuringLoadError) {
      // onDisplaced already set the honest `unloaded` status.
      console.warn("[chat-runtime]", e.message);
      throw e;
    }
    console.error("[chat-runtime] load failed", e);
    const msg = e instanceof Error ? e.message : String(e);
    let friendly = `Failed to load chat model: ${msg}`;
    if (/WebGPU|gpu|navigator\.gpu/i.test(msg) || !("gpu" in navigator)) {
      friendly +=
        " — WebGPU not available (need Chrome/Edge on https or localhost with secure context).";
    }
    setStatus({ state: "error", lastError: friendly });
    throw e;
  }
}

/**
 * One real exchange with the local model. History goes in, text comes out —
 * no parsing, no repair, no fallback content. Throws when the model isn't
 * resident (callers gate on status; we never fabricate a reply).
 */
export async function chat(history: ChatTurn[]): Promise<string> {
  const eng = engine;
  if (!eng || !isChatReady()) {
    throw new Error("chat model is not loaded");
  }
  const messages: ChatTurn[] = [
    { role: "system", content: CHAT_SYSTEM_PROMPT },
    ...history,
  ];
  // Qwen2.5-Instruct's recommended sampling; greedy int4 chat tends to loop.
  const text = await eng.chatComplete(messages, {
    temperature: 0.7,
    topP: 0.8,
    topK: 20,
    maxTokens: 512,
  });
  return String(text);
}

/**
 * Raw completion for the ax agents layer: the caller owns the FULL message
 * list (including its own system prompt) and sampling. Same engine, same
 * honesty contract — throws when not resident, never fabricates.
 */
export async function chatCompleteRaw(
  messages: ChatTurn[],
  opts?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxTokens?: number;
  },
): Promise<string> {
  const eng = engine;
  if (!eng || !isChatReady()) {
    throw new Error("chat model is not loaded");
  }
  const text = await eng.chatComplete(messages, {
    temperature: opts?.temperature ?? 0.7,
    topP: opts?.topP ?? 0.8,
    topK: opts?.topK ?? 20,
    maxTokens: opts?.maxTokens ?? 512,
  });
  return String(text);
}

export function disposeChatRuntime(): void {
  try {
    if (engine?.dispose) engine.dispose();
  } catch {}
  engine = null;
  releaseEngineSlot(CHAT_SLOT_ID);
  setStatus({ state: "unloaded" });
}
