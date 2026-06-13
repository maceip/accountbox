import { auth } from "@/lib/auth";
import { fetchPullRequests, getGithubToken } from "@/lib/github/github.server";
import { json } from "@/lib/json-response";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/pull-requests")({
  server: {
    handlers: {
      /** Pull requests for the linked GitHub account.
       *  → { linked: false } when GitHub isn't linked yet. */
      GET: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);

        const token = await getGithubToken(request.headers, session.user.id);
        if (!token) return json({ linked: false });

        try {
          const { login, prs } = await fetchPullRequests(token);
          return json({ linked: true, login, prs });
        } catch (error) {
          return json({ linked: true, error: String(error) }, 502);
        }
      },
    },
  },
});
