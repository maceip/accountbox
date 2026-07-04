/**
 * Agent mode — which brain the agent chat is talking to.
 *
 * "chat" is the plain conversation model (Qwen2.5-3B-Instruct); a skill id is
 * that skill's fine-tuned planner (VibeThinker-3B + LoRA). The GPU holds one
 * model at a time (engine slot), so switching mode swaps weights — the model
 * picker gesture, except the models are local.
 *
 * Tiny subscribable store (journey.ts pattern) so the board tile and the
 * phone sheet stay in sync. Session-scoped on purpose: what's resident on the
 * GPU resets on reload, so a persisted mode would lie.
 */

import type { AppSkill } from "./app-skill";
import { SKILLS, getSkill } from "@/lib/skills";

export type AgentModeId = "chat" | (string & {});

const firstTrainedSkill = () =>
  SKILLS.find((skill) => skill.availability === "trained");

// Default to the first trained skill: matches the historical behavior where
// the agent tile preloads the skill model and plans tool calls, without ever
// selecting a cartridge that has no adapter yet.
let mode: AgentModeId = firstTrainedSkill()?.id ?? "chat";
const listeners = new Set<() => void>();

export function getAgentMode(): AgentModeId {
  return mode;
}

export function setAgentMode(next: AgentModeId): void {
  if (next === mode) return;
  if (next !== "chat") {
    const skill = getSkill(next);
    if (skill?.availability !== "trained") return;
  }
  mode = next;
  for (const fn of listeners) fn();
}

export function subscribeAgentMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The active skill manifest, or null in plain-chat mode. */
export function agentModeSkill(): AppSkill | null {
  if (mode === "chat") return null;
  const skill = getSkill(mode);
  return skill?.availability === "trained" ? skill : null;
}
