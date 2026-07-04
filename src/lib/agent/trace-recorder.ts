/**
 * Agent trace recorder — the v1 data contract for the trace-to-retrain loop.
 *
 * LOCAL-FIRST CUSTODY: traces are written to the browser's OPFS only. They
 * never leave the machine except when the user explicitly exports them as a
 * file (Settings → Developer). No server storage, no sync, ever.
 *
 * HONESTY CONTRACT: only REAL weight-driven plans are recorded. A __cold
 * sentinel (no inference, or invalid model output) is refused here regardless
 * of what callers do — cold plans in the dataset would train the model on
 * fabrications.
 *
 * Every trace carries provenance:
 *  - skillId: which skill planned (multi-skill safe curation)
 *  - promptSha256: hash of the byte-locked system prompt in effect (B3 — a
 *    trace recorded under an old prompt is detectably stale for future runs)
 *  - adapter url + version: which weights produced the plan
 *  - execution outcome (ok/error only — never result payloads or mail content)
 */

import type { AppSkill } from "@/lib/runtime/app-skill";
import type { ToolPlan } from "@/lib/runtime/plan-parse";
import { opfsDelete, opfsGet, opfsList, opfsPut } from "@/lib/db/opfs";

export const TRACE_TABLE = "agent-traces";
export const MAX_TRACES = 1000;
/** Pre-contract localStorage key; migrated once, then removed. */
export const LEGACY_TRACES_KEY = "bm.agent-traces";

export type TraceExecution = { ok: boolean; error?: string };
export type TraceContext = "chat" | "test";

export type AgentTraceV1 = {
  v: 1;
  id: string;
  at: string; // ISO timestamp
  skillId: string;
  /** null only for legacy-migrated traces recorded before the contract. */
  promptSha256: string | null;
  adapter: { url: string; version: string | null };
  /** Where the plan was produced (agent chat vs. an equip test plan). */
  context: TraceContext;
  prompt: string;
  plan: ToolPlan;
  /** Structural outcome, appended after execution. null = never executed. */
  execution: TraceExecution | null;
};

export type RecordTraceInput = {
  skill: AppSkill;
  prompt: string;
  plan: ToolPlan;
  context: TraceContext;
  /** From the equipped adapter's manifest; null until one is served. */
  adapterVersion?: string | null;
};

// ── pure contract logic (unit-tested without a browser) ─────────────────────

/** A cold sentinel must never become training data. */
export function isColdPlan(plan: unknown): boolean {
  return (
    !!plan &&
    typeof plan === "object" &&
    (plan as { __cold?: boolean }).__cold === true
  );
}

