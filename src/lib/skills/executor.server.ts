/**
 * Per-skill executor registry — the server seam that keeps /api/agent-execute
 * generic. A skill's executor turns validated plan steps into real API calls
 * for that skill's provider (Gmail today; GitHub, Calendar, … later).
 *
 * Adding skill #2 = a manifest (skills/index.ts) + an adapter + one executor
 * module registered here. No route, runtime, or journey changes.
 */

import { gmailExecutor } from "./gmail/execute.server";

export type PlanStep = { tool: string; args: Record<string, unknown> };

export type ExecuteContext = {
  /** Request headers, for per-call token resolution (nothing cached). */
  headers: Headers;
  userId: string;
  /** Optional provider account id (multi-account users). */
  accountId?: string;
};

export interface SkillExecutor {
  execute(ctx: ExecuteContext, steps: PlanStep[]): Promise<unknown[]>;
}

/** Thrown by executors when the skill's account isn't connected (route -> 403). */
export class ExecutorAuthError extends Error {}

const EXECUTORS: Record<string, SkillExecutor> = {
  "gmail-agent": gmailExecutor,
};

export function getSkillExecutor(skillId: string): SkillExecutor | null {
  return EXECUTORS[skillId] ?? null;
}
