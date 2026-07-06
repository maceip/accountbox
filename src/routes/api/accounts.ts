import { auth } from "@/lib/auth/auth";
import { getEmailAddress, getInboxUnread } from "@/lib/gmail/api.server";
import { gmailAccessTokenFromRequest } from "@/lib/gmail/request-token.server";
import { json } from "@/lib/json-response";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/accounts")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);

        const accessToken = gmailAccessTokenFromRequest(request);
        if (!accessToken)
          return json({ error: "Gmail bearer token required" }, 403);

        try {
          const [email, unread] = await Promise.all([
            getEmailAddress(accessToken),
            getInboxUnread(accessToken),
          ]);
          const accountId =
            new URL(request.url).searchParams.get("accountId") || email;
          const account = { accountId, email, unread };
          return json({ account, accounts: [account], count: 1 });
        } catch {
          return json({ error: "Gmail token is not usable" }, 403);
        }
      },
    },
  },
});
