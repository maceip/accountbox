import { auth } from "@/lib/auth";
import { getSeriesCounts, getTopSenders } from "@/lib/gmail/api.server";
import { getGoogleToken } from "@/lib/gmail/accounts.server";
import { json } from "@/lib/json-response";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/analytics")({
  server: {
    handlers: {
      /**
       * Per-account analytics:
       *   ?accountId=…&senders=1            → top senders
       *   ?accountId=…&q=<gmail query>&days → per-day exact counts for q
       */
      GET: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);

        const url = new URL(request.url);
        const accountId = url.searchParams.get("accountId") ?? undefined;

        const accessToken = await getGoogleToken(
          request.headers,
          session.user.id,
          accountId,
        );
        if (!accessToken) return json({ error: "No Google access token" }, 403);

        try {
          if (url.searchParams.get("senders")) {
            return json({ senders: await getTopSenders(accessToken) });
          }
          const q = url.searchParams.get("q") ?? "";
          const days = Math.min(90, Number(url.searchParams.get("days")) || 30);
          return json({ days: await getSeriesCounts(accessToken, q, days) });
        } catch (error) {
          return json({ error: String(error) }, 502);
        }
      },
    },
  },
});
