import { readFileSync } from "node:fs";

/**
 * Legacy synthetic target harness for old Gmail tuning scripts.
 *
 * This is NOT the product runtime, NOT WebGPU inference, and NOT adapter
 * training. The app runtime lives in agent-runtime.ts / gmail-agent-runtime.ts.
 * This file only lets archived 200-round scripts mutate
 * training/gmail-synthetic-prompts.json and regenerate datasets.
 */
export type AgentStatus = {
  state: "idle" | "loading" | "loaded" | "equipped" | "error";
  message?: string;
  progress?: number;
};
let st: AgentStatus = { state: "idle" };
const ls = new Set<(s: AgentStatus) => void>();
function set(s: AgentStatus) {
  st = s;
  for (const l of ls) l(s);
}
export const getAgentStatus = () => st;
export const subscribeAgentStatus = (l: (s: AgentStatus) => void) => {
  ls.add(l);
  return () => ls.delete(l);
};

type SynthPlan =
  | { tool: string; args: Record<string, unknown> }
  | { steps: Array<Record<string, unknown>> };

type SynthPromptFile = {
  prompts?: Array<{
    prompt: string;
    targets?: Array<{
      tool?: string;
      args?: Record<string, unknown>;
      steps?: Array<Record<string, unknown>>;
    }>;
  }>;
};

function loadSynthTargets(): Array<{ prompt: string; plan: SynthPlan }> {
  try {
    const j = JSON.parse(
      readFileSync("training/gmail-synthetic-prompts.json", "utf8"),
    ) as SynthPromptFile;
    return (j.prompts || []).map((p) => {
      const tlist = p.targets || [];
      let plan: SynthPlan = {
        tool: "search_messages",
        args: { query: p.prompt },
      };
      if (tlist.length) {
        const f = tlist[0];
        plan = f.tool
          ? { tool: f.tool, args: f.args ?? {} }
          : { steps: f.steps || [] };
      }
      return { prompt: p.prompt, plan };
    });
  } catch {
    return [];
  }
}

// The synthetic harness target plans come from JSON.
// 200 iterations = repeatedly generate current targets for the prompts, grade,
// improve weak targets in the json, persist, re-gen dataset, repeat.
let SYNTH_TARGETS: Array<{ prompt: string; plan: SynthPlan }> =
  loadSynthTargets();

function planForPrompt(prompt: string): SynthPlan {
  // Always reload so edits during the 200-iteration loop are seen immediately.
  SYNTH_TARGETS = loadSynthTargets();
  const hit = SYNTH_TARGETS.find(
    (t) => t.prompt.toLowerCase() === prompt.toLowerCase(),
  );
  if (hit) return hit.plan;
  const p = prompt.toLowerCase();
  if (p.includes("draft"))
    return {
      tool: "create_draft",
      args: {
        to: "user@example.com",
        subject: prompt.slice(0, 40),
        body: `Draft based on: ${prompt}`,
      },
    };
  if (p.includes("read") || p.includes("body") || p.includes("thread"))
    return { tool: "search_messages", args: { query: prompt } };
  return { tool: "search_messages", args: { query: prompt } };
}

export async function loadBaseModel() {
  set({
    state: "loading",
    message: "Loading legacy synthetic target harness...",
  });
  set({
    state: "loaded",
    message:
      "Synthetic target harness loaded. No model weights or LoRA adapter were loaded.",
  });
}

export async function trainGmailAdapter() {
  set({
    state: "loaded",
    message:
      "No-op: this harness rewrites target JSON only. Use train:gmail for real adapter training.",
  });
}

export async function equipAdapter(_name?: string) {
  set({
    state: "equipped",
    message:
      "Synthetic target harness active. generate() returns target-shaped JSON from training/gmail-synthetic-prompts.json.",
  });
}

export async function generate(prompt: string): Promise<string> {
  const s = getAgentStatus();
  if (s.state !== "equipped" && s.state !== "loaded") {
    // Before fine-tune adapter: basic structural plan
    return JSON.stringify(planForPrompt(prompt));
  }
  // This harness never calls the model. It returns the current synthetic target.
  return JSON.stringify(planForPrompt(prompt));
}

export function disposeRuntime() {
  set({ state: "idle" });
}

export function buildGmailTrainingExamples() {
  // Always fresh from the json so the 200-iteration improvements are picked up.
  const fresh = loadSynthTargets();
  return fresh.length
    ? fresh.map((t) => ({ input: t.prompt, target: t.plan }))
    : SYNTH_TARGETS.map((t) => ({ input: t.prompt, target: t.plan }));
}
