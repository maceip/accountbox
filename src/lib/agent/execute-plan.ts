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

import {
  getGmailAccessToken,
  listConnectedGmailAccounts,
} from "@/lib/connections/provider-store";

export type ExecutablePlan =
  | { tool: string; args: Record<string, unknown>; __cold?: boolean }
  | {
      steps: Array<{ tool: string; args: Record<string, unknown> }>;
      __cold?: boolean;
    };

export async function executePlan(
  skillId: string,
  plan: ExecutablePlan,
  accountId?: string,
) {
  if (plan.__cold)
    throw new Error("refusing to execute cold/non-inference plan");

  let executionAccountId = accountId;
  const headers = new Headers({ "content-type": "application/json" });
  if (skillId === "gmail-agent") {
    if (!executionAccountId) {
      executionAccountId = (await listConnectedGmailAccounts())[0]?.accountId;
    }
    if (executionAccountId) {
      headers.set(
        "authorization",
        `Bearer ${await getGmailAccessToken(executionAccountId)}`,
      );
    }
  }

  const res = await fetch("/api/agent-execute", {
    method: "POST",
    headers,
    body: JSON.stringify({
      skillId,
      plan,
      ...(executionAccountId ? { accountId: executionAccountId } : {}),
    }),
  });
  const data = (await res.json().catch(() => null)) as {
    error?: string;
    results?: unknown[];
  } | null;
  if (!res.ok) {
    throw new Error(data?.error || `agent-execute failed (${res.status})`);
  }
  return data?.results ?? [];
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
