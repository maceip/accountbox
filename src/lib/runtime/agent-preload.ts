/**
 * Agent preload — moves the model weight stream into onboarding dead time.
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

import { SKILLS } from "@/lib/skills";
import { getSkillRuntime } from "./skill-runtimes";

/** The cartridge worth preloading: the first `trained` skill in the registry
 *  (the GPU holds one resident model, so registry order is the priority
 *  order). `needs-training` cartridges have no adapter to stream. */
function preloadSkill() {
  return (
    SKILLS.find((s) => s.availability === "trained" && s.adapterUrl) ?? null
  );
}

/** Minimum single-buffer budget we require before claiming the device can hold
 *  the int4 weights + KV cache working set. Advertised adapter limits are
 *  bucketed/clamped for fingerprinting resistance (especially on Android), so
 *  the probe *requests a real device* at this limit instead of trusting them. */
export const MIN_GPU_BUFFER_BYTES = 1 * 1024 * 1024 * 1024;

export type AgentSupport = { ok: true } | { ok: false; reason: string };

/**
 * Pure verdict over probed facts. Mirrors what the engine's
 * `initWebGPUDevice` (src/engine/services/device_service.js) actually
 * requires, so the gate fails the same devices the engine would — before the
 * 6GB weight download, not after. Device-validated 2026-07-04 (see
 * README.md § Device Support Matrix).
 */
export function evaluateGpuSupport(input: {
  hasGpu: boolean;
  hasImmediateAddressSpace?: boolean;
  hasSubgroups?: boolean;
  deviceGranted?: boolean;
  advertisedMaxBufferBytes?: number;
}): AgentSupport {
  if (!input.hasGpu) {
    return { ok: false, reason: "WebGPU is not available in this browser" };
  }
  if (!input.hasImmediateAddressSpace) {
    // e.g. Android Chrome 149: WebGPU present, but the WGSL feature the
    // kernels hard-require is missing. Engine init would throw after download.
    return {
      ok: false,
      reason:
        "browser WGSL is too old for the engine (needs a current Chrome/Edge)",
    };
  }
  if (!input.hasSubgroups) {
    return {
      ok: false,
      reason: "GPU lacks the 'subgroups' feature the engine kernels require",
    };
  }
  if (!input.deviceGranted) {
    const advertised =
      input.advertisedMaxBufferBytes !== undefined
        ? `${Math.round(input.advertisedMaxBufferBytes / 1024 / 1024)}MB advertised`
        : "budget unknown";
    return {
      ok: false,
      reason: `GPU refused the ${Math.round(MIN_GPU_BUFFER_BYTES / 1024 / 1024)}MB buffer budget the 3B model needs (${advertised})`,
    };
  }
  return { ok: true };
}

export function evaluateConnection(
  conn: { saveData?: boolean; effectiveType?: string; type?: string } | null,
): "allow" | "defer" {
  // No Network Information API (Safari/Firefox, all desktops) — assume fine.
  if (!conn) return "allow";
  if (conn.saveData) return "defer";
  if (conn.type === "cellular") return "defer";
  // effectiveType is a speed estimate, not a radio type — but 2g/3g class
  // links make a large model stream hopeless regardless of radio.
  if (conn.effectiveType && /(^|-)2g$|^3g$/.test(conn.effectiveType))
    return "defer";
  return "allow";
}

// WebGPU isn't in the TS DOM lib yet — minimal structural types for the probe.
type GpuDeviceLike = { destroy?: () => void };
type GpuAdapterLike = {
  features: { has(name: string): boolean };
  limits?: { maxBufferSize?: number };
  requestDevice(desc?: {
    requiredLimits?: Record<string, number>;
  }): Promise<GpuDeviceLike>;
};
type GpuLike = {
  wgslLanguageFeatures?: { has(name: string): boolean };
  requestAdapter(options?: {
    powerPreference?: "high-performance" | "low-power";
  }): Promise<GpuAdapterLike | null>;
};

