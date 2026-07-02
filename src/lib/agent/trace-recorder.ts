/**
 * Records real usage traces when the app is used with a REAL connected Gmail account.
 * Traces contain only the user prompt + the structural plan the agent produced.
 * NO email bodies, snippets, or private content are ever written.
 *
 * These traces + the synthetic prompts become the fine-tuning dataset.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const TRACES_DIR = "training/real-traces";

let enabled = true; // flip or gate behind a setting later

export function recordAgentTrace(prompt: string, toolCalls: Array<{name: string, args: any}>) {
  if (!enabled || typeof window === "undefined") return;
  try {
    if (!existsSync(TRACES_DIR)) mkdirSync(TRACES_DIR, { recursive: true });
    const id = `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const trace = {
      prompt,
      tool_calls: toolCalls,
      timestamp: new Date().toISOString(),
      source: "real-app"
    };
    writeFileSync(join(TRACES_DIR, `${id}.json`), JSON.stringify(trace, null, 2));
    console.log("[trace-recorder] wrote", id);
  } catch (e) {
    console.warn("[trace-recorder] failed to write trace", e);
  }
}

export function setTraceRecording(v: boolean) { enabled = v; }
