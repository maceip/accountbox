/**
 * Gmail app skill — the FIRST consumer of the generic agent runtime.
 *
 * This module is now exactly what adding an app should cost: a bounded
 * AppSkill config + createAgentRuntime(skill) + re-exported surface.
 * All hardened machinery (engine load, single-flight equip, honest parsing,
 * greedy→sampled retries, fail-closed __cold) lives in agent-runtime.ts,
 * shared by every future skill (GitHub, Calendar, …).
 *
 * This is THE ONLY module UI / callers should import for Gmail agent behavior.
 */

import { getSkillRuntime } from "./skill-runtimes";
import type {
  AgentStatus,
  AdapterSource,
  FileLike,
  SFTExample,
} from "./agent-runtime";

// Re-export the shared types under their historical names so no importer changes.
export type { AgentStatus, AdapterSource, FileLike, SFTExample };

// Gmail's plan types (structurally compatible with the generic runtime's).
export type ToolName = "search_messages" | "read_message" | "create_draft";

export interface SingleToolPlan {
  tool: ToolName;
  args: {
    query?: string;
    id?: string;
    to?: string;
    subject?: string;
    body?: string;
    [k: string]: unknown;
  };
  /** Set on any non-plan fallback (cold start / bad JSON / invalid tool). Never on a real, valid weight-driven plan. */
  __cold?: boolean;
  /** True when real WebGPU inference actually ran but its output wasn't a valid plan (distinguishes from true cold). */
  __ran?: boolean;
  /** Raw model text captured when __ran is set, for honest inspection. */
  raw?: string;
}

export interface SingleStep {
  tool: ToolName;
  args: Record<string, unknown>;
}

export interface MultiStepPlan {
  steps: SingleStep[];
}

export type Plan = SingleToolPlan | MultiStepPlan;

// The manifest moved to src/lib/skills/gmail (skills are data now); these
// re-exports keep every existing import — training scripts, checks, tests —
// pointing at the same bytes. FIXED_SYSTEM_PROMPT stays byte-locked (B3).
export { FIXED_SYSTEM_PROMPT, GMAIL_SKILL } from "@/lib/skills/gmail/skill";
import { FIXED_SYSTEM_PROMPT, GMAIL_SKILL } from "@/lib/skills/gmail/skill";

// Kept for spec compatibility (GmailAgentRuntime interface shape).
export interface GmailAgentRuntime {
  loadBaseModel(): Promise<void>;
  trainGmailAdapter(examples: SFTExample[]): Promise<void>;
  equipAdapter(adapterSource: AdapterSource): Promise<void>;
  generate(prompt: string): Promise<Plan>;
  disposeRuntime(): void;
  getAgentStatus(): AgentStatus;
  subscribeAgentStatus(listener: (s: AgentStatus) => void): () => void;
}

// Shared instance from the registry — the journey's skill step uses the SAME
// runtime, so an equip that happened there is visible here (and vice versa).
const rt = getSkillRuntime(GMAIL_SKILL);

export const loadBaseModel = rt.loadBaseModel;
export const equipAdapter = rt.equipAdapter;
export const disposeRuntime = rt.disposeRuntime;
export const getAgentStatus = rt.getAgentStatus;
export const subscribeAgentStatus = rt.subscribeAgentStatus;
export const isEquippedForRealInference = rt.isEquippedForRealInference;

export async function generate(prompt: string): Promise<Plan> {
  return (await rt.generate(prompt)) as Plan;
}

export async function trainGmailAdapter(
  _examples: SFTExample[],
): Promise<void> {
  // In-browser training is supported by Emberglass TrainingController but the
  // shipped path is external MLX fine-tune (bbverifier) + equip. Surface kept
  // for the spec; status reflects reality instead of pretending to train.
  console.warn(
    "[agent:gmail-agent] in-browser training not used; run the external fine-tune and equip the adapter",
  );
}

// Convenience named exports for the public surface (matches spec + tasks)
export const loadBaseModelFn = loadBaseModel;
export const equipAdapterFn = equipAdapter;
export const generateFn = generate;

// Small dev-only audit hook (used by cross-check)
export function __internalAudit() {
  const s = rt.getAgentStatus();
  return {
    usesRealEngine: s.state === "equipped" || s.state === "loaded",
    hasWeights: s.state === "equipped",
    fixedPromptLength: FIXED_SYSTEM_PROMPT.length,
  };
}
