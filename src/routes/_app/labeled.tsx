import { createFileRoute } from "@tanstack/react-router";

/** /labeled — the `_app` layout reads the path to select this folder. */
export const Route = createFileRoute("/_app/labeled")({
  component: () => null,
});
