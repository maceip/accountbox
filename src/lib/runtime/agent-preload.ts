/**
 * Agent preload — moves the 6GB weight stream into onboarding dead time.
 *
 * Called once when the vault unlocks. Decides, honestly and up front, one of:
 *   - "started":            device + connection are fine, weight stream begins now
 *   - "deferred-cellular":  device is fine but the user is on cellular/data-saver;
 *                           the chat offers an explicit "start download" button
 *   - "unsupported":        this device can't run the local agent at all (no
 *                           WebGPU / tiny GPU buffer budget) — mail still works
 *
 * Decision logic is pure (evaluateGpuSupport / evaluateConnection) so it can be
 * unit-tested without a GPU or a network stack.
 */

import { equipAdapter, isEquippedForRealInference } from './gmail-agent-runtime';

// The gmail adapter the chat has always equipped — single source of truth now.
export const GMAIL_ADAPTER_SOURCE = { type: 'http', url: '/adapters/gmail-agent' } as const;

/** Minimum single-buffer budget we require before claiming the device can hold
 *  the int4 weights + KV cache working set. Devices report 256MB by default;
 *  real desktop/flagship GPUs report 1-4GB+. */
export const MIN_GPU_BUFFER_BYTES = 1 * 1024 * 1024 * 1024;

export type AgentSupport = { ok: true } | { ok: false; reason: string };

export function evaluateGpuSupport(input: {
  hasGpu: boolean;
  maxBufferSize?: number;
}): AgentSupport {
  if (!input.hasGpu) {
    return { ok: false, reason: 'WebGPU is not available in this browser' };
  }
  if (input.maxBufferSize !== undefined && input.maxBufferSize < MIN_GPU_BUFFER_BYTES) {
    return {
      ok: false,
      reason: `GPU buffer budget too small for the 3B model (${Math.round(input.maxBufferSize / 1024 / 1024)}MB)`,
    };
  }
  return { ok: true };
}

export function evaluateConnection(
  conn: { saveData?: boolean; effectiveType?: string; type?: string } | null,
): 'allow' | 'defer' {
  // No Network Information API (Safari/Firefox, all desktops) — assume fine.
  if (!conn) return 'allow';
  if (conn.saveData) return 'defer';
  if (conn.type === 'cellular') return 'defer';
  // effectiveType is a speed estimate, not a radio type — but 2g/3g class
  // links make a 6GB stream hopeless regardless of radio.
  if (conn.effectiveType && /(^|-)2g$|^3g$/.test(conn.effectiveType)) return 'defer';
  return 'allow';
}

/** Live device probe. Cached: adapters don't change mid-session. */
let supportPromise: Promise<AgentSupport> | null = null;
export function probeAgentSupport(): Promise<AgentSupport> {
  if (supportPromise) return supportPromise;
  supportPromise = (async () => {
    if (typeof navigator === 'undefined') return { ok: false, reason: 'no browser context' };
    const gpu = (navigator as any).gpu;
    if (!gpu) return evaluateGpuSupport({ hasGpu: false });
    try {
      const adapter = await gpu.requestAdapter();
      if (!adapter) return { ok: false, reason: 'WebGPU adapter unavailable' };
      return evaluateGpuSupport({
        hasGpu: true,
        maxBufferSize: adapter.limits?.maxBufferSize,
      });
    } catch (e) {
      return { ok: false, reason: `WebGPU probe failed: ${e instanceof Error ? e.message : e}` };
    }
  })();
  return supportPromise;
}

export function connectionAllowsAutoload(): 'allow' | 'defer' {
  if (typeof navigator === 'undefined') return 'allow';
  return evaluateConnection((navigator as any).connection ?? null);
}

// ── Decision store (tiny, useSyncExternalStore-compatible) ──────────────────

export type PreloadDecision = 'idle' | 'started' | 'deferred-cellular' | 'unsupported';

let decision: PreloadDecision = 'idle';
const listeners = new Set<() => void>();

function setDecision(next: PreloadDecision) {
  if (decision === next) return;
  decision = next;
  for (const fn of listeners) fn();
}

export function getPreloadDecision(): PreloadDecision {
  return decision;
}

export function subscribePreloadDecision(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ── Entry points ─────────────────────────────────────────────────────────────

let preloadRan = false;

/** Fire once on vault unlock. Idempotent; equip itself is single-flight in the
 *  runtime, so a later chat-open equip call simply joins this stream. */
export async function maybePreloadAgent(): Promise<PreloadDecision> {
  if (preloadRan) return decision;
  preloadRan = true;

  if (isEquippedForRealInference()) {
    setDecision('started');
    return decision;
  }

  const support = await probeAgentSupport();
  if (!support.ok) {
    console.warn('[agent-preload] unsupported:', support.reason);
    setDecision('unsupported');
    return decision;
  }

  if (connectionAllowsAutoload() === 'defer') {
    console.log('[agent-preload] deferring weight stream (cellular / data saver)');
    setDecision('deferred-cellular');
    return decision;
  }

  setDecision('started');
  // Fire and forget — progress + errors surface through the agent status store.
  equipAdapter(GMAIL_ADAPTER_SOURCE).catch((e) => {
    console.warn('[agent-preload] preload equip failed (chat can retry):', e);
  });
  return decision;
}

/** Explicit user override for the deferred-cellular case. */
export async function startAgentLoad(): Promise<void> {
  setDecision('started');
  await equipAdapter(GMAIL_ADAPTER_SOURCE);
}
