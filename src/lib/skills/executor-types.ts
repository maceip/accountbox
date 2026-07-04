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
