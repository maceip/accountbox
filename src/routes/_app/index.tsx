import { createFileRoute } from "@tanstack/react-router";

/** The base mailbox — all UI lives in the `_app` layout; `?folder=` selects it. */
export const Route = createFileRoute("/_app/")({
  validateSearch: (search: Record<string, unknown>): { folder?: string } => ({
    folder: typeof search.folder === "string" ? search.folder : undefined,
  }),
  component: () => null,
});
