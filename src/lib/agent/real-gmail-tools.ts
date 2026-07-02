/**
 * Real execution of the verified Gmail tools.
 * Uses the user's real connected Gmail (token from vault-unlocked OPFS / connections after unlock).
 * No mail content is persisted; only the action result is returned to chat.
 *
 * For the current training-loop focus we do not require a live Gmail token to
 * generate or grade plans. Execution is best-effort and only happens if you
 * explicitly connect an account later.
 */

import type { Plan } from "@/lib/runtime/gmail-agent-runtime";

export async function executeTool(name: string, _args: any, accessToken?: string) {
  const token = accessToken || (await getFreshToken());
  if (!token) {
    throw new Error("No Gmail token available. Connect a real account after vault unlock to execute. (Plans can still be generated and graded without it.)");
  }

  // Client code must not import the server-only Gmail API (api.server) — the
  // production build's import-protection denies it. Real execution needs a
  // server route (Phase 7); this path is unreachable today because no token
  // exists until vault unlock + Gmail connect wires one through.
  throw new Error(
    `Execution backend not wired for tool ${name}: needs a server execution route (Phase 7). Plans are still real and graded.`,
  );
}

async function getFreshToken() {
  // Return null to force the "connect account" path. Real token would come from
  // browser OPFS after vault unlock + connected Gmail.
  return null;
}

export async function executePlan(plan: Plan, accessToken?: string) {
  if ((plan as any).__cold) throw new Error('refusing to execute cold/non-inference plan');
  if ('steps' in plan) {
    const out: any[] = [];
    for (const s of plan.steps) out.push(await executeTool(s.tool, s.args, accessToken));
    return out;
  }
  return [await executeTool(plan.tool, plan.args, accessToken)];
}