/** Live device probe. Only *successful* probes are cached — a transient GPU
 *  hiccup must not permanently mark the device unsupported for the session. */
let supportPromise: Promise<AgentSupport> | null = null;
export function probeAgentSupport(): Promise<AgentSupport> {
  if (supportPromise) return supportPromise;
  const probe = (async (): Promise<AgentSupport> => {
    if (typeof navigator === "undefined")
      return { ok: false, reason: "no browser context" };
    const gpu = (navigator as Navigator & { gpu?: GpuLike }).gpu;
    if (!gpu) return evaluateGpuSupport({ hasGpu: false });
    try {
      // Same adapter the engine requests; fall back to default if the
      // high-performance request returns null (some mobile drivers).
      const adapter =
        (await gpu.requestAdapter({ powerPreference: "high-performance" })) ??
        (await gpu.requestAdapter());
      if (!adapter) return { ok: false, reason: "WebGPU adapter unavailable" };
      const facts = {
        hasGpu: true,
        hasImmediateAddressSpace:
          gpu.wgslLanguageFeatures?.has("immediate_address_space") ?? false,
        hasSubgroups: adapter.features.has("subgroups"),
        advertisedMaxBufferBytes: adapter.limits?.maxBufferSize,
      };
      const featureVerdict = evaluateGpuSupport({
        ...facts,
        deviceGranted: true,
      });
      if (!featureVerdict.ok) return featureVerdict;
      // Advertised limits are clamped on mobile; the only honest capacity
      // check is asking for a real device at our floor.
      let deviceGranted = false;
      try {
        const device = await adapter.requestDevice({
          requiredLimits: { maxBufferSize: MIN_GPU_BUFFER_BYTES },
        });
        deviceGranted = true;
        device.destroy?.();
      } catch {
        deviceGranted = false;
      }
      return evaluateGpuSupport({ ...facts, deviceGranted });
    } catch (e) {
      return {
        ok: false,
        reason: `WebGPU probe failed: ${e instanceof Error ? e.message : e}`,
      };
    }
  })();
  supportPromise = probe.then((r) => {
    if (!r.ok) supportPromise = null;
    return r;
  });
  return supportPromise;
}

export function connectionAllowsAutoload(): "allow" | "defer" {
  if (typeof navigator === "undefined") return "allow";
  const conn = (
    navigator as Navigator & {
      connection?: {
        saveData?: boolean;
        effectiveType?: string;
        type?: string;
      };
    }
  ).connection;
  return evaluateConnection(conn ?? null);
}

// ── Decision store (tiny, useSyncExternalStore-compatible) ──────────────────

export type PreloadDecision =
  | "idle"
  | "started"
  | "deferred-cellular"
  | "unsupported";

let decision: PreloadDecision = "idle";
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

  const skill = preloadSkill();
  if (!skill) return decision; // no trained cartridge registered — nothing to stream

  if (getSkillRuntime(skill).isEquippedForRealInference()) {
    setDecision("started");
    return decision;
  }

  const support = await probeAgentSupport();
  if (!support.ok) {
    console.warn("[agent-preload] unsupported:", support.reason);
    setDecision("unsupported");
    return decision;
  }

  if (connectionAllowsAutoload() === "defer") {
    console.log(
      "[agent-preload] deferring weight stream (cellular / data saver)",
    );
    setDecision("deferred-cellular");
    return decision;
  }

  setDecision("started");
  // Fire and forget — progress + errors surface through the agent status store.
  getSkillRuntime(skill)
    .equipAdapter({ type: "http", url: skill.adapterUrl! })
    .catch((e) => {
      console.warn("[agent-preload] preload equip failed (chat can retry):", e);
    });
  return decision;
}

/** Explicit user override for the deferred-cellular case. */
export async function startAgentLoad(): Promise<void> {
  const skill = preloadSkill();
  if (!skill) return;
  setDecision("started");
  await getSkillRuntime(skill).equipAdapter({
    type: "http",
    url: skill.adapterUrl!,
  });
}
