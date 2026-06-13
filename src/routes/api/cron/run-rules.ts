import { runAllRules } from "@/lib/rules-runner.server";
import { json } from "@/lib/json-response";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/cron/run-rules")({
  server: {
    handlers: {
      /** Invoked by Vercel Cron. Walks new mail and fires matching rules.
       *  Protected by CRON_SECRET — Vercel sends it as a Bearer token. */
      GET: async ({ request }: { request: Request }) => {
        // Require a configured secret — never run unprotected (Vercel sends it
        // as a Bearer token automatically when CRON_SECRET is set).
        const secret = process.env.CRON_SECRET;
        if (!secret) return json({ error: "CRON_SECRET not configured" }, 403);
        if (request.headers.get("authorization") !== `Bearer ${secret}`) {
          return json({ error: "Unauthorized" }, 401);
        }
        try {
          const summary = await runAllRules();
          return json({ ok: true, ...summary });
        } catch (error) {
          return json({ ok: false, error: String(error) }, 500);
        }
      },
    },
  },
});
