/**
 * Verifiable rewards for in-browser GRPO. Pure TS — no GPU, no engine —
 * so `bun test` covers it fully.
 *
 * The engine (src/engine/services/grpo_controller.js) is task-agnostic and
 * takes rewardFn injected; this module owns the bbtriage task's reward
 * shaping, verified against the gold verdict from the dataset row.
 */

import {
  extractTriageVerdict,
  type TriageVerdict,
} from "./bbtriage";

/** Reward shaping weights — sum to 1.0 for a fully correct verdict. */
export const BBTRIAGE_REWARD = {
  validJson: 0.3, // structurally valid verdict (closed disposition set)
  disposition: 0.5, // disposition matches gold
  severity: 0.2, // severity_estimate matches gold (normalized)
} as const;

function normSeverity(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Deterministic, verifiable reward for one sampled bbtriage completion.
 * 0 when the output contains no valid verdict; partial credit otherwise.
 */
export function bbtriageReward(text: string, gold: TriageVerdict): number {
  const res = extractTriageVerdict(text);
  if (!res.ok) return 0;
  let r = BBTRIAGE_REWARD.validJson;
  if (res.verdict.disposition === gold.disposition) r += BBTRIAGE_REWARD.disposition;
  if (normSeverity(res.verdict.severity_estimate) === normSeverity(gold.severity_estimate))
    r += BBTRIAGE_REWARD.severity;
  return r;
}

/** One GRPO prompt: chat messages (no assistant turn) + the gold verdict. */
export interface GrpoPrompt {
  messages: Array<{ role: string; content: string }>;
  gold: TriageVerdict;
}

/**
 * Convert one bbtriage SFT JSONL row ({messages: [system, user, assistant]})
 * into a GRPO prompt. Returns null when the row has no extractable gold
 * verdict (never fabricate a target).
 */
export function toGrpoPrompt(row: {
  messages: Array<{ role: string; content: string }>;
}): GrpoPrompt | null {
  const msgs = row?.messages;
  if (!Array.isArray(msgs)) return null;
  const assistant = msgs.find((m) => m.role === "assistant");
  if (!assistant) return null;
  const gold = extractTriageVerdict(assistant.content);
  if (!gold.ok) return null;
  return {
    messages: msgs.filter((m) => m.role !== "assistant"),
    gold: gold.verdict,
  };
}
