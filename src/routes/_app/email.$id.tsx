import { createFileRoute } from "@tanstack/react-router";

/** /email/$id?account=… — the open message. The `_app` layout reads this
 *  route to drive the reader pane; the route renders no UI of its own. */
export const Route = createFileRoute("/_app/email/$id")({
  validateSearch: (search: Record<string, unknown>): { account?: string } => ({
    account: typeof search.account === "string" ? search.account : undefined,
  }),
  component: () => null,
});