export function buildTrace(
  input: RecordTraceInput,
  promptSha256: string,
  now: Date = new Date(),
): AgentTraceV1 {
  return {
    v: 1,
    id: `trace-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    at: now.toISOString(),
    skillId: input.skill.id,
    promptSha256,
    adapter: {
      url: input.skill.adapterUrl,
      version: input.adapterVersion ?? null,
    },
    context: input.context,
    prompt: input.prompt,
    plan: input.plan,
    execution: null,
  };
}

/** Oldest-first ids to delete so the store stays under `cap`. */
export function selectPruneIds(
  traces: Array<{ id: string; at: string }>,
  cap: number = MAX_TRACES,
): string[] {
  if (traces.length <= cap) return [];
  return [...traces]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, traces.length - cap)
    .map((t) => t.id);
}

type LegacyTrace = {
  id?: string;
  prompt?: string;
  tool_calls?: Array<{ name: string; args: unknown }>;
  timestamp?: string;
};

/** Convert pre-contract localStorage traces (prompt + tool_calls) to v1.
 *  Provenance is honestly unknown: promptSha256 null, adapter version null. */
export function migrateLegacyTraces(json: string): AgentTraceV1[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: AgentTraceV1[] = [];
  for (const raw of parsed as LegacyTrace[]) {
    if (
      !raw ||
      typeof raw.prompt !== "string" ||
      !Array.isArray(raw.tool_calls)
    )
      continue;
    const calls = raw.tool_calls.filter((c) => c && typeof c.name === "string");
    if (calls.length === 0) continue;
    const plan: ToolPlan =
      calls.length === 1
        ? {
            tool: calls[0].name,
            args: (calls[0].args ?? {}) as Record<string, unknown>,
          }
        : {
            steps: calls.map((c) => ({
              tool: c.name,
              args: (c.args ?? {}) as Record<string, unknown>,
            })),
          };
    out.push({
      v: 1,
      id: raw.id || `trace-legacy-${Math.random().toString(36).slice(2, 10)}`,
      at: raw.timestamp || new Date(0).toISOString(),
      skillId: "gmail-agent", // only skill that existed pre-contract
      promptSha256: null,
      adapter: { url: "/adapters/gmail-agent", version: null },
      context: "chat",
      prompt: raw.prompt,
      plan,
      execution: null,
    });
  }
  return out;
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── recorder (browser-only I/O) ──────────────────────────────────────────────

// Default ON (decided: local-only custody makes default-off pointless data
// loss). Persisted with the rest of the preferences in bm.settings; read
// directly here so the recorder has no React dependency.
let enabled: boolean | null = null;
let migrated = false;
const promptHashCache = new Map<string, Promise<string>>();

function recordingEnabled(): boolean {
  if (enabled !== null) return enabled;
  try {
    const raw = localStorage.getItem("bm.settings");
    const parsed = raw
      ? (JSON.parse(raw) as { traceRecording?: boolean })
      : null;
    enabled = parsed?.traceRecording !== false;
  } catch {
    enabled = true;
  }
  return enabled;
}

export function setTraceRecording(v: boolean) {
  enabled = v;
}

export function isTraceRecording(): boolean {
  return recordingEnabled();
}

function hashSystemPrompt(skill: AppSkill): Promise<string> {
  let cached = promptHashCache.get(skill.id);
  if (!cached) {
    cached = sha256Hex(skill.systemPrompt);
    promptHashCache.set(skill.id, cached);
  }
  return cached;
}

async function migrateLegacyOnce(): Promise<void> {
  if (migrated || typeof window === "undefined") return;
  migrated = true;
  try {
    const json = localStorage.getItem(LEGACY_TRACES_KEY);
    if (!json) return;
    const traces = migrateLegacyTraces(json);
    for (const t of traces) {
      await opfsPut(TRACE_TABLE, t.id, t);
    }
    localStorage.removeItem(LEGACY_TRACES_KEY);
    if (traces.length)
      console.log(
        `[trace-recorder] migrated ${traces.length} legacy traces to OPFS`,
      );
  } catch (e) {
    console.warn("[trace-recorder] legacy migration failed", e);
  }
}

async function prune(): Promise<void> {
  const recs = await opfsList<AgentTraceV1>(TRACE_TABLE);
  const ids = selectPruneIds(
    recs.map((r) => ({ id: r.data.id, at: r.data.at })),
  );
  for (const id of ids) {
    await opfsDelete(TRACE_TABLE, id);
  }
}

/**
 * Record a REAL weight-driven plan. Returns the trace id, or null when
 * recording is off, the environment has no OPFS, or the plan is cold.
 * Never throws — a trace failure must never break the chat.
 */
export async function recordAgentTrace(
  input: RecordTraceInput,
): Promise<string | null> {
  if (typeof window === "undefined" || !recordingEnabled()) return null;
  if (isColdPlan(input.plan)) {
    console.warn("[trace-recorder] refused cold plan (not training data)");
    return null;
  }
  try {
    await migrateLegacyOnce();
    const trace = buildTrace(input, await hashSystemPrompt(input.skill));
    await opfsPut(TRACE_TABLE, trace.id, trace);
    await prune();
    console.log("[trace-recorder] wrote", trace.id);
    return trace.id;
  } catch (e) {
    console.warn("[trace-recorder] failed to write trace", e);
    return null;
  }
}

/** Append the structural execution outcome to a recorded trace. */
export async function completeAgentTrace(
  id: string,
  execution: TraceExecution,
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const trace = await opfsGet<AgentTraceV1>(TRACE_TABLE, id);
    if (!trace) return;
    await opfsPut(TRACE_TABLE, id, { ...trace, execution });
  } catch (e) {
    console.warn("[trace-recorder] failed to complete trace", e);
  }
}

/** All traces, oldest first. */
export async function listAgentTraces(): Promise<AgentTraceV1[]> {
  if (typeof window === "undefined") return [];
  await migrateLegacyOnce();
  const recs = await opfsList<AgentTraceV1>(TRACE_TABLE);
  return recs.map((r) => r.data).sort((a, b) => a.at.localeCompare(b.at));
}

export async function clearAgentTraces(): Promise<void> {
  const recs = await opfsList<AgentTraceV1>(TRACE_TABLE);
  for (const r of recs) {
    await opfsDelete(TRACE_TABLE, r.data.id);
  }
}

// Console/E2E inspection hook — same precedent as loadRealGmailLoRA on window.
if (typeof window !== "undefined") {
  (
    window as Window & { listAgentTraces?: typeof listAgentTraces }
  ).listAgentTraces = listAgentTraces;
}
