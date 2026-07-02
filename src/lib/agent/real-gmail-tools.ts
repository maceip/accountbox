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

export async function executeTool(name: string, args: any, accessToken?: string) {
  const token = accessToken || (await getFreshToken());
  if (!token) {
    throw new Error("No Gmail token available. Connect a real account after vault unlock to execute. (Plans can still be generated and graded without it.)");
  }

  // Dynamic import so this module typechecks even if the server Gmail helpers
  // have different signatures or are not in the client path.
  try {
    const api = await import("@/lib/gmail/api.server");
    const searchEmails = (api as any).searchEmails;
    const getFullEmail = (api as any).getFullEmail;
    const createDraft = (api as any).createDraft;

    if (name === "search_messages") {
      const q = args.query || "";
      const res = await searchEmails(token, 10, undefined, q);
      const emails = res?.emails || res || [];
      return { ok: true, count: emails.length, results: emails.map((e: any) => ({ id: e.id, from: e.from, subject: e.subject, date: e.date })) };
    }
    if (name === "read_message") {
      const full = await getFullEmail(token, args.id);
      return { ok: true, id: args.id, from: full.from, subject: full.subject, body: full.body?.slice(0, 2000) || "(body)" };
    }
    if (name === "create_draft") {
      await createDraft(token, args.to, args.subject || "", args.body || "");
      return { ok: true, created: true, to: args.to, subject: args.subject };
    }
  } catch (e) {
    throw new Error(`Execution backend not wired for tool ${name}: ${e}`);
  }
  throw new Error("Unknown tool " + name);
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
