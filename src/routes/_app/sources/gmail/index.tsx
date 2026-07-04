import { createFileRoute } from "@tanstack/react-router";

/** Gmail inbox — mail board is rendered by the `_app` layout. */
export const Route = createFileRoute("/_app/sources/gmail/")({
  component: () => null,
});
