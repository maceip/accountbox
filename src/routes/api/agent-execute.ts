import { auth } from "@/lib/auth/auth";
import { getFullEmail, saveGmailDraft, searchEmails } from "@/lib/gmail/api.server";
import { getGoogleToken } from "@/lib/gmail/accounts.server";
import { json, jsonError } from "@/lib/json-response";
import { isValidToolPlan } from "@/lib/runtime/plan-parse";
import { createFileRoute } from "@tanstack/react-router";

/**
 * Execute a verified agent plan against the signed-in user's real Gmail.
 *
 * Stateless helper per the architecture rules: the token is resolved per call,
 * nothing (mail content, plan, results) is persisted server-side. Writes are
 * create_draft ONLY — never send.
 *
 * Fail-closed: refuses __cold plans (non-inference sentinels) and any tool not
 * on the whitelist, even if a client bypasses the runtime's own validation.
 */

const ALLOWED = ["search_messages", "read_message", "create_draft"] as const;

type Step = { tool: (typeof ALLOWED)[number]; args: Record<string, unknown> };

function stepsOf(plan: any): Step[] {
  return "steps" in plan ? plan.steps : [plan];
}

async function executeStep(accessToken: string, step: Step) {
  const a = step.args as any;
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
        results: emails.map((e) => ({ id: e.id, from: e.from, subject: e.subject, date: e.date })),
      };
    }
    case "read_message": {
      const id = String(a?.id ?? "").trim();
      if (!id || id.startsWith("<")) throw new Error("read_message requires a concrete args.id (run search first)");
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
      return { tool: step.tool, ok: true, created: true, draftId: draft.id, to };
    }
  }
}

export const Route = createFileRoute("/api/agent-execute")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);

        const body = (await request.json().catch(() => null)) as {
          plan?: unknown;
          accountId?: string;
        } | null;
        const plan: any = body?.plan;
        if (!plan) return json({ error: "plan is required" }, 400);
        if (plan.__cold) {
          return json({ error: "refusing to execute cold/non-inference plan" }, 422);
        }
        if (!isValidToolPlan(plan, ALLOWED)) {
          return json({ error: "plan is not a valid tool plan for this skill" }, 422);
        }

        const accessToken = await getGoogleToken(request.headers, session.user.id, body?.accountId);
        if (!accessToken) {
          return json({ error: "No Google access token — connect a Gmail account first" }, 403);
        }

        try {
          const results = [];
          for (const step of stepsOf(plan)) {
            results.push(await executeStep(accessToken, step));
          }
          return json({ ok: true, results });
        } catch (err) {
          return jsonError("agent plan execution", err);
        }
      },
    },
  },
});
