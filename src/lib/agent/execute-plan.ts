/**
 * Client entry for executing verified agent tool plans — for ANY skill.
 *
 * Execution happens in /api/agent-execute (a stateless server helper: session
 * -> per-call provider token -> provider API, dispatched by skillId). Nothing
 * is persisted; Gmail writes are create_draft only — never send.
 *
 * Fail-closed on both sides: this module refuses __cold plans before the
 * network, and the route re-validates the plan against the skill's
 * manifest-derived whitelist independently.
 */

export type ExecutablePlan =
  | { tool: string; args: Record<string, unknown>; __cold?: boolean }
  | { steps: Array<{ tool: string; args: Record<string, unknown> }>; __cold?: boolean };

export async function executePlan(skillId: string, plan: ExecutablePlan, accountId?: string) {
  if ((plan as any).__cold) throw new Error("refusing to execute cold/non-inference plan");

  const res = await fetch("/api/agent-execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ skillId, plan, ...(accountId ? { accountId } : {}) }),
  });
  const data = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    throw new Error(data?.error || `agent-execute failed (${res.status})`);
  }
  return data.results;
}

/** Single-tool convenience wrapper over executePlan. */
export async function executeTool(
  skillId: string,
  name: string,
  args: Record<string, unknown>,
  accountId?: string,
) {
  const results = await executePlan(skillId, { tool: name, args }, accountId);
  return results[0];
}
