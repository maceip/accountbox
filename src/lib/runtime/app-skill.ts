/**
 * AppSkill — the ONE bounded seam for adding a new app to AccountBox.
 *
 * An "app" (Gmail, GitHub, Calendar, …) is exactly this data object plus a
 * trained adapter and (later) a tool executor. Nothing else. The generic
 * runtime (agent-runtime.ts) consumes it; the engine (emberglass) never
 * knows apps exist.
 *
 * Anti-sprawl rules, learned the hard way across eight resets:
 *  - This is a DATA interface, not a framework. No registries, no plugin
 *    loaders, no dynamic discovery. Adding an app = one config module that
 *    calls createAgentRuntime(skill) and re-exports its surface.
 *  - systemPrompt is BYTE-LOCKED to the skill's training data (the fine-tune
 *    saw exactly these bytes; drift silently degrades plans — see B3 check).
 *  - allowedTools is the plan-validation whitelist AND the execution
 *    whitelist. A tool not listed here cannot be planned or executed, no
 *    matter what the model emits.
 */

export interface AppSkill {
  /** Stable id; also names the adapter ("gmail" -> /adapters/gmail-agent). */
  id: string;
  /** Byte-identical to the system prompt in this skill's training data. */
  systemPrompt: string;
  /** Closed tool whitelist for plan validation and execution. */
  allowedTools: readonly string[];
  /** Same-origin directory serving adapter_config.json + adapters.safetensors. */
  adapterUrl: string;
  /** Human label for status surfaces. */
  label: string;
}
