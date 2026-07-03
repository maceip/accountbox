/**
 * Gmail skill executor — the server half of the Gmail skill.
 *
 * Stateless per the architecture rules: the Google token is resolved per call,
 * nothing (mail content, plan, results) is persisted server-side. Writes are
 * create_draft ONLY — never send.
 *
 * The generic /api/agent-execute route has already validated the session and
 * the plan against this skill's manifest whitelist before we run.
 */

import {
  getFullEmail,
  saveGmailDraft,
  searchEmails,
} from "@/lib/gmail/api.server";
import { getGoogleToken } from "@/lib/gmail/accounts.server";
// Import cycle with executor.server.ts is safe: ExecutorAuthError is only
// referenced at call time (inside execute), never at module-eval time.
import {
  ExecutorAuthError,
  type ExecuteContext,
  type PlanStep,
  type SkillExecutor,
} from "@/lib/skills/executor.server";

async function executeStep(accessToken: string, step: PlanStep) {
  const a = (step.args ?? {}) as Record<string, unknown>;
  switch (step.tool) {
    case "search_messages": {
      const q = String(a?.query ?? "").trim();
      if (!q) throw new Error("search_messages requires args.query");
      const emails = await searchEmails(accessToken, q, 10);
      // Structural results only; bodies are not fetched here.
      return {
        tool: step.tool,
        ok: true,
        count: emails.length,
        results: emails.map((e) => ({
          id: e.id,
          from: e.from,
          subject: e.subject,
          date: e.date,
        })),
      };
    }
    case "read_message": {
      const id = String(a?.id ?? "").trim();
      if (!id || id.startsWith("<"))
        throw new Error(
          "read_message requires a concrete args.id (run search first)",
        );
      const full = await getFullEmail(accessToken, id);
      return {
        tool: step.tool,
        ok: true,
        id,
        from: full.from,
        subject: full.subject,
        // Returned to the caller only; never persisted.
        body: (full.body ?? "").slice(0, 2000),
      };
    }
    case "create_draft": {
      const to = String(a?.to ?? "").trim();
      if (!to) throw new Error("create_draft requires args.to");
      const draft = await saveGmailDraft(accessToken, {
        to,
        subject: String(a?.subject ?? ""),
        body: String(a?.body ?? ""),
      });
      return {
        tool: step.tool,
        ok: true,
        created: true,
        draftId: draft.id,
        to,
      };
    }
    default:
      // Unreachable: the route validated against the manifest whitelist.
      throw new Error(`gmail executor has no handler for tool "${step.tool}"`);
  }
}

export const gmailExecutor: SkillExecutor = {
  async execute(ctx: ExecuteContext, steps: PlanStep[]) {
    const accessToken = await getGoogleToken(
      ctx.headers,
      ctx.userId,
      ctx.accountId,
    );
    if (!accessToken) {
      throw new ExecutorAuthError(
        "No Google access token — connect a Gmail account first",
      );
    }
    const results = [];
    for (const step of steps) {
      results.push(await executeStep(accessToken, step));
    }
    return results;
  },
};
