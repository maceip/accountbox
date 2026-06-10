import { createFileRoute } from "@tanstack/react-router";

/** The base inbox — all UI lives in the `_app` layout; this route is just `/`. */
export const Route = createFileRoute("/_app/")({
  component: () => null,
});
