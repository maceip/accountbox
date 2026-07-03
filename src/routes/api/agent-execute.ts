import { auth } from "@/lib/auth/auth";
import { json, jsonError } from "@/lib/json-response";
import { isValidToolPlan } from "@/lib/runtime/plan-parse";
import { getSkill } from "@/lib/skills";
import { ExecutorAuthError, getSkillExecutor, type PlanStep } from "@/lib/skills/executor.server";
import { createFileRoute } from "@tanstack/react-router";

/**
 * Execute a verified agent plan against the signed-in user's real account —
 * generically, for ANY registered skill. The request carries a skillId; the
 * plan is validated against that skill's manifest-derived tool whitelist and
 * dispatched to its executor module. Gmail is just the first registration.
 *
 * Stateless per the architecture rules: tokens are resolved per call inside
 * the executor, nothing (content, plan, results) is persisted server-side.
 *
 * Fail-closed: refuses __cold plans (non-inference sentinels) and any tool not
 * on the skill's whitelist, even if a client bypasses the runtime's own
 * validation.
 */

function stepsOf(plan: any): PlanStep[] {
  return "steps" in plan ? plan.steps : [plan];
}

export const Route = createFileRoute("/api/agent-execute")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);

        const body = (await request.json().catch(() => null)) as {
          plan?: unknown;
          skillId?: string;
          accountId?: string;
        } | null;
        const plan: any = body?.plan;
        if (!plan) return json({ error: "plan is required" }, 400);

        // Default keeps pre-skillId clients working; they were all Gmail.
        const skillId = body?.skillId ?? "gmail-agent";
        const skill = getSkill(skillId);
        const executor = getSkillExecutor(skillId);
        if (!skill || !executor) {
          return json({ error: `unknown skill "${skillId}"` }, 422);
        }

        if (plan.__cold) {
          return json({ error: "refusing to execute cold/non-inference plan" }, 422);
        }
        if (!isValidToolPlan(plan, skill.allowedTools)) {
          return json({ error: "plan is not a valid tool plan for this skill" }, 422);
        }

        try {
          const results = await executor.execute(
            { headers: request.headers, userId: session.user.id, accountId: body?.accountId },
            stepsOf(plan),
          );
          return json({ ok: true, results });
        } catch (err) {
          if (err instanceof ExecutorAuthError) {
            return json({ error: err.message }, 403);
          }
          return jsonError("agent plan execution", err);
        }
      },
    },
  },
});
