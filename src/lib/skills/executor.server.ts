/**
 * Per-skill executor registry — the server seam that keeps /api/agent-execute
 * generic. A skill's executor turns validated plan steps into real API calls
 * for that skill's provider (Gmail today; GitHub, Calendar, … later).
 *
 * Adding skill #2 = a manifest (skills/index.ts) + an adapter + one executor
 * module registered here. No route, runtime, or journey changes.
 */

import { gmailExecutor } from "./gmail/execute.server";
import { githubExecutor } from "./github/execute.server";
import type { SkillExecutor } from "./executor-types";
export {
  ExecutorAuthError,
  type ExecuteContext,
  type PlanStep,
  type SkillExecutor,
} from "./executor-types";

const EXECUTORS: Record<string, SkillExecutor> = {
  "gmail-agent": gmailExecutor,
  "github-agent": githubExecutor,
};

export function getSkillExecutor(skillId: string): SkillExecutor | null {
  return EXECUTORS[skillId] ?? null;
}
