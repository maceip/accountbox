import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { Prisma } from "@/generated/prisma/client";
import { json } from "@/lib/json-response";
import { createFileRoute } from "@tanstack/react-router";

/**
 * The signed-in user's preferences blob — settings + custom charts. One JSON
 * column on `user`, so anything we add to the settings surface persists across
 * sessions and devices without a schema change.
 */
export const Route = createFileRoute("/api/preferences")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);
        const user = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { preferences: true },
        });
        return json({ preferences: user?.preferences ?? {} });
      },

      /** Shallow-merge the posted keys into the stored blob (partial update). */
      PUT: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);

        const patch = (await request.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;
        if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
          return json({ error: "Body must be a preferences object" }, 400);
        }

        const current = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { preferences: true },
        });
        const merged = {
          ...((current?.preferences as Record<string, unknown> | null) ?? {}),
          ...patch,
        };
        await prisma.user.update({
          where: { id: session.user.id },
          data: { preferences: merged as Prisma.InputJsonValue },
        });
        return json({ preferences: merged });
      },
    },
  },
});
