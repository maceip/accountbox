import { createFileRoute } from "@tanstack/react-router";

import { EvalsPage } from "@/components/workbench/workbench-pages";

export const Route = createFileRoute("/_app/evals")({
  component: EvalsPage,
});
