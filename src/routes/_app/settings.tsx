import { createFileRoute } from "@tanstack/react-router";

/** /settings — opens the settings dialog over the shell (driven by `_app`). */
export const Route = createFileRoute("/_app/settings")({
  component: () => null,
});
