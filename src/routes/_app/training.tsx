import { createFileRoute } from "@tanstack/react-router";

import { TrainingPage } from "@/components/workbench/workbench-pages";

export const Route = createFileRoute("/_app/training")({
  component: TrainingPage,
});
