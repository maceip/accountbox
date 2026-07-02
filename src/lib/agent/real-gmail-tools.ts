/**
 * Client entry for executing verified Gmail tool plans.
 *
 * Execution happens in /api/agent-execute (a stateless server helper following
 * the app's route pattern: session -> per-call Google token -> Gmail API).
 * Nothing is persisted; writes are create_draft only — never send.
 *
 * Fail-closed on both sides: this module refuses __cold plans before the
 * network, and the route re-validates the plan + whitelist independently.
 */

import type { Plan } from "@/lib/runtime/gmail-agent-runtime";

export async function executePlan(plan: Plan, accountId?: string) {
  if ((plan as any).__cold) throw new Error("refusing to execute cold/non-inference plan");

  const res = await fetch("/api/agent-execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan, ...(accountId ? { accountId } : {}) }),
  });
  const data = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    throw new Error(data?.error || `agent-execute failed (${res.status})`);
  }
  return data.results;
}

/** Single-tool convenience wrapper over executePlan. */
export async function executeTool(name: string, args: Record<string, unknown>, accountId?: string) {
  const results = await executePlan({ tool: name, args } as Plan, accountId);
  return results[0];
}
