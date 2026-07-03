/**
 * Gmail compatibility wrapper over the generic executor (execute-plan.ts).
 * Existing callers keep their one-argument signature; new code should call
 * executePlan(skillId, plan) directly.
 */

import {
  executePlan as executeSkillPlan,
  executeTool as executeSkillTool,
  type ExecutablePlan,
} from "./execute-plan";
import { GMAIL_SKILL } from "@/lib/skills/gmail/skill";
import type { Plan } from "@/lib/runtime/gmail-agent-runtime";

export async function executePlan(plan: Plan, accountId?: string) {
  return executeSkillPlan(GMAIL_SKILL.id, plan as ExecutablePlan, accountId);
}

/** Single-tool convenience wrapper over executePlan. */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  accountId?: string,
) {
  return executeSkillTool(GMAIL_SKILL.id, name, args, accountId);
}
