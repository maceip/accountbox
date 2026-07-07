/**
 * AppSkill — the ONE bounded seam for adding a new app to AccountBox.
 *
 * An "app" (Gmail, GitHub, Calendar, …) is exactly this data object plus a
 * trained adapter and one server executor module. Nothing else. The generic
 * runtime (agent-runtime.ts) consumes it; the engine (emberglass) never
 * knows apps exist.
 *
 * Tools are DATA, not code: a tool is a name + description + typed args.
 * The plan-validation whitelist (allowedTools) derives from the tool list —
 * a tool not declared here cannot be planned or executed, no matter what the
 * model emits. This declarative shape is also the target schema for
 * model-synthesized tools (docs/tool-synthesis-research.md).
 *
 * Anti-sprawl rules, learned the hard way across eight resets:
 *  - This is a DATA interface, not a framework. No plugin loaders, no dynamic
 *    discovery. Adding a skill = one manifest in src/lib/skills/ + one server
 *    executor module + an adapter.
 *  - systemPrompt is BYTE-LOCKED to the skill's training data (the fine-tune
 *    saw exactly these bytes; drift silently degrades plans — see B3 check).
 */

export interface ToolArgSpec {
  name: string;
  type: "string" | "number" | "boolean";
  required: boolean;
}

export interface ToolSpec {
  name: string;
  description: string;
  args: readonly ToolArgSpec[];
}

export type SkillAvailability = "trained" | "needs-training";
export type TrainingSourceKind =
  | "api"
  | "app-dom"
  | "provider-dom"
  | "tool-schema"
  | "user-examples"
  | "traces";

export interface EvalCase {
  id: string;
  prompt: string;
  expectTools: readonly string[];
  /** True for prompts the app should refuse or answer as unsupported. */
  unsupported?: boolean;
}

export interface SafeActionPolicy {
  /** The first allowed write-like tool, or null for read-only cartridges. */
  tool: string | null;
  /** Whether the first proof mutates a provider or only prepares local output. */
  effect: "provider-draft" | "local-only" | "read-only";
  label: string;
}

export interface AppSkill {
  /** Stable id; also names the adapter ("gmail-agent" -> /adapters/gmail-agent). */
  id: string;
  /** Source registry id this skill plans against (gmail, github, …). */
  sourceId: string;
  /** Human label for status surfaces and the journey skill picker. */
  label: string;
  /** One-line description for the journey skill picker. */
  description: string;
  /**
   * Honest catalog state. "trained" means adapterUrl must serve real LoRA
   * files; "needs-training" is a cartridge/tool contract without shipped
   * weights yet and must not be shown as equippable.
   */
  availability: SkillAvailability;
  /** What the first safe write/proposal is allowed to do. */
  safeAction: SafeActionPolicy;
  /** Inputs that may be used to build this cartridge's training/eval data. */
  trainingSources: readonly TrainingSourceKind[];
  /** Small built-in eval seed set; larger eval suites can be generated later. */
  evalCases: readonly EvalCase[];
  /** One prompt that exercises this skill without account execution. */
  testPrompt: string;
  /** Byte-identical to the system prompt in this skill's training data. */
  systemPrompt: string;
  /** The skill's tools as data. Source of truth for allowedTools. */
  tools: readonly ToolSpec[];
  /** Closed whitelist for plan validation and execution — DERIVED from tools
   *  by defineSkill(); never hand-written. */
  allowedTools: readonly string[];
  /** Same-origin directory serving adapter_config.json + adapters.safetensors. */
  adapterUrl?: string;
  /**
   * Served SFT dataset for this cartridge (chat-JSONL train/heldout), when
   * one ships in-app. Consumed by the in-browser trainer; absent means the
   * cartridge trains externally (or not yet). GRPO additionally needs a
   * GrpoTaskSpec (verifiable reward) supplied in code — rewards are
   * functions, not data.
   */
  training?: {
    datasetUrl: string;
    heldoutUrl: string;
  };
}

/** The only way to build an AppSkill: derives allowedTools from the tool list
 *  so the whitelist can never drift from the declared tools. */
export function defineSkill(def: Omit<AppSkill, "allowedTools">): AppSkill {
  return { ...def, allowedTools: def.tools.map((t) => t.name) };
}
