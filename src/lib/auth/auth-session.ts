import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { auth } from "@/lib/auth/auth";

/**
 * Server-resolved session for route guards. Called from _app's beforeLoad so SSR
 * knows sign-in state — the authenticated shell never flashes before the landing
 * page (or vice versa). On the client it's an RPC; useSession() then takes over
 * for live updates (sign-out, account linking).
 */
export const fetchSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers });
    return session ?? null;
  },
);

export type ServerSession = Awaited<ReturnType<typeof fetchSession>>;
