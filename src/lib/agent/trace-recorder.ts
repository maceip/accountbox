/**
 * Records real usage traces when the app is used with a REAL connected Gmail account.
 * Traces contain only the user prompt + the structural plan the agent produced.
 * NO email bodies, snippets, or private content are ever written.
 *
 * These traces + the synthetic prompts become the fine-tuning dataset.
 */

// Browser-side storage: this code runs in the browser (see the window guard),
// so node:fs can never work here — it broke the production build. Traces go to
// localStorage; export them from devtools when curating the dataset.
const TRACES_KEY = "bm.agent-traces";
const MAX_TRACES = 200;

let enabled = true; // flip or gate behind a setting later

export function recordAgentTrace(
  prompt: string,
  toolCalls: Array<{ name: string; args: unknown }>,
) {
  if (!enabled || typeof window === "undefined") return;
  try {
    const trace = {
      id: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      prompt,
      tool_calls: toolCalls,
      timestamp: new Date().toISOString(),
      source: "real-app",
    };
    const all = JSON.parse(localStorage.getItem(TRACES_KEY) || "[]");
    all.push(trace);
    while (all.length > MAX_TRACES) all.shift();
    localStorage.setItem(TRACES_KEY, JSON.stringify(all));
    console.log("[trace-recorder] wrote", trace.id);
  } catch (e) {
    console.warn("[trace-recorder] failed to write trace", e);
  }
}

export function setTraceRecording(v: boolean) {
  enabled = v;
}
